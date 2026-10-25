//! Long-running commands the agent starts and checks back on.
//!
//! `start_background` launches a command through the same isolated shell as
//! `run_shell` and returns at once; `check_background` reports status and the
//! latest output, optionally waiting for the job to finish; `stop_background`
//! ends it. Output goes to a log file in the session folder, and a manifest
//! records every job so a resumed session knows what ran. Jobs still running
//! when Crumb exits are stopped with it.

use std::fmt::Write as _;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use crumb_core::redact_sensitive_text;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::shell::{AgentShellConfig, configure_process_group, terminate};

/// Tool names, for labels and permission listings.
pub const START_BACKGROUND: &str = "start_background";
pub const CHECK_BACKGROUND: &str = "check_background";
pub const STOP_BACKGROUND: &str = "stop_background";
const MANIFEST: &str = "jobs.json";
const MAX_JOBS: usize = 16;
const MAX_LOG_BYTES: u64 = 20 * 1024 * 1024;
const MAX_WAIT: Duration = Duration::from_secs(120);
const DEFAULT_TAIL_LINES: usize = 40;
const MAX_TAIL_LINES: usize = 200;
const POLL: Duration = Duration::from_millis(200);

/// Where a background job stands.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case", tag = "state")]
pub enum JobStatus {
    Running,
    Exited {
        code: Option<i32>,
    },
    Stopped {
        reason: String,
    },
    /// It was running when a previous Crumb process ended.
    Interrupted,
}

impl JobStatus {
    fn describe(&self) -> String {
        match self {
            Self::Running => "running".to_owned(),
            Self::Exited { code: Some(0) } => "succeeded (exit 0)".to_owned(),
            Self::Exited { code: Some(code) } => format!("failed (exit {code})"),
            Self::Exited { code: None } => "ended by a signal".to_owned(),
            Self::Stopped { reason } => format!("stopped: {reason}"),
            Self::Interrupted => "interrupted when Crumb last exited".to_owned(),
        }
    }
}

/// A job as recorded in the manifest.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct JobRecord {
    pub id: u32,
    pub label: String,
    pub command: String,
    pub started_unix: u64,
    #[serde(default)]
    pub finished_unix: Option<u64>,
    pub status: JobStatus,
    pub log: PathBuf,
}

struct Job {
    record: JobRecord,
    child: Option<Child>,
    started: Instant,
}

struct Inner {
    workspace: PathBuf,
    shell: AgentShellConfig,
    folder: PathBuf,
    jobs: Mutex<Vec<Job>>,
}

impl Drop for Inner {
    fn drop(&mut self) {
        let jobs = self
            .jobs
            .get_mut()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        for job in jobs.iter_mut() {
            if let Some(child) = job.child.as_mut() {
                terminate(child);
                let _ = child.wait();
                job.record.status = JobStatus::Stopped {
                    reason: "Crumb exited".to_owned(),
                };
            }
        }
        let _ = save_manifest(&self.folder, jobs);
    }
}

/// The background jobs of one session, shared by every turn's tools.
#[derive(Clone)]
pub struct BackgroundJobs {
    inner: Arc<Inner>,
}

impl BackgroundJobs {
    /// Jobs for a session whose files live in `folder`. Jobs a previous Crumb
    /// process left running are reported as interrupted.
    ///
    /// # Errors
    ///
    /// Returns an error when the workspace or shell program is invalid.
    pub fn new(workspace: &Path, shell: AgentShellConfig, folder: PathBuf) -> Result<Self> {
        if !shell.program.is_absolute() {
            bail!("background shell program must be an absolute path");
        }
        let workspace = fs::canonicalize(workspace)
            .with_context(|| format!("failed to resolve workspace `{}`", workspace.display()))?;
        let jobs = load_manifest(&folder)
            .into_iter()
            .map(|mut record| {
                if record.status == JobStatus::Running {
                    record.status = JobStatus::Interrupted;
                }
                Job {
                    record,
                    child: None,
                    started: Instant::now(),
                }
            })
            .collect();
        Ok(Self {
            inner: Arc::new(Inner {
                workspace,
                shell,
                folder,
                jobs: Mutex::new(jobs),
            }),
        })
    }

