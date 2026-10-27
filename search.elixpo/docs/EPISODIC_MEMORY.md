# Session-scoped episodic memory

OreoLook uses Redis as the authoritative hot session ledger and Qdrant as a
bounded durable episodic tier. Semantic similarity never replaces exact Redis
state.

## Retrieval contract

- Every episodic query requires `tenant_id`, `user_id`, and a namespaced
  `session_id`; search sessions and Responses conversations cannot collide.
- Qdrant recall starts alongside the Redis lookup, but exact Redis turns win.
- Standalone requests receive no episodic text. Continuation snippets are
  labelled continuity-only and must not be cited or treated as current facts.
- The singleton core embedding service produces all embeddings; request workers
  never load another model.
- Result count, characters, similarity threshold, and caller wait time are
  bounded.

## Episode schema

The `oreolook-episode-v1` payload supports `user_intent`, `final_answer`,
`evidence`, `decision`, `preference`, and `artifact` records. Each record has a
deterministic point ID, content hash, ownership scope, source turns, evidence
IDs, artifact IDs, creation time, and expiry time. Retrying the same response
upserts the same point instead of creating a duplicate.

## Lifecycle

Session deletion removes only episodes matching the full ownership scope. The
core maintenance worker removes expired episodes. Ephemeral requests and
`store: false` responses do not write episodic memory.

Optional non-secret settings:

```dotenv
EPISODIC_MEMORY_TOP_K=4
EPISODIC_MEMORY_MAX_CHARS=2000
EPISODIC_MEMORY_TIMEOUT_SECONDS=0.75
EPISODIC_MEMORY_TTL_SECONDS=2592000
EPISODIC_MEMORY_MIN_SCORE=0.30
```

No additional credential or application secret is required; this tier reuses
the configured Qdrant connection and the existing request principal.
