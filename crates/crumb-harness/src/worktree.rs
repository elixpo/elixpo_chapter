//! Git worktrees that isolate write-access helper agents.
//!
//! Each write helper works in its own worktree, which starts from what the
//! user sees: the current commit plus uncommitted and untracked changes. That
//! starting point is committed inside the worktree, so when the helper
//! finishes, its own changes are exactly the diff against that commit. The
//! parent applies the diff to the real workspace as soon as the helper
//! finishes; a diff that no longer applies is saved and reported, never
//! forced. Applying never touches the user's git index.

use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use anyhow::{Context, Result, bail};

/// A helper's isolated checkout.
#[derive(Debug)]
pub(crate) struct HelperWorktree {
    repo_top: PathBuf,
    /// The worktree's top-level directory.
    root: PathBuf,
    /// The workspace's counterpart inside the worktree, where the helper runs.
    pub(crate) workdir: PathBuf,
}

/// What happened to a helper's changes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum MergeOutcome {
    /// The helper changed nothing.
    Unchanged,
    /// The changes were applied to the workspace.
    Applied { files: Vec<String> },
    /// The changes did not apply; the patch was saved for the user.
    Conflict {
        files: Vec<String>,
        patch: PathBuf,
        reason: String,
    },
}

impl MergeOutcome {
    /// One-line progress label.
    pub(crate) fn short_label(&self) -> &'static str {
        match self {
            Self::Unchanged => "No file changes",
            Self::Applied { .. } => "Changes applied",
            Self::Conflict { .. } => "Changes conflict; patch saved",
        }
    }

    pub(crate) fn summary(&self) -> String {
        match self {
            Self::Unchanged => "no file changes".to_owned(),
            Self::Applied { files } => {
                format!("changes applied to the workspace: {}", files.join(", "))
            }
            Self::Conflict {
                files,
                patch,
                reason,
            } => format!(
                "changes NOT applied (they conflict with the workspace: {reason}); touched {}; patch saved at {}",
                files.join(", "),
                patch.display()
            ),
        }
    }
}

/// Returns the repository's top-level directory when `workspace` is inside a
/// git work tree. Unix only for now: Windows' verbatim canonical paths
/// (`\\?\C:\…`) need separate handling before git accepts them.
pub(crate) fn repository_top(workspace: &Path) -> Option<PathBuf> {
    if cfg!(not(unix)) {
        return None;
    }
    let output = git(workspace, &["rev-parse", "--show-toplevel"]).ok()?;
    if !output.status.success() {
        return None;
    }
    let top = String::from_utf8(output.stdout).ok()?;
    std::fs::canonicalize(top.trim()).ok()
}

/// Removes worktree records whose directories are gone, such as those left
/// by a crashed run.
pub(crate) fn prune(repo_top: &Path) {
    let _ = git(repo_top, &["worktree", "prune"]);
}

impl HelperWorktree {
    /// Creates a worktree for one helper under `parent_dir`, seeded with the
    /// workspace's current state.
    pub(crate) fn create(
        workspace: &Path,
        repo_top: &Path,
        parent_dir: &Path,
        name: &str,
    ) -> Result<Self> {
        std::fs::create_dir_all(parent_dir)
            .with_context(|| format!("failed to create `{}`", parent_dir.display()))?;
        let root = parent_dir.join(name);
        run(
            repo_top,
            &[
                "worktree",
                "add",
                "--detach",
                "--quiet",
                &path_arg(&root),
                "HEAD",
            ],
        )
        .context("failed to create a helper worktree")?;
        let worktree = Self {
            repo_top: repo_top.to_path_buf(),
            workdir: root.join(workspace.strip_prefix(repo_top).unwrap_or(Path::new(""))),
            root,
        };
        if let Err(error) = worktree
            .seed()
            .and_then(|()| Ok(std::fs::create_dir_all(&worktree.workdir)?))
        {
            worktree.remove();
            return Err(error);
        }
        Ok(worktree)
    }

