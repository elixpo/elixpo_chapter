# Agent evals

End-to-end checks that Crumb's agent finishes real tasks correctly and within
budget. Each scenario runs the real `crumb` binary in a fresh temporary
workspace with `crumb exec --json`, then grades only the outcome:

| Check | Meaning |
|---|---|
| `commands_succeed` | shell commands that must exit 0 afterwards (tests, the program) |
| `file_contains` | files that must exist and contain the given text |
| `files_absent` | paths that must not exist |
| `no_new_files` | the agent must not create files in the workspace |
| `answer_contains` / `answer_matches` / `answer_excludes` | the final answer's text |
| `max_tokens` | input plus output tokens the turn may spend |

The workspace gets the built-in default config with full tool access, which is
safe only because it is a throwaway folder.

## Run

Scenarios call the configured provider (Pollinations by default) with your
credential, so a run spends real tokens.

```sh
cargo build --release -p crumb-cli
python3 evals/run.py                      # all scenarios
python3 evals/run.py --only fix-failing-test exact-count
python3 evals/run.py --keep               # keep workspaces for inspection
```

Results go to `evals/results/<timestamp>.json` (ignored by git) with each
answer, token use, and failed checks.

## Add a scenario

Create `evals/scenarios/<name>.json` with a `prompt`, the seed `files`, and at
least one outcome check. Prefer checks a script can verify (tests pass, exact
values) over answer wording.
