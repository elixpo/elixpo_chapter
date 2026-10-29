# Newcomer guide

This page gets you from a fresh clone to a green test run, and tells you where
to start reading. You do not need a Pollinations account or any API key for
anything on this page.

Read [CONTRIBUTING.md](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md) too:
they hold the contribution rules and the architecture invariants reviewers
check for.

## Prerequisites

- **Rust via rustup.** `rust-toolchain.toml` pins the `stable` channel with the
  `clippy` and `rustfmt` components, so rustup installs the right toolchain the
  first time you run `cargo` in the repository.
- **Minimum version.** The workspace declares `rust-version = "1.95"` and
  `edition = "2024"` in the root `Cargo.toml`. An older stable toolchain will
  not build it; run `rustup update stable` if you see an edition or MSRV error.
- **A C compiler.** Default features compile SQLite from source
  (`bundled-sqlite` in `crumb-history`).
- **Python 3** only if you run the agent evals (you usually should not; see
  below).

You do not need the committed `.env` file. It is encrypted with SOPS (see
`.sops.yaml`) and is only used by maintainer deployment scripts. Do not try to
decrypt it, and never commit a plaintext one.

## Build and test without API keys

These are the commands CI runs on every pull request
(`.github/workflows/ci.yml`):

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
```

The test job runs on Linux, macOS, and Windows. The format and lint job also
runs the installer smoke test, which is POSIX shell and needs `sha256sum`:

```bash
scripts/test-install.sh
```

None of these need network credentials. Tests never call a real model:

- `crumb-llm` defines the `LlmProvider` trait and a deterministic
  `MockProvider` (`crates/crumb-llm/src/lib.rs`). You build it with canned
  models, chat events, and an embedding response, and `with_failure(...)`
  makes every call return a given `ProviderError`.
- `crumb-harness` tests use `MockProvider` (`src/parallel.rs`) and their own
  `ScriptedProvider` (`src/lib.rs`, test module) to drive multi-turn runs.
- `crumb-pollinations` tests its HTTP adapter against a local test server
  (`src/http_tests.rs`), not against the Pollinations API.

When you write a test that needs a model, construct a `MockProvider` (or copy
the `ScriptedProvider` pattern) instead of reaching for a real provider.

### What does need a key

Only the **agent evals** in `evals/` spend real tokens. They run the release
binary against the configured provider and are wired to
`.github/workflows/evals.yml`, which runs weekly and on manual dispatch, never
on pull requests. Skip them unless a maintainer asks. If you do run them, the
steps are in [evals/README.md](../evals/README.md) and need
`POLLINATIONS_API_KEY` in your environment.

There are no `#[ignore]`d tests in the workspace, so `cargo test --workspace`
is the full offline suite.

## Run one crate's tests

The workspace is large (29 crates, about 81k lines of Rust), so iterate on one
crate with `-p`, as `marketplace/README.md` does:

```bash
cargo test -p crumb-marketplace
```

Replace the crate name with the one you are changing (for example
`crumb-tools` or `crumb-agent`). Cargo also accepts `--test <name>` to run a
single integration-test file, such as
`crates/crumb-marketplace/tests/skill_protocol_conformance.rs`. Run the full
three CI commands above before you open a pull request.

## Crate map

All crates live under `crates/`. These are the ones most changes touch.