    /// Every job, with finished ones brought up to date.
    #[must_use]
    pub fn records(&self) -> Vec<JobRecord> {
        let mut jobs = self.lock();
        refresh(&mut jobs);
        jobs.iter().map(|job| job.record.clone()).collect()
    }

    /// The last `lines` lines of job `id`'s output, secrets redacted.
    #[must_use]
    pub fn output_tail(&self, id: u32, lines: usize) -> Option<String> {
        let record = self.records().into_iter().find(|record| record.id == id)?;
        Some(log_tail(&record.log, lines))
    }

    /// One line per job for the agent's runtime context; `None` when there
    /// are no jobs.
    #[must_use]
    pub fn context_summary(&self) -> Option<String> {
        let records = self.records();
        if records.is_empty() {
            return None;
        }
        let lines = records
            .iter()
            .map(|record| {
                format!(
                    "- job {}: {} · {} (`{}`)",
                    record.id,
                    record.label,
                    record.status.describe(),
                    record.command
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        Some(format!(
            "Background jobs this session (check_background for output):\n{lines}"
        ))
    }

    fn lock(&self) -> MutexGuard<'_, Vec<Job>> {
        self.inner
            .jobs
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn start(&self, command: &str, label: &str) -> Result<JobRecord> {
        let mut jobs = self.lock();
        refresh(&mut jobs);
        let running = jobs
            .iter()
            .filter(|job| job.record.status == JobStatus::Running)
            .count();
        if running >= MAX_JOBS {
            bail!("{MAX_JOBS} jobs are already running; stop one first");
        }
        let id = jobs.iter().map(|job| job.record.id).max().unwrap_or(0) + 1;
        fs::create_dir_all(&self.inner.folder).context("failed to create the job folder")?;
        let log = self.inner.folder.join(format!("job-{id}.log"));
        let output = File::create(&log).context("failed to create the job log")?;
        let shell = &self.inner.shell;
        let mut process = Command::new(&shell.program);
        process
            .args(&shell.arguments)
            .arg(command)
            .current_dir(&self.inner.workspace)
            .stdin(Stdio::null())
            .stdout(output.try_clone().context("failed to share the job log")?)
            .stderr(output);
        if !shell.inherit_environment {
            process.env_clear();
        }
        if let Some(path) = &shell.path {
            process.env("PATH", path);
        }
        configure_process_group(&mut process);
        let child = process
            .spawn()
            .context("failed to start the background job")?;
        let record = JobRecord {
            id,
            label: label.to_owned(),
            command: command.to_owned(),
            started_unix: unix_now(),
            finished_unix: None,
            status: JobStatus::Running,
            log,
        };
        jobs.push(Job {
            record: record.clone(),
            child: Some(child),
            started: Instant::now(),
        });
        save_manifest(&self.inner.folder, &jobs)?;
        Ok(record)
    }

    fn stop(&self, id: u32) -> Result<JobRecord> {
        let mut jobs = self.lock();
        refresh(&mut jobs);
        let job = jobs
            .iter_mut()
            .find(|job| job.record.id == id)
            .with_context(|| format!("no job {id}"))?;
        if let Some(mut child) = job.child.take() {
            terminate(&mut child);
            let _ = child.wait();
            job.record.status = JobStatus::Stopped {
                reason: "stopped by the agent".to_owned(),
            };
            job.record.finished_unix = Some(unix_now());
        }
        let record = job.record.clone();
        save_manifest(&self.inner.folder, &jobs)?;
        Ok(record)
    }

    /// Waits up to `wait` for job `id` to leave the running state.
    fn wait_for(&self, id: u32, wait: Duration, cancellation: &CancellationToken) -> Result<()> {
        let deadline = Instant::now() + wait;
        loop {
            let running = {
                let mut jobs = self.lock();
                refresh(&mut jobs);
                jobs.iter()
                    .find(|job| job.record.id == id)
                    .with_context(|| format!("no job {id}"))?
                    .record
                    .status
                    == JobStatus::Running
            };
            if !running || Instant::now() >= deadline {
                return Ok(());
            }
            if cancellation.is_cancelled() {
                bail!("tool call cancelled");
            }
            thread::sleep(POLL);
        }
    }

    fn elapsed(&self, id: u32) -> Option<Duration> {
        let jobs = self.lock();
        let job = jobs.iter().find(|job| job.record.id == id)?;
        Some(match job.record.finished_unix {
            Some(finished) => Duration::from_secs(finished.saturating_sub(job.record.started_unix)),
            None if job.record.status == JobStatus::Running => job.started.elapsed(),
            None => Duration::ZERO,
        })
    }
}

/// Reaps finished jobs and stops any whose log outgrew its cap.
fn refresh(jobs: &mut [Job]) {
    for job in jobs {
        let Some(child) = job.child.as_mut() else {
            continue;
        };
        let oversized = fs::metadata(&job.record.log).is_ok_and(|meta| meta.len() > MAX_LOG_BYTES);
        if oversized {
            terminate(child);
            let _ = child.wait();
            job.child = None;
            job.record.status = JobStatus::Stopped {
                reason: format!("output passed {} MB", MAX_LOG_BYTES / (1024 * 1024)),
            };
            job.record.finished_unix = Some(unix_now());
            continue;
        }
        if let Ok(Some(status)) = child.try_wait() {
            job.child = None;
            job.record.status = JobStatus::Exited {
                code: status.code(),
            };
            job.record.finished_unix = Some(unix_now());
        }
    }
}

fn load_manifest(folder: &Path) -> Vec<JobRecord> {
    fs::read(folder.join(MANIFEST))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save_manifest(folder: &Path, jobs: &[Job]) -> Result<()> {
    fs::create_dir_all(folder).context("failed to create the job folder")?;
    let records = jobs.iter().map(|job| &job.record).collect::<Vec<_>>();
    let temporary = folder.join("jobs.json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(&records)?)
        .context("failed to save the job manifest")?;
    fs::rename(&temporary, folder.join(MANIFEST)).context("failed to save the job manifest")
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}

/// The last `lines` lines of a log, reading at most its final 256 KB.
fn log_tail(path: &Path, lines: usize) -> String {
    const WINDOW: u64 = 256 * 1024;
    let Ok(mut file) = File::open(path) else {
        return String::new();
    };
    let length = file.metadata().map_or(0, |meta| meta.len());
    let _ = file.seek(SeekFrom::Start(length.saturating_sub(WINDOW)));
    let mut bytes = Vec::new();
    let _ = file.read_to_end(&mut bytes);
    let text = String::from_utf8_lossy(&bytes);
    let all = text.lines().collect::<Vec<_>>();
    let tail = all[all.len().saturating_sub(lines)..].join("\n");
    redact_sensitive_text(&tail).0
}

fn duration_label(duration: Duration) -> String {
    let seconds = duration.as_secs();
    if seconds >= 60 {
        format!("{}m {:02}s", seconds / 60, seconds % 60)
    } else {
        format!("{seconds}s")
    }
}

/// Registers `start_background`, `check_background`, and `stop_background`.
///
/// # Errors
///
/// Returns an error if a tool name is already registered.
pub fn register_background_tools(host: &mut ToolHost, jobs: BackgroundJobs) -> Result<()> {
    host.register(start_descriptor(), Arc::new(StartBackground(jobs.clone())))?;
    host.register(check_descriptor(), Arc::new(CheckBackground(jobs.clone())))?;
    host.register(stop_descriptor(), Arc::new(StopBackground(jobs)))
}

struct StartBackground(BackgroundJobs);
struct CheckBackground(BackgroundJobs);
struct StopBackground(BackgroundJobs);

impl ToolHandler for StartBackground {
    fn call(&self, arguments: &Value, _cancellation: &CancellationToken) -> Result<ToolOutput> {
        let Some(command) = arguments
            .get("command")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|command| !command.is_empty())
        else {
            return Ok(ToolOutput::error("command must be a non-empty string"));
        };
        let label = arguments
            .get("label")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|label| !label.is_empty())
            .unwrap_or(command)
            .chars()
            .take(80)
            .collect::<String>();
        Ok(match self.0.start(command, &label) {
            Ok(record) => ToolOutput::text(format!(
                "Started job {} ({}). Keep working; call check_background with job {} to see its output, or wait_seconds to wait for it.",
                record.id, record.label, record.id
            )),
            Err(error) => ToolOutput::error(error.to_string()),
        })
    }
}

impl ToolHandler for CheckBackground {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        let Some(id) = arguments
            .get("job")
            .and_then(Value::as_u64)
            .and_then(|id| u32::try_from(id).ok())
        else {
            return Ok(ToolOutput::text(
                self.0
                    .context_summary()
                    .unwrap_or_else(|| "No background jobs this session.".to_owned()),
            ));
        };
        let wait = Duration::from_secs(
            arguments
                .get("wait_seconds")
                .and_then(Value::as_u64)
                .unwrap_or(0),
        )
        .min(MAX_WAIT);
        if let Err(error) = self.0.wait_for(id, wait, cancellation) {
            if cancellation.is_cancelled() {
                return Err(error);
            }
            return Ok(ToolOutput::error(error.to_string()));
        }
        let Some(record) = self.0.records().into_iter().find(|record| record.id == id) else {
            return Ok(ToolOutput::error(format!("no job {id}")));
        };
        let lines = usize::try_from(
            arguments
                .get("tail_lines")
                .and_then(Value::as_u64)
                .unwrap_or(DEFAULT_TAIL_LINES as u64),
        )
        .unwrap_or(MAX_TAIL_LINES)
        .clamp(1, MAX_TAIL_LINES);
        let mut text = format!(
            "job {} · {} · {} after {}\ncommand: {}",
            record.id,
            record.label,
            record.status.describe(),
            duration_label(self.0.elapsed(id).unwrap_or_default()),
            record.command
        );
        let tail = log_tail(&record.log, lines);
        if tail.trim().is_empty() {
            text.push_str("\n(no output yet)");
        } else {
            let _ = write!(text, "\nlast output:\n{tail}");
        }
        Ok(ToolOutput {
            text,
            structured: serde_json::to_value(&record).ok(),
            is_error: matches!(record.status, JobStatus::Exited { code: Some(code) } if code != 0),
        })
    }
}

impl ToolHandler for StopBackground {
    fn call(&self, arguments: &Value, _cancellation: &CancellationToken) -> Result<ToolOutput> {
        let Some(id) = arguments
            .get("job")
            .and_then(Value::as_u64)
            .and_then(|id| u32::try_from(id).ok())
        else {
            return Ok(ToolOutput::error("job must be a job number"));
        };
        Ok(match self.0.stop(id) {
            Ok(record) => {
                ToolOutput::text(format!("job {} · {}", record.id, record.status.describe()))
            }
            Err(error) => ToolOutput::error(error.to_string()),
        })
    }
}

fn start_descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: START_BACKGROUND.to_owned(),
        description: "Start a long-running shell command in the background (build, deploy, dev server, CI or PR watch) and return at once with a job number. Same shell and approval as run_shell. Use it instead of blocking run_shell for anything slow; keep working and check back with check_background.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "command": {"type": "string", "minLength": 1},
                "label": {"type": "string", "description": "Short name shown to the user."}
            },
            "required": ["command"],
            "additionalProperties": false
        }),
        risk: RiskClass::ProcessExecution,
        transport: ToolTransport::Native,
    }
}

