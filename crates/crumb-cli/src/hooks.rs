//! Runs user-configured hook commands around agent tool calls.
//!
//! Each hook gets a JSON event on stdin and the `CRUMB_HOOK_EVENT` and
//! `CRUMB_WORKSPACE` environment variables. Exit status 2 means "block" for
//! `pre_tool` and "tell the model" for `post_tool`; stderr carries the text.
//! Any other outcome, including a timeout or a hook that cannot start, lets
//! the call proceed: hooks can only restrict or annotate, never approve.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crumb_agent::{CancellationToken, HookCommand, HookSettings, TurnStatus};
use crumb_harness::ToolHooks;
use serde_json::{Value, json};

/// Text taken from a hook's stderr is capped at this many bytes.
const MAX_HOOK_TEXT: usize = 2 * 1024;
/// Exit status that blocks (`pre_tool`) or annotates (`post_tool`).
const HOOK_SIGNAL_STATUS: i32 = 2;

pub(crate) struct CommandHooks {
    settings: HookSettings,
    workspace: PathBuf,
}

impl CommandHooks {
    pub(crate) fn new(settings: HookSettings, workspace: PathBuf) -> Self {
        Self {
            settings,
            workspace,
        }
    }

    /// Runs every matching hook; returns the stderr of those that exited
    /// with the signal status.
    fn signals(
        &self,
        hooks: &[HookCommand],
        event: &str,
        tool: Option<&str>,
        payload: &Value,
        cancellation: &CancellationToken,
        stop_at_first: bool,
    ) -> Vec<String> {
        let mut signals = Vec::new();
        for hook in hooks.iter().filter(|hook| applies(hook, tool)) {
            if let HookOutcome::Signal(text) =
                run_hook(hook, event, &self.workspace, payload, cancellation)
            {
                signals.push(text);
                if stop_at_first {
                    break;
                }
            }
        }
        signals
    }

    fn payload(&self, event: &str, tool: &str, arguments: &Value) -> Value {
        json!({
            "event": event,
            "tool": tool,
            "arguments": arguments,
            "workspace": self.workspace,
        })
    }
}

impl ToolHooks for CommandHooks {
    fn before_tool(
        &self,
        tool: &str,
        arguments: &Value,
        cancellation: &CancellationToken,
    ) -> Option<String> {
        let payload = self.payload("pre_tool", tool, arguments);
        self.signals(
            &self.settings.pre_tool,
            "pre_tool",
            Some(tool),
            &payload,
            cancellation,
            true,
        )
        .into_iter()
        .next()
    }

    fn after_tool(
        &self,
        tool: &str,
        arguments: &Value,
        cancellation: &CancellationToken,
    ) -> Option<String> {
        let payload = self.payload("post_tool", tool, arguments);
        let notes = self.signals(
            &self.settings.post_tool,
            "post_tool",
            Some(tool),
            &payload,
            cancellation,
            false,
        );
        (!notes.is_empty()).then(|| notes.join("\n"))
    }

    fn turn_finished(&self, status: TurnStatus) {
        let payload = json!({
            "event": "on_stop",
            "status": status,
            "workspace": self.workspace,
        });
        // The turn is over; nothing a stop hook says changes it.
        let _ = self.signals(
            &self.settings.on_stop,
            "on_stop",
            None,
            &payload,
            &CancellationToken::default(),
            false,
        );
    }
}

fn applies(hook: &HookCommand, tool: Option<&str>) -> bool {
    match tool {
        None => true,
        Some(tool) => {
            hook.tools.is_empty() || hook.tools.iter().any(|name| name == tool || name == "*")
        }
    }
}

#[derive(Debug, Eq, PartialEq)]
enum HookOutcome {
    Pass,
    Signal(String),
}

