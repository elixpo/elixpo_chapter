//! `crumb acp`: Crumb as an Agent Client Protocol (v1) agent over stdio.
//!
//! Editors such as Zed start `crumb acp` and speak newline-delimited
//! JSON-RPC 2.0 on its stdin and stdout. Each prompt runs one Crumb turn; its
//! text, reasoning and tool calls stream back as `session/update`
//! notifications, approvals become `session/request_permission` requests to
//! the editor, and `session/cancel` cancels the turn. stdout carries protocol
//! messages only; diagnostics go to stderr.
//!
//! The protocol loop is written against [`AcpBackend`] so that it can be
//! tested without a model; [`RuntimeBackend`] runs real Crumb turns.

use std::collections::{BTreeMap, VecDeque};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, RecvTimeoutError, TryRecvError};
use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use crumb_agent::{AgentConfig, ApprovalMode, PendingApproval, QuestionAnswer};
use crumb_harness_dsh::HarnessActivity;
use serde_json::{Value, json};

use crate::agent_runtime::{AgentRuntime, AgentTurnTask};

/// The ACP major version this agent speaks.
pub(crate) const PROTOCOL_VERSION: u64 = 1;

const PARSE_ERROR: i64 = -32700;
const INVALID_REQUEST: i64 = -32600;
const METHOD_NOT_FOUND: i64 = -32601;
const INVALID_PARAMS: i64 = -32602;
const INTERNAL_ERROR: i64 = -32603;

/// How often a running turn checks for editor messages between events.
const TURN_POLL: Duration = Duration::from_millis(25);

const ALLOW_ONCE: &str = "allow-once";
const REJECT_ONCE: &str = "reject-once";

/// One JSON-RPC message read from the editor.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Incoming {
    Request {
        id: Value,
        method: String,
        params: Value,
    },
    Notification {
        method: String,
        params: Value,
    },
    Response {
        id: Value,
        result: Option<Value>,
    },
    /// A line that is not a valid JSON-RPC message; the error is answered.
    Invalid(Value),
}

pub(crate) fn parse_incoming(line: &str) -> Incoming {
    let Ok(message) = serde_json::from_str::<Value>(line) else {
        return Incoming::Invalid(error_response(&Value::Null, PARSE_ERROR, "parse error"));
    };
    let id = message.get("id").cloned();
    match (message.get("method").and_then(Value::as_str), id) {
        (Some(method), Some(id)) => Incoming::Request {
            id,
            method: method.to_owned(),
            params: message.get("params").cloned().unwrap_or(Value::Null),
        },
        (Some(method), None) => Incoming::Notification {
            method: method.to_owned(),
            params: message.get("params").cloned().unwrap_or(Value::Null),
        },
        (None, Some(id)) if message.get("result").is_some() || message.get("error").is_some() => {
            Incoming::Response {
                id,
                result: message.get("result").cloned(),
            }
        }
        (None, id) => Incoming::Invalid(error_response(
            &id.unwrap_or(Value::Null),
            INVALID_REQUEST,
            "invalid request",
        )),
    }
}

fn error_response(id: &Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})
}

/// A tool approval waiting for the editor's answer. Dropping it denies.
pub(crate) struct ApprovalPrompt {
    pub tool: String,
    pub arguments: Value,
    decide: Option<Box<dyn FnOnce(bool) + Send>>,
}

impl ApprovalPrompt {
    pub(crate) fn new(
        tool: impl Into<String>,
        arguments: Value,
        decide: impl FnOnce(bool) + Send + 'static,
    ) -> Self {
        Self {
            tool: tool.into(),
            arguments,
            decide: Some(Box::new(decide)),
        }
    }

    fn resolve(mut self, allow: bool) {
        if let Some(decide) = self.decide.take() {
            decide(allow);
        }
    }
}

impl Drop for ApprovalPrompt {
    fn drop(&mut self) {
        if let Some(decide) = self.decide.take() {
            decide(false);
        }
    }
}

/// What a running turn produced since it was last polled.
pub(crate) enum TurnSignal {
    Activity(HarnessActivity),
    Approval(ApprovalPrompt),
    Idle,
    Finished,
}

/// How a turn ended.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum TurnEnd {
    Stop(&'static str),
    Error(String),
}

pub(crate) trait AcpTurn {
    fn poll(&mut self, timeout: Duration) -> TurnSignal;
    fn cancel(&self);
}

/// A session listed by `session/list`.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ListedSession {
    pub id: String,
    pub cwd: PathBuf,
    pub title: Option<String>,
}

pub(crate) trait AcpBackend {
    type Turn: AcpTurn;
    fn new_session(&mut self, cwd: &Path) -> Result<String>;
    fn resume_session(&mut self, session: &str, cwd: &Path) -> Result<()>;
    fn close_session(&mut self, session: &str) -> Result<()>;
    fn list_sessions(&self, cwd: Option<&Path>) -> Result<Vec<ListedSession>>;
    fn start_turn(&mut self, session: &str, prompt: String) -> Result<Self::Turn>;
    fn finish_turn(&mut self, session: &str, turn: Self::Turn, cancelled: bool) -> TurnEnd;
}

/// The protocol side of `crumb acp`: one editor connection.
pub(crate) struct AcpServer<B: AcpBackend, W: Write> {
    backend: B,
    out: W,
    next_request: u64,
}

impl<B: AcpBackend, W: Write> AcpServer<B, W> {
    pub(crate) fn new(backend: B, out: W) -> Self {
        Self {
            backend,
            out,
            next_request: 0,
        }
    }

    /// Serves messages until the editor closes the connection.
    pub(crate) fn run(&mut self, incoming: &Receiver<Incoming>) -> Result<()> {
        while let Ok(message) = incoming.recv() {
            self.handle(message, incoming)?;
        }
        Ok(())
    }

