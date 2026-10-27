# Temporal graph memory

OreoLook's graph tier stores durable, Doctor-approved entities and relationships
without putting transcript-sized data or graph traversal on the response path.
It is disabled by default.

## Data flow

1. An internal Doctor pipeline creates an `ApprovedGraphFact` with tenant, user,
   session, source turn, event time, confidence, and approval fingerprint.
2. `GraphMemoryClient.enqueue_approved()` puts that envelope on Redis DB 5. There
   is deliberately no public graph-write endpoint.
3. The dedicated worker writes it through Graphiti's FalkorDB driver. A newer
   subject/predicate assertion closes the earlier fact's validity interval; it
   does not erase history.
4. The worker refreshes the caller's scoped neighborhood cache in Redis.
5. API workers perform one cache `GET` in parallel with the Redis session ledger
   and Qdrant recall. They never run graph extraction or traversal synchronously.

Failed graph writes do not fail user responses. They enter an exponential-backoff
retry set and move to `oreolook:graph:v1:dead` after the configured retry limit.

## Configuration

Add these values to `.env.local`:

```dotenv
GRAPH_MEMORY_ENABLED=true
GRAPH_MEMORY_BACKEND=graphiti
GRAPH_MEMORY_REDIS_DB=5
GRAPH_MEMORY_CACHE_TTL_SECONDS=3600
GRAPH_MEMORY_MAX_ITEMS=8
GRAPH_MEMORY_MAX_CHARS=2000
GRAPH_MEMORY_RETRY_LIMIT=8

FALKORDB_PASSWORD=replace_with_a_long_random_secret
FALKORDB_DATABASE=oreolook_memory
DOCTOR_APPROVAL_SECRET=replace_with_at_least_32_random_characters
DOCTOR_ALLOW_GLOBAL=false
GRAPH_MEMORY_FACT_TTL_SECONDS=31536000
```

No extra LLM key is needed: approved
facts are written exactly as supplied, rather than being re-extracted by a model.
The existing Redis password remains in use for queues and neighborhood caches.
`DOCTOR_APPROVAL_SECRET` HMAC-signs the complete promoted fact; keep it stable
across replicas and do not expose it to request workers or clients.

Retention, revocation, cascade deletion, and physical graph cleanup are handled
by the internal Janitor. See [JANITOR_MEMORY.md](JANITOR_MEMORY.md).

## Deployment

The Graphiti dependency is isolated in `Dockerfile.graph-memory`; normal API and
IPC images stay unchanged. FalkorDB uses its server-only Alpine image, AOF, and
the fixed `./data/falkordb` volume.

```bash
./deploy.sh --model build deploy --graph
```

To inspect only the optional services:

```bash
docker compose --env-file .env.local --profile graph-memory ps
docker compose --env-file .env.local --profile graph-memory logs -f graph-memory-worker falkordb
```

Turning `GRAPH_MEMORY_ENABLED=false` restores the pre-graph request path: no
Redis graph read, no prompt injection, and no write enqueue.

## Local CPU-only verification

The SQLite backend provides deterministic temporal tests without a graph server
or model:

```bash
PYTHONPATH=lixsearch venv/bin/python -m pytest -q tester/test_graph_memory.py
```

The suite covers revisions, contradictions, historical reads, revocation,
tenant/user/session isolation, restart persistence, retry behavior, disabled
mode, and the 75 ms cache-read gate.