fn run_hook(
    hook: &HookCommand,
    event: &str,
    workspace: &PathBuf,
    payload: &Value,
    cancellation: &CancellationToken,
) -> HookOutcome {
    let (shell, flag) = if cfg!(windows) {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    };
    let Ok(mut child) = Command::new(shell)
        .args([flag, &hook.command])
        .current_dir(workspace)
        .env("CRUMB_HOOK_EVENT", event)
        .env("CRUMB_WORKSPACE", workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
    else {
        return HookOutcome::Pass;
    };
    if let Some(mut stdin) = child.stdin.take() {
        // A hook that ignores stdin may close it early; that is fine.
        let _ = stdin.write_all(payload.to_string().as_bytes());
    }
    let stderr = child.stderr.take().map(|mut pipe| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            bytes
        })
    });
    let timeout = Duration::from_secs(hook.timeout_secs.max(1));
    let started = Instant::now();
    let status = loop {
        if let Ok(Some(status)) = child.try_wait() {
            break status;
        }
        if cancellation.is_cancelled() || started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return HookOutcome::Pass;
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    if status.code() != Some(HOOK_SIGNAL_STATUS) {
        return HookOutcome::Pass;
    }
    let text = stderr
        .and_then(|handle| handle.join().ok())
        .map(|bytes| String::from_utf8_lossy(&bytes).trim().to_owned())
        .unwrap_or_default();
    HookOutcome::Signal(if text.is_empty() {
        format!("`{}` objected without giving a reason", hook.command)
    } else {
        cap(&text)
    })
}

fn cap(text: &str) -> String {
    if text.len() <= MAX_HOOK_TEXT {
        return text.to_owned();
    }
    let mut end = MAX_HOOK_TEXT;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &text[..end])
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn hook(command: &str, tools: &[&str]) -> HookCommand {
        HookCommand {
            command: command.to_owned(),
            tools: tools.iter().map(|tool| (*tool).to_owned()).collect(),
            timeout_secs: 5,
        }
    }

    fn hooks(settings: HookSettings) -> (tempfile::TempDir, CommandHooks) {
        let root = tempfile::tempdir().expect("tempdir");
        let hooks = CommandHooks::new(settings, root.path().to_path_buf());
        (root, hooks)
    }

    #[test]
    fn exit_two_blocks_with_stderr_as_the_reason() {
        let (_root, hooks) = hooks(HookSettings {
            pre_tool: vec![hook("echo 'no rm -rf' >&2; exit 2", &["run_shell"])],
            ..HookSettings::default()
        });
        let token = CancellationToken::default();

        assert_eq!(
            hooks.before_tool("run_shell", &json!({"command":"rm -rf /"}), &token),
            Some("no rm -rf".to_owned())
        );
        assert_eq!(hooks.before_tool("read_file", &json!({}), &token), None);
    }

    #[test]
    fn the_hook_receives_the_event_on_stdin() {
        let (root, hooks) = hooks(HookSettings {
            pre_tool: vec![hook("cat > event.json", &[])],
            ..HookSettings::default()
        });

        let blocked = hooks.before_tool(
            "edit_file",
            &json!({"path":"src/lib.rs"}),
            &CancellationToken::default(),
        );

        assert_eq!(blocked, None);
        let event: Value = serde_json::from_slice(
            &std::fs::read(root.path().join("event.json")).expect("event written"),
        )
        .expect("json");
        assert_eq!(event["event"], "pre_tool");
        assert_eq!(event["tool"], "edit_file");
        assert_eq!(event["arguments"]["path"], "src/lib.rs");
    }

    #[test]
    fn other_failures_and_timeouts_do_not_block() {
        let (_root, hooks) = hooks(HookSettings {
            pre_tool: vec![
                hook("exit 1", &[]),
                HookCommand {
                    timeout_secs: 1,
                    ..hook("sleep 5; exit 2", &[])
                },
            ],
            ..HookSettings::default()
        });

        assert_eq!(
            hooks.before_tool("edit_file", &json!({}), &CancellationToken::default()),
            None
        );
    }

    #[test]
    fn post_tool_notes_are_collected_from_every_signalling_hook() {
        let (_root, hooks) = hooks(HookSettings {
            post_tool: vec![
                hook("echo 'formatted 1 file' >&2; exit 2", &["edit_file"]),
                hook("exit 0", &[]),
                hook("echo 'lint: ok' >&2; exit 2", &["*"]),
            ],
            ..HookSettings::default()
        });

        assert_eq!(
            hooks.after_tool("edit_file", &json!({}), &CancellationToken::default()),
            Some("formatted 1 file\nlint: ok".to_owned())
        );
    }

    #[test]
    fn stop_hooks_get_the_turn_status() {
        let (root, hooks) = hooks(HookSettings {
            on_stop: vec![hook("cat > stop.json", &["ignored_for_stop"])],
            ..HookSettings::default()
        });

        hooks.turn_finished(TurnStatus::Complete);

        let event: Value = serde_json::from_slice(
            &std::fs::read(root.path().join("stop.json")).expect("event written"),
        )
        .expect("json");
        assert_eq!(event["event"], "on_stop");
        assert_eq!(event["status"], "complete");
    }
}