    fn handle(&mut self, message: Incoming, incoming: &Receiver<Incoming>) -> Result<()> {
        match message {
            Incoming::Request { id, method, params } => {
                if method == "session/prompt" {
                    return self.prompt(&id, &params, incoming);
                }
                let reply = self.request(&method, &params);
                self.reply(&id, reply)
            }
            Incoming::Invalid(error) => self.send(&error),
            // Notifications outside a turn (a late cancel) and stray
            // responses need no answer.
            Incoming::Notification { .. } | Incoming::Response { .. } => Ok(()),
        }
    }

    fn request(&mut self, method: &str, params: &Value) -> Result<Value, (i64, String)> {
        match method {
            "initialize" => Ok(initialize_result(params)),
            "authenticate" => Ok(json!({})),
            "session/new" => {
                let cwd = cwd_param(params)?;
                warn_unused_mcp_servers(params);
                let session = self
                    .backend
                    .new_session(&cwd)
                    .map_err(|error| internal(&error))?;
                Ok(json!({"sessionId": session}))
            }
            "session/resume" => {
                let session = session_param(params)?;
                let cwd = cwd_param(params)?;
                warn_unused_mcp_servers(params);
                self.backend
                    .resume_session(&session, &cwd)
                    .map_err(|error| internal(&error))?;
                Ok(json!({}))
            }
            "session/close" => {
                let session = session_param(params)?;
                self.backend
                    .close_session(&session)
                    .map_err(|error| internal(&error))?;
                Ok(json!({}))
            }
            "session/list" => {
                let cwd = params.get("cwd").and_then(Value::as_str).map(PathBuf::from);
                let sessions = self
                    .backend
                    .list_sessions(cwd.as_deref())
                    .map_err(|error| internal(&error))?;
                Ok(json!({"sessions": sessions.iter().map(|session| {
                    let mut info = json!({
                        "sessionId": session.id,
                        "cwd": session.cwd.display().to_string(),
                    });
                    if let Some(title) = &session.title {
                        info["title"] = Value::from(title.as_str());
                    }
                    info
                }).collect::<Vec<_>>()}))
            }
            other => Err((METHOD_NOT_FOUND, format!("method not found: {other}"))),
        }
    }

    fn prompt(&mut self, id: &Value, params: &Value, incoming: &Receiver<Incoming>) -> Result<()> {
        let started = session_param(params).and_then(|session| {
            let text = prompt_text(params.get("prompt").unwrap_or(&Value::Null))?;
            let turn = self
                .backend
                .start_turn(&session, text)
                .map_err(|error| (INVALID_PARAMS, format!("{error:#}")))?;
            Ok((session, turn))
        });
        let (session, mut turn) = match started {
            Ok(started) => started,
            Err(error) => return self.reply(id, Err(error)),
        };
        let mut tools = ToolCalls::default();
        let mut approvals: BTreeMap<u64, ApprovalPrompt> = BTreeMap::new();
        let mut cancelled = false;
        loop {
            loop {
                let message = match incoming.try_recv() {
                    Ok(message) => message,
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => {
                        // The editor went away: stop the turn, deny what waits.
                        if !cancelled {
                            cancelled = true;
                            turn.cancel();
                            approvals.clear();
                        }
                        break;
                    }
                };
                match message {
                    Incoming::Notification { method, params }
                        if method == "session/cancel"
                            && params.get("sessionId").and_then(Value::as_str)
                                == Some(session.as_str()) =>
                    {
                        cancelled = true;
                        turn.cancel();
                        approvals.clear();
                    }
                    Incoming::Response { id, result } => {
                        if let Some(prompt) = id.as_u64().and_then(|id| approvals.remove(&id)) {
                            prompt.resolve(permission_allowed(result.as_ref()));
                        }
                    }
                    Incoming::Request { id, method, .. } if method == "session/prompt" => {
                        self.reply(
                            &id,
                            Err((
                                INVALID_REQUEST,
                                "a prompt is already running; wait for it or cancel it".to_owned(),
                            )),
                        )?;
                    }
                    Incoming::Request { id, method, params } => {
                        let reply = self.request(&method, &params);
                        self.reply(&id, reply)?;
                    }
                    Incoming::Invalid(error) => self.send(&error)?,
                    Incoming::Notification { .. } => {}
                }
            }
            match turn.poll(TURN_POLL) {
                TurnSignal::Activity(activity) => {
                    for update in tools.updates(&activity) {
                        self.update(&session, &update)?;
                    }
                }
                TurnSignal::Approval(prompt) => {
                    if cancelled {
                        prompt.resolve(false);
                        continue;
                    }
                    let tool_call = tools.permission_call(&prompt.tool, &prompt.arguments);
                    let request = self.next_request;
                    self.next_request += 1;
                    self.send(&json!({
                        "jsonrpc": "2.0",
                        "id": request,
                        "method": "session/request_permission",
                        "params": {
                            "sessionId": session,
                            "toolCall": tool_call,
                            "options": [
                                {"optionId": ALLOW_ONCE, "name": "Allow", "kind": "allow_once"},
                                {"optionId": REJECT_ONCE, "name": "Reject", "kind": "reject_once"},
                            ],
                        },
                    }))?;
                    approvals.insert(request, prompt);
                }
                TurnSignal::Idle => {}
                TurnSignal::Finished => break,
            }
        }
        drop(approvals);
        let reply = match self.backend.finish_turn(&session, turn, cancelled) {
            TurnEnd::Stop(reason) => Ok(json!({"stopReason": reason})),
            TurnEnd::Error(message) => Err((INTERNAL_ERROR, message)),
        };
        self.reply(id, reply)
    }

    fn update(&mut self, session: &str, update: &Value) -> Result<()> {
        self.send(&json!({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {"sessionId": session, "update": update},
        }))
    }

    fn reply(&mut self, id: &Value, reply: Result<Value, (i64, String)>) -> Result<()> {
        match reply {
            Ok(result) => self.send(&json!({"jsonrpc": "2.0", "id": id, "result": result})),
            Err((code, message)) => self.send(&error_response(id, code, &message)),
        }
    }

    fn send(&mut self, message: &Value) -> Result<()> {
        serde_json::to_writer(&mut self.out, message)?;
        self.out.write_all(b"\n")?;
        self.out.flush()?;
        Ok(())
    }
}

