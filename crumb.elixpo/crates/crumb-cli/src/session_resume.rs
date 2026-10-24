//! What a session needs to pick up where it stopped, kept in its folder:
//! the conversation (secrets redacted, owner-only file), a marker for a turn
//! that never finished, and a brief built from the task list and background
//! jobs for the first turn after resuming.

use std::fmt::Write as _;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use crumb_agent::{SessionEvent, TurnStatus, export_session};
use crumb_core::redact_sensitive_text;
use crumb_harness::{ConversationSnapshot, SavedTurn};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const CONVERSATION: &str = "conversation.json";
const INTERRUPTED: &str = "interrupted.json";
const MAX_SNAPSHOT_BYTES: u64 = 4 * 1024 * 1024;
const MAX_REQUEST_CHARS: usize = 2_000;

/// A turn that started but never recorded its end.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub(crate) struct InterruptedTurn {
    pub request: String,
    pub started_unix: u64,
}

/// Redacts secret-looking lines, keeping the text's own line endings.
fn redact(text: &str) -> String {
    let mut redacted = redact_sensitive_text(text).0;
    if !text.ends_with('\n') && redacted.ends_with('\n') {
        redacted.pop();
    }
    redacted
}

/// Saves `snapshot` with secrets redacted, readable only by the owner.
pub(crate) fn save_conversation(folder: &Path, snapshot: &ConversationSnapshot) -> Result<()> {
    let redacted = ConversationSnapshot {
        turns: snapshot
            .turns
            .iter()
            .map(|turn| SavedTurn {
                user: redact(&turn.user),
                assistant: redact(&turn.assistant),
            })
            .collect(),
        action_facts: snapshot
            .action_facts
            .iter()
            .map(|fact| redact(fact))
            .collect(),
        artifact_references: snapshot
            .artifact_references
            .iter()
            .map(|reference| redact(reference))
            .collect(),
    };
    write_private(&folder.join(CONVERSATION), &serde_json::to_vec(&redacted)?)
}

/// The saved conversation, if there is a readable one.
pub(crate) fn load_conversation(folder: &Path) -> Option<ConversationSnapshot> {
    let path = folder.join(CONVERSATION);
    if fs::metadata(&path).ok()?.len() > MAX_SNAPSHOT_BYTES {
        return None;
    }
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

/// Records that a turn started; [`mark_turn_finished`] clears it.
pub(crate) fn mark_turn_started(folder: &Path, request: &str) -> Result<()> {
    let turn = InterruptedTurn {
        request: redact(request).chars().take(MAX_REQUEST_CHARS).collect(),
        started_unix: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs()),
    };
    write_private(&folder.join(INTERRUPTED), &serde_json::to_vec(&turn)?)
}

pub(crate) fn mark_turn_finished(folder: &Path) {
    let _ = fs::remove_file(folder.join(INTERRUPTED));
}

/// The turn that was running when Crumb last stopped, if any.
pub(crate) fn interrupted_turn(folder: &Path) -> Option<InterruptedTurn> {
    serde_json::from_slice(&fs::read(folder.join(INTERRUPTED)).ok()?).ok()
}

