# Doctor memory promotion

The Doctor is OreoLook's private trust boundary between short-lived conversation
data and durable graph memory. It runs inside the graph-memory worker and does
not expose an HTTP, OpenAI, or MCP write endpoint.

## Policy

Every candidate carries ownership, an event timestamp, source turn, source,
evidence identifiers, confidence, and a content fingerprint. The Doctor:

- rejects prompt injection, tool wrappers, internal reasoning, stack traces,
  malformed ownership, expired/future timestamps, and missing evidence;
- classifies retention as `ephemeral`, `session`, `user`, `project`, or `global`;
- applies increasing confidence thresholds for broader scopes;
- requires both operator policy and explicit candidate approval for global data;
- detects cached duplicates and contradictions before promotion;
- signs the complete promoted fact with HMAC-SHA256;
- writes an audit decision without retaining rejected malicious content; and
- retries infrastructure failures while dead-lettering invalid approvals.

The graph worker verifies the HMAC again before persistence. A Redis client with
write access therefore cannot alter an approved subject, relationship, object,
scope, confidence, timestamp, source, or evidence without invalidating approval.

## Configuration

Generate the Doctor secret once:

```bash
openssl rand -hex 32
```

Then add it to `.env.local`:

```dotenv
DOCTOR_APPROVAL_SECRET=<generated-value>
DOCTOR_ALLOW_GLOBAL=false
DOCTOR_CANDIDATE_TTL_SECONDS=604800
DOCTOR_AUDIT_TTL_SECONDS=7776000
```

Keep global promotion disabled until an operator explicitly opts in. Global
means tenant-wide, not cross-tenant.

## Internal submission

Trusted code may create and queue a candidate; public request handlers must not
call this API directly:

```python
from graphMemory.doctor import DoctorMemoryClient, MemoryCandidate, MemoryClass
from pipeline.config import GRAPH_MEMORY_REDIS_DB, create_redis_client
from sessions.episodic_memory import MemoryScope

redis = create_redis_client(db=GRAPH_MEMORY_REDIS_DB, decode_responses=True)
candidate = MemoryCandidate.create(
    scope=MemoryScope("pollinations", "poll_user_id", "search:session_id"),
    subject="OreoLook",
    predicate="creator",
    object="Ayushman Bhattacharya",
    memory_class=MemoryClass.SESSION,
    source="response:resp_id",
    source_turn="turn:4",
    evidence_ids=("response:resp_id",),
    confidence=0.99,
)
DoctorMemoryClient(redis).submit(candidate)
```

The worker processes the candidate asynchronously. Its audit record lives at
`oreolook:doctor:v1:audit:<candidate_id>` in Redis DB 5.

## Verification

```bash
PYTHONPATH=lixsearch venv/bin/python -m pytest -q \
  tester/test_doctor_memory.py tester/test_graph_memory.py
```

These tests cover malicious content, evidence and confidence gates, duplicate
facts, contradictions, global approval, ephemeral disposal, retry behavior,
auditability, signature verification, and payload tampering.