fn internal(error: &anyhow::Error) -> (i64, String) {
    (INTERNAL_ERROR, format!("{error:#}"))
}

fn session_param(params: &Value) -> Result<String, (i64, String)> {
    params
        .get("sessionId")
        .and_then(Value::as_str)
        .filter(|session| !session.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| (INVALID_PARAMS, "sessionId is required".to_owned()))
}

fn cwd_param(params: &Value) -> Result<PathBuf, (i64, String)> {
    let cwd = params
        .get("cwd")
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .ok_or_else(|| (INVALID_PARAMS, "cwd is required".to_owned()))?;
    if !cwd.is_absolute() {
        return Err((INVALID_PARAMS, "cwd must be an absolute path".to_owned()));
    }
    Ok(cwd)
}

/// Crumb's agent turns do not load MCP servers yet, so servers an editor
/// offers are not connected; say so instead of dropping them silently.
fn warn_unused_mcp_servers(params: &Value) {
    if let Some(servers) = params.get("mcpServers").and_then(Value::as_array)
        && !servers.is_empty()
    {
        eprintln!(
            "crumb acp: {} MCP server(s) from the editor are not connected; \
             Crumb's agent turns do not load MCP servers yet",
            servers.len()
        );
    }
}

fn permission_allowed(result: Option<&Value>) -> bool {
    result
        .and_then(|result| result.get("outcome"))
        .is_some_and(|outcome| {
            outcome.get("outcome").and_then(Value::as_str) == Some("selected")
                && outcome.get("optionId").and_then(Value::as_str) == Some(ALLOW_ONCE)
        })
}

/// Whether the editor can run an agent's sign-in in a terminal: the stable
/// `auth.terminal` capability, or the earlier `_meta["terminal-auth"]`.
fn supports_terminal_auth(params: &Value) -> bool {
    let capabilities = params.get("clientCapabilities").unwrap_or(&Value::Null);
    capabilities.pointer("/auth/terminal") == Some(&Value::Bool(true))
        || capabilities.pointer("/_meta/terminal-auth") == Some(&Value::Bool(true))
}

/// `crumb auth login`, run by the editor in a terminal. It exits 0 once the
/// crumb.elixpo account is connected.
fn terminal_login_method() -> Value {
    let args = ["auth", "login"];
    let command = std::env::current_exe()
        .ok()
        .map_or_else(|| "crumb".to_owned(), |path| path.display().to_string());
    json!({
        "id": "crumb-login",
        "name": "Sign in to crumb.elixpo",
        "description": "Connect your crumb.elixpo account in a terminal to use Pollinations models",
        "type": "terminal",
        "args": args,
        "env": {},
        "_meta": {"terminal-auth": {"command": command, "args": args, "label": "crumb auth login"}},
    })
}

pub(crate) fn initialize_result(params: &Value) -> Value {
    let auth_methods = if supports_terminal_auth(params) {
        vec![terminal_login_method()]
    } else {
        Vec::new()
    };
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "agentCapabilities": {
            "loadSession": false,
            "promptCapabilities": {"image": false, "audio": false, "embeddedContext": true},
            "mcpCapabilities": {"http": false, "sse": false},
            "sessionCapabilities": {"resume": {}, "list": {}, "close": {}},
        },
        "agentInfo": {"name": "crumb", "title": "Crumb", "version": env!("CARGO_PKG_VERSION")},
        "authMethods": auth_methods,
    })
}

/// Flattens a prompt's content blocks into the text of one Crumb request.
pub(crate) fn prompt_text(blocks: &Value) -> Result<String, (i64, String)> {
    let blocks = blocks
        .as_array()
        .ok_or_else(|| (INVALID_PARAMS, "prompt must be an array".to_owned()))?;
    let mut parts = Vec::new();
    for block in blocks {
        match block.get("type").and_then(Value::as_str) {
            Some("text") => {
                if let Some(text) = block.get("text").and_then(Value::as_str) {
                    parts.push(text.to_owned());
                }
            }
            Some("resource_link") => {
                let uri = block.get("uri").and_then(Value::as_str).unwrap_or_default();
                let name = block.get("name").and_then(Value::as_str).unwrap_or(uri);
                parts.push(format!("[{name}]({uri})"));
            }
            Some("resource") => {
                let resource = block.get("resource").unwrap_or(&Value::Null);
                let uri = resource
                    .get("uri")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let Some(text) = resource.get("text").and_then(Value::as_str) else {
                    return Err((
                        INVALID_PARAMS,
                        format!("binary resource `{uri}` is not supported"),
                    ));
                };
                parts.push(format!("<context uri=\"{uri}\">\n{text}\n</context>"));
            }
            Some(other) => {
                return Err((
                    INVALID_PARAMS,
                    format!("`{other}` content is not supported"),
                ));
            }
            None => return Err((INVALID_PARAMS, "content block has no type".to_owned())),
        }
    }
    let text = parts.join("\n\n");
    if text.trim().is_empty() {
        return Err((INVALID_PARAMS, "prompt is empty".to_owned()));
    }
    Ok(text)
}

/// Gives Crumb's tool events the call ids ACP needs, pairing each finish
/// with the earliest open call of the same tool.
#[derive(Default)]
pub(crate) struct ToolCalls {
    next: u64,
    open: VecDeque<(String, String)>,
    /// Calls announced by a permission request before the tool started.
    announced: VecDeque<(String, String)>,
    /// Recently finished calls: Crumb reports a tool's output after its
    /// finish, so the output still needs the call's id.
    finished: VecDeque<(String, String)>,
}

/// How many finished calls stay addressable for late output.
const FINISHED_CALLS: usize = 32;

impl ToolCalls {
    fn new_id(&mut self) -> String {
        self.next += 1;
        format!("call-{}", self.next)
    }

    fn take(queue: &mut VecDeque<(String, String)>, name: &str) -> Option<String> {
        let index = queue.iter().position(|(tool, _)| tool == name)?;
        queue.remove(index).map(|(_, id)| id)
    }

    fn open_id(&self, name: &str) -> Option<&str> {
        self.open
            .iter()
            .find(|(tool, _)| tool == name)
            .map(|(_, id)| id.as_str())
    }

