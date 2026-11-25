//! Operating-system confinement for agent shell commands.
//!
//! On Linux, agent commands run under a Landlock ruleset: everything stays
//! readable and executable, but writes are limited to the workspace,
//! temporary directories, `/dev` and the usual toolchain caches, so an agent
//! command cannot change the user's other files (for example `~/.ssh` or
//! `~/.bashrc`).
//!
//! The command is started through Crumb's own executable
//! (`crumb __sandbox-exec --write <dir>… -- <program> <args>…`), which
//! restricts itself and then replaces itself with the real program. This
//! needs no `unsafe` code: the restriction is applied by the helper process
//! to itself while it is still single-threaded.
//!
//! The sandbox is best effort: on kernels without Landlock, and on other
//! platforms, commands run unconfined. The interactive shell is never
//! sandboxed; only agent-run commands are.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// Hidden subcommand that applies the sandbox and runs the real program.
pub const SANDBOX_EXEC_ARG: &str = "__sandbox-exec";

/// Appended to failed command output when the sandbox was active, so the
/// model asks for approval instead of retrying blocked writes.
pub(crate) const SANDBOX_HINT: &str = "Note: agent commands run in a sandbox that only allows writing inside the workspace, temporary directories and toolchain caches. If the user really wants this command to write elsewhere, run it with run_shell_outside_sandbox, which asks the user to approve it; do not retry it with run_shell.";

/// Directories an agent command may write to.
#[must_use]
pub fn writable_paths(workspace: &Path) -> Vec<PathBuf> {
    let mut paths = vec![
        workspace.to_path_buf(),
        std::env::temp_dir(),
        PathBuf::from("/tmp"),
        PathBuf::from("/var/tmp"),
        PathBuf::from("/dev"),
    ];
    for variable in [
        "CARGO_HOME",
        "RUSTUP_HOME",
        "GOPATH",
        "GOCACHE",
        "XDG_CACHE_HOME",
    ] {
        if let Some(value) = std::env::var_os(variable) {
            paths.push(PathBuf::from(value));
        }
    }
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        for cache in [".cargo", ".rustup", ".cache", ".npm", "go"] {
            paths.push(home.join(cache));
        }
    }
    paths.retain(|path| path.is_dir());
    paths.sort();
    paths.dedup();
    paths
}

/// Arguments for `launcher` that run `program args…` inside the sandbox.
pub(crate) fn wrapped_arguments(
    writable: &[PathBuf],
    program: &Path,
    arguments: impl IntoIterator<Item = OsString>,
) -> Vec<OsString> {
    let mut wrapped = vec![OsString::from(SANDBOX_EXEC_ARG)];
    for path in writable {
        wrapped.push(OsString::from("--write"));
        wrapped.push(path.clone().into_os_string());
    }
    wrapped.push(OsString::from("--"));
    wrapped.push(program.as_os_str().to_owned());
    wrapped.extend(arguments);
    wrapped
}

/// Parsed `__sandbox-exec` invocation.
#[derive(Debug, Eq, PartialEq)]
pub struct SandboxExec {
    pub writable: Vec<PathBuf>,
    pub program: OsString,
    pub arguments: Vec<OsString>,
}

/// Parses the arguments after [`SANDBOX_EXEC_ARG`].
///
/// # Errors
///
/// Returns an error for a missing `--` separator or program.
pub fn parse_sandbox_exec(
    arguments: impl IntoIterator<Item = OsString>,
) -> Result<SandboxExec, String> {
    let mut arguments = arguments.into_iter();
    let mut writable = Vec::new();
    loop {
        match arguments.next() {
            Some(flag) if flag == "--write" => {
                let path = arguments
                    .next()
                    .ok_or_else(|| "--write needs a directory".to_owned())?;
                writable.push(PathBuf::from(path));
            }
            Some(separator) if separator == "--" => break,
            Some(other) => return Err(format!("unexpected argument {}", other.to_string_lossy())),
            None => return Err("missing -- before the program".to_owned()),
        }
    }
    let program = arguments
        .next()
        .ok_or_else(|| "missing program to run".to_owned())?;
    Ok(SandboxExec {
        writable,
        program,
        arguments: arguments.collect(),
    })
}

