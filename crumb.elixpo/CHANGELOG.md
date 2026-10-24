# Changelog

This file records notable public changes to Crumb. Until the first stable
release, behavior and interfaces may change without compatibility guarantees.

## Unreleased

## 1.1.0 - 2026-10-25

### Agent

- The agent keeps working until a task is done: tools stay available after a
  successful call, invalid tool calls are returned to the model, and hitting
  a limit ends with a summary of partial work.
- Narration and answers stream live, alongside tool activity.
- New tools: `search_code` (regex, literal, or file search with line
  numbers), `update_tasks` (a task list the agent must finish or report as
  blocked before answering), and `start_background` / `check_background` /
  `stop_background` (long builds, deploys, and CI watches without blocking
  the turn).
- `spawn_agents` can run helpers with `access: "write"`; every action they
  take goes through the user's approval.
- `ask_user` asks with choices, checkboxes, or text; `jev_decide` gets
  calibrated decisions from Pollinations' Jev model and shows the grant link
  when a key does not allow it.
- Advice about the project is grounded in what it already uses:
  `detect_stack` now reports hosting, Cloudflare bindings, data stores, ORMs,
  and migrations.
- Stated arithmetic is checked before an answer is accepted, and `read_file`
  states the number of lines it returned.
- Rarely used tools load on demand (`load_tools`) and small talk carries no
  tools, which cuts prompt tokens per round substantially.

### Sessions

- Sessions are grouped per folder; `/sessions` browses, resumes, renames, and
  archives them, and `/sessions all` lists every folder.
- Interrupted sessions resume where they stopped: the conversation is saved
  with secrets redacted (`sessions.save_conversation` turns this off), and a
  resumed agent gets a recap of what happened, the interrupted request, open
  tasks, and earlier background jobs.
- `/agents` shows a map of helpers and background jobs, during a turn too.

### Terminal

- Crumb works in any folder with a built-in Pollinations default.
- Any OpenAI-compatible provider, including keyless local servers such as
  Ollama, can run the native harness.
- A more terminal-like composer: the folder appears as a prompt before the
  cursor, Shift+Enter (or Ctrl+J) inserts a new line, `/terminal-setup`
  enables Shift+Enter in VS Code, footer items explain themselves when
  clicked, and the completion menu sits directly above the composer.
- Streaming no longer times out on long answers, chat requests are retried
  before the first byte, and the transcript scrolls smoothly during a turn.

### Packaging and website

- Elixpo's `.deb` packages are now versioned `<version>-1~elixpo1`, so the
  official Debian package of the same version takes precedence once
  available.
- Fixed the website returning HTTP 500 on every page after the Next.js 16.4
  upgrade, which also broke `crumb auth login`.
- Added end-to-end agent evaluations in `evals/`.

## 1.0.4 - 2026-10-21

- Added a `debian` build profile that uses the system SQLite library and
  environment-variable credentials, and compiles without remote Sigstore
  verification, so Crumb builds from Debian-packaged Rust crates.
- Moved the official Debian source packaging to Salsa; release tarballs no
  longer ship a `debian/` directory.
- Upgraded the website to Next.js 16.

## 1.0.3 - 2026-10-19

- Added `amd64` and `arm64` Debian packages to protected releases.
- Added SHA-256 checksums, Sigstore bundles, and build-provenance attestations
  for each Debian package.
- Documented the separate paths for Elixpo APT distribution and official
  Debian archive sponsorship.

## 1.0.2 - 2026-10-19

- Added manually authorized cross-platform GitHub Releases with checksums,
  SPDX SBOMs, Sigstore signatures, and build-provenance attestations.
- Added checksum-verifying one-line installers for Linux, macOS, and Windows.
- Defined Crumb as Elixpo's self-hosted autonomous Rust agent harness and
  natural-language terminal, powered by Pollinations by default.
- Added the Elixpo Repository Standard 1.0 manifest and public governance,
  contribution, support, conduct, and security policies.
- Replaced repository-local Elixpoo automation with the shared v2 workflow
  callers maintained by `elixpo/agent.elixpo`.

Published versions and artifacts are available from
[GitHub Releases](https://github.com/elixpo/crumb.elixpo/releases).