    /// The call that output belongs to: an open call of that tool, or else
    /// the one that finished most recently.
    fn output_id(&self, name: &str) -> Option<&str> {
        self.open_id(name).or_else(|| {
            self.finished
                .iter()
                .rev()
                .find(|(tool, _)| tool == name)
                .map(|(_, id)| id.as_str())
        })
    }

    /// The `toolCall` of a permission request.
    pub(crate) fn permission_call(&mut self, name: &str, arguments: &Value) -> Value {
        let id = if let Some(id) = self.open_id(name) {
            id.to_owned()
        } else {
            let id = self.new_id();
            self.announced.push_back((name.to_owned(), id.clone()));
            id
        };
        json!({
            "toolCallId": id,
            "title": name,
            "kind": tool_kind(name),
            "status": "pending",
            "rawInput": arguments,
        })
    }

    /// The `session/update` payloads for one Crumb activity.
    pub(crate) fn updates(&mut self, activity: &HarnessActivity) -> Vec<Value> {
        match activity {
            HarnessActivity::ResponseDelta { text } => vec![chunk("agent_message_chunk", text)],
            HarnessActivity::ReasoningDelta { text } => vec![chunk("agent_thought_chunk", text)],
            HarnessActivity::ResponseCorrected { text } => {
                vec![chunk(
                    "agent_message_chunk",
                    &format!("\n\n**Corrected answer:**\n\n{text}"),
                )]
            }
            HarnessActivity::ToolStarted { name, detail } => {
                let (id, kind) = match Self::take(&mut self.announced, name) {
                    Some(id) => (id, "tool_call_update"),
                    None => (self.new_id(), "tool_call"),
                };
                self.open.push_back((name.clone(), id.clone()));
                let title = detail
                    .as_deref()
                    .filter(|detail| !detail.is_empty())
                    .map_or_else(|| name.clone(), |detail| format!("{name}: {detail}"));
                vec![json!({
                    "sessionUpdate": kind,
                    "toolCallId": id,
                    "title": title,
                    "kind": tool_kind(name),
                    "status": "in_progress",
                })]
            }
            HarnessActivity::ToolOutput {
                name,
                content: Some(content),
                ..
            } => self
                .output_id(name)
                .map(|id| {
                    vec![json!({
                        "sessionUpdate": "tool_call_update",
                        "toolCallId": id,
                        "content": [{"type": "content", "content": {"type": "text", "text": content}}],
                    })]
                })
                .unwrap_or_default(),
            HarnessActivity::FileChanged { path, .. } => self
                .open
                .back()
                .map(|(_, id)| {
                    vec![json!({
                        "sessionUpdate": "tool_call_update",
                        "toolCallId": id,
                        "locations": [{"path": path}],
                    })]
                })
                .unwrap_or_default(),
            HarnessActivity::ToolFinished { name, success } => Self::take(&mut self.open, name)
                .map(|id| {
                    if self.finished.len() == FINISHED_CALLS {
                        self.finished.pop_front();
                    }
                    self.finished.push_back((name.clone(), id.clone()));
                    vec![json!({
                        "sessionUpdate": "tool_call_update",
                        "toolCallId": id,
                        "status": if *success { "completed" } else { "failed" },
                    })]
                })
                .unwrap_or_default(),
            _ => Vec::new(),
        }
    }
}

fn chunk(kind: &str, text: &str) -> Value {
    json!({"sessionUpdate": kind, "content": {"type": "text", "text": text}})
}

/// ACP's tool kind for a Crumb tool name, used by editors to pick an icon.
pub(crate) fn tool_kind(name: &str) -> &'static str {
    let name = name.to_ascii_lowercase();
    let has = |words: &[&str]| words.iter().any(|word| name.contains(word));
    if has(&["search", "grep", "find", "glob"]) {
        "search"
    } else if has(&["read", "list", "view", "inspect"]) {
        "read"
    } else if has(&["delete", "remove"]) {
        "delete"
    } else if has(&["move", "rename"]) {
        "move"
    } else if has(&["write", "edit", "patch", "apply", "create"]) {
        "edit"
    } else if has(&["command", "shell", "exec", "run", "bash"]) {
        "execute"
    } else if has(&["fetch", "web", "http"]) {
        "fetch"
    } else if has(&["think", "plan"]) {
        "think"
    } else {
        "other"
    }
}

/// Reads newline-delimited messages from `input` on a separate thread, so a
/// cancel or a permission answer arrives while a turn is running.
pub(crate) fn spawn_reader(input: impl BufRead + Send + 'static) -> Receiver<Incoming> {
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        for line in input.lines() {
            let Ok(line) = line else { break };
            if line.trim().is_empty() {
                continue;
            }
            if sender.send(parse_incoming(&line)).is_err() {
                break;
            }
        }
    });
    receiver
}

/// Real Crumb turns: one runtime per ACP session.
pub(crate) struct RuntimeBackend {
    approvals: Option<ApprovalMode>,
    sessions: BTreeMap<String, Session>,
}

struct Session {
    cwd: PathBuf,
    config: AgentConfig,
    runtime: Option<AgentRuntime>,
}

pub(crate) struct RuntimeTurn {
    task: AgentTurnTask,
}

impl RuntimeBackend {
    pub(crate) fn new(approvals: Option<ApprovalMode>) -> Self {
        Self {
            approvals,
            sessions: BTreeMap::new(),
        }
    }

    fn open(&self, cwd: &Path) -> Result<(PathBuf, AgentConfig, AgentRuntime)> {
        let cwd = std::fs::canonicalize(cwd)
            .with_context(|| format!("workspace `{}` is not available", cwd.display()))?;
        let mut config = crate::read_agent_config(&cwd)?;
        if let Some(mode) = self.approvals {
            config.permissions.mode = mode;
        }
        let runtime = crate::exec_runtime(&cwd)?;
        Ok((cwd, config, runtime))
    }
}

impl AcpBackend for RuntimeBackend {
    type Turn = RuntimeTurn;

