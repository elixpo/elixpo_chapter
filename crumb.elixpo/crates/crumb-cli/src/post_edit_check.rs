//! Runs the project's fast check after the agent changed the workspace.
//!
//! The check is detected from the project's manifests (or configured with
//! `checks.command`) and run when a turn that edited files is about to
//! finish. Failures go back to the model; a check that cannot give a verdict
//! (missing tool, timeout, cancellation) is ignored so it never blocks a turn.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crumb_agent::{CancellationToken, CheckSettings};
use crumb_harness::TurnVerifier;

/// Diagnostics sent back to the model are capped at this many bytes.
const MAX_REPORT_BYTES: usize = 8 * 1024;

/// One concrete check command for a workspace.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct CommandVerifier {
    program: String,
    args: Vec<String>,
    label: String,
    workspace: PathBuf,
    timeout: Duration,
}

/// Returns the verifier for `workspace`, or `None` when checks are off or no
/// check applies.
pub(crate) fn verifier_for(
    workspace: &Path,
    settings: &CheckSettings,
) -> Option<Arc<dyn TurnVerifier>> {
    detect(workspace, settings, &|program| on_path(program))
        .map(|verifier| Arc::new(verifier) as Arc<dyn TurnVerifier>)
}

fn detect(
    workspace: &Path,
    settings: &CheckSettings,
    available: &dyn Fn(&str) -> bool,
) -> Option<CommandVerifier> {
    if !settings.after_edit {
        return None;
    }
    let timeout = Duration::from_secs(settings.timeout_secs.max(1));
    let make = |program: &str, args: &[&str], label: &str| CommandVerifier {
        program: program.to_owned(),
        args: args.iter().map(|arg| (*arg).to_owned()).collect(),
        label: label.to_owned(),
        workspace: workspace.to_path_buf(),
        timeout,
    };
    if let Some(command) = settings.command.as_deref().map(str::trim) {
        if command.is_empty() {
            return None;
        }
        return Some(if cfg!(windows) {
            make("cmd", &["/C", command], command)
        } else {
            make("sh", &["-c", command], command)
        });
    }
    let has = |name: &str| workspace.join(name).is_file();
    if has("Cargo.toml") && available("cargo") {
        return Some(make(
            "cargo",
            &["check", "--quiet", "--message-format", "short"],
            "cargo check",
        ));
    }
    let tsc = workspace.join("node_modules").join(".bin").join("tsc");
    if has("tsconfig.json") && tsc.is_file() {
        let tsc = tsc.to_string_lossy().into_owned();
        return Some(make(
            &tsc,
            &["--noEmit", "--pretty", "false"],
            "tsc --noEmit",
        ));
    }
    if has("go.mod") && available("go") {
        return Some(make("go", &["vet", "./..."], "go vet ./..."));
    }
    if (has("ruff.toml") || has(".ruff.toml") || has("pyproject.toml")) && available("ruff") {
        return Some(make(
            "ruff",
            &["check", "--quiet", "--output-format", "concise"],
            "ruff check",
        ));
    }
    None
}

fn on_path(program: &str) -> bool {
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&paths).any(|dir| {
        let candidate = dir.join(program);
        candidate.is_file() || (cfg!(windows) && candidate.with_extension("exe").is_file())
    })
}

impl TurnVerifier for CommandVerifier {
    fn label(&self) -> String {
        self.label.clone()
    }

    fn verify(&self, cancellation: &CancellationToken) -> Option<String> {
        let mut child = Command::new(&self.program)
            .args(&self.args)
            .current_dir(&self.workspace)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .ok()?;
        // Drain both pipes on threads so a chatty check cannot fill a pipe
        // and stall while we wait for it.
        let stdout = child.stdout.take().map(drain);
        let stderr = child.stderr.take().map(drain);
        let started = Instant::now();
        let status = loop {
            if let Ok(Some(status)) = child.try_wait() {
                break status;
            }
            if cancellation.is_cancelled() || started.elapsed() >= self.timeout {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            std::thread::sleep(Duration::from_millis(100));
        };
        if status.success() {
            return None;
        }
        let collect = |handle: Option<std::thread::JoinHandle<Vec<u8>>>| {
            handle
                .and_then(|handle| handle.join().ok())
                .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
                .unwrap_or_default()
        };
        let mut output = collect(stderr);
        let stdout = collect(stdout);
        if !stdout.trim().is_empty() {
            if !output.is_empty() {
                output.push('\n');
            }
            output.push_str(&stdout);
        }
        if output.trim().is_empty() {
            output = format!("`{}` exited with {status}", self.label);
        }
        Some(cap_report(&output))
    }
}

fn drain<R: Read + Send + 'static>(mut reader: R) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = reader.read_to_end(&mut bytes);
        bytes
    })
}

