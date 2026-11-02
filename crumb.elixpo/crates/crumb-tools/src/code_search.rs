//! Read-only code search exposed as the `search_code` agent tool.
//!
//! Finds lines matching a regex or literal, or files matching a glob, inside
//! the workspace. Build output, dependency folders, binaries, and large files
//! are skipped, and the walk never follows symlinks out of the workspace.

use std::collections::BTreeSet;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result, bail};
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use regex::{Regex, RegexBuilder};
use serde_json::{Value, json};
use walkdir::WalkDir;

use crate::bounded_text;

const SEARCH_CODE: &str = "search_code";
const DEFAULT_RESULTS: usize = 100;
const MAX_RESULTS: usize = 500;
const MAX_CONTEXT_LINES: usize = 3;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_SCANNED_FILES: usize = 50_000;
const MAX_LINE_CHARS: usize = 240;
const SKIPPED_DIRECTORIES: &[&str] = &[
    ".git",
    ".crumb",
    ".next",
    ".open-next",
    ".wrangler",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "target",
    "vendor",
    "venv",
];

/// Output ceiling for the `search_code` tool.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CodeSearchLimits {
    pub max_output_bytes: usize,
}

/// Registers the read-only `search_code` tool rooted at one workspace.
///
/// # Errors
///
/// Returns an error when the workspace is unavailable, the output limit is
/// zero, or the tool name is already registered.
pub fn register_code_search_tool(
    host: &mut ToolHost,
    workspace: &Path,
    limits: CodeSearchLimits,
) -> Result<()> {
    if limits.max_output_bytes == 0 {
        bail!("code search output limit must be positive");
    }
    let root = fs::canonicalize(workspace)
        .with_context(|| format!("failed to resolve workspace `{}`", workspace.display()))?;
    if !root.is_dir() {
        bail!("workspace root must be a directory");
    }
    host.register(descriptor(), Arc::new(SearchCode { root, limits }))
}

struct SearchCode {
    root: PathBuf,
    limits: CodeSearchLimits,
}

impl ToolHandler for SearchCode {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        Ok(match search(self, arguments, cancellation) {
            Ok(text) => ToolOutput::text(bounded_text(text, self.limits.max_output_bytes)),
            Err(error) => ToolOutput::error(error.to_string()),
        })
    }
}

struct Query {
    pattern: Option<Regex>,
    glob: Option<Regex>,
    start: PathBuf,
    context: usize,
    max_results: usize,
}

fn search(
    tool: &SearchCode,
    arguments: &Value,
    cancellation: &CancellationToken,
) -> Result<String> {
    let query = parse_query(&tool.root, arguments)?;
    let ignored = gitignored_directories(&tool.root);
    let mut report = String::new();
    let mut results = 0;
    let mut files_with_matches = 0;
    let mut scanned = 0;
    let mut truncated = false;
    let walker = WalkDir::new(&query.start)
        .follow_links(false)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| {
            entry.depth() == 0 || !entry.file_type().is_dir() || !skipped(entry.path(), &ignored)
        });
    for entry in walker.filter_map(Result::ok) {
        if cancellation.is_cancelled() {
            bail!("tool call cancelled");
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(&tool.root)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .replace('\\', "/");
        if query
            .glob
            .as_ref()
            .is_some_and(|glob| !glob.is_match(&relative))
        {
            continue;
        }
        scanned += 1;
        if scanned > MAX_SCANNED_FILES {
            truncated = true;
            break;
        }
        let Some(pattern) = &query.pattern else {
            if results == query.max_results {
                truncated = true;
                break;
            }
            let _ = writeln!(report, "{relative}");
            results += 1;
            continue;
        };
        let Some(text) = searchable_text(entry.path()) else {
            continue;
        };
        let found = matching_lines(&text, pattern, query.context);
        if found.is_empty() {
            continue;
        }
        files_with_matches += 1;
        for (number, line, is_match) in found {
            if is_match {
                if results == query.max_results {
                    truncated = true;
                    break;
                }
                results += 1;
            }
            let separator = if is_match { ':' } else { '-' };
            let _ = writeln!(report, "{relative}{separator}{number}{separator} {line}");
        }
        if truncated {
            break;
        }
    }
    let summary = match &query.pattern {
        Some(_) if results == 0 => "no matches".to_owned(),
        Some(_) => format!("{results} matching lines in {files_with_matches} files"),
        None if results == 0 => "no files matched".to_owned(),
        None => format!("{results} files"),
    };
    let more = if truncated {
        " (limit reached; narrow the path, glob, or pattern)"
    } else {
        ""
    };
    Ok(format!("{summary}{more}\n{report}"))
}