    fn new_session(&mut self, cwd: &Path) -> Result<String> {
        let (cwd, config, mut runtime) = self.open(cwd)?;
        let session = runtime
            .prepare_local_job(config.mode, &cwd)?
            .as_str()
            .to_owned();
        self.sessions.insert(
            session.clone(),
            Session {
                cwd,
                config,
                runtime: Some(runtime),
            },
        );
        Ok(session)
    }

    fn resume_session(&mut self, session: &str, cwd: &Path) -> Result<()> {
        let (cwd, config, mut runtime) = self.open(cwd)?;
        runtime
            .resume(&cwd, session)
            .with_context(|| format!("session `{session}` could not be resumed"))?;
        self.sessions.insert(
            session.to_owned(),
            Session {
                cwd,
                config,
                runtime: Some(runtime),
            },
        );
        Ok(())
    }

    fn close_session(&mut self, session: &str) -> Result<()> {
        match self.sessions.get(session) {
            Some(open) if open.runtime.is_none() => bail!("session `{session}` is running a turn"),
            Some(_) => {
                self.sessions.remove(session);
                Ok(())
            }
            None => bail!("unknown session `{session}`"),
        }
    }

    fn list_sessions(&self, cwd: Option<&Path>) -> Result<Vec<ListedSession>> {
        let workspace = match cwd {
            Some(cwd) => cwd.to_path_buf(),
            None => crate::current_process_dir()?,
        };
        let workspace = std::fs::canonicalize(&workspace).unwrap_or(workspace);
        let root = crate::agent_runtime::session_root(&workspace);
        if !root.exists() {
            return Ok(Vec::new());
        }
        let mut sessions = crumb_agent::list_sessions(&root)?;
        sessions.retain(|session| !session.archived && session.turns > 0);
        sessions.sort_by_key(|session| std::cmp::Reverse(session.last_event_at_ms));
        Ok(sessions
            .into_iter()
            .map(|session| ListedSession {
                id: session.id.as_str().to_owned(),
                cwd: session.workspace,
                title: session.label,
            })
            .collect())
    }

    fn start_turn(&mut self, session: &str, prompt: String) -> Result<RuntimeTurn> {
        let open = self
            .sessions
            .get_mut(session)
            .ok_or_else(|| anyhow!("unknown session `{session}`"))?;
        let mut runtime = open
            .runtime
            .take()
            .ok_or_else(|| anyhow!("session `{session}` is already running a turn"))?;
        let capacity = usize::try_from(open.config.limits.max_activity_events)
            .unwrap_or(usize::MAX)
            .max(1);
        if let Err(error) = runtime.prepare_local_job(open.config.mode, &open.cwd) {
            open.runtime = Some(runtime);
            return Err(error);
        }
        let task = runtime.spawn_turn(prompt, open.config.clone(), open.cwd.clone(), capacity)?;
        Ok(RuntimeTurn { task })
    }

    fn finish_turn(&mut self, session: &str, turn: RuntimeTurn, cancelled: bool) -> TurnEnd {
        let (runtime, result) = match turn.task.finish() {
            Ok(finished) => finished,
            Err(error) => return TurnEnd::Error(format!("{error:#}")),
        };
        if let Some(open) = self.sessions.get_mut(session) {
            open.runtime = Some(runtime);
        }
        turn_end(result.map(|result| result.finish_reason), cancelled)
    }
}

/// The ACP stop reason for a finished Crumb turn.
pub(crate) fn turn_end(result: Result<Option<String>>, cancelled: bool) -> TurnEnd {
    if cancelled {
        return TurnEnd::Stop("cancelled");
    }
    match result {
        Ok(reason) => TurnEnd::Stop(match reason.as_deref() {
            Some("length" | "max_tokens" | "max_output_tokens") => "max_tokens",
            Some("max_turns" | "max_tool_rounds" | "max_turn_requests") => "max_turn_requests",
            Some("refusal" | "content_filter") => "refusal",
            Some("cancelled") => "cancelled",
            _ => "end_turn",
        }),
        Err(error) => TurnEnd::Error(format!("{error:#}")),
    }
}

impl AcpTurn for RuntimeTurn {
    fn poll(&mut self, timeout: Duration) -> TurnSignal {
        if let Ok(pending) = self.task.recv_approval_timeout(Duration::ZERO) {
            return TurnSignal::Approval(approval_prompt(pending));
        }
        if let Ok(question) = self.task.recv_question_timeout(Duration::ZERO) {
            // ACP v1 has no baseline way to ask the user a question; the
            // agent continues without an answer.
            question.answer(QuestionAnswer::Dismissed);
        }
        match self.task.recv_timeout(timeout) {
            Ok(activity) => TurnSignal::Activity(activity),
            Err(RecvTimeoutError::Timeout) if !self.task.is_finished() => TurnSignal::Idle,
            Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => TurnSignal::Finished,
        }
    }

    fn cancel(&self) {
        self.task.cancel();
    }
}

fn approval_prompt(pending: PendingApproval) -> ApprovalPrompt {
    let tool = pending.request().tool.clone();
    let arguments = pending.arguments().clone();
    ApprovalPrompt::new(tool, arguments, move |allow| {
        let _ = if allow {
            pending.allow_once()
        } else {
            pending.deny()
        };
    })
}