| Crate | Purpose | Start with |
|---|---|---|
| `crumb-cli` | The `crumb` binary: startup, REPL wiring, slash commands, agent runtime | `src/main.rs` (about 16k lines; search, don't read top to bottom), `src/agent_runtime.rs`, `src/bundled_skills.rs` |
| `crumb-agent` | Provider-neutral agent foundations: config, sessions, routing, approvals, tool registry | `src/tools.rs` (`ToolHandler`, `ToolHost`, `ApprovalBroker`), `src/session.rs`, `src/config.rs` |
| `crumb-tools` | Native tools (shell, workspace read/write, code search, web fetch, GitHub, background jobs) | `src/lib.rs`, `src/clock.rs` (smallest tool), `src/workspace.rs`, `src/shell.rs` |
| `crumb-llm` | Model provider contract and `MockProvider` | `src/lib.rs` |
| `crumb-pollinations` | Pollinations adapter (the default provider) | `src/lib.rs`, `src/http_tests.rs` |
| `crumb-harness` | Bounded, non-interactive agent harness for embedded use | `src/lib.rs`, `src/parallel.rs` |
| `crumb-mcp` | Crumb's own policy-enforcing MCP server, plus STDIO and Streamable HTTP clients for third-party servers | `src/lib.rs` (server), `src/client.rs`, `src/http_client.rs` |
| `crumb-marketplace` | Signed package and skills catalog: validation, scoped install, Sigstore verification | `src/lib.rs`, `tests/skill_protocol_conformance.rs` |
| `crumb-core` | Provider-neutral domain types shared by every crate | `src/lib.rs` |
| `crumb-auth` | Credential storage (OS keyring behind `native-keyring`) | `src/lib.rs` |
| `crumb-memory` | Explicitly approved, bounded session memory | `src/lib.rs` |
| `crumb-ui` | Terminal presentation | `src/lib.rs` |
| `crumb-repl` / `crumb-native` / `crumb-pty` | Input loop and classification, native shell selection, PTY primitives | `src/lib.rs` in each |

The `crumb-a2a*` crates implement agent-to-agent messaging, and
`crumb-harness-cli` / `crumb-harness-dsh` are optional external harness
adapters. You can ignore them until you work on those features.

## Where to start for common tasks

**Add a native tool.**
1. Read the `ToolHandler` trait and `ToolHost::register` in
   `crates/crumb-agent/src/tools.rs`. Each tool is a `ToolDescriptor` (name,
   schema, `RiskClass`) plus an `Arc<dyn ToolHandler>`.
2. Copy the shape of `crates/crumb-tools/src/clock.rs`: a handler type and a
   `register_*_tool(&mut ToolHost, ...)` function, exported from
   `crates/crumb-tools/src/lib.rs`.
3. Call the register function where the others are called in
   `crates/crumb-cli/src/main.rs` and `crates/crumb-cli/src/agent_runtime.rs`
   (search for `register_current_time_tool`).
4. Pick the narrowest `RiskClass`. Models cannot grant themselves
   permissions, so approval stays with `ApprovalBroker`.

**Add or change a skill.**
- Built-in skills are `skills/core/<id>/SKILL.md` (YAML frontmatter plus
  instructions). They are compiled into the binary with `include_str!` in
  `crates/crumb-cli/src/bundled_skills.rs`, so a new built-in skill also needs
  an entry there.
- Community skills ship as marketplace packages. Follow
  [marketplace/README.md](../marketplace/README.md), then run
  `cargo test -p crumb-marketplace`.

**Touch MCP.**
- Read [docs/development/mcp-boundary.md](development/mcp-boundary.md) first.
  Crumb's server and both client transports end at the same `ToolHost` and
  approval boundary.
- Server: `McpDispatcher` in `crates/crumb-mcp/src/lib.rs`.
- Clients: `register_stdio_servers` in `src/client.rs` and
  `register_streamable_http_servers` in `src/http_client.rs`.

**Change model or provider behavior.**
- Contract changes go in `crumb-llm`; Pollinations specifics stay in
  `crumb-pollinations`. Provider details must not leak into `crumb-core`.
- Background: [provider-configuration.md](development/provider-configuration.md)
  and [agent-foundation.md](development/agent-foundation.md).

## Lint and format

CI fails on any warning. The workspace turns on `clippy::all` and
`clippy::pedantic` as warnings and forbids `unsafe_code` (root `Cargo.toml`),
and CI promotes warnings to errors:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```

Run `cargo fmt --all` (without `--check`) to apply formatting.

`CONTRIBUTING.md` also lists a variant with `--all-features`. That also
enables the `debian` feature of `crumb-cli`, which CI does not build. Treat
the CI command as authoritative; use `--all-features` only if you touched
feature-gated code.

## Getting help

- Questions and design discussion:
  [Elixpo Discussions](https://github.com/orgs/elixpo/discussions).
- Reproducible bugs and scoped proposals:
  [GitHub Issues](https://github.com/elixpo/crumb.elixpo/issues). Open an
  issue before large behavioral or architectural changes.
- Security problems: the private path in [SECURITY.md](../SECURITY.md), not a
  public issue.
- More design notes: [docs/development/](development/).

When you ask for help, include your OS, `rustc --version`, the command you ran,
and the first error in its output. Remove tokens and private prompts first.
