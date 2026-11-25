#!/usr/bin/env python3
"""
pr_blog_draft.py — Converts a merged PR summary into a technical LixBlogs draft via the CLI.

Requirements:
- Triggered on selected merged PRs (label 'blog-draft') or manual workflow_dispatch.
- Uses LIXBLOGS_PAT personal access token from GitHub Secrets (read and write scopes).
- Extracts trusted PR metadata and file changes without executing contributor code.
- Produces a technical Markdown draft with PR attribution, title, subtitle, tags, and target.
- Creates a draft by default (publishing is never automated).
- Derives a deterministic idempotency key from repository and PR number.
- Updates an existing draft on safe reruns instead of creating duplicates.
- Masks tokens and never prints secrets in logs, summaries, or artifacts.
- Outputs draft ID and URL in GitHub Step Summary and action outputs.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

TOKEN_PATTERN = re.compile(r"lix_pat_[A-Za-z0-9_-]{32,120}")


def redact_token(text: str, token: Optional[str] = None) -> str:
    """Mask any occurrences of LixBlogs PAT tokens in text."""
    if not text:
        return ""
    redacted = TOKEN_PATTERN.sub("[REDACTED_PAT]", text)
    if token and token in redacted:
        redacted = redacted.replace(token, "[REDACTED_PAT]")
    return redacted


def derive_idempotency_key(repo: str, pr_number: int | str) -> str:
    """Derive a bounded, valid idempotency key from repository name and PR number.

    LixBlogs requires 8 to 128 characters containing only alphanumeric, hyphen, underscore.
    """
    clean_repo = re.sub(r"[^a-zA-Z0-9_-]", "-", str(repo)).strip("-").lower()
    key = f"{clean_repo}-pr-{pr_number}"
    if len(key) < 8:
        key = f"lixblogs-{key}"
    if len(key) > 128:
        key = key[:128]
    return key


def derive_draft_slug(pr_number: int | str) -> str:
    """Deterministic slug for draft identification across safe reruns."""
    return f"pr-{pr_number}"


def derive_tags(files: List[Dict[str, Any]]) -> List[str]:
    """Derive up to 5 technical tags from changed files."""
    tags = ["engineering", "open-source"]
    filenames = [f.get("filename", "").lower() for f in files]

    if any(fn.startswith("packages/lixblogs-cli") or "cli" in fn for fn in filenames):
        tags.append("cli")
    if any(fn.startswith("app/api") or fn.startswith("lib/") for fn in filenames):
        tags.append("backend")
    if any(fn.startswith("src/") or fn.startswith("app/") for fn in filenames):
        tags.append("frontend")
    if any("cloudflare" in fn or fn.startswith("worker/") for fn in filenames):
        tags.append("cloudflare")

    # Deduplicate preserving order, limit to 5
    seen = set()
    unique_tags = []
    for t in tags:
        if t not in seen:
            seen.add(t)
            unique_tags.append(t)
        if len(unique_tags) >= 5:
            break
    return unique_tags


def extract_pr_metadata(pr: Dict[str, Any], files: List[Dict[str, Any]], repo: str) -> Dict[str, Any]:
    """Extract and sanitize trusted PR metadata without executing any contributor code."""
    pr_number = pr.get("number")
    raw_title = pr.get("title", f"Pull Request #{pr_number}")
    # Strip conventional prefixes like [ELIXPO], feat:, fix: etc. for blog title
    clean_title = re.sub(r"^(\[[A-Z0-9_-]+\]|\w+:\s*)+", "", raw_title).strip()
    if not clean_title or len(clean_title) < 5:
        clean_title = raw_title.strip()

    title = f"{clean_title} (PR #{pr_number})"
    # Cap title length
    if len(title) > 280:
        title = title[:277] + "..."

    author = pr.get("user", {}).get("login", "contributor")
    merged_by = pr.get("merged_by", {}).get("login") if pr.get("merged_by") else None
    merged_at = pr.get("merged_at", "")
    html_url = pr.get("html_url", f"https://github.com/{repo}/pull/{pr_number}")
    raw_body = pr.get("body") or ""

    # Subtitle: extract first informative sentence or fallback
    subtitle = ""
    lines = [line.strip() for line in raw_body.splitlines() if line.strip() and not line.startswith("#")]
    for line in lines:
        cleaned_line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line).strip()
        if len(cleaned_line) >= 20:
            subtitle = cleaned_line
            break
    if not subtitle:
        subtitle = f"Technical overview of changes and architecture introduced in pull request #{pr_number}."
    if len(subtitle) > 250:
        subtitle = subtitle[:247] + "..."

    return {
        "pr_number": pr_number,
        "title": title,
        "clean_title": clean_title,
        "subtitle": subtitle,
        "author": author,
        "merged_by": merged_by,
        "merged_at": merged_at,
        "html_url": html_url,
        "body": raw_body,
        "files": files,
        "repo": repo,
    }


def generate_markdown_draft(metadata: Dict[str, Any]) -> str:
    """Generate structured technical Markdown for the blog draft."""
    pr_number = metadata["pr_number"]
    clean_title = metadata["clean_title"]
    html_url = metadata["html_url"]
    author = metadata["author"]
    merged_by = metadata.get("merged_by")
    merged_at = metadata.get("merged_at", "")
    body = metadata.get("body", "")
    files = metadata.get("files", [])
    repo = metadata.get("repo", "")

    # Sanitize body: remove PR command tags or bot comments
    clean_body_lines = []
    for line in body.splitlines():
        if "@elixpoo" in line or "@claude" in line:
            continue
        clean_body_lines.append(line)
    clean_body = "\n".join(clean_body_lines).strip()

    # Changed files summary
    total_files = len(files)
    additions = sum(f.get("additions", 0) for f in files)
    deletions = sum(f.get("deletions", 0) for f in files)

    key_files = files[:12]
    files_list = []
    for f in key_files:
        fn = f.get("filename", "")
        status = f.get("status", "modified")
        adds = f.get("additions", 0)
        dels = f.get("deletions", 0)
        files_list.append(f"- `{fn}` ({status}, +{adds}/-{dels})")
    if total_files > 12:
        files_list.append(f"- *...and {total_files - 12} additional files*")
    files_section = "\n".join(files_list) if files_list else "- *No changed file details available.*"

    overview_text = clean_body if clean_body else (
        f"This pull request implements technical improvements and refinements for `{repo}`. "
        f"It addresses issue requirements with structured code changes and automated testing."
    )

    merged_info = f"- **Merged At:** {merged_at}\n" if merged_at else ""
    merged_by_info = f"- **Merged By:** @{merged_by}\n" if merged_by else ""

    markdown = f"""# {clean_title}