/// Context for the first turn after resuming: the interrupted request, open
/// tasks, and background jobs. `None` when there is nothing to continue.
pub(crate) fn resume_brief(folder: &Path) -> Option<String> {
    let mut brief = String::new();
    if let Some(turn) = interrupted_turn(folder) {
        let _ = writeln!(
            brief,
            "The previous turn was interrupted before it finished. Its request was:\n{}",
            turn.request
        );
    }
    let open_tasks = read_json(&folder.join("tasks.json"))
        .and_then(|tasks| tasks.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter(|task| matches!(task["status"].as_str(), Some("pending" | "in_progress")))
        .filter_map(|task| task["content"].as_str().map(str::to_owned))
        .collect::<Vec<_>>();
    if !open_tasks.is_empty() {
        let _ = writeln!(brief, "Open tasks from the task list:");
        for task in open_tasks {
            let _ = writeln!(brief, "- {task}");
        }
    }
    let jobs = read_json(&folder.join("jobs").join("jobs.json"))
        .and_then(|jobs| jobs.as_array().cloned())
        .unwrap_or_default();
    if !jobs.is_empty() {
        let _ = writeln!(
            brief,
            "Background jobs from before (they are no longer running):"
        );
        for job in jobs {
            let _ = writeln!(
                brief,
                "- job {}: {} · {} (`{}`)",
                job["id"],
                job["label"].as_str().unwrap_or("job"),
                job["status"]["state"].as_str().unwrap_or("unknown"),
                job["command"].as_str().unwrap_or("")
            );
        }
    }
    if brief.is_empty() {
        return None;
    }
    brief.push_str(
        "If the user asks to continue, pick up exactly where this left off: check what was already done before redoing it.",
    );
    Some(brief)
}

/// What happened in a session so far, from its journal and saved
/// conversation: turn outcomes, tools used, recorded actions, and the latest
/// exchanges. Lets a resumed agent start with the session's history instead
/// of a blank slate, even for sessions saved before conversations were kept.
pub(crate) fn session_recap(
    root: &Path,
    session_id: &str,
    conversation: Option<&ConversationSnapshot>,
) -> Option<String> {
    let export = export_session(root, session_id).ok()?;
    let mut turns = 0_u32;
    let mut last_status = None;
    let mut tools = std::collections::BTreeMap::<String, u32>::new();
    for event in &export.events {
        match event {
            SessionEvent::TurnFinished { status, .. } => {
                turns += 1;
                last_status = Some(*status);
            }
            SessionEvent::ToolFinished {
                name,
                success: true,
                ..
            } => *tools.entry(name.clone()).or_default() += 1,
            _ => {}
        }
    }
    if turns == 0 && conversation.is_none_or(|saved| saved.turns.is_empty()) {
        return None;
    }
    let mut recap = format!("Recap of this session so far: {turns} turns");
    if let Some(status) = last_status {
        let _ = write!(recap, " (the last one {})", status_label(status));
    }
    recap.push('.');
    if !tools.is_empty() {
        let mut used = tools.into_iter().collect::<Vec<_>>();
        used.sort_by_key(|(_, count)| std::cmp::Reverse(*count));
        let used = used
            .iter()
            .take(8)
            .map(|(name, count)| format!("{name} ×{count}"))
            .collect::<Vec<_>>()
            .join(", ");
        let _ = write!(recap, "\nTools that succeeded: {used}.");
    }
    if let Some(saved) = conversation {
        if !saved.action_facts.is_empty() {
            let _ = write!(recap, "\nRecorded actions:");
            for fact in saved.action_facts.iter().rev().take(10).rev() {
                let _ = write!(recap, "\n- {}", clip(fact, 200));
            }
        }
        if !saved.turns.is_empty() {
            let _ = write!(recap, "\nLatest exchanges:");
            for turn in saved.turns.iter().rev().take(3).rev() {
                let _ = write!(
                    recap,
                    "\n- User: {}\n  Crumb: {}",
                    clip(&turn.user, 300),
                    clip(&turn.assistant, 300)
                );
            }
        }
    } else {
        recap.push_str("\nThe conversation text of this session was not saved; ask the user for any detail you need.");
    }
    Some(recap)
}

/// One line for the user: the latest request and how it ended.
pub(crate) fn user_recap(conversation: Option<&ConversationSnapshot>) -> Option<String> {
    let turn = conversation?.turns.last()?;
    let answer = turn
        .assistant
        .lines()
        .find(|line| !line.trim().is_empty())?;
    Some(format!(
        "Last: {} → {}",
        clip(turn.user.lines().next().unwrap_or_default(), 80),
        clip(answer, 100)
    ))
}

const fn status_label(status: TurnStatus) -> &'static str {
    match status {
        TurnStatus::Complete => "completed",
        TurnStatus::Cancelled => "was cancelled",
        TurnStatus::Failed => "failed",
        TurnStatus::LimitReached => "hit a limit",
    }
}

fn clip(text: &str, limit: usize) -> String {
    let text = text.trim().replace('\n', " ");
    if text.chars().count() <= limit {
        return text;
    }
    format!("{}…", text.chars().take(limit).collect::<String>())
}

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
    let folder = path.parent().context("session file has no folder")?;
    fs::create_dir_all(folder).context("failed to create the session folder")?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, bytes).context("failed to save session state")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600))
            .context("failed to restrict session state")?;
    }
    fs::rename(&temporary, path).context("failed to save session state")
}

#[cfg(test)]
mod tests {
    use crumb_harness::{ConversationSnapshot, SavedTurn};

    use super::{
        interrupted_turn, load_conversation, mark_turn_finished, mark_turn_started, resume_brief,
        save_conversation,
    };

    #[test]
    fn conversations_round_trip_with_secrets_redacted_and_private() {
        let folder = tempfile::tempdir().expect("folder");
        let snapshot = ConversationSnapshot {
            turns: vec![SavedTurn {
                user: "deploy with token ghp_abcdefghijklmnopqrstuvwxyz0123456789".to_owned(),
                assistant: "Deployed.".to_owned(),
            }],
            action_facts: vec!["edited src/main.rs".to_owned()],
            artifact_references: Vec::new(),
        };
        save_conversation(folder.path(), &snapshot).expect("saved");
        let loaded = load_conversation(folder.path()).expect("loaded");
        assert_eq!(loaded.turns[0].assistant, "Deployed.");
        assert!(
            !loaded.turns[0]
                .user
                .contains("ghp_abcdefghijklmnopqrstuvwxyz0123456789")
        );
        assert_eq!(loaded.action_facts, snapshot.action_facts);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(folder.path().join("conversation.json"))
                .expect("file")
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
    }

    #[test]
    fn interrupted_turns_and_open_work_make_a_resume_brief() {
        let folder = tempfile::tempdir().expect("folder");
        assert!(resume_brief(folder.path()).is_none());

        mark_turn_started(folder.path(), "fix the failing build").expect("marked");
        std::fs::write(
            folder.path().join("tasks.json"),
            r#"[{"content":"Find the error","status":"completed"},{"content":"Fix the import","status":"in_progress"}]"#,
        )
        .expect("tasks");
        std::fs::create_dir(folder.path().join("jobs")).expect("jobs dir");
        std::fs::write(
            folder.path().join("jobs/jobs.json"),
            r#"[{"id":1,"label":"build","command":"cargo build","status":{"state":"running"}}]"#,
        )
        .expect("jobs");

        let brief = resume_brief(folder.path()).expect("brief");
        assert!(
            brief.contains(
                "interrupted before it finished. Its request was:\nfix the failing build"
            )
        );
        assert!(brief.contains("- Fix the import"));
        assert!(!brief.contains("Find the error"));
        assert!(brief.contains("- job 1: build · running (`cargo build`)"));

        mark_turn_finished(folder.path());
        assert!(interrupted_turn(folder.path()).is_none());
    }
}