/// Keeps the beginning of long output, where compilers put the first errors.
fn cap_report(output: &str) -> String {
    if output.len() <= MAX_REPORT_BYTES {
        return output.to_owned();
    }
    let mut end = MAX_REPORT_BYTES;
    while !output.is_char_boundary(end) {
        end -= 1;
    }
    let omitted = output[end..].lines().count();
    format!("{}\n[… {omitted} more lines omitted]", &output[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> CheckSettings {
        CheckSettings::default()
    }

    #[test]
    fn detects_cargo_go_and_ruff_projects() {
        let root = tempfile::tempdir().expect("tempdir");
        std::fs::write(root.path().join("Cargo.toml"), "").expect("write");
        let found = detect(root.path(), &settings(), &|_| true).expect("cargo check");
        assert_eq!(found.label, "cargo check");

        let go = tempfile::tempdir().expect("tempdir");
        std::fs::write(go.path().join("go.mod"), "").expect("write");
        assert_eq!(
            detect(go.path(), &settings(), &|_| true).map(|v| v.label),
            Some("go vet ./...".to_owned())
        );

        let py = tempfile::tempdir().expect("tempdir");
        std::fs::write(py.path().join("pyproject.toml"), "").expect("write");
        assert_eq!(
            detect(py.path(), &settings(), &|_| true).map(|v| v.label),
            Some("ruff check".to_owned())
        );
        assert_eq!(detect(py.path(), &settings(), &|_| false), None);
    }

    #[test]
    fn typescript_needs_a_local_tsc() {
        let root = tempfile::tempdir().expect("tempdir");
        std::fs::write(root.path().join("tsconfig.json"), "{}").expect("write");
        assert_eq!(detect(root.path(), &settings(), &|_| true), None);

        let bin = root.path().join("node_modules/.bin");
        std::fs::create_dir_all(&bin).expect("dirs");
        std::fs::write(bin.join("tsc"), "").expect("write");
        assert_eq!(
            detect(root.path(), &settings(), &|_| true).map(|v| v.label),
            Some("tsc --noEmit".to_owned())
        );
    }

    #[test]
    fn can_be_disabled_or_overridden() {
        let root = tempfile::tempdir().expect("tempdir");
        std::fs::write(root.path().join("Cargo.toml"), "").expect("write");
        let off = CheckSettings {
            after_edit: false,
            ..settings()
        };
        assert_eq!(detect(root.path(), &off, &|_| true), None);

        let custom = CheckSettings {
            command: Some("make lint".to_owned()),
            ..settings()
        };
        assert_eq!(
            detect(root.path(), &custom, &|_| true).map(|v| v.label),
            Some("make lint".to_owned())
        );
    }

    #[test]
    fn nothing_to_check_in_an_unknown_project() {
        let root = tempfile::tempdir().expect("tempdir");
        assert_eq!(detect(root.path(), &settings(), &|_| true), None);
    }

    #[cfg(unix)]
    fn shell(root: &Path, command: &str, timeout: Duration) -> CommandVerifier {
        CommandVerifier {
            program: "sh".to_owned(),
            args: vec!["-c".to_owned(), command.to_owned()],
            label: command.to_owned(),
            workspace: root.to_path_buf(),
            timeout,
        }
    }

    #[cfg(unix)]
    #[test]
    fn reports_failures_and_passes_successes() {
        let root = tempfile::tempdir().expect("tempdir");
        let token = CancellationToken::default();
        let failing = shell(
            root.path(),
            "echo 'error: broken' >&2; exit 1",
            Duration::from_secs(5),
        );
        assert_eq!(failing.verify(&token).as_deref(), Some("error: broken\n"));

        let passing = shell(root.path(), "echo fine", Duration::from_secs(5));
        assert_eq!(passing.verify(&token), None);

        let silent = shell(root.path(), "exit 3", Duration::from_secs(5));
        assert!(
            silent
                .verify(&token)
                .expect("failure")
                .contains("exited with")
        );
    }

    #[cfg(unix)]
    #[test]
    fn timeouts_and_cancellation_give_no_verdict() {
        let root = tempfile::tempdir().expect("tempdir");
        let slow = shell(root.path(), "sleep 5; exit 1", Duration::from_millis(200));
        assert_eq!(slow.verify(&CancellationToken::default()), None);

        let token = CancellationToken::default();
        token.cancel();
        let cancelled = shell(root.path(), "sleep 5; exit 1", Duration::from_secs(10));
        assert_eq!(cancelled.verify(&token), None);
    }

    #[test]
    fn long_reports_keep_the_beginning() {
        let output = "error: first\n".repeat(2_000);
        let report = cap_report(&output);
        assert!(report.starts_with("error: first\n"));
        assert!(report.len() < MAX_REPORT_BYTES + 64);
        assert!(report.ends_with("more lines omitted]"));
    }
}
