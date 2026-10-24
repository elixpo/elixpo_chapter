//! The agent's task list for multi-step work.
//!
//! `update_tasks` replaces the whole list each call, like a checklist the
//! agent keeps current. The harness reads the open items before a turn ends,
//! so planned work is finished or explicitly reported as blocked rather than
//! silently dropped. A board bound to a file survives restarts for resume.

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};

/// Name of the task list tool.
pub const UPDATE_TASKS: &str = "update_tasks";
const MAX_TASKS: usize = 40;
const MAX_TASK_CHARS: usize = 300;
const MAX_FILE_BYTES: u64 = 256 * 1024;

/// Progress of one task.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    /// Cannot be finished now; `note` says why.
    Blocked,
}

impl TaskStatus {
    #[must_use]
    pub const fn is_open(self) -> bool {
        matches!(self, Self::Pending | Self::InProgress)
    }

    const fn marker(self) -> &'static str {
        match self {
            Self::Pending => "[ ]",
            Self::InProgress => "[~]",
            Self::Completed => "[x]",
            Self::Blocked => "[!]",
        }
    }
}

/// One item on the task list.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Task {
    pub content: String,
    pub status: TaskStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// A shared task list, optionally saved to a file after every change.
#[derive(Clone, Default)]
pub struct TaskBoard {
    tasks: Arc<Mutex<Vec<Task>>>,
    file: Option<PathBuf>,
}

impl TaskBoard {
    /// A board saved to `file`, starting from what the file already holds.
    /// An unreadable or invalid file starts an empty list.
    #[must_use]
    pub fn persisted(file: impl Into<PathBuf>) -> Self {
        let file = file.into();
        let tasks = load_tasks(&file).unwrap_or_default();
        Self {
            tasks: Arc::new(Mutex::new(tasks)),
            file: Some(file),
        }
    }

    #[must_use]
    pub fn tasks(&self) -> Vec<Task> {
        self.lock().clone()
    }

    /// Tasks still pending or in progress.
    #[must_use]
    pub fn open_tasks(&self) -> Vec<Task> {
        self.lock()
            .iter()
            .filter(|task| task.status.is_open())
            .cloned()
            .collect()
    }

