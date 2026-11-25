//! Loads repository-authored agent instruction files (`AGENTS.md`, with
//! `CLAUDE.md` as a fallback) for the native agent's system context.
//!
//! `AGENTS.md` is the cross-tool convention for telling coding agents about a
//! project's commands and conventions. Files are collected from the workspace
//! up to the enclosing repository root, outermost first, so a nested file can
//! refine the repository-wide one. Outside a repository only the workspace
//! itself is consulted, so unrelated files in parent directories are never
//! read. The content is guidance only and is rendered as such by the harness.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

/// File names checked in each directory, in order; the first match wins.
const INSTRUCTION_FILES: [&str; 2] = ["AGENTS.md", "CLAUDE.md"];
/// Upper bound for one instruction file.
const MAX_FILE_BYTES: usize = 16 * 1024;
/// Upper bound for all instruction files of one turn together.
const MAX_TOTAL_BYTES: usize = 32 * 1024;

/// Returns the rendered instruction files that apply to `workspace`.
pub(crate) fn load(workspace: &Path) -> Vec<String> {
    let mut remaining = MAX_TOTAL_BYTES;
    let mut rendered = Vec::new();
    let dirs = instruction_dirs(workspace);
    let base = dirs
        .first()
        .cloned()
        .unwrap_or_else(|| workspace.to_path_buf());
    for dir in dirs {
        if remaining == 0 {
            break;
        }
        let Some((path, text)) = read_instruction_file(&dir, remaining.min(MAX_FILE_BYTES)) else {
            continue;
        };
        remaining = remaining.saturating_sub(text.len());
        // Shown relative to the repository root (or the workspace).
        let shown = path
            .strip_prefix(&base)
            .map_or_else(|_| path.clone(), Path::to_path_buf);
        rendered.push(format!("### {}\n{}", slash_path(&shown), text.trim_end()));
    }
    rendered
}

/// Renders a path with `/` on every platform, so the model sees the same
/// text on Windows as elsewhere.
fn slash_path(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Directories to consult, outermost first: the repository root down to the
/// workspace, or only the workspace when it is not inside a repository.
fn instruction_dirs(workspace: &Path) -> Vec<PathBuf> {
    let mut chain = Vec::new();
    for dir in workspace.ancestors() {
        chain.push(dir.to_path_buf());
        if dir.join(".git").exists() {
            chain.reverse();
            return chain;
        }
    }
    vec![workspace.to_path_buf()]
}

/// Reads the first instruction file present in `dir`, truncated to `limit`
/// bytes on a UTF-8 boundary. Symlinks and non-regular files are ignored so a
/// repository cannot point the agent at files outside it.
fn read_instruction_file(dir: &Path, limit: usize) -> Option<(PathBuf, String)> {
    for name in INSTRUCTION_FILES {
        let path = dir.join(name);
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if !metadata.file_type().is_file() {
            continue;
        }
        let mut bytes = Vec::new();
        let file = fs::File::open(&path).ok()?;
        file.take(limit as u64 + 1).read_to_end(&mut bytes).ok()?;
        let truncated = bytes.len() > limit;
        bytes.truncate(limit);
        let mut text = match String::from_utf8(bytes) {
            Ok(text) => text,
            Err(error) => {
                let valid = error.utf8_error().valid_up_to();
                let mut bytes = error.into_bytes();
                bytes.truncate(valid);
                String::from_utf8(bytes).ok()?
            }
        };
        if text.trim().is_empty() {
            return None;
        }
        if truncated {
            text.push_str("\n[truncated: instruction file exceeds Crumb's size limit]");
        }
        return Some((path, text));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().expect("parent")).expect("dirs");
        fs::write(path, text).expect("write");
    }

    #[test]
    fn loads_repository_files_outermost_first() {
        let root = tempfile::tempdir().expect("tempdir");
        let repo = root.path().join("repo");
        fs::create_dir_all(repo.join(".git")).expect("git dir");
        write(&repo.join("AGENTS.md"), "Run cargo test.");
        write(&repo.join("crates/app/AGENTS.md"), "App uses tokio.");

        let loaded = load(&repo.join("crates/app"));

        assert_eq!(loaded.len(), 2);
        assert!(loaded[0].contains("Run cargo test."));
        assert!(loaded[0].starts_with("### AGENTS.md\nRun cargo test."));
        assert!(loaded[1].starts_with("### crates/app/AGENTS.md\nApp uses tokio."));
    }

    #[test]
    fn falls_back_to_claude_md_and_prefers_agents_md() {
        let root = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join(".git")).expect("git dir");
        write(&root.path().join("CLAUDE.md"), "claude rules");
        assert!(load(root.path())[0].contains("claude rules"));

        write(&root.path().join("AGENTS.md"), "agents rules");
        let loaded = load(root.path());
        assert_eq!(loaded.len(), 1);
        assert!(loaded[0].contains("agents rules"));
    }

    #[test]
    fn outside_a_repository_only_the_workspace_is_read() {
        let root = tempfile::tempdir().expect("tempdir");
        write(&root.path().join("AGENTS.md"), "parent file");
        let workspace = root.path().join("work");
        fs::create_dir_all(&workspace).expect("workspace");

        assert_eq!(load(&workspace), Vec::<String>::new());
    }

    #[test]
    fn oversized_files_are_truncated_on_a_char_boundary() {
        let root = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join(".git")).expect("git dir");
        write(&root.path().join("AGENTS.md"), &"é".repeat(MAX_FILE_BYTES));

        let loaded = load(root.path());

        assert!(loaded[0].ends_with("[truncated: instruction file exceeds Crumb's size limit]"));
        assert!(loaded[0].len() < MAX_FILE_BYTES + 200);
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_instruction_files_are_ignored() {
        let root = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join(".git")).expect("git dir");
        write(&root.path().join("secret.txt"), "do not read");
        std::os::unix::fs::symlink(
            root.path().join("secret.txt"),
            root.path().join("AGENTS.md"),
        )
        .expect("symlink");

        assert_eq!(load(root.path()), Vec::<String>::new());
    }

    #[test]
    fn empty_files_are_skipped() {
        let root = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join(".git")).expect("git dir");
        write(&root.path().join("AGENTS.md"), "  \n");

        assert_eq!(load(root.path()), Vec::<String>::new());
    }
}