> **Source Pull Request:** [#{pr_number}]({html_url}) by @{author}

## Overview

{overview_text}

## Architecture & Modified Files

This pull request touched {total_files} file{"s" if total_files != 1 else ""} across the codebase with a net diff of +{additions} / -{deletions} lines.

### Modified Components

{files_section}

## Source & Attribution

- **Repository:** `{repo}`
- **Pull Request:** [#{pr_number}]({html_url})
- **Author:** @{author}
{merged_by_info}{merged_info}
---
*This draft was automatically generated from pull request #{pr_number} metadata. Review and adjust content before publishing.*
"""
    return markdown.strip()


def find_existing_draft(drafts: List[Dict[str, Any]], pr_number: int | str) -> Optional[Dict[str, Any]]:
    """Locate an existing draft for this PR by slug or title."""
    target_slug = derive_draft_slug(pr_number)
    pr_tag = f"pr-{pr_number}"
    pr_label = f"PR #{pr_number}"

    for draft in drafts:
        slug = str(draft.get("slug", ""))
        title = str(draft.get("title", ""))
        if slug == target_slug or slug.startswith(f"{target_slug}-"):
            return draft
        if pr_label in title or f"(#{pr_number})" in title:
            return draft
        tags = draft.get("tags") or []
        if pr_tag in tags:
            return draft
    return None


def github_api_get(url: str, token: Optional[str] = None) -> Any:
    """Fetch JSON from GitHub REST API."""
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "elixpo-pr-blog-draft/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def resolve_cli_path() -> List[str]:
    """Find the path to invoke the LixBlogs CLI."""
    # Check local packages/lixblogs-cli/bin/lixblogs.mjs
    local_bin = os.path.join(os.getcwd(), "packages", "lixblogs-cli", "bin", "lixblogs.mjs")
    if os.path.exists(local_bin):
        return ["node", local_bin]
    # Check if lixblogs is in PATH
    return ["lixblogs"]


def run_cli(args: List[str], token: str, stdin_content: Optional[str] = None) -> Tuple[int, str, str]:
    """Execute a LixBlogs CLI command with LIXBLOGS_TOKEN in environment."""
    cli_base = resolve_cli_path()
    cmd = cli_base + args

    env = os.environ.copy()
    env["LIXBLOGS_TOKEN"] = token

    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE if stdin_content is not None else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )
    stdout, stderr = proc.communicate(input=stdin_content)
    return proc.returncode, stdout, stderr


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or update a LixBlogs draft from a merged PR.")
    parser.add_argument("--pr", type=int, default=os.environ.get("PR_NUMBER"), help="PR number")
    parser.add_argument("--repo", default=os.environ.get("REPO") or os.environ.get("GITHUB_REPOSITORY", "elixpo/blogs.elixpo"), help="Repository name")
    parser.add_argument("--publication", default=os.environ.get("PUBLICATION", "personal"), help="Publication target (personal or org:ID)")
    parser.add_argument("--collection", default=os.environ.get("COLLECTION"), help="Collection ID")
    parser.add_argument("--dry-run", action="store_true", default=os.environ.get("DRY_RUN", "").lower() in ("true", "1"), help="Dry run without writing to API")
    args = parser.parse_args()

    pr_number = args.pr
    repo = args.repo
    publication = args.publication or "personal"
    collection = args.collection
    dry_run = args.dry_run

    if not pr_number:
        print("::error::PR number is required via --pr or PR_NUMBER environment variable.", file=sys.stderr)
        return 1

    lixblogs_token = os.environ.get("LIXBLOGS_TOKEN") or os.environ.get("LIXBLOGS_PAT")
    github_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")

    # Fork check and secret availability
    if not lixblogs_token:
        # Check if running in a fork context
        is_fork = os.environ.get("GITHUB_EVENT_NAME") == "pull_request" and os.environ.get("GITHUB_HEAD_REF")
        msg = (
            "LIXBLOGS_PAT secret is not configured or not accessible in this context. "
            "For pull requests from forks, repository secrets are omitted for security. "
            "To generate a technical blog draft for this PR, a maintainer can run the workflow manually via workflow_dispatch."
        )
        if is_fork:
            print(f"::warning::{msg}")
            # Exit 0 gracefully on forks so PR status checks are not failed
            return 0
        print(f"::error::{msg}", file=sys.stderr)
        return 1

    # Mask token in GitHub Actions logs
    print(f"::add-mask::{lixblogs_token}")

    print(f"Fetching PR #{pr_number} metadata from {repo}...")
    try:
        pr_data = github_api_get(f"https://api.github.com/repos/{repo}/pulls/{pr_number}", github_token)
    except Exception as exc:
        print(f"::error::Failed to fetch PR #{pr_number} from GitHub API: {exc}", file=sys.stderr)
        return 1

    # Verify PR is merged unless dry-run
    if not pr_data.get("merged") and not dry_run:
        print(f"::warning::PR #{pr_number} is not merged. Blog draft generation only applies to merged PRs.")
        return 0

    try:
        files_data = github_api_get(f"https://api.github.com/repos/{repo}/pulls/{pr_number}/files?per_page=100", github_token)
    except Exception as exc:
        print(f"::warning::Failed to fetch changed files for PR #{pr_number} ({exc}), continuing with empty file list.")
        files_data = []

    metadata = extract_pr_metadata(pr_data, files_data, repo)
    markdown_content = generate_markdown_draft(metadata)
    tags = derive_tags(files_data)
    idempotency_key = derive_idempotency_key(repo, pr_number)
    slug = derive_draft_slug(pr_number)

    print(f"Prepared technical draft for PR #{pr_number}:")
    print(f"  Title: {metadata['title']}")
    print(f"  Subtitle: {metadata['subtitle']}")
    print(f"  Idempotency-Key: {idempotency_key}")
    print(f"  Slug: {slug}")
    print(f"  Tags: {', '.join(tags)}")
    print(f"  Publication: {publication}")

    if dry_run:
        print("\n--- Dry Run Draft Preview ---")
        print(markdown_content[:300] + "\n...")
        print("Dry run completed successfully.")
        return 0

    # Write Markdown to a temporary file
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".md", delete=False) as tf:
        tf.write(markdown_content)
        temp_markdown_path = tf.name

    try:
        # Check for existing draft to update instead of creating duplicate
        print("Checking for existing draft on LixBlogs...")
        code, stdout, stderr = run_cli(["blog", "list", "--status", "draft", "--limit", "50", "--json", "--no-input"], lixblogs_token)
        existing_draft = None
        if code == 0:
            try:
                res = json.loads(stdout)
                drafts = res.get("data", [])
                existing_draft = find_existing_draft(drafts, pr_number)
            except Exception as e:
                print(f"::warning::Failed to parse draft list JSON: {e}")

        draft_id = None
        draft_url = None
        action_taken = "created"

        if existing_draft:
            draft_id = existing_draft["id"]
            action_taken = "updated"
            print(f"Found existing draft {draft_id} (slug: {existing_draft.get('slug')}). Updating content...")
            edit_args = [
                "blog", "edit", draft_id,
                "--file", temp_markdown_path,
                "--title", metadata["title"],
                "--subtitle", metadata["subtitle"],
                "--json", "--no-input",
            ]
            for t in tags:
                edit_args.extend(["--tag", t])
            if publication and publication != "personal":
                edit_args.extend(["--publication", publication])
            if collection:
                edit_args.extend(["--collection", collection])

            code, stdout, stderr = run_cli(edit_args, lixblogs_token)
            if code != 0:
                print(f"::error::Failed to update draft {draft_id}: {redact_token(stderr, lixblogs_token)}", file=sys.stderr)
                return 1
        else:
            print("Creating new draft on LixBlogs...")
            create_args = [
                "blog", "create",
                "--file", temp_markdown_path,
                "--title", metadata["title"],
                "--subtitle", metadata["subtitle"],
                "--slug", slug,
                "--idempotency-key", idempotency_key,
                "--json", "--no-input",
            ]
            for t in tags:
                create_args.extend(["--tag", t])
            if publication and publication != "personal":
                create_args.extend(["--publication", publication])
            if collection:
                create_args.extend(["--collection", collection])

            code, stdout, stderr = run_cli(create_args, lixblogs_token)
            if code != 0:
                print(f"::error::Failed to create draft: {redact_token(stderr, lixblogs_token)}", file=sys.stderr)
                return 1
            try:
                created_data = json.loads(stdout)
                draft_id = created_data.get("id") or (created_data.get("data", {}).get("id"))
            except Exception as e:
                print(f"::warning::Could not parse create output: {e}")

        # Fetch canonical draft details to retrieve URL
        if draft_id:
            code, stdout, stderr = run_cli(["blog", "get", draft_id, "--json", "--no-input"], lixblogs_token)
            if code == 0:
                try:
                    blog_data = json.loads(stdout).get("data", {})
                    draft_url = blog_data.get("url")
                except Exception:
                    pass

        if not draft_url and draft_id:
            draft_url = f"https://blogs.elixpo.com/draft/{draft_id}"

        print(f"\nSuccessfully {action_taken} technical blog draft!")
        print(f"Draft ID:  {draft_id}")
        print(f"Draft URL: {draft_url}")

        # Write to GITHUB_OUTPUT if available
        gh_output = os.environ.get("GITHUB_OUTPUT")
        if gh_output:
            with open(gh_output, "a", encoding="utf-8") as f:
                f.write(f"draft_id={draft_id}\n")
                f.write(f"draft_url={draft_url}\n")
                f.write(f"action={action_taken}\n")

        # Write to GITHUB_STEP_SUMMARY
        gh_summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if gh_summary:
            summary_md = f"""### LixBlogs Technical Draft

- **Action:** Draft {action_taken.capitalize()}
- **Draft ID:** `{draft_id}`
- **Preview / Edit URL:** [{draft_url}]({draft_url})
- **Source Pull Request:** [#{pr_number}]({metadata['html_url']}) by @{metadata['author']}
- **Publication Target:** `{publication}`
- **Idempotency Key:** `{idempotency_key}`

> ℹ️ *This post has been saved as a **draft** on LixBlogs. Publishing requires explicit review and approval in the LixBlogs web editor or through `lixblogs blog publish {draft_id} --yes`.*
"""
            with open(gh_summary, "a", encoding="utf-8") as f:
                f.write(summary_md + "\n")

        return 0

    finally:
        if os.path.exists(temp_markdown_path):
            os.remove(temp_markdown_path)


if __name__ == "__main__":
    sys.exit(main())