/// Restricts the calling thread, and every thread or process it starts
/// afterwards, to writing only below `writable`. Returns whether a
/// restriction was enforced (`false` on kernels without Landlock).
///
/// # Errors
///
/// Returns an error when Landlock is available but the ruleset fails.
#[cfg(target_os = "linux")]
pub fn restrict_current_thread(writable: &[PathBuf]) -> Result<bool, String> {
    use landlock::{
        ABI, Access, AccessFs, Ruleset, RulesetAttr, RulesetCreatedAttr, RulesetStatus,
        path_beneath_rules,
    };

    let abi = ABI::V5;
    let status = Ruleset::default()
        .handle_access(AccessFs::from_all(abi))
        .and_then(landlock::Ruleset::create)
        .and_then(|ruleset| ruleset.add_rules(path_beneath_rules(["/"], AccessFs::from_read(abi))))
        .and_then(|ruleset| {
            ruleset.add_rules(path_beneath_rules(writable, AccessFs::from_all(abi)))
        })
        .and_then(landlock::RulesetCreated::restrict_self)
        .map_err(|error| error.to_string())?;
    Ok(status.ruleset != RulesetStatus::NotEnforced)
}

#[cfg(not(target_os = "linux"))]
pub fn restrict_current_thread(_writable: &[PathBuf]) -> Result<bool, String> {
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrapped_arguments_round_trip_through_the_parser() {
        let writable = vec![PathBuf::from("/work"), PathBuf::from("/tmp")];
        let wrapped = wrapped_arguments(
            &writable,
            Path::new("/bin/sh"),
            [OsString::from("-c"), OsString::from("echo --write -- x")],
        );
        assert_eq!(wrapped[0], SANDBOX_EXEC_ARG);

        let parsed = parse_sandbox_exec(wrapped.into_iter().skip(1)).expect("parses");
        assert_eq!(parsed.writable, writable);
        assert_eq!(parsed.program, "/bin/sh");
        assert_eq!(parsed.arguments, ["-c", "echo --write -- x"]);
    }

    #[test]
    fn malformed_invocations_are_rejected() {
        assert!(parse_sandbox_exec([OsString::from("--write")]).is_err());
        assert!(parse_sandbox_exec([OsString::from("sh")]).is_err());
        assert!(parse_sandbox_exec([OsString::from("--")]).is_err());
    }

    #[test]
    fn writable_paths_include_the_workspace_and_temp() {
        let workspace = tempfile::tempdir().expect("workspace");
        let paths = writable_paths(workspace.path());
        assert!(paths.contains(&workspace.path().to_path_buf()));
        assert!(paths.iter().all(|path| path.is_dir()));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn restricted_threads_can_only_write_to_allowed_paths() {
        let workspace = tempfile::tempdir().expect("workspace");
        let outside = tempfile::tempdir().expect("outside");
        let allowed = workspace.path().to_path_buf();
        let blocked = outside.path().join("file");
        // Landlock applies to the calling thread, so other tests are untouched.
        let result = std::thread::spawn(move || {
            let enforced =
                restrict_current_thread(std::slice::from_ref(&allowed)).expect("ruleset");
            let inside = std::fs::write(allowed.join("file"), "ok").is_ok();
            let elsewhere = std::fs::write(&blocked, "no").is_ok();
            let readable = std::fs::read_dir("/").is_ok();
            (enforced, inside, elsewhere, readable)
        })
        .join()
        .expect("thread");
        let (enforced, inside, elsewhere, readable) = result;
        if !enforced {
            // Kernel without Landlock: nothing to check.
            return;
        }
        assert!(inside, "the workspace stays writable");
        assert!(!elsewhere, "writes elsewhere are blocked");
        assert!(readable, "reading stays allowed");
    }
}
