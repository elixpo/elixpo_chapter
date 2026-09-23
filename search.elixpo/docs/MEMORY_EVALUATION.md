# Memory release gates

Issue #52 adds two complementary gates. The local gate is deterministic,
CPU-only, and safe for every pull request. The Compose gate is opt-in because
it calls the live model and must reach two individual application replicas.

## Local gate

Run it before building containers:

```bash
source venv/bin/activate
PYTHONPATH=lixsearch python -m pytest -q tester/test_memory_release_gates.py
PYTHONPATH=lixsearch python -m memoryEval local --output-dir data/evals/memory
```

The command writes a JSON result for automation and a Markdown report for
humans. It verifies referential follow-ups, clarification recovery, artifact
source selection, historical/current temporal facts, stale-memory rejection,
long-session recall, deletion visibility, tenant/user/session isolation, and
the injected-context token budget. Latency measurements exercise the bounded
Redis serialization contract, scoped Qdrant ranking/filtering pipeline,
SQLite temporal graph lookup, and deterministic context builder.

Default p95 limits can be overridden with:

| Variable | Default |
|---|---:|
| `MEMORY_EVAL_REDIS_P95_MS` | 25 ms |
| `MEMORY_EVAL_QDRANT_P95_MS` | 100 ms |
| `MEMORY_EVAL_GRAPH_P95_MS` | 25 ms |
| `MEMORY_EVAL_CONTEXT_P95_MS` | 10 ms |
| `MEMORY_EVAL_MAX_INJECTION_TOKENS` | 1,400 |

## Two-replica Compose gate

Start the production topology first. Resolve the two `lixsearch-app` container
addresses and pass them separately; passing the public load balancer twice is
rejected because it cannot prove cross-replica continuity.

```bash
source .env.local
mapfile -t APP_IDS < <(docker compose --env-file .env.local -f docker-compose.yml ps -q lixsearch-app)
APP_ONE="http://$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "${APP_IDS[0]}"):9002"
APP_TWO="http://$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "${APP_IDS[1]}"):9002"

export OREOLOOK_EVAL_TOKEN_A="$API_KEY"
PYTHONPATH=lixsearch python -m memoryEval compose \
  --base-url "$APP_ONE" \
  --base-url "$APP_TWO" \
  --output-dir data/evals/memory
```

For a real cross-user isolation check, mint a second agent token and export it
as `OREOLOOK_EVAL_TOKEN_B`. Tokens are read from environment variables and are
never written to the report or command line. Without a second token, the gate
still verifies cross-session isolation for the same principal.

The live gate calls the stateful `/api/search` route and alternates requests
across replicas. It verifies an exact random marker
survives the handoff, verifies that the marker cannot be recalled from another
scope, ensures an underspecified artifact request asks for clarification
without creating a file, and records time-to-first-content and total latency.
The default limits are 2,000 ms TTFE and 45,000 ms total response time; override
them with `MEMORY_EVAL_TTFE_P95_MS` and `MEMORY_EVAL_TOTAL_P95_MS`.

## Scenario contract

[`evals/memory/scenarios.json`](../evals/memory/scenarios.json) is the stable
scenario inventory. The targeted test fails when a local scenario is added to
the manifest without a matching result, preventing silent loss of coverage.