fn parse_query(root: &Path, arguments: &Value) -> Result<Query> {
    let pattern = optional_string(arguments, "pattern")?.filter(|pattern| !pattern.is_empty());
    let glob = optional_string(arguments, "glob")?.filter(|glob| !glob.is_empty());
    if pattern.is_none() && glob.is_none() {
        bail!("give a pattern to search for, a glob to list files, or both");
    }
    let literal = arguments
        .get("literal")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let pattern = pattern
        .map(|pattern| {
            let source = if literal {
                regex::escape(pattern)
            } else {
                pattern.to_owned()
            };
            // Smart case: an uppercase letter makes the search case-sensitive.
            RegexBuilder::new(&source)
                .case_insensitive(!pattern.chars().any(char::is_uppercase))
                .size_limit(1 << 20)
                .build()
                .with_context(|| {
                    format!("invalid pattern `{pattern}`; set literal: true to match text as-is")
                })
        })
        .transpose()?;
    let start = match optional_string(arguments, "path")?.filter(|path| !path.is_empty()) {
        None => root.to_path_buf(),
        Some(path) => {
            let resolved = fs::canonicalize(root.join(path))
                .with_context(|| format!("path `{path}` does not exist"))?;
            if !resolved.starts_with(root) {
                bail!("path escapes the workspace");
            }
            resolved
        }
    };
    let context = usize::try_from(
        arguments
            .get("context_lines")
            .and_then(Value::as_u64)
            .unwrap_or(0),
    )
    .unwrap_or(MAX_CONTEXT_LINES)
    .min(MAX_CONTEXT_LINES);
    let max_results = usize::try_from(
        arguments
            .get("max_results")
            .and_then(Value::as_u64)
            .unwrap_or(DEFAULT_RESULTS as u64),
    )
    .unwrap_or(MAX_RESULTS)
    .clamp(1, MAX_RESULTS);
    Ok(Query {
        pattern,
        glob: glob.map(glob_regex).transpose()?,
        start,
        context,
        max_results,
    })
}

fn optional_string<'a>(arguments: &'a Value, name: &str) -> Result<Option<&'a str>> {
    match arguments.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_str()
            .map(Some)
            .with_context(|| format!("{name} must be a string")),
    }
}

/// `*.rs`, `src/**/*.ts`, `Cargo.?oml`. A glob without `/` matches the
/// file name anywhere in the tree.
fn glob_regex(glob: &str) -> Result<Regex> {
    let mut source = String::from(if glob.contains('/') { "^" } else { "(^|/)" });
    let mut characters = glob.chars().peekable();
    while let Some(character) = characters.next() {
        match character {
            '*' if characters.peek() == Some(&'*') => {
                characters.next();
                if characters.peek() == Some(&'/') {
                    characters.next();
                    source.push_str("(.*/)?");
                } else {
                    source.push_str(".*");
                }
            }
            '*' => source.push_str("[^/]*"),
            '?' => source.push_str("[^/]"),
            other => source.push_str(&regex::escape(&other.to_string())),
        }
    }
    source.push('$');
    Regex::new(&source).with_context(|| format!("invalid glob `{glob}`"))
}

/// Top-level folders named in the root `.gitignore` (`dist/`, `/out`, `logs`).
fn gitignored_directories(root: &Path) -> BTreeSet<String> {
    fs::read_to_string(root.join(".gitignore"))
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with(['#', '!']))
        .filter(|line| !line.contains(['*', '?', '[']))
        .map(|line| line.trim_matches('/').to_owned())
        .filter(|line| !line.is_empty() && !line.contains('/'))
        .collect()
}

fn skipped(directory: &Path, ignored: &BTreeSet<String>) -> bool {
    directory
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| SKIPPED_DIRECTORIES.contains(&name) || ignored.contains(name))
}

/// UTF-8 text of a small, non-binary file.
fn searchable_text(path: &Path) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    if metadata.len() > MAX_FILE_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    if bytes.iter().take(8 * 1024).any(|byte| *byte == 0) {
        return None;
    }
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// `(line number, text, is a match)`, with context lines around matches.
fn matching_lines(text: &str, pattern: &Regex, context: usize) -> Vec<(usize, String, bool)> {
    let lines = text.lines().collect::<Vec<_>>();
    let matches = lines
        .iter()
        .enumerate()
        .filter(|(_, line)| pattern.is_match(line))
        .map(|(index, _)| index)
        .collect::<BTreeSet<_>>();
    let mut shown = BTreeSet::new();
    for &index in &matches {
        shown.extend(index.saturating_sub(context)..=(index + context).min(lines.len() - 1));
    }
    shown
        .into_iter()
        .map(|index| {
            let line = lines[index].trim_end();
            let line = if line.chars().count() > MAX_LINE_CHARS {
                format!("{}…", line.chars().take(MAX_LINE_CHARS).collect::<String>())
            } else {
                line.to_owned()
            };
            (index + 1, line, matches.contains(&index))
        })
        .collect()
}

