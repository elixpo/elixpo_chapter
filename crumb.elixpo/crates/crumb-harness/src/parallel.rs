//! Bounded parallel agents exposed as one native tool.
//!
//! Agents are read-only by default. With `access: "write"` each one may edit
//! files and run commands in its own scope; every such action goes through
//! the parent's approval broker, so the user approves helpers the same way
//! they approve the main agent.

use std::num::NonZeroUsize;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, SyncSender};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use crumb_agent::{
    AgentMode, AgentSession, ApprovalBroker, CancellationToken, DenyAllApprovals, RiskClass,
    SessionId, SessionJournal, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
    tool_activity_label,
};
use crumb_llm::LlmProvider;
use serde_json::{Value, json};

use crate::{EventSink, HarnessEvent, HarnessLimits, HarnessTurn, NativeHarness, TeamRegistry};

const SPAWN_AGENTS: &str = "spawn_agents";
const NAMES: [&str; 8] = ["Koi", "Nyx", "Rune", "Echo", "Lux", "Mica", "Rook", "Zed"];
const LOGOS: [&str; 4] = ["◆", "●", "▲", "■"];
const HARD_MAX_AGENTS: usize = 4;
/// Tools that stay with the parent: helpers cannot spawn helpers, ask the
/// user directly, edit the parent's task list, or own background jobs.
const PARENT_ONLY_TOOLS: [&str; 9] = [
    SPAWN_AGENTS,
    "ask_user",
    "update_tasks",
    "start_background",
    "check_background",
    "stop_background",
    "send_peer_message",
    "share_peer_file",
    "list_peer_agents",
];
const MAX_AGENT_NAME_BYTES: usize = 32;
const MAX_AGENT_LOGO_BYTES: usize = 16;
static NEXT_TEAM: AtomicU64 = AtomicU64::new(1);

/// Hard ceilings for one parallel-analysis request.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ParallelAgentLimits {
    pub max_agents: NonZeroUsize,
    pub max_task_bytes: NonZeroUsize,
    pub max_result_bytes: NonZeroUsize,
}

impl Default for ParallelAgentLimits {
    fn default() -> Self {
        Self {
            max_agents: NonZeroUsize::new(4).expect("constant is non-zero"),
            max_task_bytes: NonZeroUsize::new(8 * 1024).expect("constant is non-zero"),
            max_result_bytes: NonZeroUsize::new(16 * 1024).expect("constant is non-zero"),
        }
    }
}

/// Provider and session settings inherited by read-only subagents.
#[derive(Clone)]
pub struct ParallelAgentConfig {
    pub workspace: PathBuf,
    pub journal_root: PathBuf,
    pub model: String,
    pub max_output_tokens: Option<u32>,
    pub harness_limits: HarnessLimits,
    pub team_limits: ParallelAgentLimits,
    /// The parent's approval broker. Without one, only read-only teams run.
    pub approvals: Option<Arc<dyn ApprovalBroker>>,
    /// Live helper status for the agent map.
    pub registry: Option<TeamRegistry>,
}

/// Adds a non-recursive `spawn_agents` tool backed by independent native Harness turns.
///
/// The supplied host is cloned before registration and narrowed to read-only tools,
/// so children cannot mutate the workspace, use network tools, or spawn more agents.
///
/// # Errors
///
/// Returns an error when paths, limits, or model configuration are invalid.
pub fn register_parallel_agent_tool(
    host: &mut ToolHost,
    provider: Arc<dyn LlmProvider>,
    config: ParallelAgentConfig,
) -> Result<()> {
    if config.team_limits.max_agents.get() > HARD_MAX_AGENTS {
        bail!("parallel agent limit cannot exceed the hard maximum of {HARD_MAX_AGENTS}");
    }
    if config.model.trim().is_empty() {
        bail!("parallel agent model must not be empty");
    }
    let workspace = std::fs::canonicalize(&config.workspace).with_context(|| {
        format!(
            "failed to resolve parallel agent workspace `{}`",
            config.workspace.display()
        )
    })?;
    if !workspace.is_dir() {
        bail!("parallel agent workspace must be a directory");
    }
    std::fs::create_dir_all(&config.journal_root).with_context(|| {
        format!(
            "failed to create parallel agent journal root `{}`",
            config.journal_root.display()
        )
    })?;
    let child_tools = host.read_only();
    let write_tools = host.without(&PARENT_ONLY_TOOLS);
    host.register(
        descriptor(config.team_limits),
        Arc::new(ParallelAgentTool {
            provider,
            child_tools,
            write_tools,
            config: ParallelAgentConfig {
                workspace,
                ..config
            },
        }),
    )
}

