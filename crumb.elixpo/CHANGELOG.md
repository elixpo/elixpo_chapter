# Changelog

This file records notable public changes to Crumb. Until the first stable
release, behavior and interfaces may change without compatibility guarantees.

## 1.5.2 - 2026-11-21

### Terminal

- Crumb now runs inline by default, in your terminal's normal scrollback, so
  scrolling, search and selection are the terminal's own and stay smooth.
  `CRUMB_FULLSCREEN=1` brings back the full-screen view.
- `/agents` opens the agent map as a dialog while helpers are working too,
  instead of printing over the live view.
- Requests that quote code, such as "add a function fn f() -> String", go
  to the agent instead of failing in the shell because of `>` or `()`.
  Real commands like `ls | grep x` still run in your shell.

### Agent

- Helper agents (`spawn_agents`) no longer hang at "Thinking · 0 tokens":
  they shared the turn's network connections, which could not make progress
  while the turn waited for them.
- When the sandbox blocks a command you asked for, Crumb can ask you to
  approve running just that command outside the sandbox
  (`run_shell_outside_sandbox`); the model cannot approve it itself.
- The temporary folder used by write helpers is removed when they finish.

### Sign-in and notifications

- `/auth login` shows a moving spinner with the elapsed time while it waits
  for you to approve the sign-in.
- Messages the browser prints when Crumb opens it (for example GTK
  warnings) no longer appear in Crumb's screen.
- On Linux desktops where the terminal can only ring the bell, long tasks
  also show a desktop notification (`notify-send`).

### Security

- Updates rustls to 0.23.46, fixing a moderate advisory (TLS secrets could
  appear in debug output) and three low ones.

## 1.5.1 - 2026-11-21

- `crumb --version` (or `-V`) prints the installed version, for example
  `crumb 1.5.1`.
- `crumb --help` (or `-h`, `crumb help`) lists every command and the `exec`
  options instead of failing with a usage error.
- The MCP HTTP tests no longer fail intermittently on Windows.

## 1.5.0 - 2026-11-20

### Follows your project's instructions

- Crumb reads the project's `AGENTS.md`, the instruction file other coding
  agents use, and falls back to `CLAUDE.md`. Files are read from the
  repository root down to the working folder, so a nested file refines the
  project-wide one; outside a repository only the working folder is read.
  They guide how Crumb works and never grant permissions. Helper agents get
  the same instructions.

### Safer by default

- On Linux, commands Crumb runs for you are confined by the kernel
  (Landlock): they can read the system but can only write inside the
  project, temporary folders and toolchain caches, so files such as
  `~/.ssh` stay out of reach. Your own shell commands are never sandboxed.
  Full-access mode or `"permissions": {"sandbox": false}` turns it off.
  Commands that used to write elsewhere now fail with "Permission denied",
  and Crumb tells the model to ask you instead of retrying.

### Checks its own work

- After editing files, Crumb runs the project's fast check (`cargo check`,
  `tsc --noEmit`, `go vet` or `ruff check`) before finishing and fixes what
  it reports, at most twice per turn. Configure or disable it with
  `"checks"` in `.crumb/agent.json`.

### Hooks

- `"hooks"` in `.crumb/agent.json` runs your own commands before and after
  agent tool calls and when a turn ends. A `pre_tool` hook can block a call,
  a `post_tool` hook can add a note for the model; hooks never approve
  anything.

### Helper agents in worktrees

- Helpers that edit files (`spawn_agents` with write access) now work in
  their own git worktree, starting from what you see, and their changes are
  applied to your workspace as soon as each one finishes. Changes that no
  longer apply are saved as a patch and reported, never forced. Outside git
  repositories, and on Windows for now, helpers share the workspace as
  before.

### Notifications

- When a task runs for more than ten seconds, Crumb asks the terminal for a
  desktop notification when it finishes or needs your approval (kitty,
  iTerm2, WezTerm, Ghostty and foot; other terminals get the bell). Set
  `CRUMB_NOTIFICATIONS=off` to turn it off.

### Other

- The eval suite grows from 11 to 24 outcome-graded scenarios.
- The website uses Next.js 16.4.6.

## 1.4.1 - 2026-11-04

### Use Crumb in your editor

- `crumb acp` offers `crumb auth login` as a terminal sign-in to editors
  that can run one (`auth.terminal`, or the earlier `terminal-auth`), so an
  editor can connect the crumb.elixpo account without leaving it.

## 1.4.0 - 2026-11-04

### Use Crumb in your editor

- `crumb acp` runs Crumb as an Agent Client Protocol (v1) agent, so editors
  such as Zed can use it: answers, reasoning and tool calls with their output
  stream into the editor, tool approvals become the editor's permission
  prompts, a cancel stops the turn, and sessions can be listed, resumed and
  closed. `--approvals` overrides the approval policy. Image and audio
  prompts and editor-provided MCP servers are not supported yet.

## 1.3.0 - 2026-11-04

### Run Crumb as a harness

- `crumb exec --stream-json` prints one JSON event per line while a turn runs
  (text, reasoning, tool steps, file changes, approvals, usage) and ends with
  a `result` event, so harness runners can follow and cancel Crumb like other
  coding agents. Tool output is reported by size only, never by contents.
- `crumb exec --resume <session_id>` continues a saved session, and
  `crumb exec --model <provider>/<model>` picks a configured model for one
  turn without changing `.crumb/agent.json`.
- `CRUMB_EXEC_BASE_URL`, `CRUMB_EXEC_API_KEY` and `CRUMB_EXEC_PROTOCOL` point
  `crumb exec --model exec/<model-id>` at any OpenAI-compatible endpoint for
  one turn; the key is referenced by name and never stored.
- `crumb exec --approvals always-ask|sensitive-only|full-access` sets the
  turn's approval policy from the command line, which the model cannot change.

## 1.2.0 - 2026-10-27

### Use Crumb from other agents

- `crumb mcp serve` offers `crumb_agent`: Claude Code, Codex, or any MCP
  client can hand Crumb a whole task and get back its answer with token
  usage. Crumb's own tool calls follow the user's configured approvals.
- Long tool calls report MCP progress every 15 seconds, so clients keep the
  connection open while a delegated task runs.
- This repository is a Claude Code plugin marketplace:
  `/plugin marketplace add elixpo/crumb.elixpo`, then
  `/plugin install crumb@elixpo`. The plugin connects Crumb's MCP server and
  adds a `crumb` skill, which other skill-loading agents can use as well.

### Agent

- A new read-only `github` tool reads repositories, issues, pull requests and
  their changed files, search results, files at a ref, releases, and Actions
  runs, using existing `gh` or `GH_TOKEN` authentication.
- `read_file` numbers every line it returns, so reported line numbers are
  exact.
- HTTP clients are built on first use, so Crumb's tools register even on a
  system without CA certificates; only calls that need the network fail.

### Packaging

- Linux binaries now run on glibc 2.31 and newer (Ubuntu 20.04, Debian 11,
  RHEL 9); 1.1.0 needed glibc 2.39. The Elixpo `.deb` depends on
  `libc6 (>= 2.31)` to match.
- Homebrew: `brew tap elixpo/crumb https://github.com/elixpo/crumb.elixpo`,
  then `brew install elixpo/crumb/crumb`. WinGet manifests are prepared in
  `packaging/winget/`.
- Weekly CI installs Crumb from the Elixpo APT repository on Ubuntu and
  Debian, and agent evals stop once a run reaches its token budget.

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
