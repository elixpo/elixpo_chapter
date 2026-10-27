# Janitor memory lifecycle

Janitor is OreoLook's internal retention and privacy-deletion coordinator. It
has no HTTP route. Every API replica may schedule it, but a Redis lease allows
only one replica to mutate lifecycle state during a pass.

## What one pass does

- repairs missing TTLs only on known temporary session-ledger keys;
- skips any session with an active execution lock;
- compacts inactive Redis streams to a bounded hot window and stores immutable
  SHA-256 references for trimmed turns;
- removes completed task state, expired Qdrant episodes, old artifacts, stale
  retry entries, and excess dead letters;
- queues expiry/revocation cleanup for the dedicated Graphiti worker;
- processes retryable user/session deletion requests across Redis, Qdrant,
  Graphiti caches and facts, response state, artifacts, and disk archives;
- stores a bounded JSON report at `oreolook:janitor:v1:last-report` in the
  graph-memory Redis database.

Graph facts carry a signed `expires_at` value. Retrieval filters expired facts
immediately; physical deletion occurs asynchronously after the configured
grace period. Revoked facts remain available only to historical point-in-time
queries before their revocation timestamp.

## Configuration

```dotenv
JANITOR_ENABLED=true
JANITOR_INTERVAL_SECONDS=21600
JANITOR_LOCK_SECONDS=900
JANITOR_INACTIVE_SECONDS=3600
JANITOR_TRANSCRIPT_MAX_TURNS=200
JANITOR_QUEUE_RETENTION_SECONDS=604800
JANITOR_DEAD_LETTER_MAX_ITEMS=500
JANITOR_REVOCATION_GRACE_SECONDS=604800
JANITOR_REPORT_TTL_SECONDS=2592000
GRAPH_MEMORY_FACT_TTL_SECONDS=31536000
```

These values are non-secret. Existing Redis, Qdrant, IPC, and Graphiti settings
are reused; Janitor introduces no credential.

## Operator commands

Preview a pass without changing memory, queues, or files:

```bash
docker compose --env-file .env.local exec lixsearch-app \
  python -m memoryJanitor --dry-run
```

Queue an idempotent session deletion:

```bash
docker compose --env-file .env.local exec lixsearch-app \
  python -m memoryJanitor \
  --delete-tenant pollinations \
  --delete-user poll_ACCOUNT_ID \
  --delete-session search:conv_ID \
  --raw-session conv_ID
```

Omit both session flags to delete all memory owned by that tenant/user. Failed
tiers retry with exponential backoff and eventually enter the Janitor dead
letter queue. Re-running the same deletion is safe.

Read the last metrics report:

```bash
docker compose --env-file .env.local exec redis \
  redis-cli -a "$REDIS_PASSWORD" -p 9530 -n 5 \
  GET oreolook:janitor:v1:last-report
```

## Trust boundaries

- No public deletion or memory-write endpoint exists.
- Cascade filters always require both tenant and user ownership.
- Session deletion additionally requires the scoped and raw session IDs.
- Unowned legacy artifacts age out by TTL; Janitor never guesses ownership.
- Dry runs do not pop queues, trim streams, delete files, or enqueue graph work.
