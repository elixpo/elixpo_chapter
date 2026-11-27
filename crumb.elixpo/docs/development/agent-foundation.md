# Agent foundation

Branch: `feat/wp-012-agent-foundation`

This work package establishes Rust-owned boundaries before any external harness
is allowed to execute. It does not add model traffic to startup or to ordinary
native commands.

## Deterministic input routing

Routing performs no model call and follows this precedence:

1. Crumb built-ins remain typed and local.
2. Shell syntax, paths, environment assignments, and commands resolved from
   `PATH` remain native.
3. A likely typo with command arguments remains native and carries a
   deterministic suggestion for the error UI.
4. A single unknown token is ambiguous, even when it resembles a command, and
   follows the configured fallback: agent, negotiate, or native.
5. Any other unresolved phrase follows that same configured fallback.

No prefix is needed for natural language. Inputs beginning with `/` are
reserved for Crumb commands, connector/plugin references, and future file or
folder attachments; they never select the agent path. A leading `:` is an
explicit override that removes the prefix and sends the remainder to the agent.

## Operating modes

- `auto`: execute policy-approved harmless steps without extra pauses.
- `negotiate`: show proposed actions and request decisions.
- `plan`: produce a plan and do not execute tools.

These modes affect agent execution, not whether valid shell input is native.

## Live configuration

The schema is represented by `crumb-agent::AgentConfig`; an example lives at
[`docs/examples/agent-config.json`](../examples/agent-config.json). The runtime
reloads the file for each new turn, so edits are immediately visible. The
schema cannot contain credential fields. Prompt-driven changes must become a
typed patch and pass the same validation and approval path as manual edits.

Models, skills, MCP processes, harness commands, optimizer commands, limits,
and modality routes are data. They are not compiled into the router.

Reasoning effort is an adapter-defined string stored with the session and may
be overridden per exact model route. The harness adapter must validate it
against that model's advertised effort list before network I/O; unsupported
values fail visibly rather than being silently remapped.

## Sessions and cancellation

Crumb owns the session identifier, workspace, mode, limits, cancellation token,
and append-only journal. Journals store event metadata and content digests, not
raw prompts, raw tool arguments, credentials, or unfiltered command output.

So an interrupted session can continue where it stopped, its folder
(`.crumb/sessions/crumb/<id>/`) also keeps:

- `conversation.json`: completed turns and action records, saved after each
  successful native turn with secret-looking lines redacted and owner-only
  (`0600`) permissions. Set `"sessions": {"save_conversation": false}` in
  `.crumb/agent.json` to keep nothing but the journal.
- `interrupted.json`: the (redacted) request of a turn that started but never
  finished; it is removed when the turn ends.
- `tasks.json` and `jobs/jobs.json`: the task list and background jobs.

Resuming after a restart restores the conversation, tells the user what was
interrupted, and gives the next turn a brief of the interrupted request, open
tasks, and earlier jobs. Project memory and the code graph are read again each
turn.

## Checks after edits

When a native turn edited files (a successful `WriteWorkspace` or
`Destructive` tool call) and the model gives its final answer, the harness
runs the project's fast check before finishing: `cargo check` for a
`Cargo.toml`, the local `tsc --noEmit` for a `tsconfig.json`, `go vet ./...`
for a `go.mod`, or `ruff check` for Python projects with ruff installed.
Failures go back to the model to fix, at most twice per turn. A check that
cannot give a verdict (missing tool, timeout, Ctrl+C) never fails the turn.
Configure it in `.crumb/agent.json`:

```json
"checks": {"after_edit": true, "command": "make lint", "timeout_secs": 120}
```

`command` replaces the detected check; `"after_edit": false` turns it off.
## Hooks

Hooks run user commands around native agent tool calls, configured in
`.crumb/agent.json` (project hooks only run in a folder you trusted):

```json
"hooks": {
  "pre_tool": [{"command": "./scripts/guard.sh", "tools": ["run_shell"]}],
  "post_tool": [{"command": "cargo fmt --all", "tools": ["edit_file", "write_file"]}],
  "on_stop": [{"command": "notify-send 'Crumb is done'"}]
}
```

