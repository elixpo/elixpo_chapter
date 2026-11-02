//! Read-only GitHub access: repositories, issues, pull requests, search,
//! files, releases, and Actions runs.
//!
//! Uses the same credentials as `github_issue` (`GH_TOKEN`, `GITHUB_TOKEN`, or
//! the `gh` CLI login) and otherwise reads public data anonymously. Only GET
//! requests to GitHub's fixed API origin are made, and credentials never
//! appear in tool output.

use std::fmt::Write as _;
use std::sync::Arc;
use std::thread;

use anyhow::{Context, Result, anyhow, bail};
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use reqwest::{Client, StatusCode};
use serde_json::{Value, json};
use url::Url;

use crate::bounded_text;
use crate::github::{GitHubIssueLimits, github_token, valid_slug};

pub const GITHUB: &str = "github";
const OPERATIONS: [&str; 8] = [
    "repo",
    "issues",
    "pulls",
    "pull_files",
    "search",
    "file",
    "releases",
    "runs",
];
const DEFAULT_LIMIT: u64 = 20;
const MAX_LIMIT: u64 = 50;
const JSON: &str = "application/vnd.github+json";
const RAW: &str = "application/vnd.github.raw+json";

/// Registers the read-only `github` tool.
///
/// # Errors
///
/// Returns an error when limits are invalid or the tool cannot be registered.
pub fn register_github_read_tool(host: &mut ToolHost, limits: GitHubIssueLimits) -> Result<()> {
    if limits.timeout.is_zero() || limits.max_output_bytes == 0 {
        bail!("GitHub limits must be positive");
    }
    host.register(
        ToolDescriptor {
            name: GITHUB.to_owned(),
            description: "Read GitHub without changing anything. operation: repo (metadata), \
                          issues or pulls (list, by state), pull_files (files a PR changes), \
                          search (issues and PRs, GitHub search syntax), file (contents at a \
                          ref, or a directory listing), releases, runs (Actions workflow runs). \
                          Uses existing GitHub authentication when available."
                .to_owned(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "operation": {"type": "string", "enum": OPERATIONS},
                    "repo": {"type": "string", "description": "owner/name; required except for search"},
                    "number": {"type": "integer", "minimum": 1, "description": "pull request number for pull_files"},
                    "query": {"type": "string", "description": "search query"},
                    "path": {"type": "string", "description": "file or directory path for file"},
                    "ref": {"type": "string", "description": "branch, tag, or commit for file"},
                    "state": {"type": "string", "enum": ["open", "closed", "all"]},
                    "branch": {"type": "string", "description": "filter runs by branch"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_LIMIT}
                },
                "required": ["operation"],
                "additionalProperties": false
            }),
            risk: RiskClass::NetworkAccess,
            transport: ToolTransport::Native,
        },
        Arc::new(GitHubRead { limits }),
    )
}

struct GitHubRead {
    limits: GitHubIssueLimits,
}

impl ToolHandler for GitHubRead {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        let request = plan(arguments)?;
        let limits = self.limits;
        let cancellation = cancellation.clone();
        thread::Builder::new()
            .name("crumb-github".to_owned())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .context("failed to start GitHub runtime")?;
                runtime.block_on(run(request, limits, &cancellation))
            })
            .context("failed to start GitHub worker")?
            .join()
            .map_err(|_| anyhow!("GitHub worker failed"))?
    }
}

/// One validated API request and how to render its answer.
#[derive(Debug)]
struct Request {
    operation: &'static str,
    url: Url,
    accept: &'static str,
    limit: usize,
}