    /// Copies uncommitted and untracked changes into the worktree and commits
    /// them as the helper's starting point.
    fn seed(&self) -> Result<()> {
        let tracked = git(&self.repo_top, &["diff", "--binary", "HEAD"])?;
        if !tracked.stdout.is_empty() {
            apply_patch(&self.root, &tracked.stdout)
                .context("failed to copy uncommitted changes")?;
        }
        let untracked = git(
            &self.repo_top,
            &["ls-files", "--others", "--exclude-standard", "-z"],
        )?;
        for relative in untracked
            .stdout
            .split(|byte| *byte == 0)
            .filter(|entry| !entry.is_empty())
            .map(|entry| PathBuf::from(String::from_utf8_lossy(entry).into_owned()))
            .filter(|relative| !relative.starts_with(".crumb"))
        {
            let target = self.root.join(&relative);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(self.repo_top.join(&relative), &target)
                .with_context(|| format!("failed to copy `{}`", relative.display()))?;
        }
        run(&self.root, &["add", "-A"])?;
        run(
            &self.root,
            &[
                "-c",
                "user.name=Crumb",
                "-c",
                "user.email=crumb@localhost",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--quiet",
                "--allow-empty",
                "--no-verify",
                "-m",
                "helper starting point",
            ],
        )?;
        Ok(())
    }

    /// Applies the helper's changes to the workspace, then removes the
    /// worktree. A patch that does not apply is written to `conflict_patch`.
    pub(crate) fn merge_into_workspace(self, conflict_patch: &Path) -> Result<MergeOutcome> {
        let result = self.merge(conflict_patch);
        self.remove();
        result
    }

    fn merge(&self, conflict_patch: &Path) -> Result<MergeOutcome> {
        run(&self.root, &["add", "-A"])?;
        let files = git(&self.root, &["diff", "--cached", "--name-only", "HEAD"])?;
        let files = String::from_utf8_lossy(&files.stdout)
            .lines()
            .filter(|line| !line.is_empty())
            .map(str::to_owned)
            .collect::<Vec<_>>();
        if files.is_empty() {
            return Ok(MergeOutcome::Unchanged);
        }
        let patch = git(&self.root, &["diff", "--cached", "--binary", "HEAD"])?.stdout;
        match apply_patch(&self.repo_top, &patch) {
            Ok(()) => Ok(MergeOutcome::Applied { files }),
            Err(error) => {
                if let Some(parent) = conflict_patch.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(conflict_patch, &patch)
                    .with_context(|| format!("failed to save `{}`", conflict_patch.display()))?;
                Ok(MergeOutcome::Conflict {
                    files,
                    patch: conflict_patch.to_path_buf(),
                    reason: error.to_string(),
                })
            }
        }
    }

    /// Removes the worktree without applying anything.
    pub(crate) fn remove(&self) {
        let _ = git(
            &self.repo_top,
            &["worktree", "remove", "--force", &path_arg(&self.root)],
        );
        let _ = std::fs::remove_dir_all(&self.root);
        prune(&self.repo_top);
    }
}

/// Applies a binary patch to the files under `dir` (not the index), all or
/// nothing.
fn apply_patch(dir: &Path, patch: &[u8]) -> Result<()> {
    use std::io::Write;

    let mut child = Command::new("git")
        .args(["apply", "--binary", "--whitespace=nowarn", "-"])
        .current_dir(dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .context("failed to start git apply")?;
    child
        .stdin
        .take()
        .context("git apply stdin unavailable")?
        .write_all(patch)?;
    let output = child.wait_with_output()?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr);
        bail!(
            "{}",
            message.lines().next().unwrap_or("git apply failed").trim()
        );
    }
    Ok(())
}