struct ParallelAgentTool {
    provider: Arc<dyn LlmProvider>,
    child_tools: ToolHost,
    write_tools: ToolHost,
    config: ParallelAgentConfig,
}

impl ToolHandler for ParallelAgentTool {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        self.call_with_progress(arguments, cancellation, &mut |_| {})
    }

    fn call_with_progress(
        &self,
        arguments: &Value,
        cancellation: &CancellationToken,
        progress: &mut dyn FnMut(&str),
    ) -> Result<ToolOutput> {
        match run_team(self, arguments, cancellation, progress) {
            Ok(output) => Ok(output),
            Err(error) if cancellation.is_cancelled() => Err(error),
            Err(error) => Ok(ToolOutput::error(error.to_string())),
        }
    }
}

fn run_team(
    tool: &ParallelAgentTool,
    arguments: &Value,
    cancellation: &CancellationToken,
    progress: &mut dyn FnMut(&str),
) -> Result<ToolOutput> {
    ensure_active(cancellation)?;
    let request = parse_request(arguments, tool.config.team_limits)?;
    let approvals: Arc<dyn ApprovalBroker> = if request.write {
        tool.config
            .approvals
            .clone()
            .context("write access needs an approval channel; run a read-only team instead")?
    } else {
        Arc::new(DenyAllApprovals)
    };
    let team = team_id();
    let assignments = request.assignments;
    let (activity_tx, activity_rx) = mpsc::sync_channel(64);
    let mut workers = Vec::with_capacity(assignments.len());
    for (index, assignment) in assignments.iter().cloned().enumerate() {
        let provider = Arc::clone(&tool.provider);
        let child_tools = if request.write {
            tool.write_tools.clone()
        } else {
            tool.child_tools.clone()
        };
        let config = tool.config.clone();
        let helper = config.registry.clone().map(|registry| {
            let id = registry.begin(
                &assignment.name,
                &assignment.logo,
                &assignment.task,
                request.write,
            );
            (registry, id)
        });
        let worker = WorkerSpec {
            team: team.clone(),
            objective: request.objective.clone(),
            assignments: assignments.clone(),
            index,
            name: assignment.name,
            logo: assignment.logo,
            task: assignment.task,
            provider,
            tools: child_tools,
            approvals: Arc::clone(&approvals),
            write: request.write,
            helper,
            config,
            cancellation: cancellation.clone(),
            activity: activity_tx.clone(),
        };
        workers.push(
            thread::Builder::new()
                .name(format!("crumb-{}", worker.name.to_ascii_lowercase()))
                .spawn(move || run_worker(worker))
                .context("failed to start parallel agent")?,
        );
    }
    drop(activity_tx);

    let total = workers.len();
    let mut reported_active = None;
    loop {
        let active = workers
            .iter()
            .filter(|worker| !worker.is_finished())
            .count();
        if reported_active != Some(active) {
            progress(&team_progress_label(active, total));
            reported_active = Some(active);
        }
        if active == 0 {
            break;
        }
        match activity_rx.recv_timeout(Duration::from_millis(40)) {
            Ok(label) => progress(&label),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    while let Ok(label) = activity_rx.try_recv() {
        progress(&label);
    }
    let mut findings = Vec::with_capacity(workers.len());
    for worker in workers {
        findings.push(
            worker
                .join()
                .map_err(|_| anyhow::anyhow!("parallel agent worker panicked"))??,
        );
    }
    ensure_active(cancellation)?;
    Ok(team_report(
        &team,
        &request.objective,
        &findings,
        tool.config.harness_limits.max_output_bytes.get(),
    ))
}

/// The bounded report the parent reconciles: each agent's finding and the
/// files it changed.
fn team_report(team: &str, objective: &str, findings: &[Finding], limit: usize) -> ToolOutput {
    let reports = findings
        .iter()
        .map(|finding| {
            let changed = if finding.changed_files.is_empty() {
                String::new()
            } else {
                format!("\nchanged files: {}", finding.changed_files.join(", "))
            };
            format!(
                "{} {} [{}]:\n{}{changed}",
                finding.logo,
                finding.name,
                if finding.failed { "failed" } else { "complete" },
                finding.text
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let text = bounded_text(
        format!(
            "Team {team} report\nObjective: {objective}\n\n{reports}\n\nParent action: reconcile agreements, conflicts, and evidence into one final response."
        ),
        limit,
    );
    ToolOutput {
        text,
        structured: Some(json!({
            "team_id": team,
            "objective": objective,
            "status": if findings.iter().any(|finding| finding.failed) { "partial" } else { "complete" },
            "agents": findings.iter().map(|finding| json!({
                "name": finding.name,
                "logo": finding.logo,
                "session_id": finding.session_id,
                "status": if finding.failed { "failed" } else { "complete" },
                "finding": finding.text,
                "changed_files": finding.changed_files,
            })).collect::<Vec<_>>()
        })),
        is_error: findings.iter().any(|finding| finding.failed),
    }
}

struct Finding {
    name: String,
    logo: String,
    session_id: String,
    text: String,
    failed: bool,
    changed_files: Vec<String>,
}

struct WorkerSpec {
    team: String,
    objective: String,
    assignments: Vec<AgentAssignment>,
    index: usize,
    name: String,
    logo: String,
    task: String,
    provider: Arc<dyn LlmProvider>,
    tools: ToolHost,
    approvals: Arc<dyn ApprovalBroker>,
    write: bool,
    helper: Option<(TeamRegistry, u64)>,
    config: ParallelAgentConfig,
    cancellation: CancellationToken,
    activity: SyncSender<String>,
}

fn run_worker(worker: WorkerSpec) -> Result<Finding> {
    let WorkerSpec {
        team,
        objective,
        assignments,
        index,
        name,
        logo,
        task,
        provider,
        tools,
        approvals,
        write,
        helper,
        config,
        cancellation,
        activity,
    } = worker;
    publish_activity(&activity, format!("{logo} {name} · Inspecting assignment"));
    // Display identities are user-facing Unicode. Durable identifiers are
    // generated independently so spaces, emoji, and punctuation cannot make
    // a valid display name fail SessionId validation.
    let session_id = SessionId::new(format!("agent-{team}-{}", index + 1))?;
    let journal = SessionJournal::open(&config.journal_root, &session_id)?;
    let mut session = AgentSession::start(
        session_id.clone(),
        AgentMode::Auto,
        config.workspace,
        journal,
    )?;
    let harness = NativeHarness::new(provider, tools, approvals, config.harness_limits);
    let mut conversation = harness.conversation();
    let mut events = TeamEvents::new(name.clone(), activity.clone());
    events.helper.clone_from(&helper);
    let roster = assignments
        .iter()
        .map(|assignment| {
            format!(
                "- {} {}: {}",
                assignment.logo, assignment.name, assignment.task
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let role = if write {
        "a member of a Crumb agent team supervised by the parent Harness. You may edit files and run commands, but only inside your assignment's scope: never touch files a sibling owns, and verify your changes (build or test) before reporting. The user approves each action. Report what you changed and how you verified it."
    } else {
        "one read-only member of a Crumb agent team supervised by the parent Harness. Do not request mutations."
    };
    let turn = HarnessTurn {
        model: config.model,
        user_message: format!(
            "You are {logo} {name}, {role} Work only on your assignment, avoid duplicating sibling scopes, cite concrete paths or evidence, and flag dependencies, disagreements, or uncertainty for parent synthesis. Do not claim to be the final answer.\n\nShared objective:\n{objective}\n\nTeam assignments:\n{roster}\n\nYour assignment:\n{task}"
        ),
        images: Vec::new(),
        persona: None,
        static_context: Vec::new(),
        selected_skills: Vec::new(),
        trusted_context: Vec::new(),
        max_output_tokens: config.max_output_tokens,
    };
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .context("failed to start parallel agent runtime")?;
    let outcome = runtime.block_on(harness.run_turn(
        &mut session,
        &mut conversation,
        turn,
        &cancellation,
        &mut events,
    ));
    let (text, failed) = match outcome {
        Ok(outcome) => {
            publish_activity(&activity, format!("{logo} {name} · Reported findings"));
            (
                bounded_text(outcome.text, config.team_limits.max_result_bytes.get()),
                false,
            )
        }
        Err(error) => {
            publish_activity(&activity, format!("{logo} {name} · Failed safely"));
            (format!("analysis failed: {error}"), true)
        }
    };
    if let Some((registry, id)) = &helper {
        registry.finish(*id, failed);
    }
    Ok(Finding {
        name,
        logo,
        session_id: session_id.as_str().to_owned(),
        text,
        failed,
        changed_files: events.changed_files,
    })
}

fn team_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis());
    let sequence = NEXT_TEAM.fetch_add(1, Ordering::Relaxed);
    format!("{}-{timestamp}-{sequence}", std::process::id())
}

struct TeamRequest {
    objective: String,
    assignments: Vec<AgentAssignment>,
    write: bool,
}

#[derive(Clone)]
struct AgentAssignment {
    name: String,
    logo: String,
    task: String,
}

fn parse_request(arguments: &Value, limits: ParallelAgentLimits) -> Result<TeamRequest> {
    let objective = arguments
        .get("objective")
        .and_then(Value::as_str)
        .unwrap_or("Parallel investigation requested by the parent Harness")
        .trim();
    if objective.is_empty() || objective.len() > limits.max_task_bytes.get() {
        bail!("parallel agent objective is empty or exceeds the byte limit");
    }
    let tasks = arguments
        .get("tasks")
        .and_then(Value::as_array)
        .context("tasks must be an array")?;
    if tasks.len() < 2 {
        bail!("parallel analysis requires at least two tasks");
    }
    let maximum = limits.max_agents.get().min(HARD_MAX_AGENTS);
    if tasks.len() > maximum {
        bail!("parallel analysis exceeds the configured agent limit");
    }
    let assignments = tasks
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let (name, logo, task) = if let Some(task) = value.as_str() {
                (NAMES[index], LOGOS[index], task)
            } else {
                let object = value
                    .as_object()
                    .context("each agent must be a task string or an agent object")?;
                let name = object
                    .get("name")
                    .and_then(Value::as_str)
                    .context("agent name must be a string")?
                    .trim();
                let logo = object
                    .get("logo")
                    .and_then(Value::as_str)
                    .context("agent logo must be a string")?
                    .trim();
                let task = object
                    .get("task")
                    .and_then(Value::as_str)
                    .context("agent task must be a string")?;
                (name, logo, task)
            };
            validate_agent_identity(name, logo)?;
            let task = task.trim();
            if task.is_empty() || task.len() > limits.max_task_bytes.get() {
                bail!("parallel agent task is empty or exceeds the byte limit");
            }
            Ok(AgentAssignment {
                name: name.to_owned(),
                logo: logo.to_owned(),
                task: task.to_owned(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let mut names = std::collections::BTreeSet::new();
    if assignments
        .iter()
        .any(|assignment| !names.insert(assignment.name.to_lowercase()))
    {
        bail!("parallel agent names must be unique");
    }
    let write = match arguments.get("access").and_then(Value::as_str) {
        None | Some("read") => false,
        Some("write") => true,
        Some(_) => bail!("access must be read or write"),
    };
    Ok(TeamRequest {
        objective: objective.to_owned(),
        assignments,
        write,
    })
}

fn validate_agent_identity(name: &str, logo: &str) -> Result<()> {
    if name.is_empty()
        || name.len() > MAX_AGENT_NAME_BYTES
        || name.chars().any(|character| {
            character.is_control() || matches!(character, '/' | '\\' | ':' | '[' | ']')
        })
    {
        bail!("agent name must be 1-{MAX_AGENT_NAME_BYTES} safe display bytes");
    }
    if logo.is_empty()
        || logo.len() > MAX_AGENT_LOGO_BYTES
        || logo.chars().count() > 4
        || logo.chars().any(char::is_control)
    {
        bail!("agent logo must be 1-4 visible characters");
    }
    Ok(())
}

fn bounded_text(mut text: String, limit: usize) -> String {
    if text.len() <= limit {
        return text;
    }
    let mut boundary = limit;
    while !text.is_char_boundary(boundary) {
        boundary -= 1;
    }
    text.truncate(boundary);
    text
}

fn ensure_active(cancellation: &CancellationToken) -> Result<()> {
    if cancellation.is_cancelled() {
        bail!("tool call cancelled");
    }
    Ok(())
}

struct TeamEvents {
    name: String,
    activity: SyncSender<String>,
    reporting: bool,
    changed_files: Vec<String>,
    helper: Option<(TeamRegistry, u64)>,
}

impl TeamEvents {
    fn new(name: String, activity: SyncSender<String>) -> Self {
        Self {
            name,
            activity,
            reporting: false,
            changed_files: Vec::new(),
            helper: None,
        }
    }
}

impl EventSink for TeamEvents {
    fn emit(&mut self, event: HarnessEvent) {
        if let (HarnessEvent::Usage(usage), Some((registry, id))) = (&event, &self.helper) {
            let tokens = usage.input_tokens.saturating_add(usage.output_tokens);
            registry.update(*id, |helper| {
                helper.tokens = helper.tokens.saturating_add(tokens);
            });
        }
        let label = match event {
            HarnessEvent::TurnStarted => Some("Thinking".to_owned()),
            HarnessEvent::ToolRequested { name, detail, .. } => Some(detail.map_or_else(
                || tool_activity_label(&name),
                |detail| format!("{} · {detail}", tool_activity_label(&name)),
            )),
            HarnessEvent::ToolProgress { label, .. } => Some(label),
            HarnessEvent::ToolFinished { name, success, .. } => Some(format!(
                "{} · {}",
                tool_activity_label(&name),
                if success { "done" } else { "failed" }
            )),
            HarnessEvent::TextDelta(_) if !self.reporting => {
                self.reporting = true;
                Some("Reporting findings".to_owned())
            }
            HarnessEvent::FileChanged { path, .. } => {
                if !self.changed_files.contains(&path) {
                    self.changed_files.push(path.clone());
                }
                Some(format!("Edited {path}"))
            }
            HarnessEvent::ToolOutput { .. }
            | HarnessEvent::TextDelta(_)
            | HarnessEvent::ReasoningDelta(_)
            | HarnessEvent::ResponseRevised
            | HarnessEvent::Correction(_)
            | HarnessEvent::Usage(_)
            | HarnessEvent::TurnFinished => None,
        };
        if let Some(label) = label {
            if let Some((registry, id)) = &self.helper {
                registry.update(*id, |helper| helper.activity.clone_from(&label));
            }
            publish_activity(&self.activity, format!("{} · {label}", self.name));
        }
    }
}

const TEAM_PROGRESS_SUFFIX: &str = " parallel agents working";

/// Progress label announcing how many team members are still running.
#[must_use]
pub fn team_progress_label(active: usize, total: usize) -> String {
    format!("{active} of {total}{TEAM_PROGRESS_SUFFIX}")
}

/// Parses a [`team_progress_label`] into `(active, total)`.
#[must_use]
pub fn parse_team_progress(label: &str) -> Option<(usize, usize)> {
    let (active, total) = label
        .strip_suffix(TEAM_PROGRESS_SUFFIX)?
        .split_once(" of ")?;
    Some((active.parse().ok()?, total.parse().ok()?))
}

fn publish_activity(activity: &SyncSender<String>, label: String) {
    let _ = activity.try_send(label);
}

fn descriptor(limits: ParallelAgentLimits) -> ToolDescriptor {
    ToolDescriptor {
        name: SPAWN_AGENTS.to_owned(),
        description: "Run two to four named agents concurrently toward one objective and get a bounded team report. access read (default) is for parallel investigation; write lets each agent edit files and run commands in its own non-overlapping scope, with every action approved by the user.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "access": {
                    "type": "string",
                    "enum": ["read", "write"],
                    "description": "read (default) or write; give write agents non-overlapping files or folders."
                },
                "objective": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": limits.max_task_bytes.get(),
                    "description": "Shared outcome the parent Harness wants the team to achieve"
                },
                "tasks": {
                    "type": "array",
                    "minItems": 2,
                    "maxItems": limits.max_agents.get().min(HARD_MAX_AGENTS),
                    "description": "Two to four independent assignments. Use agent objects when custom terminal names and logos help distinguish roles.",
                    "items": {
                        "oneOf": [
                            {"type": "string", "minLength": 1, "maxLength": limits.max_task_bytes.get()},
                            {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string", "minLength": 1, "maxLength": MAX_AGENT_NAME_BYTES},
                                    "logo": {"type": "string", "minLength": 1, "maxLength": 4},
                                    "task": {"type": "string", "minLength": 1, "maxLength": limits.max_task_bytes.get()}
                                },
                                "required": ["name", "logo", "task"],
                                "additionalProperties": false
                            }
                        ]
                    }
                }
            },
            "required": ["tasks"],
            "additionalProperties": false
        }),
        risk: RiskClass::NetworkAccess,
        transport: ToolTransport::Native,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::num::NonZeroUsize;
    use std::sync::Arc;
    use std::time::Duration;

    use crumb_agent::{AgentMode, CancellationToken, ConfiguredApprovals, ToolHost};
    use crumb_llm::{ChatEvent, EmbeddingResponse, FinishReason, MockProvider, TokenUsage};
    use serde_json::json;

    #[test]
    fn team_progress_labels_round_trip() {
        let label = super::team_progress_label(3, 4);
        assert_eq!(label, "3 of 4 parallel agents working");
        assert_eq!(super::parse_team_progress(&label), Some((3, 4)));
        assert_eq!(
            super::parse_team_progress("Koi · Inspecting assignment"),
            None
        );
    }
    use tempfile::TempDir;

    use super::{
        NAMES, ParallelAgentConfig, ParallelAgentLimits, parse_request,
        register_parallel_agent_tool,
    };
    use crate::HarnessLimits;

    /// Calls `note_write` until a tool result is in the conversation, then answers.
    struct ToolThenAnswer;

    struct Events(std::collections::VecDeque<ChatEvent>);

    impl crumb_llm::ChatStream for Events {
        fn next(&mut self) -> crumb_llm::ProviderFuture<'_, Option<ChatEvent>> {
            Box::pin(std::future::ready(Ok(self.0.pop_front())))
        }
    }

    impl crumb_llm::LlmProvider for ToolThenAnswer {
        fn name(&self) -> &'static str {
            "tool-then-answer"
        }

        fn list_models(&self) -> crumb_llm::ProviderFuture<'_, Vec<crumb_llm::ModelInfo>> {
            Box::pin(std::future::ready(Ok(Vec::new())))
        }

        fn chat_stream(
            &self,
            request: crumb_llm::ChatRequest,
        ) -> crumb_llm::ProviderFuture<'_, Box<dyn crumb_llm::ChatStream>> {
            let answered = request
                .messages
                .iter()
                .any(|message| message.role == crumb_llm::ChatRole::Tool);
            let events = if answered {
                vec![
                    ChatEvent::TextDelta("Wrote the note and checked it.".to_owned()),
                    ChatEvent::Finished(FinishReason::Stop),
                ]
            } else {
                vec![
                    ChatEvent::ToolCall(crumb_llm::ToolCall {
                        id: "call_1".to_owned(),
                        name: "note_write".to_owned(),
                        arguments: json!({}),
                    }),
                    ChatEvent::Finished(FinishReason::ToolCall),
                ]
            };
            Box::pin(std::future::ready(Ok(
                Box::new(Events(events.into())) as Box<dyn crumb_llm::ChatStream>
            )))
        }

        fn embeddings(
            &self,
            _request: crumb_llm::EmbeddingRequest,
        ) -> crumb_llm::ProviderFuture<'_, EmbeddingResponse> {
            Box::pin(std::future::ready(Err(crumb_llm::ProviderError::new(
                crumb_llm::ProviderErrorKind::Other,
                "unused",
                false,
            ))))
        }
    }

    struct NoteWrite(Arc<std::sync::atomic::AtomicUsize>);

    impl crumb_agent::ToolHandler for NoteWrite {
        fn call(
            &self,
            _arguments: &serde_json::Value,
            _cancellation: &CancellationToken,
        ) -> anyhow::Result<crumb_agent::ToolOutput> {
            self.0.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            Ok(crumb_agent::ToolOutput::text("note written"))
        }
    }

    struct CountingApprovals(Arc<std::sync::atomic::AtomicUsize>);

    impl crumb_agent::ApprovalBroker for CountingApprovals {
        fn decide(
            &self,
            _request: &crumb_agent::ApprovalRequest,
            _arguments: &serde_json::Value,
            _cancellation: &CancellationToken,
        ) -> crumb_agent::ApprovalDecision {
            self.0.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            crumb_agent::ApprovalDecision::AllowOnce
        }
    }

    fn write_team(
        approvals: Option<Arc<dyn crumb_agent::ApprovalBroker>>,
    ) -> (TempDir, ToolHost, Arc<std::sync::atomic::AtomicUsize>) {
        let workspace = TempDir::new().expect("workspace");
        let writes = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut host = ToolHost::default();
        host.register(
            crumb_agent::ToolDescriptor {
                name: "note_write".to_owned(),
                description: "write a note".to_owned(),
                input_schema: json!({"type": "object"}),
                risk: crumb_agent::RiskClass::WriteWorkspace,
                transport: crumb_agent::ToolTransport::Native,
            },
            Arc::new(NoteWrite(Arc::clone(&writes))),
        )
        .expect("note tool");
        register_parallel_agent_tool(
            &mut host,
            Arc::new(ToolThenAnswer),
            ParallelAgentConfig {
                workspace: workspace.path().to_path_buf(),
                journal_root: workspace.path().join("agents"),
                model: "fixture".to_owned(),
                max_output_tokens: Some(128),
                harness_limits: HarnessLimits {
                    turn_timeout: Duration::from_secs(5),
                    ..HarnessLimits::default()
                },
                team_limits: ParallelAgentLimits::default(),
                approvals,
                registry: None,
            },
        )
        .expect("parallel tool registers");
        (workspace, host, writes)
    }

    #[test]
    fn write_teams_act_through_the_parent_approvals_and_report_it() {
        let approved = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let broker: Arc<dyn crumb_agent::ApprovalBroker> =
            Arc::new(CountingApprovals(Arc::clone(&approved)));
        let (_workspace, host, writes) = write_team(Some(Arc::clone(&broker)));
        let parent_approvals =
            ConfiguredApprovals::new(BTreeSet::from(["spawn_agents".to_owned()]));

        let output = host
            .call(
                "spawn_agents",
                &json!({"access": "write", "objective": "write notes", "tasks": ["note a", "note b"]}),
                AgentMode::Auto,
                &parent_approvals,
                &CancellationToken::default(),
            )
            .expect("write team runs");

        assert!(!output.is_error, "{}", output.text);
        assert_eq!(writes.load(std::sync::atomic::Ordering::Relaxed), 2);
        assert_eq!(
            approved.load(std::sync::atomic::Ordering::Relaxed),
            2,
            "each write is approved"
        );
        assert!(output.text.contains("[complete]:"), "{}", output.text);
        assert!(output.text.contains("note written"), "{}", output.text);
    }

    #[test]
    fn read_teams_never_write_and_write_teams_need_an_approval_channel() {
        let (_workspace, host, writes) = write_team(None);
        let parent_approvals =
            ConfiguredApprovals::new(BTreeSet::from(["spawn_agents".to_owned()]));
        let refused = host
            .call(
                "spawn_agents",
                &json!({"access": "write", "tasks": ["a", "b"]}),
                AgentMode::Auto,
                &parent_approvals,
                &CancellationToken::default(),
            )
            .expect("tool answers");
        assert!(refused.is_error);
        assert!(refused.text.contains("approval channel"));

        let read = host
            .call(
                "spawn_agents",
                &json!({"tasks": ["a", "b"]}),
                AgentMode::Auto,
                &parent_approvals,
                &CancellationToken::default(),
            )
            .expect("read team runs");
        assert_eq!(
            writes.load(std::sync::atomic::Ordering::Relaxed),
            0,
            "{}",
            read.text
        );
    }

    #[test]
    fn short_names_are_unique_and_terminal_friendly() {
        let unique = NAMES.into_iter().collect::<std::collections::BTreeSet<_>>();
        assert_eq!(unique.len(), NAMES.len());
        assert!(NAMES.iter().all(|name| name.len() <= 4));
    }

    #[test]
    fn task_fanout_is_bounded() {
        let limits = ParallelAgentLimits {
            max_agents: NonZeroUsize::new(2).unwrap(),
            max_task_bytes: NonZeroUsize::new(8).unwrap(),
            max_result_bytes: NonZeroUsize::new(32).unwrap(),
        };
        let request = parse_request(
            &json!({"objective":"ship it", "tasks":["one", "two"]}),
            limits,
        )
        .expect("bounded team request");
        assert_eq!(request.objective, "ship it");
        assert!(parse_request(&json!({"tasks":["one"]}), limits).is_err());
        assert!(parse_request(&json!({"tasks":["one", "two", "three"]}), limits).is_err());
        assert!(parse_request(&json!({"tasks":["too long!", "two"]}), limits).is_err());

        let permissive = ParallelAgentLimits {
            max_agents: NonZeroUsize::new(8).unwrap(),
            ..limits
        };
        assert!(
            parse_request(
                &json!({"tasks":["one", "two", "tri", "four", "five"]}),
                permissive
            )
            .is_err()
        );
    }

    #[test]
    fn custom_agent_identities_are_bounded_and_unique() {
        let limits = ParallelAgentLimits::default();
        let request = parse_request(
            &json!({
                "tasks":[
                    {"name":"UI Scout", "logo":"🖼️", "task":"inspect auth"},
                    {"name":"Builder", "logo":"🛠️", "task":"inspect UI"}
                ]
            }),
            limits,
        )
        .expect("custom identities");
        assert_eq!(request.assignments[0].name, "UI Scout");
        assert_eq!(request.assignments[0].logo, "🖼️");
        assert_eq!(request.assignments[1].name, "Builder");
        assert!(
            parse_request(
                &json!({"tasks":[
                    {"name":"Scout", "logo":"🔎", "task":"one"},
                    {"name":"scout", "logo":"🛠️", "task":"two"}
                ]}),
                limits
            )
            .is_err()
        );
        assert!(
            parse_request(
                &json!({"tasks":[
                    {"name":"bad/name", "logo":"🔎", "task":"one"},
                    {"name":"Builder", "logo":"🛠️", "task":"two"}
                ]}),
                limits
            )
            .is_err()
        );
    }

    #[test]
    fn registered_tool_runs_named_workers_and_journals_each_one() {
        let workspace = TempDir::new().expect("workspace");
        let journal_root = workspace.path().join("sessions/agents");
        let provider = MockProvider::new(
            Vec::new(),
            vec![
                ChatEvent::TextDelta("evidence".to_owned()),
                ChatEvent::Finished(FinishReason::Stop),
            ],
            EmbeddingResponse {
                vectors: Vec::new(),
                usage: TokenUsage::default(),
            },
        );
        let mut host = ToolHost::default();
        register_parallel_agent_tool(
            &mut host,
            Arc::new(provider),
            ParallelAgentConfig {
                workspace: workspace.path().to_path_buf(),
                journal_root: journal_root.clone(),
                model: "fixture".to_owned(),
                max_output_tokens: Some(128),
                harness_limits: HarnessLimits {
                    turn_timeout: Duration::from_secs(2),
                    ..HarnessLimits::default()
                },
                team_limits: ParallelAgentLimits::default(),
                approvals: None,
                registry: None,
            },
        )
        .expect("parallel tool registers");
        let approvals = ConfiguredApprovals::new(BTreeSet::from(["spawn_agents".to_owned()]));

        let mut progress = Vec::new();
        let output = host
            .call_with_progress(
                "spawn_agents",
                &json!({
                    "objective":"map both surfaces",
                    "tasks":[
                        {"name":"UI Scout", "logo":"🖼️", "task":"inspect one"},
                        {"name":"Builder", "logo":"🛠️", "task":"inspect two"}
                    ]
                }),
                AgentMode::Auto,
                &approvals,
                &CancellationToken::default(),
                &mut |label| progress.push(label.to_owned()),
            )
            .expect("parallel analysis succeeds");

        assert!(!output.is_error);
        assert!(output.text.contains("Objective: map both surfaces"));
        assert!(output.text.contains("🖼️ UI Scout [complete]:\nevidence"));
        assert!(output.text.contains("🛠️ Builder [complete]:\nevidence"));
        assert!(output.text.contains("Parent action: reconcile"));
        assert_eq!(
            output
                .structured
                .as_ref()
                .and_then(|value| value.get("status"))
                .and_then(serde_json::Value::as_str),
            Some("complete")
        );
        assert_eq!(
            output
                .structured
                .as_ref()
                .and_then(|value| value["agents"][0]["logo"].as_str()),
            Some("🖼️")
        );
        assert_eq!(
            std::fs::read_dir(journal_root)
                .expect("journals exist")
                .count(),
            2
        );
        assert!(
            progress
                .iter()
                .any(|label| label == "🖼️ UI Scout · Inspecting assignment")
        );
        assert!(
            progress
                .iter()
                .any(|label| label.starts_with("🛠️ Builder ·"))
        );
    }
}