fn plan(arguments: &Value) -> Result<Request> {
    let operation = text(arguments, "operation")?
        .and_then(|name| OPERATIONS.into_iter().find(|known| *known == name))
        .context("operation must be one of repo, issues, pulls, pull_files, search, file, releases, runs")?;
    let limit = arguments
        .get("limit")
        .map(|value| value.as_u64().context("limit must be a positive integer"))
        .transpose()?
        .unwrap_or(DEFAULT_LIMIT)
        .clamp(1, MAX_LIMIT);
    let per_page = limit.to_string();
    let mut url = Url::parse("https://api.github.com/").context("GitHub API origin")?;
    let mut accept = JSON;
    if operation == "search" {
        let query = text(arguments, "query")?.context("search needs a query")?;
        url.set_path("search/issues");
        url.query_pairs_mut()
            .append_pair("q", query)
            .append_pair("per_page", &per_page);
    } else {
        let (owner, name) = repository(arguments)?;
        let mut segments = vec!["repos", owner, name];
        let state = text(arguments, "state")?.unwrap_or("open");
        if !matches!(state, "open" | "closed" | "all") {
            bail!("state must be open, closed, or all");
        }
        let mut query = vec![("per_page", per_page)];
        let number;
        match operation {
            "repo" => {}
            "issues" | "pulls" => {
                segments.push(operation);
                query.push(("state", state.to_owned()));
                if operation == "issues" {
                    // This endpoint counts pull requests too and they are
                    // filtered out afterwards, so ask for a full page.
                    "100".clone_into(&mut query[0].1);
                }
            }
            "pull_files" => {
                number = arguments
                    .get("number")
                    .and_then(Value::as_u64)
                    .filter(|number| *number > 0)
                    .context("pull_files needs a pull request number")?
                    .to_string();
                segments.extend(["pulls", number.as_str(), "files"]);
            }
            "file" => {
                accept = RAW;
                segments.push("contents");
                segments.extend(file_path(text(arguments, "path")?.unwrap_or(""))?);
                query.clear();
                if let Some(reference) = text(arguments, "ref")? {
                    query.push(("ref", git_ref(reference)?.to_owned()));
                }
            }
            "releases" => segments.push("releases"),
            _ => {
                segments.extend(["actions", "runs"]);
                if let Some(branch) = text(arguments, "branch")? {
                    query.push(("branch", git_ref(branch)?.to_owned()));
                }
            }
        }
        url.path_segments_mut()
            .map_err(|()| anyhow!("GitHub API origin cannot take a path"))?
            .pop_if_empty()
            .extend(segments);
        if !query.is_empty() && operation != "repo" {
            url.query_pairs_mut().extend_pairs(query);
        }
    }
    Ok(Request {
        operation,
        url,
        accept,
        limit: usize::try_from(limit).unwrap_or(usize::MAX),
    })
}

fn text<'a>(arguments: &'a Value, name: &str) -> Result<Option<&'a str>> {
    match arguments.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => {
            let value = value
                .as_str()
                .with_context(|| format!("{name} must be a string"))?
                .trim();
            Ok((!value.is_empty()).then_some(value))
        }
    }
}

fn repository(arguments: &Value) -> Result<(&str, &str)> {
    let repo = text(arguments, "repo")?.context("this operation needs repo as owner/name")?;
    let repo = repo
        .strip_prefix("https://github.com/")
        .unwrap_or(repo)
        .trim_end_matches('/');
    let (owner, name) = repo.split_once('/').context("repo must be owner/name")?;
    if !valid_slug(owner) || !valid_slug(name) || name == "." || name == ".." {
        bail!("repo must be owner/name");
    }
    Ok((owner, name))
}

/// Splits a repository path into checked segments; `..` and absolute paths
/// are refused so the request cannot leave the repository's contents API.
fn file_path(path: &str) -> Result<Vec<&str>> {
    let segments = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if segments
        .iter()
        .any(|segment| matches!(*segment, "." | "..") || segment.contains('\\'))
    {
        bail!("path must stay inside the repository");
    }
    Ok(segments)
}

fn git_ref(reference: &str) -> Result<&str> {
    let valid = reference.len() <= 200
        && !reference.contains("..")
        && reference
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'/'));
    if valid {
        Ok(reference)
    } else {
        bail!("ref and branch may contain only letters, digits, and - _ . /")
    }
}