fn path_arg(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn git(dir: &Path, arguments: &[&str]) -> Result<Output> {
    Command::new("git")
        .args(arguments)
        .current_dir(dir)
        .stdin(Stdio::null())
        .output()
        .context("failed to run git")
}

fn run(dir: &Path, arguments: &[&str]) -> Result<()> {
    let output = git(dir, arguments)?;
    if !output.status.success() {
        bail!(
            "git {} failed: {}",
            arguments.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn repo() -> (tempfile::TempDir, PathBuf) {
        let root = tempfile::tempdir().expect("tempdir");
        let top = std::fs::canonicalize(root.path()).expect("canonical");
        run(&top, &["init", "--quiet"]).expect("init");
        std::fs::write(top.join("a.txt"), "one\ntwo\nthree\n").expect("write");
        std::fs::write(top.join("b.txt"), "bee\n").expect("write");
        run(&top, &["add", "-A"]).expect("add");
        run(
            &top,
            &[
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "commit",
                "--quiet",
                "-m",
                "seed",
            ],
        )
        .expect("commit");
        (root, top)
    }

    fn helpers_dir() -> tempfile::TempDir {
        tempfile::tempdir().expect("helpers dir")
    }

    #[test]
    fn helpers_start_from_uncommitted_state_and_their_changes_are_applied() {
        let (_root, top) = repo();
        std::fs::write(top.join("b.txt"), "bee edited by user\n").expect("write");
        std::fs::write(top.join("new.txt"), "untracked\n").expect("write");
        let dir = helpers_dir();
        let worktree = HelperWorktree::create(&top, &top, dir.path(), "a1").expect("worktree");

        assert_eq!(
            std::fs::read_to_string(worktree.workdir.join("b.txt")).expect("read"),
            "bee edited by user\n"
        );
        assert!(worktree.workdir.join("new.txt").is_file());
        std::fs::write(worktree.workdir.join("a.txt"), "one\nTWO\nthree\n").expect("write");
        std::fs::write(worktree.workdir.join("c.txt"), "created\n").expect("write");

        let outcome = worktree
            .merge_into_workspace(&dir.path().join("a1.patch"))
            .expect("merge");

        assert_eq!(
            outcome,
            MergeOutcome::Applied {
                files: vec!["a.txt".to_owned(), "c.txt".to_owned()]
            }
        );
        assert_eq!(
            std::fs::read_to_string(top.join("a.txt")).expect("read"),
            "one\nTWO\nthree\n"
        );
        assert_eq!(
            std::fs::read_to_string(top.join("c.txt")).expect("read"),
            "created\n"
        );
        // The user's own edits are untouched and nothing was staged.
        assert_eq!(
            std::fs::read_to_string(top.join("b.txt")).expect("read"),
            "bee edited by user\n"
        );
        let staged = git(&top, &["diff", "--cached", "--name-only"]).expect("git");
        assert_eq!(staged.stdout, Vec::<u8>::new());
        assert!(!dir.path().join("a1").exists(), "the worktree is removed");
    }

    #[test]
    fn conflicting_changes_are_saved_not_forced() {
        let (_root, top) = repo();
        let dir = helpers_dir();
        let first = HelperWorktree::create(&top, &top, dir.path(), "a1").expect("worktree");
        let second = HelperWorktree::create(&top, &top, dir.path(), "a2").expect("worktree");
        std::fs::write(first.workdir.join("a.txt"), "one\nFIRST\nthree\n").expect("write");
        std::fs::write(second.workdir.join("a.txt"), "one\nSECOND\nthree\n").expect("write");

        let applied = first
            .merge_into_workspace(&dir.path().join("a1.patch"))
            .expect("merge");
        let conflict = second
            .merge_into_workspace(&dir.path().join("a2.patch"))
            .expect("merge");

        assert!(matches!(applied, MergeOutcome::Applied { .. }));
        let MergeOutcome::Conflict { patch, files, .. } = conflict else {
            panic!("second helper should conflict");
        };
        assert_eq!(files, vec!["a.txt".to_owned()]);
        assert!(
            std::fs::read_to_string(patch)
                .expect("patch")
                .contains("+SECOND")
        );
        assert_eq!(
            std::fs::read_to_string(top.join("a.txt")).expect("read"),
            "one\nFIRST\nthree\n"
        );
    }

    #[test]
    fn helpers_in_a_subfolder_work_in_the_matching_subfolder() {
        let (_root, top) = repo();
        std::fs::create_dir_all(top.join("pkg")).expect("dir");
        let dir = helpers_dir();
        let worktree =
            HelperWorktree::create(&top.join("pkg"), &top, dir.path(), "a1").expect("worktree");
        assert!(worktree.workdir.ends_with("a1/pkg"));
        std::fs::write(worktree.workdir.join("lib.txt"), "in pkg\n").expect("write");

        worktree
            .merge_into_workspace(&dir.path().join("a1.patch"))
            .expect("merge");

        assert!(top.join("pkg/lib.txt").is_file());
    }

    #[test]
    fn unchanged_helpers_and_non_repositories() {
        let (_root, top) = repo();
        let dir = helpers_dir();
        let worktree = HelperWorktree::create(&top, &top, dir.path(), "a1").expect("worktree");
        assert_eq!(
            worktree
                .merge_into_workspace(&dir.path().join("a1.patch"))
                .expect("merge"),
            MergeOutcome::Unchanged
        );

        let plain = tempfile::tempdir().expect("tempdir");
        assert_eq!(repository_top(plain.path()), None);
        assert_eq!(repository_top(&top), Some(top.clone()));
    }
}