fn check_descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: CHECK_BACKGROUND.to_owned(),
        description: "Report a background job's status and latest output. wait_seconds (up to 120) waits for it to finish first; omit job to list every job this session.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "job": {"type": "integer", "minimum": 1},
                "wait_seconds": {"type": "integer", "minimum": 0, "maximum": 120},
                "tail_lines": {"type": "integer", "minimum": 1, "maximum": MAX_TAIL_LINES}
            },
            "additionalProperties": false
        }),
        risk: RiskClass::ReadOnly,
        transport: ToolTransport::Native,
    }
}

fn stop_descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: STOP_BACKGROUND.to_owned(),
        description: "Stop a running background job and everything it started.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {"job": {"type": "integer", "minimum": 1}},
            "required": ["job"],
            "additionalProperties": false
        }),
        risk: RiskClass::ProcessExecution,
        transport: ToolTransport::Native,
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::path::PathBuf;
    use std::time::Duration;

    use crumb_agent::{AgentMode, CancellationToken, DenyAllApprovals, ToolHost};
    use serde_json::{Value, json};

    use super::{BackgroundJobs, JobStatus, register_background_tools};
    use crate::AgentShellConfig;

    fn jobs(workspace: &std::path::Path, folder: PathBuf) -> BackgroundJobs {
        BackgroundJobs::new(
            workspace,
            AgentShellConfig {
                program: PathBuf::from("/bin/sh"),
                arguments: vec!["-c".into()],
                path: std::env::var_os("PATH"),
                command_rewriter: None,
                inherit_environment: false,
                max_output_bytes: 4096,
                timeout: Duration::from_secs(30),
            },
            folder,
        )
        .expect("jobs")
    }

    struct AllowAll;

    impl crumb_agent::ApprovalBroker for AllowAll {
        fn decide(
            &self,
            _request: &crumb_agent::ApprovalRequest,
            _arguments: &Value,
            _cancellation: &CancellationToken,
        ) -> crumb_agent::ApprovalDecision {
            crumb_agent::ApprovalDecision::AllowOnce
        }
    }

    fn call(host: &ToolHost, name: &str, arguments: &Value) -> crumb_agent::ToolOutput {
        host.call(
            name,
            arguments,
            AgentMode::Auto,
            &AllowAll,
            &CancellationToken::default(),
        )
        .expect("tool call")
    }

    #[test]
    fn jobs_start_report_output_and_finish() {
        let workspace = tempfile::tempdir().expect("workspace");
        let folder = workspace.path().join(".crumb/jobs");
        let board = jobs(workspace.path(), folder);
        let mut host = ToolHost::default();
        register_background_tools(&mut host, board.clone()).expect("tools");

        let started = call(
            &host,
            "start_background",
            &json!({"command": "echo building; sleep 0.3; echo done", "label": "build"}),
        );
        assert!(
            started.text.starts_with("Started job 1 (build)"),
            "{}",
            started.text
        );
        let finished = call(
            &host,
            "check_background",
            &json!({"job": 1, "wait_seconds": 10}),
        );
        assert!(
            finished.text.contains("job 1 · build · succeeded (exit 0)"),
            "{}",
            finished.text
        );
        assert!(finished.text.contains("building\ndone"));

        call(&host, "start_background", &json!({"command": "exit 3"}));
        let failed = call(
            &host,
            "check_background",
            &json!({"job": 2, "wait_seconds": 10}),
        );
        assert!(failed.is_error);
        assert!(failed.text.contains("failed (exit 3)"));
        let listing = call(&host, "check_background", &json!({}));
        assert!(
            listing.text.contains("- job 1: build · succeeded (exit 0)"),
            "{}",
            listing.text
        );
    }

    #[test]
    fn jobs_can_be_stopped_and_interrupted_jobs_are_reported_after_a_restart() {
        let workspace = tempfile::tempdir().expect("workspace");
        let folder = workspace.path().join(".crumb/jobs");
        {
            let board = jobs(workspace.path(), folder.clone());
            let mut host = ToolHost::default();
            register_background_tools(&mut host, board.clone()).expect("tools");
            call(
                &host,
                "start_background",
                &json!({"command": "sleep 30", "label": "server"}),
            );
            let stopped = call(&host, "stop_background", &json!({"job": 1}));
            assert!(
                stopped.text.contains("stopped: stopped by the agent"),
                "{}",
                stopped.text
            );
            call(
                &host,
                "start_background",
                &json!({"command": "sleep 30", "label": "watch"}),
            );
        }
        // The first registry was dropped like a Crumb exit; a new one reads the manifest.
        let restored = jobs(workspace.path(), folder);
        let records = restored.records();
        assert_eq!(records.len(), 2);
        assert!(
            matches!(records[1].status, JobStatus::Stopped { ref reason } if reason == "Crumb exited")
        );
        assert!(
            restored
                .context_summary()
                .expect("summary")
                .contains("job 2: watch")
        );
    }

    #[test]
    fn starting_a_job_needs_approval() {
        let workspace = tempfile::tempdir().expect("workspace");
        let mut host = ToolHost::default();
        register_background_tools(
            &mut host,
            jobs(workspace.path(), workspace.path().join("j")),
        )
        .expect("tools");
        let denied = host.call(
            "start_background",
            &json!({"command": "echo hi"}),
            AgentMode::Auto,
            &DenyAllApprovals,
            &CancellationToken::default(),
        );
        assert!(denied.is_err());
    }
}