/// `crumb acp`: serves one editor connection on stdin and stdout.
pub(crate) fn serve(approvals: Option<ApprovalMode>) -> Result<()> {
    let incoming = spawn_reader(std::io::BufReader::new(std::io::stdin()));
    let mut server = AcpServer::new(RuntimeBackend::new(approvals), std::io::stdout());
    server.run(&incoming)
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc::{Sender, channel};
    use std::sync::{Arc, Mutex};
    use std::thread::JoinHandle;

    use super::*;

    /// A scripted turn: plays back its signals, then finishes, or idles
    /// until cancelled when `until_cancelled` is set.
    struct ScriptedTurn {
        script: VecDeque<TurnSignal>,
        until_cancelled: bool,
        cancelled: Arc<Mutex<bool>>,
    }

    impl AcpTurn for ScriptedTurn {
        fn poll(&mut self, _timeout: Duration) -> TurnSignal {
            if let Some(signal) = self.script.pop_front() {
                return signal;
            }
            if self.until_cancelled && !*self.cancelled.lock().unwrap() {
                std::thread::sleep(Duration::from_millis(1));
                return TurnSignal::Idle;
            }
            TurnSignal::Finished
        }

        fn cancel(&self) {
            *self.cancelled.lock().unwrap() = true;
        }
    }

    #[derive(Default)]
    struct FakeBackend {
        scripts: VecDeque<(VecDeque<TurnSignal>, bool)>,
        prompts: Arc<Mutex<Vec<String>>>,
        sessions: usize,
        cancelled: Arc<Mutex<bool>>,
    }

    impl AcpBackend for FakeBackend {
        type Turn = ScriptedTurn;

        fn new_session(&mut self, _cwd: &Path) -> Result<String> {
            self.sessions += 1;
            Ok(format!("s{}", self.sessions))
        }

        fn resume_session(&mut self, session: &str, _cwd: &Path) -> Result<()> {
            if session == "missing" {
                bail!("no such session");
            }
            Ok(())
        }

        fn close_session(&mut self, _session: &str) -> Result<()> {
            Ok(())
        }

        fn list_sessions(&self, _cwd: Option<&Path>) -> Result<Vec<ListedSession>> {
            Ok(vec![ListedSession {
                id: "s1".to_owned(),
                cwd: PathBuf::from("/work"),
                title: Some("fix tests".to_owned()),
            }])
        }

        fn start_turn(&mut self, _session: &str, prompt: String) -> Result<ScriptedTurn> {
            self.prompts.lock().unwrap().push(prompt);
            let (script, until_cancelled) = self.scripts.pop_front().unwrap_or_default();
            Ok(ScriptedTurn {
                script,
                until_cancelled,
                cancelled: Arc::clone(&self.cancelled),
            })
        }

        fn finish_turn(&mut self, _session: &str, _turn: ScriptedTurn, cancelled: bool) -> TurnEnd {
            turn_end(Ok(None), cancelled)
        }
    }

    /// Server output, one JSON message per written line.
    struct Lines(Sender<Value>, Vec<u8>);

    impl Write for Lines {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.1.extend_from_slice(bytes);
            while let Some(end) = self.1.iter().position(|byte| *byte == b'\n') {
                let line: Vec<u8> = self.1.drain(..=end).collect();
                let _ = self.0.send(serde_json::from_slice(&line).unwrap());
            }
            Ok(bytes.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    /// A fake editor talking to a server running on its own thread.
    struct Editor {
        to_server: Option<Sender<Incoming>>,
        from_server: Receiver<Value>,
        server: Option<JoinHandle<()>>,
    }

    impl Editor {
        fn start(backend: FakeBackend) -> Self {
            let (to_server, incoming) = channel();
            let (sender, from_server) = channel();
            let server = std::thread::spawn(move || {
                AcpServer::new(backend, Lines(sender, Vec::new()))
                    .run(&incoming)
                    .unwrap();
            });
            Self {
                to_server: Some(to_server),
                from_server,
                server: Some(server),
            }
        }

        fn send(&self, message: Incoming) {
            self.to_server.as_ref().unwrap().send(message).unwrap();
        }

        fn request(&self, id: u64, method: &str, params: Value) {
            self.send(Incoming::Request {
                id: Value::from(id),
                method: method.to_owned(),
                params,
            });
        }

        fn next(&self) -> Value {
            self.from_server
                .recv_timeout(Duration::from_secs(5))
                .expect("the server answers")
        }

        /// Reads messages until the response to request `id`.
        fn until_response(&self, id: u64) -> Vec<Value> {
            let mut seen = Vec::new();
            loop {
                let message = self.next();
                let done = message.get("method").is_none() && message["id"] == id;
                seen.push(message);
                if done {
                    return seen;
                }
            }
        }

        fn close(mut self) {
            self.to_server.take();
            self.server.take().unwrap().join().unwrap();
        }
    }

    /// An absolute workspace path on this platform (`/work` has no drive
    /// letter on Windows, so it is not absolute there).
    fn work_dir() -> String {
        std::env::temp_dir().join("work").display().to_string()
    }

    fn text_prompt(session: &str, text: &str) -> Value {
        json!({"sessionId": session, "prompt": [{"type": "text", "text": text}]})
    }

    fn script(signals: Vec<TurnSignal>, until_cancelled: bool) -> FakeBackend {
        FakeBackend {
            scripts: VecDeque::from([(VecDeque::from(signals), until_cancelled)]),
            ..FakeBackend::default()
        }
    }

    #[test]
    fn messages_are_classified_as_requests_notifications_and_responses() {
        assert!(matches!(
            parse_incoming(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#),
            Incoming::Request { method, .. } if method == "initialize"
        ));
        assert!(matches!(
            parse_incoming(r#"{"jsonrpc":"2.0","method":"session/cancel","params":{}}"#),
            Incoming::Notification { method, .. } if method == "session/cancel"
        ));
        assert!(matches!(
            parse_incoming(r#"{"jsonrpc":"2.0","id":0,"result":{}}"#),
            Incoming::Response { .. }
        ));
        let Incoming::Invalid(error) = parse_incoming("not json") else {
            panic!("expected a parse error");
        };
        assert_eq!(error["error"]["code"], PARSE_ERROR);
        let Incoming::Invalid(error) = parse_incoming(r#"{"jsonrpc":"2.0","id":4}"#) else {
            panic!("expected an invalid request");
        };
        assert_eq!(error["id"], 4);
        assert_eq!(error["error"]["code"], INVALID_REQUEST);
    }

    #[test]
    fn initialize_offers_v1_with_resume_list_and_close() {
        let editor = Editor::start(FakeBackend::default());
        editor.request(0, "initialize", json!({"protocolVersion": 1}));
        let result = editor.next()["result"].clone();
        editor.close();
        assert_eq!(result["protocolVersion"], 1);
        assert_eq!(result["agentInfo"]["name"], "crumb");
        assert_eq!(
            result["agentCapabilities"]["sessionCapabilities"],
            json!({"resume": {}, "list": {}, "close": {}})
        );
        assert_eq!(result["agentCapabilities"]["loadSession"], false);
        assert_eq!(result["authMethods"], json!([]));
    }

    #[test]
    fn terminal_sign_in_is_offered_only_to_editors_that_can_run_it() {
        for capabilities in [
            json!({"auth": {"terminal": true}}),
            json!({"_meta": {"terminal-auth": true}}),
        ] {
            let result = initialize_result(&json!({"clientCapabilities": capabilities}));
            let method = &result["authMethods"][0];
            assert_eq!(method["type"], "terminal");
            assert_eq!(method["args"], json!(["auth", "login"]));
            assert_eq!(
                method["_meta"]["terminal-auth"]["args"],
                json!(["auth", "login"])
            );
        }
        let result =
            initialize_result(&json!({"clientCapabilities": {"auth": {"terminal": false}}}));
        assert_eq!(result["authMethods"], json!([]));
    }

    #[test]
    fn a_prompt_streams_text_and_tools_then_ends_the_turn() {
        let backend = script(
            vec![
                TurnSignal::Activity(HarnessActivity::ReasoningDelta {
                    text: "look first".to_owned(),
                }),
                TurnSignal::Activity(HarnessActivity::ToolStarted {
                    name: "read_file".to_owned(),
                    detail: Some("src/lib.rs".to_owned()),
                }),
                TurnSignal::Activity(HarnessActivity::ToolOutput {
                    name: "read_file".to_owned(),
                    bytes: Some(5),
                    content: Some("hello".to_owned()),
                }),
                TurnSignal::Activity(HarnessActivity::ToolFinished {
                    name: "read_file".to_owned(),
                    success: true,
                }),
                TurnSignal::Activity(HarnessActivity::ResponseDelta {
                    text: "done".to_owned(),
                }),
            ],
            false,
        );
        let prompts = Arc::clone(&backend.prompts);
        let editor = Editor::start(backend);
        editor.request(
            0,
            "session/new",
            json!({"cwd": work_dir(), "mcpServers": []}),
        );
        assert_eq!(editor.next()["result"]["sessionId"], "s1");
        editor.request(1, "session/prompt", text_prompt("s1", "read lib.rs"));
        let out = editor.until_response(1);
        editor.close();
        assert_eq!(*prompts.lock().unwrap(), ["read lib.rs"]);
        let updates: Vec<&Value> = out[..out.len() - 1]
            .iter()
            .map(|line| {
                assert_eq!(line["method"], "session/update");
                assert_eq!(line["params"]["sessionId"], "s1");
                &line["params"]["update"]
            })
            .collect();
        assert_eq!(updates[0]["sessionUpdate"], "agent_thought_chunk");
        assert_eq!(updates[1]["sessionUpdate"], "tool_call");
        assert_eq!(updates[1]["title"], "read_file: src/lib.rs");
        assert_eq!(updates[1]["kind"], "read");
        let id = updates[1]["toolCallId"].clone();
        assert_eq!(updates[2]["toolCallId"], id);
        assert_eq!(updates[2]["content"][0]["content"]["text"], "hello");
        assert_eq!(updates[3]["toolCallId"], id);
        assert_eq!(updates[3]["status"], "completed");
        assert_eq!(updates[4]["content"]["text"], "done");
        assert_eq!(out.last().unwrap()["result"]["stopReason"], "end_turn");
    }

    fn approval_turn(allow: bool) -> (Value, Option<bool>) {
        let decision = Arc::new(Mutex::new(None));
        let recorded = Arc::clone(&decision);
        let backend = script(
            vec![TurnSignal::Approval(ApprovalPrompt::new(
                "run_command",
                json!({"command": "cargo test"}),
                move |allowed| *recorded.lock().unwrap() = Some(allowed),
            ))],
            true,
        );
        let editor = Editor::start(backend);
        editor.request(1, "session/prompt", text_prompt("s1", "test"));
        let asked = editor.next();
        let option = if allow { ALLOW_ONCE } else { REJECT_ONCE };
        editor.send(Incoming::Response {
            id: asked["id"].clone(),
            result: Some(json!({"outcome": {"outcome": "selected", "optionId": option}})),
        });
        // Wait until the decision lands, then end the turn.
        for _ in 0..500 {
            if decision.lock().unwrap().is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        editor.send(Incoming::Notification {
            method: "session/cancel".to_owned(),
            params: json!({"sessionId": "s1"}),
        });
        editor.until_response(1);
        editor.close();
        let decided = *decision.lock().unwrap();
        (asked, decided)
    }

    #[test]
    fn an_approval_waits_for_the_editors_answer() {
        let (asked, decided) = approval_turn(true);
        assert_eq!(asked["method"], "session/request_permission");
        assert_eq!(asked["params"]["sessionId"], "s1");
        assert_eq!(asked["params"]["toolCall"]["kind"], "execute");
        assert_eq!(
            asked["params"]["toolCall"]["rawInput"]["command"],
            "cargo test"
        );
        assert_eq!(decided, Some(true));
        let (_, decided) = approval_turn(false);
        assert_eq!(decided, Some(false));
    }

    #[test]
    fn unanswered_or_cancelled_approvals_deny() {
        assert!(!permission_allowed(Some(
            &json!({"outcome": {"outcome": "cancelled"}})
        )));
        assert!(!permission_allowed(None));
        let decision = Arc::new(Mutex::new(None));
        let recorded = Arc::clone(&decision);
        let backend = script(
            vec![TurnSignal::Approval(ApprovalPrompt::new(
                "run_command",
                json!({}),
                move |allowed| *recorded.lock().unwrap() = Some(allowed),
            ))],
            true,
        );
        let editor = Editor::start(backend);
        editor.request(1, "session/prompt", text_prompt("s1", "test"));
        assert_eq!(editor.next()["method"], "session/request_permission");
        editor.send(Incoming::Notification {
            method: "session/cancel".to_owned(),
            params: json!({"sessionId": "s1"}),
        });
        let out = editor.until_response(1);
        editor.close();
        assert_eq!(out.last().unwrap()["result"]["stopReason"], "cancelled");
        assert_eq!(*decision.lock().unwrap(), Some(false));
    }

    #[test]
    fn closing_the_connection_cancels_a_running_turn() {
        let cancelled = Arc::new(Mutex::new(false));
        let backend = FakeBackend {
            scripts: VecDeque::from([(VecDeque::new(), true)]),
            cancelled: Arc::clone(&cancelled),
            ..FakeBackend::default()
        };
        let editor = Editor::start(backend);
        editor.request(1, "session/prompt", text_prompt("s1", "long task"));
        editor.close();
        assert!(*cancelled.lock().unwrap());
    }

    #[test]
    fn a_second_prompt_during_a_turn_is_refused() {
        let editor = Editor::start(script(Vec::new(), true));
        editor.request(1, "session/prompt", text_prompt("s1", "first"));
        editor.request(2, "session/prompt", text_prompt("s1", "second"));
        let refused = editor.next();
        assert_eq!(refused["id"], 2);
        assert_eq!(refused["error"]["code"], INVALID_REQUEST);
        editor.send(Incoming::Notification {
            method: "session/cancel".to_owned(),
            params: json!({"sessionId": "s1"}),
        });
        let out = editor.until_response(1);
        editor.close();
        assert_eq!(out.last().unwrap()["result"]["stopReason"], "cancelled");
    }

    #[test]
    fn sessions_resume_list_and_reject_bad_parameters() {
        let editor = Editor::start(FakeBackend::default());
        let calls = [
            (
                "session/resume",
                json!({"sessionId": "s9", "cwd": work_dir()}),
            ),
            (
                "session/resume",
                json!({"sessionId": "missing", "cwd": work_dir()}),
            ),
            ("session/list", json!({})),
            ("session/new", json!({"cwd": "relative"})),
            ("session/set_mode", json!({})),
            ("session/prompt", json!({"sessionId": "s1", "prompt": []})),
        ];
        let out: Vec<Value> = calls
            .into_iter()
            .zip(1_u64..)
            .map(|((method, params), id)| {
                editor.request(id, method, params);
                editor.next()
            })
            .collect();
        editor.close();
        assert_eq!(out[0]["result"], json!({}));
        assert_eq!(out[1]["error"]["code"], INTERNAL_ERROR);
        assert_eq!(out[2]["result"]["sessions"][0]["title"], "fix tests");
        assert_eq!(out[3]["error"]["code"], INVALID_PARAMS);
        assert_eq!(out[4]["error"]["code"], METHOD_NOT_FOUND);
        assert_eq!(out[5]["error"]["code"], INVALID_PARAMS);
    }

    #[test]
    fn prompt_blocks_become_one_request() {
        let text = prompt_text(&json!([
            {"type": "text", "text": "explain this"},
            {"type": "resource_link", "name": "lib.rs", "uri": "file:///w/lib.rs"},
            {"type": "resource", "resource": {"uri": "file:///w/a.rs", "text": "fn a() {}"}},
        ]))
        .unwrap();
        assert_eq!(
            text,
            "explain this\n\n[lib.rs](file:///w/lib.rs)\n\n\
             <context uri=\"file:///w/a.rs\">\nfn a() {}\n</context>"
        );
        assert!(
            prompt_text(&json!([{"type": "image", "data": "", "mimeType": "image/png"}])).is_err()
        );
        assert!(prompt_text(&json!([{"type": "text", "text": "  "}])).is_err());
    }

    #[test]
    fn approval_before_start_keeps_one_call_id() {
        let mut tools = ToolCalls::default();
        let asked = tools.permission_call("run_command", &json!({}));
        let started = tools.updates(&HarnessActivity::ToolStarted {
            name: "run_command".to_owned(),
            detail: None,
        });
        assert_eq!(started[0]["sessionUpdate"], "tool_call_update");
        assert_eq!(started[0]["toolCallId"], asked["toolCallId"]);
        let finished = tools.updates(&HarnessActivity::ToolFinished {
            name: "run_command".to_owned(),
            success: false,
        });
        assert_eq!(finished[0]["toolCallId"], asked["toolCallId"]);
        assert_eq!(finished[0]["status"], "failed");
        // Crumb reports output after the finish; it still reaches the call.
        let output = tools.updates(&HarnessActivity::ToolOutput {
            name: "run_shell".to_owned(),
            bytes: Some(7),
            content: Some("acp-ok\n".to_owned()),
        });
        assert!(output.is_empty(), "no run_shell call was made");
        tools.updates(&HarnessActivity::ToolStarted {
            name: "run_shell".to_owned(),
            detail: None,
        });
        let shell = tools.updates(&HarnessActivity::ToolFinished {
            name: "run_shell".to_owned(),
            success: true,
        });
        let output = tools.updates(&HarnessActivity::ToolOutput {
            name: "run_shell".to_owned(),
            bytes: Some(7),
            content: Some("acp-ok\n".to_owned()),
        });
        assert_eq!(output[0]["toolCallId"], shell[0]["toolCallId"]);
        assert_eq!(output[0]["content"][0]["content"]["text"], "acp-ok\n");
    }

    #[test]
    fn stop_reasons_and_tool_kinds() {
        assert_eq!(turn_end(Ok(None), false), TurnEnd::Stop("end_turn"));
        assert_eq!(
            turn_end(Ok(Some("length".to_owned())), false),
            TurnEnd::Stop("max_tokens")
        );
        assert_eq!(
            turn_end(Err(anyhow!("boom")), true),
            TurnEnd::Stop("cancelled")
        );
        assert_eq!(
            turn_end(Err(anyhow!("provider failed")), false),
            TurnEnd::Error("provider failed".to_owned())
        );
        assert_eq!(tool_kind("web_fetch"), "fetch");
        assert_eq!(tool_kind("run_command"), "execute");
        assert_eq!(tool_kind("write_file"), "edit");
        assert_eq!(tool_kind("read_file"), "read");
    }
}