async fn run(
    request: Request,
    limits: GitHubIssueLimits,
    cancellation: &CancellationToken,
) -> Result<ToolOutput> {
    let token = github_token(cancellation);
    let client = Client::builder()
        .timeout(limits.timeout)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("crumb-cli")
        .build()
        .context("failed to construct GitHub client")?;
    let mut builder = client
        .get(request.url.clone())
        .header(reqwest::header::ACCEPT, request.accept)
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Some(token) = token.as_deref() {
        builder = builder.bearer_auth(token);
    }
    let mut response = tokio::select! {
        result = builder.send() => result.context("GitHub request failed")?,
        () = cancellation.cancelled() => bail!("GitHub request cancelled"),
    };
    let status = response.status();
    if let Some(message) = status_message(status, token.is_some()) {
        return Ok(ToolOutput::error(message));
    }
    let decode_limit = limits.max_output_bytes.saturating_mul(8).max(64 * 1024);
    let mut bytes = Vec::new();
    while let Some(chunk) = tokio::select! {
        result = response.chunk() => result.context("GitHub response failed")?,
        () = cancellation.cancelled() => bail!("GitHub request cancelled"),
    } {
        if bytes.len().saturating_add(chunk.len()) > decode_limit {
            return Ok(ToolOutput::error(
                "GitHub response exceeded the configured size limit; narrow the request",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(ToolOutput::text(bounded_text(
        render(&request, &bytes)?,
        limits.max_output_bytes,
    )))
}

fn status_message(status: StatusCode, authenticated: bool) -> Option<String> {
    if status.is_success() {
        return None;
    }
    Some(match status {
        StatusCode::UNAUTHORIZED => {
            "GitHub authentication failed. Run `gh auth login`, then retry.".to_owned()
        }
        StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS => {
            "GitHub refused the request (permissions or rate limit). Signing in with \
             `gh auth login` raises the rate limit."
                .to_owned()
        }
        StatusCode::NOT_FOUND if authenticated => {
            "Not found, or not visible to the signed-in GitHub account.".to_owned()
        }
        StatusCode::NOT_FOUND => {
            "Not found. If it is private, run `gh auth login`, then retry.".to_owned()
        }
        status => format!("GitHub API returned HTTP {}", status.as_u16()),
    })
}

fn render(request: &Request, bytes: &[u8]) -> Result<String> {
    if request.operation == "file" {
        // A directory comes back as a JSON listing even when raw is requested.
        if let Ok(Value::Array(entries)) = serde_json::from_slice::<Value>(bytes) {
            return Ok(lines(&entries, request.limit, |entry| {
                format!("{}\t{}", field(entry, "/type"), field(entry, "/path"))
            }));
        }
        return Ok(String::from_utf8_lossy(bytes).into_owned());
    }
    let value: Value = serde_json::from_slice(bytes).context("GitHub returned invalid JSON")?;
    let empty = Vec::new();
    let items = value.as_array().unwrap_or(&empty);
    Ok(match request.operation {
        "repo" => render_repo(&value),
        "issues" => {
            // The issues endpoint also returns pull requests; list them under pulls.
            let issues = items
                .iter()
                .filter(|item| item.get("pull_request").is_none())
                .cloned()
                .collect::<Vec<_>>();
            lines(&issues, request.limit, render_item)
        }
        "pulls" => lines(items, request.limit, render_item),
        "pull_files" => lines(items, request.limit, |file| {
            format!(
                "{}\t+{} -{}\t{}",
                field(file, "/status"),
                field(file, "/additions"),
                field(file, "/deletions"),
                field(file, "/filename")
            )
        }),
        "search" => {
            let empty = Vec::new();
            let found = value
                .get("items")
                .and_then(Value::as_array)
                .unwrap_or(&empty);
            format!(
                "{} results\n{}",
                field(&value, "/total_count"),
                lines(found, request.limit, |item| {
                    let repo = field(item, "/repository_url")
                        .rsplit('/')
                        .take(2)
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect::<Vec<_>>()
                        .join("/");
                    format!("{repo} {}", render_item(item))
                })
            )
        }
        "releases" => lines(items, request.limit, |release| {
            let mut line = format!(
                "{}\t{}\t{}",
                field(release, "/tag_name"),
                field(release, "/name"),
                field(release, "/published_at")
            );
            if release.get("prerelease") == Some(&Value::Bool(true)) {
                line.push_str("\tprerelease");
            }
            line
        }),
        _ => {
            let empty = Vec::new();
            let runs = value
                .get("workflow_runs")
                .and_then(Value::as_array)
                .unwrap_or(&empty);
            lines(runs, request.limit, |run| {
                let result = match field(run, "/conclusion").as_str() {
                    "" => field(run, "/status"),
                    conclusion => conclusion.to_owned(),
                };
                format!(
                    "{}\t{result}\t{}\t{}\t{}",
                    field(run, "/name"),
                    field(run, "/head_branch"),
                    field(run, "/created_at"),
                    field(run, "/html_url")
                )
            })
        }
    })
}

fn render_repo(repo: &Value) -> String {
    let topics = repo
        .get("topics")
        .and_then(Value::as_array)
        .map(|topics| {
            topics
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    format!(
        "{}: {}\nDefault branch: {} · Stars: {} · Forks: {} · Open issues and PRs: {}\nLicense: {} · Visibility: {} · Last push: {}\nTopics: {}\nURL: {}",
        field(repo, "/full_name"),
        field(repo, "/description"),
        field(repo, "/default_branch"),
        field(repo, "/stargazers_count"),
        field(repo, "/forks_count"),
        field(repo, "/open_issues_count"),
        field(repo, "/license/spdx_id"),
        field(repo, "/visibility"),
        field(repo, "/pushed_at"),
        if topics.is_empty() { "none" } else { &topics },
        field(repo, "/html_url"),
    )
}

fn render_item(item: &Value) -> String {
    let kind = if item.get("pull_request").is_some() || item.get("head").is_some() {
        "PR "
    } else {
        ""
    };
    let labels = item
        .get("labels")
        .and_then(Value::as_array)
        .map(|labels| {
            labels
                .iter()
                .filter_map(|label| label.get("name").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(",")
        })
        .unwrap_or_default();
    let mut line = format!(
        "{kind}#{} [{}] {} (@{}, updated {})",
        field(item, "/number"),
        field(item, "/state"),
        field(item, "/title"),
        field(item, "/user/login"),
        field(item, "/updated_at"),
    );
    if !labels.is_empty() {
        let _ = write!(line, " [{labels}]");
    }
    line
}

fn lines(items: &[Value], limit: usize, render: impl Fn(&Value) -> String) -> String {
    if items.is_empty() {
        return "none".to_owned();
    }
    items
        .iter()
        .take(limit)
        .map(render)
        .collect::<Vec<_>>()
        .join("\n")
}

fn field(value: &Value, pointer: &str) -> String {
    match value.pointer(pointer) {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{Request, plan, render};
    use serde_json::json;

    fn url(arguments: &serde_json::Value) -> String {
        plan(arguments).expect("valid request").url.to_string()
    }

    #[test]
    fn requests_map_to_fixed_read_only_endpoints() {
        assert_eq!(
            url(&json!({"operation": "repo", "repo": "elixpo/crumb.elixpo"})),
            "https://api.github.com/repos/elixpo/crumb.elixpo"
        );
        assert_eq!(
            url(&json!({"operation": "issues", "repo": "o/r", "state": "closed", "limit": 5})),
            "https://api.github.com/repos/o/r/issues?per_page=100&state=closed"
        );
        assert_eq!(
            url(&json!({"operation": "pull_files", "repo": "o/r", "number": 12})),
            "https://api.github.com/repos/o/r/pulls/12/files?per_page=20"
        );
        assert_eq!(
            url(&json!({"operation": "search", "query": "repo:o/r is:open label:bug"})),
            "https://api.github.com/search/issues?q=repo%3Ao%2Fr+is%3Aopen+label%3Abug&per_page=20"
        );
        assert_eq!(
            url(&json!({"operation": "file", "repo": "o/r", "path": "src/main.rs", "ref": "v1.0"})),
            "https://api.github.com/repos/o/r/contents/src/main.rs?ref=v1.0"
        );
        assert_eq!(
            url(&json!({"operation": "runs", "repo": "o/r", "branch": "main", "limit": 99})),
            "https://api.github.com/repos/o/r/actions/runs?per_page=50&branch=main"
        );
    }

    #[test]
    fn unsafe_or_incomplete_requests_are_refused() {
        for arguments in [
            json!({"operation": "delete", "repo": "o/r"}),
            json!({"operation": "repo"}),
            json!({"operation": "repo", "repo": "o/.."}),
            json!({"operation": "repo", "repo": "o"}),
            json!({"operation": "search"}),
            json!({"operation": "pull_files", "repo": "o/r"}),
            json!({"operation": "file", "repo": "o/r", "path": "../secrets"}),
            json!({"operation": "file", "repo": "o/r", "path": "a", "ref": "x..y"}),
            json!({"operation": "issues", "repo": "o/r", "state": "merged"}),
        ] {
            assert!(plan(&arguments).is_err(), "{arguments}");
        }
    }

    #[test]
    fn issue_listings_leave_out_pull_requests_and_respect_the_limit() {
        let request = Request {
            operation: "issues",
            ..plan(&json!({"operation": "issues", "repo": "o/r", "limit": 1})).unwrap()
        };
        let body = json!([
            {"number": 3, "state": "open", "title": "A PR", "pull_request": {}, "user": {"login": "a"}},
            {"number": 2, "state": "open", "title": "Bug", "user": {"login": "b"},
             "labels": [{"name": "bug"}], "updated_at": "2026-10-27"},
            {"number": 1, "state": "open", "title": "Old", "user": {"login": "c"}}
        ]);
        let text = render(&request, body.to_string().as_bytes()).unwrap();
        assert_eq!(text, "#2 [open] Bug (@b, updated 2026-10-27) [bug]");
    }
}