fn descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: SEARCH_CODE.to_owned(),
        description: "Search the workspace for lines matching a regex (as path:line) or, with only a glob, list matching files. Skips dependency and build folders. Prefer it to grep or find.".to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Regex; case-insensitive unless it has uppercase."},
                "literal": {"type": "boolean"},
                "glob": {"type": "string", "description": "e.g. *.rs or src/**/*.ts"},
                "path": {"type": "string"},
                "context_lines": {"type": "integer", "minimum": 0, "maximum": MAX_CONTEXT_LINES},
                "max_results": {"type": "integer", "minimum": 1, "maximum": MAX_RESULTS}
            },
            "additionalProperties": false
        }),
        risk: RiskClass::ReadOnly,
        transport: ToolTransport::Native,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use crumb_agent::{AgentMode, CancellationToken, DenyAllApprovals, ToolHost};
    use serde_json::{Value, json};

    use super::{CodeSearchLimits, glob_regex, register_code_search_tool};

    fn search(root: &std::path::Path, arguments: &Value) -> crumb_agent::ToolOutput {
        let mut host = ToolHost::default();
        register_code_search_tool(
            &mut host,
            root,
            CodeSearchLimits {
                max_output_bytes: 16 * 1024,
            },
        )
        .expect("tool registers");
        host.call(
            "search_code",
            arguments,
            AgentMode::Auto,
            &DenyAllApprovals,
            &CancellationToken::default(),
        )
        .expect("read-only call needs no approval")
    }

    fn fixture() -> tempfile::TempDir {
        let root = tempfile::tempdir().expect("workspace");
        let path = root.path();
        fs::create_dir_all(path.join("src/db")).expect("dirs");
        fs::create_dir_all(path.join("node_modules/pkg")).expect("dirs");
        fs::create_dir_all(path.join("logs")).expect("dirs");
        fs::write(path.join(".gitignore"), "logs/\n*.tmp\n").expect("file");
        fs::write(
            path.join("src/main.rs"),
            "fn main() {\n    connect_db();\n}\n",
        )
        .expect("file");
        fs::write(
            path.join("src/db/pool.rs"),
            "pub fn connect_db() {}\n// TODO: pool size\n",
        )
        .expect("file");
        fs::write(path.join("node_modules/pkg/index.js"), "connect_db()\n").expect("file");
        fs::write(path.join("logs/run.log"), "connect_db failed\n").expect("file");
        fs::write(path.join("image.bin"), b"connect_db\0\x01").expect("file");
        root
    }

    #[test]
    fn finds_matching_lines_and_skips_dependencies_ignored_folders_and_binaries() {
        let root = fixture();
        let output = search(root.path(), &json!({"pattern": "connect_db"}));
        assert!(!output.is_error, "{}", output.text);
        assert!(
            output.text.starts_with("2 matching lines in 2 files"),
            "{}",
            output.text
        );
        assert!(output.text.contains("src/main.rs:2:     connect_db();"));
        assert!(
            output
                .text
                .contains("src/db/pool.rs:1: pub fn connect_db() {}")
        );
        assert!(!output.text.contains("node_modules"));
        assert!(!output.text.contains("logs/"));
        assert!(!output.text.contains("image.bin"));
    }

    #[test]
    fn globs_list_files_and_narrow_searches() {
        let root = fixture();
        let files = search(root.path(), &json!({"glob": "src/**/*.rs"}));
        assert!(files.text.starts_with("2 files"), "{}", files.text);
        let narrowed = search(
            root.path(),
            &json!({"pattern": "todo", "glob": "pool.rs", "context_lines": 1}),
        );
        assert!(
            narrowed
                .text
                .contains("src/db/pool.rs-1- pub fn connect_db() {}"),
            "{}",
            narrowed.text
        );
        assert!(
            narrowed
                .text
                .contains("src/db/pool.rs:2: // TODO: pool size")
        );
    }

    #[test]
    fn smart_case_literal_and_bad_input() {
        let root = fixture();
        assert!(
            search(root.path(), &json!({"pattern": "TODO"}))
                .text
                .contains("pool.rs:2:")
        );
        assert!(
            search(root.path(), &json!({"pattern": "Todo"}))
                .text
                .starts_with("no matches")
        );
        assert!(
            search(
                root.path(),
                &json!({"pattern": "connect_db()", "literal": true})
            )
            .text
            .contains("main.rs:2:")
        );
        assert!(search(root.path(), &json!({"pattern": "("})).is_error);
        assert!(search(root.path(), &json!({})).is_error);
        assert!(search(root.path(), &json!({"pattern": "x", "path": "../"})).is_error);
    }

    #[test]
    fn glob_translation() {
        assert!(glob_regex("*.rs").expect("glob").is_match("a/b/c.rs"));
        assert!(!glob_regex("src/*.rs").expect("glob").is_match("src/a/b.rs"));
        assert!(
            glob_regex("src/**/*.rs")
                .expect("glob")
                .is_match("src/b.rs")
        );
        assert!(
            glob_regex("src/**/*.rs")
                .expect("glob")
                .is_match("src/a/b.rs")
        );
    }
}
