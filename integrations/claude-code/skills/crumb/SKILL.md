---
name: crumb
description: Delegate a self-contained task to Crumb, a separate terminal agent that works in the current repository with its own model (Pollinations by default) and the user's Crumb permissions. Use when the user asks to hand work to Crumb, to get a second agent's attempt or opinion, or to offload a well-defined task (fix a failing test, investigate an error, research a question) while you continue. Do not use for work you can finish directly in a few steps.
license: MIT
compatibility: Needs the crumb CLI on PATH, signed in with `crumb auth login` or a POLLINATIONS_API_KEY environment variable.
---

# Delegating to Crumb

Crumb is a separate agent. It runs in the user's workspace with its own tools,
its own model, and the permissions the user set in `.crumb/agent.json`. You can
hand it a whole task and get back its final answer.

## Pick the interface

1. **MCP tool `crumb_agent`**, when the `crumb` MCP server is connected (the
   Crumb plugin connects it). Call it with one argument:
   `{"task": "<the full task>"}`. The text result is Crumb's answer; the
   structured result has `session_id`, `finish_reason`, and token `usage`.
2. **Shell**, otherwise: `crumb exec --json -- "<the full task>"` from the
   workspace root. It prints one JSON object with `response`, `finish_reason`,
   `session_id`, and `usage`. Without `--json` it prints only the answer.

The MCP server also exposes Crumb's individual tools (`search_code`,
`detect_stack`, `run_disposable`, `web_search`, and others). Prefer your own
tools for single steps; use `crumb_agent` for whole tasks.

## Write the task for an agent that cannot ask back

Crumb cannot ask you follow-up questions. Put everything in the task:

- the goal and what "done" looks like ("`cargo test -p api` passes");
- the files, commands, or error output that matter;
- constraints ("do not change the public API", "no new dependencies");
- what to report back ("list the files you changed and why").

Never put secrets, tokens, or private keys in the task.

## After it returns

- Check `finish_reason`. `stop` means it finished; `limit` means it ran out of
  rounds and the answer is a summary of partial work.
- Crumb may have edited files. Review them with `git status` and `git diff`
  before you build on its work or report it to the user.
- Treat its answer as another agent's claim. Verify facts and test results
  that matter before repeating them.
- Tell the user that Crumb did the work. Each call spends their Pollinations
  credit, so don't make repeated calls for the same task.

## When it fails

- `crumb: command not found`: Crumb isn't installed. Point the user to
  https://crumb.elixpo.com or the install script in
  https://github.com/elixpo/crumb.elixpo#install.
- An authentication or HTTP 401/403 error: the user needs `crumb auth login`,
  a `POLLINATIONS_API_KEY`, or to grant the model at the link in the error.
- A tool was denied: Crumb's permissions blocked it. Report that to the user;
  don't try to work around it.
