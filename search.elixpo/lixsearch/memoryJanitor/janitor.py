"""Replica-safe cleanup, compaction, and cross-tier deletion orchestration."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import time
import uuid
from typing import Any, Iterable

from graphMemory.client import GraphMemoryClient
from pipeline.config import (
    GRAPH_MEMORY_RETRY_LIMIT,
    JANITOR_DEAD_LETTER_MAX_ITEMS,
    JANITOR_INACTIVE_SECONDS,
    JANITOR_LOCK_SECONDS,
    JANITOR_QUEUE_RETENTION_SECONDS,
    JANITOR_REPORT_TTL_SECONDS,
    JANITOR_REVOCATION_GRACE_SECONDS,
    JANITOR_TRANSCRIPT_MAX_TURNS,
    SESSION_LEDGER_TTL_SECONDS,
)


LOCK_KEY = "oreolook:janitor:v1:lock"
REPORT_KEY = "oreolook:janitor:v1:last-report"
DELETION_QUEUE = "oreolook:janitor:v1:deletions"
DELETION_RETRIES = "oreolook:janitor:v1:deletion-retries"
DELETION_DEAD = "oreolook:janitor:v1:deletion-dead"

_RELEASE_LOCK = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""


@dataclass(frozen=True, slots=True)
class DeletionRequest:
    request_id: str
    tenant_id: str
    user_id: str
    session_id: str | None
    raw_session_id: str | None
    requested_at: int

    @classmethod
    def create(
        cls, tenant_id: str, user_id: str, *, session_id: str | None = None,
        raw_session_id: str | None = None, now: int | None = None,
    ) -> "DeletionRequest":
        if not tenant_id.strip() or not user_id.strip():
            raise ValueError("tenant_id and user_id are required")
        timestamp = int(now or time.time())
        identity = "\0".join((tenant_id, user_id, session_id or "*", raw_session_id or "*"))
        return cls(
            request_id=f"del_{uuid.uuid5(uuid.NAMESPACE_URL, identity).hex}",
            tenant_id=tenant_id, user_id=user_id, session_id=session_id,
            raw_session_id=raw_session_id, requested_at=timestamp,
        )


@dataclass(slots=True)
class JanitorReport:
    run_id: str
    started_at: int
    dry_run: bool
    acquired: bool = True
    redis_keys_repaired: int = 0
    transcripts_compacted: int = 0
    turns_trimmed: int = 0
    completed_states_removed: int = 0
    episodes_expired: int = 0
    graph_cleanup_queued: int = 0
    artifacts_removed: int = 0
    queue_items_removed: int = 0
    deletions_completed: int = 0
    deletions_retried: int = 0
    deletions_dead_lettered: int = 0
    failures: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class Janitor:
    """One bounded lifecycle pass. No method in this class is mounted publicly."""

    def __init__(
        self, *, lock_redis, ledger_redis, state_redis, graph_redis,
        graph_client: GraphMemoryClient, core_service=None,
        artifact_dirs: Iterable[str] = (), conversation_dir: str | None = None,
    ):
        self.lock_redis = lock_redis
        self.ledger_redis = ledger_redis
        self.state_redis = state_redis
        self.graph_redis = graph_redis
        self.graph = graph_client
        self.core = core_service
        self.artifact_dirs = tuple(Path(path) for path in artifact_dirs if path)
        self.conversation_dir = Path(conversation_dir) if conversation_dir else None
        self._release_lock = lock_redis.register_script(_RELEASE_LOCK)

    def request_deletion(self, request: DeletionRequest) -> bool:
        payload = json.dumps({"attempt": 0, "request": asdict(request)}, separators=(",", ":"))
        return bool(self.graph_redis.lpush(DELETION_QUEUE, payload))

    def run(self, *, dry_run: bool = False, now: int | None = None) -> JanitorReport:
        timestamp = int(now or time.time())
        report = JanitorReport(f"jan_{uuid.uuid4().hex}", timestamp, bool(dry_run))
        token = uuid.uuid4().hex
        if not self.lock_redis.set(LOCK_KEY, token, nx=True, ex=JANITOR_LOCK_SECONDS):
            report.acquired = False
            return report
        try:
            self._repair_and_compact_ledger(report)
            self._clean_queues(report, timestamp)
            self._expire_episodes(report, timestamp)
            self._clean_artifacts(report, timestamp)
            self._queue_graph_cleanup(report, timestamp)
            self._process_deletions(report, timestamp)
            if not dry_run:
                self.graph_redis.setex(
                    REPORT_KEY, JANITOR_REPORT_TTL_SECONDS,
                    json.dumps(report.to_dict(), separators=(",", ":")),
                )
            return report
        finally:
            self._release_lock(keys=[LOCK_KEY], args=[token])

    def delete_now(self, request: DeletionRequest, *, dry_run: bool = False) -> JanitorReport:
        report = JanitorReport(f"jan_{uuid.uuid4().hex}", int(time.time()), bool(dry_run))
        self._cascade(request, report)
        return report

    def _repair_and_compact_ledger(self, report: JanitorReport) -> None:
        for raw_key in self.ledger_redis.scan_iter(match="elixpo:session-ledger:v1:*", count=200):
            key = self._text(raw_key)
            ttl = int(self.ledger_redis.ttl(key))
            if ttl == -1:
                report.redis_keys_repaired += 1
                if not report.dry_run:
                    self.ledger_redis.expire(key, SESSION_LEDGER_TTL_SECONDS)
                ttl = SESSION_LEDGER_TTL_SECONDS
            if not key.endswith(":turns"):
                continue
            root = key[:-6]
            if self.ledger_redis.exists(f"{root}:lock"):
                continue
            if ttl > SESSION_LEDGER_TTL_SECONDS - JANITOR_INACTIVE_SECONDS:
                continue
            state_key = f"{root}:state"
            active = self.ledger_redis.hget(state_key, "active_task")
            if active:
                try:
                    status = json.loads(self._text(active)).get("status")
                except (ValueError, AttributeError):
                    status = None
                if status in {"completed", "failed", "cancelled"}:
                    report.completed_states_removed += 1
                    if not report.dry_run:
                        self.ledger_redis.hdel(state_key, "active_task")
            length = int(self.ledger_redis.xlen(key))
            if length <= JANITOR_TRANSCRIPT_MAX_TURNS:
                continue
            trim = length - JANITOR_TRANSCRIPT_MAX_TURNS
            report.transcripts_compacted += 1
            report.turns_trimmed += trim
            if report.dry_run:
                continue
            rows = self.ledger_redis.xrange(key, count=trim)
            audit_key = f"{root}:compaction-audit"
            pipe = self.ledger_redis.pipeline(transaction=True)
            for _, fields in rows:
                sequence = self._text(fields.get("seq", fields.get(b"seq", "unknown")))
                payload = self._text(fields.get("payload", fields.get(b"payload", "")))
                digest = hashlib.sha256(payload.encode()).hexdigest()
                pipe.hsetnx(audit_key, sequence, digest)
            pipe.expire(audit_key, max(ttl, 60))
            pipe.xtrim(key, maxlen=JANITOR_TRANSCRIPT_MAX_TURNS, approximate=False)
            pipe.execute()

    def _clean_queues(self, report: JanitorReport, now: int) -> None:
        cutoff = now - JANITOR_QUEUE_RETENTION_SECONDS
        for key in ("oreolook:graph:v1:retries", "oreolook:doctor:v1:retries", DELETION_RETRIES):
            candidates = int(self.graph_redis.zcount(key, 0, cutoff))
            report.queue_items_removed += candidates
            if candidates and not report.dry_run:
                self.graph_redis.zremrangebyscore(key, 0, cutoff)
        for key in ("oreolook:graph:v1:dead", "oreolook:doctor:v1:dead", DELETION_DEAD):
            length = int(self.graph_redis.llen(key))
            excess = max(0, length - JANITOR_DEAD_LETTER_MAX_ITEMS)
            report.queue_items_removed += excess
            if excess and not report.dry_run:
                self.graph_redis.ltrim(key, 0, JANITOR_DEAD_LETTER_MAX_ITEMS - 1)

    def _expire_episodes(self, report: JanitorReport, now: int) -> None:
        if self.core is None or report.dry_run:
            return
        try:
            report.episodes_expired = int(self.core.expire_episodes(now) or 0)
        except Exception as exc:
            report.failures.append(f"qdrant_expiry:{type(exc).__name__}")

    def _queue_graph_cleanup(self, report: JanitorReport, now: int) -> None:
        report.graph_cleanup_queued = 1
        if report.dry_run:
            return
        revoked_before = datetime.fromtimestamp(
            now - JANITOR_REVOCATION_GRACE_SECONDS, timezone.utc,
        ).isoformat().replace("+00:00", "Z")
        payload = json.dumps({
            "attempt": 0,
            "cleanup": {"now": now, "revoked_before": revoked_before},
        }, separators=(",", ":"))
        self.graph_redis.lpush("oreolook:graph:v1:writes", payload)

    def _clean_artifacts(self, report: JanitorReport, now: int) -> None:
        ttl = int(os.getenv("CONTENT_TTL_SECONDS", "604800"))
        image_ttl = int(os.getenv("IMAGE_TTL_SECONDS", "604800"))
        for directory in self.artifact_dirs:
            if not directory.exists():
                continue
            selected_ttl = image_ttl if directory.name == "images" else ttl
            for path in directory.iterdir():
                if not path.is_file() or now - int(path.stat().st_mtime) <= selected_ttl:
                    continue
                report.artifacts_removed += 1
                if not report.dry_run:
                    path.unlink(missing_ok=True)

    def _process_deletions(self, report: JanitorReport, now: int) -> None:
        if report.dry_run:
            return
        due = self.graph_redis.zrangebyscore(DELETION_RETRIES, 0, now, start=0, num=20)
        for raw in due:
            if not report.dry_run:
                self.graph_redis.zrem(DELETION_RETRIES, raw)
                self.graph_redis.lpush(DELETION_QUEUE, raw)
        for _ in range(20):
            raw = self.graph_redis.rpop(DELETION_QUEUE)
            if not raw:
                break
            envelope = json.loads(self._text(raw))
            try:
                request = DeletionRequest(**envelope["request"])
                self._cascade(request, report)
                report.deletions_completed += 1
            except Exception as exc:
                attempt = int(envelope.get("attempt", 0)) + 1
                envelope["attempt"] = attempt
                payload = json.dumps(envelope, separators=(",", ":"))
                report.failures.append(f"deletion:{type(exc).__name__}")
                if attempt >= GRAPH_MEMORY_RETRY_LIMIT:
                    self.graph_redis.lpush(DELETION_DEAD, payload)
                    report.deletions_dead_lettered += 1
                else:
                    self.graph_redis.zadd(
                        DELETION_RETRIES,
                        {payload: now + min(300, 2 ** min(attempt, 8))},
                    )
                    report.deletions_retried += 1

    def _cascade(self, request: DeletionRequest, report: JanitorReport) -> None:
        if not report.dry_run:
            if self.core is not None:
                self.core.delete_owned_episodes(
                    request.tenant_id, request.user_id, request.session_id,
                )
            self.graph.clear_owner_cached(
                request.tenant_id, request.user_id, session_id=request.session_id,
            )
            self.graph.enqueue_revoke_owner(
                request.tenant_id, request.user_id, session_id=request.session_id,
            )
        if request.raw_session_id:
            root = f"elixpo:session-ledger:v1:{{{request.raw_session_id}}}"
            keys = [
                f"{root}:turns", f"{root}:sequence", f"{root}:idempotency",
                f"{root}:state", f"{root}:lock", f"{root}:compaction-audit",
            ]
            if not report.dry_run:
                self.ledger_redis.delete(*keys)
        self._delete_agent_state(request, report)
        self._delete_owned_artifacts(request, report)
        self._delete_archives(request, report)

    def _delete_agent_state(self, request: DeletionRequest, report: JanitorReport) -> None:
        pattern = ("elixpo:agent:*" if request.user_id == "local"
                   else f"elixpo:agent:{request.user_id}:*")
        for raw_key in self.state_redis.scan_iter(match=pattern, count=200):
            key = self._text(raw_key)
            if request.raw_session_id and request.raw_session_id not in key:
                raw = self.state_redis.get(key)
                if not raw or request.raw_session_id not in self._text(raw):
                    continue
            if not report.dry_run:
                self.state_redis.delete(key)

    def _delete_owned_artifacts(self, request: DeletionRequest, report: JanitorReport) -> None:
        for directory in self.artifact_dirs:
            if not directory.exists():
                continue
            for manifest in directory.glob("*.artifact.json"):
                try:
                    metadata = json.loads(manifest.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    continue
                if metadata.get("tenant_id") != request.tenant_id or metadata.get("user_id") != request.user_id:
                    continue
                if request.session_id is not None and metadata.get("session_id") != request.session_id:
                    continue
                stem = manifest.name.removesuffix(".artifact.json")
                for path in directory.glob(f"{stem}.*"):
                    if not report.dry_run:
                        path.unlink(missing_ok=True)
                    report.artifacts_removed += 1

    def _delete_archives(self, request: DeletionRequest, report: JanitorReport) -> None:
        if not self.conversation_dir or not self.conversation_dir.exists() or not request.raw_session_id:
            return
        safe = request.raw_session_id.replace("/", "_").replace("..", "_")
        for path in self.conversation_dir.glob(f"*{safe}*"):
            if path.is_file() and not report.dry_run:
                path.unlink(missing_ok=True)

    @staticmethod
    def _text(value: Any) -> str:
        return value.decode() if isinstance(value, bytes) else str(value)