    /// Replaces the list and saves it when the board has a file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file cannot be written.
    pub fn replace(&self, tasks: Vec<Task>) -> Result<()> {
        if let Some(file) = &self.file {
            save_tasks(file, &tasks)?;
        }
        *self.lock() = tasks;
        Ok(())
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<Task>> {
        self.tasks
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

/// The list as a checklist: `[x] done`, `[~] doing`, `[ ] todo`, `[!] blocked`.
#[must_use]
pub fn render_tasks(tasks: &[Task]) -> String {
    let done = tasks
        .iter()
        .filter(|task| task.status == TaskStatus::Completed)
        .count();
    let mut text = format!("Tasks {done}/{} done", tasks.len());
    for task in tasks {
        let _ = write!(text, "\n{} {}", task.status.marker(), task.content);
        if let Some(note) = &task.note {
            let _ = write!(text, " ({note})");
        }
    }
    text
}

/// A one-line summary for the activity line: `2/5 done · now: Run tests`.
#[must_use]
pub fn task_summary(tasks: &[Task]) -> String {
    let done = tasks
        .iter()
        .filter(|task| task.status == TaskStatus::Completed)
        .count();
    let mut summary = format!("{done}/{} done", tasks.len());
    if let Some(current) = tasks
        .iter()
        .find(|task| task.status == TaskStatus::InProgress)
    {
        let _ = write!(summary, " · now: {}", current.content);
    }
    summary
}

fn load_tasks(file: &Path) -> Result<Vec<Task>> {
    let metadata = fs::metadata(file)?;
    if metadata.len() > MAX_FILE_BYTES {
        bail!("task file is too large");
    }
    Ok(serde_json::from_slice(&fs::read(file)?)?)
}

fn save_tasks(file: &Path, tasks: &[Task]) -> Result<()> {
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).context("failed to create the task folder")?;
    }
    let temporary = file.with_extension("json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(tasks)?).context("failed to save tasks")?;
    fs::rename(&temporary, file).context("failed to save tasks")
}

/// Registers `update_tasks` backed by `board`.
///
/// # Errors
///
/// Returns an error if the tool name is already registered.
pub fn register_update_tasks_tool(host: &mut ToolHost, board: TaskBoard) -> Result<()> {
    host.register(
        ToolDescriptor {
            name: UPDATE_TASKS.to_owned(),
            description: "Keep a task list for work with three or more steps. Send the whole list each time: mark one task in_progress before starting it and completed as soon as it is verified done. Use blocked with a note only when a task truly cannot be finished. Open tasks must be finished or reported before you answer.".to_owned(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "tasks": {
                        "type": "array",
                        "maxItems": MAX_TASKS,
                        "items": {
                            "type": "object",
                            "properties": {
                                "content": {"type": "string"},
                                "status": {"type": "string", "enum": ["pending", "in_progress", "completed", "blocked"]},
                                "note": {"type": "string"}
                            },
                            "required": ["content", "status"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["tasks"],
                "additionalProperties": false
            }),
            risk: RiskClass::ReadOnly,
            transport: ToolTransport::Native,
        },
        Arc::new(UpdateTasks { board }),
    )
}

struct UpdateTasks {
    board: TaskBoard,
}

impl ToolHandler for UpdateTasks {
    fn call(&self, arguments: &Value, _cancellation: &CancellationToken) -> Result<ToolOutput> {
        let tasks = match parse_tasks(arguments) {
            Ok(tasks) => tasks,
            Err(error) => return Ok(ToolOutput::error(error.to_string())),
        };
        self.board.replace(tasks.clone())?;
        Ok(ToolOutput {
            text: render_tasks(&tasks),
            structured: Some(json!({ "tasks": tasks })),
            is_error: false,
        })
    }
}

fn parse_tasks(arguments: &Value) -> Result<Vec<Task>> {
    let tasks: Vec<Task> = serde_json::from_value(
        arguments
            .get("tasks")
            .cloned()
            .context("tasks must be an array")?,
    )
    .context(
        "each task needs content and a status of pending, in_progress, completed, or blocked",
    )?;
    if tasks.len() > MAX_TASKS {
        bail!("keep the list to {MAX_TASKS} tasks");
    }
    let in_progress = tasks
        .iter()
        .filter(|task| task.status == TaskStatus::InProgress)
        .count();
    if in_progress > 1 {
        bail!("only one task can be in_progress at a time");
    }
    tasks
        .into_iter()
        .map(|mut task| {
            task.content = task.content.trim().chars().take(MAX_TASK_CHARS).collect();
            if task.content.is_empty() {
                bail!("task content cannot be empty");
            }
            task.note = task
                .note
                .map(|note| note.trim().chars().take(MAX_TASK_CHARS).collect::<String>())
                .filter(|note| !note.is_empty());
            if task.status == TaskStatus::Blocked && task.note.is_none() {
                bail!("a blocked task needs a note saying why");
            }
            Ok(task)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{TaskBoard, TaskStatus, parse_tasks, render_tasks, task_summary};

    #[test]
    fn lists_parse_render_and_track_open_items() {
        let tasks = parse_tasks(&json!({"tasks": [
            {"content": "Read the failing test", "status": "completed"},
            {"content": "Fix the parser", "status": "in_progress"},
            {"content": "Run the suite", "status": "pending"},
            {"content": "Deploy", "status": "blocked", "note": "needs credentials"}
        ]}))
        .expect("valid list");
        let board = TaskBoard::default();
        board.replace(tasks.clone()).expect("in-memory board");
        assert_eq!(board.open_tasks().len(), 2);
        assert_eq!(
            render_tasks(&tasks),
            "Tasks 1/4 done\n[x] Read the failing test\n[~] Fix the parser\n[ ] Run the suite\n[!] Deploy (needs credentials)"
        );
        assert_eq!(task_summary(&tasks), "1/4 done · now: Fix the parser");
    }

    #[test]
    fn invalid_lists_are_rejected() {
        assert!(parse_tasks(&json!({"tasks": [{"content": " ", "status": "pending"}]})).is_err());
        assert!(parse_tasks(&json!({"tasks": [{"content": "x", "status": "done"}]})).is_err());
        assert!(parse_tasks(&json!({"tasks": [{"content": "x", "status": "blocked"}]})).is_err());
        assert!(
            parse_tasks(&json!({"tasks": [
                {"content": "a", "status": "in_progress"},
                {"content": "b", "status": "in_progress"}
            ]}))
            .is_err()
        );
    }

    #[test]
    fn persisted_boards_survive_a_restart() {
        let folder = tempfile::tempdir().expect("folder");
        let file = folder.path().join("session/tasks.json");
        let board = TaskBoard::persisted(&file);
        board
            .replace(vec![super::Task {
                content: "Resume me".to_owned(),
                status: TaskStatus::InProgress,
                note: None,
            }])
            .expect("saved");
        let restored = TaskBoard::persisted(&file);
        assert_eq!(restored.open_tasks()[0].content, "Resume me");
    }
}