Each hook runs in the workspace with `sh -c` (`cmd /C` on Windows) and gets a
JSON event on stdin (`event`, `tool`, `arguments`, `workspace`; `status` for
`on_stop`) plus `CRUMB_HOOK_EVENT` and `CRUMB_WORKSPACE`. `tools` limits a hook
to some tools (empty or `"*"` means all), and `timeout_secs` defaults to 30.

- `pre_tool` runs before approval. Exit status 2 blocks the call; stderr is
  the reason reported to the model.
- `post_tool` runs after a successful call. Exit status 2 appends stderr to
  the result the model sees.
- `on_stop` runs when a turn ends; its outcome is ignored.

Any other exit status, a timeout or a hook that cannot start lets the call
proceed. Hooks can only block or annotate: they never approve a call or widen
permissions.
## Command sandbox

On Linux, agent shell commands and background jobs start through
`crumb __sandbox-exec --write <dir>… -- <shell> <args>…`. The helper applies a
Landlock ruleset to itself while still single-threaded, then `exec`s the
shell, so the restriction needs no `unsafe` code and covers every process the
command starts. Reading and executing stay allowed everywhere; writing is
limited to the workspace, the temporary directories, `/dev`, and toolchain
caches (`~/.cargo`, `~/.rustup`, `~/.cache`, `~/.npm`, `~/go`, plus
`CARGO_HOME`, `RUSTUP_HOME`, `GOPATH`, `GOCACHE` and `XDG_CACHE_HOME`). A
failed command whose error looks like a refused write gets a note pointing the
model at `run_shell_outside_sandbox`: the same shell without the sandbox,
registered only while the sandbox is on, with the `SystemMutation` risk class.
No policy allows it on its own, so every call shows the user an approval prompt
("Running outside the sandbox · $ …"); without an interactive user, as in
`crumb exec`, it is denied.

The sandbox is skipped in full-access mode, with
`"permissions": {"sandbox": false}`, on kernels without Landlock, and on other
platforms (macOS Seatbelt is a follow-up). Network access is not restricted
yet. The interactive shell is never sandboxed.
## Write helpers in worktrees

`spawn_agents` with `access: "write"` runs each helper in its own git
worktree when the workspace is inside a git repository (Unix for now). The
worktree starts from what the user sees: the current commit plus uncommitted
and untracked changes (`.crumb/` excluded), committed in the worktree as the
helper's starting point. As soon as a helper finishes, its diff against that
starting point is applied to the workspace with `git apply` (files only, never
the user's index), and the progress line says so. A diff that no longer
applies, for example because a sibling changed the same lines, is not forced:
it is saved as `<team>-agent-<n>.patch` next to the helper journals and
reported to the parent model and the user. Worktrees live under the system
temp directory and are removed after merging, on cancellation and on errors;
stale records are pruned at the next team start. Outside git repositories,
helpers share the workspace as before.

Ctrl+C sets the shared cancellation token. Native tools must stop their child
processes. The current DeepSeek Harness JSON-RPC SDK has no turn-cancellation
method, so its adapter must terminate and restart the harness subprocess.

## Harness boundary

DeepSeek Harness is a developer-preview optional process reached through
newline-delimited JSON-RPC on stdio. Crumb must pin and check its version, own
all approvals, and fall back to the native loop when it is absent or fails.
Harness configuration is loaded from the live config and never startup-critical.

## MCP and tools

The Rust tool registry owns names, schemas, risk classes, and transport. MCP is
a transport for registered capabilities, not a way to bypass approval. Native
tools win when they provide the same capability with fewer round trips; an MCP
server is chosen only for capabilities it uniquely owns or when configuration
explicitly selects it.

## Token optimization

The pipeline is secret redaction, command-aware filtering, deduplication,
optional external optimization, and budget clipping. RTK is an optional process
adapter. Missing RTK must return the unmodified redacted output.

TOON 4.1 is a working-draft structured encoding. `auto` must compare encoded
sizes and use TOON only for lossless structures where it is smaller; JSON stays
the fallback for irregular data and function-call protocols that require JSON.

## Next packages

1. Wire routing and suggestions into the CLI without changing native execution.
2. Add error capture and the configurable help panel.
3. Add the native agent state machine and isolated shell tool.
4. Add the DeepSeek Harness subprocess adapter and hard cancellation.
5. Add MCP stdio serving/client transports and approval enforcement.
6. Add native filters, RTK, TOON measurement, and context budgeting.
7. Add skill discovery and prompt-driven configuration patches.
