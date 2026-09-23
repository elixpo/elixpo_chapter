"""Typed, ownership-scoped episodic memory backed by the shared Qdrant client."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import Enum
import hashlib
import re
import time
import uuid
from typing import Any, Iterable, Mapping, Sequence

from commons.auth_context import current_principal_id
from pipeline.config import (
    EPISODIC_MEMORY_MAX_CHARS,
    EPISODIC_MEMORY_MIN_SCORE,
    EPISODIC_MEMORY_TOP_K,
    EPISODIC_MEMORY_TTL_SECONDS,
)


class EpisodeKind(str, Enum):
    USER_INTENT = "user_intent"
    FINAL_ANSWER = "final_answer"
    EVIDENCE = "evidence"
    DECISION = "decision"
    PREFERENCE = "preference"
    ARTIFACT = "artifact"


@dataclass(frozen=True, slots=True)
class MemoryScope:
    tenant_id: str
    user_id: str
    session_id: str

    def __post_init__(self) -> None:
        for name in ("tenant_id", "user_id", "session_id"):
            if not str(getattr(self, name) or "").strip():
                raise ValueError(f"{name} is required")

    def filters(self) -> dict[str, str]:
        return asdict(self)


def request_memory_scope(session_id: str, *, namespace: str = "session") -> MemoryScope:
    principal = current_principal_id()
    tenant = "pollinations" if principal.startswith("poll_") else "local"
    safe_namespace = re.sub(r"[^a-z0-9_-]", "", namespace.lower()) or "session"
    return MemoryScope(
        tenant_id=tenant,
        user_id=principal,
        session_id=f"{safe_namespace}:{session_id}",
    )


@dataclass(frozen=True, slots=True)
class EpisodicMemoryPayload:
    point_id: str
    episode_id: str
    kind: str
    text: str
    tenant_id: str
    user_id: str
    session_id: str
    content_hash: str
    source_turn_ids: tuple[int, ...]
    evidence_ids: tuple[str, ...]
    artifact_ids: tuple[str, ...]
    created_at: int
    expires_at: int
    factual_evidence: bool = False
    schema: str = "oreolook-episode-v1"

    @classmethod
    def create(
        cls,
        *,
        scope: MemoryScope,
        episode_id: str,
        kind: EpisodeKind,
        text: str,
        source_turn_ids: Sequence[int] = (),
        evidence_ids: Sequence[str] = (),
        artifact_ids: Sequence[str] = (),
        created_at: int | None = None,
        ttl_seconds: int = EPISODIC_MEMORY_TTL_SECONDS,
    ) -> "EpisodicMemoryPayload":
        value = re.sub(r"\s+", " ", str(text or "")).strip()[:4000]
        if not value:
            raise ValueError("episodic text is required")
        created = int(created_at or time.time())
        identity = "\0".join((
            scope.tenant_id,
            scope.user_id,
            scope.session_id,
            str(episode_id),
            kind.value,
        ))
        return cls(
            point_id=str(uuid.uuid5(uuid.NAMESPACE_URL, identity)),
            episode_id=str(episode_id),
            kind=kind.value,
            text=value,
            tenant_id=scope.tenant_id,
            user_id=scope.user_id,
            session_id=scope.session_id,
            content_hash=hashlib.sha256(value.encode("utf-8")).hexdigest(),
            source_turn_ids=tuple(dict.fromkeys(int(item) for item in source_turn_ids)),
            evidence_ids=tuple(dict.fromkeys(str(item) for item in evidence_ids if item)),
            artifact_ids=tuple(dict.fromkeys(str(item) for item in artifact_ids if item)),
            created_at=created,
            expires_at=created + max(3600, int(ttl_seconds)),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class EpisodicMemoryManager:
    """Uses injected singleton services; this class never loads an embedding model."""

    def __init__(self, embedding_service, vector_store):
        self.embedding_service = embedding_service
        self.vector_store = vector_store

    def remember_turn(
        self,
        *,
        scope: MemoryScope,
        episode_id: str,
        user_text: str,
        assistant_text: str,
        source_turn_ids: Sequence[int] = (),
        evidence_ids: Sequence[str] = (),
        artifact_ids: Sequence[str] = (),
    ) -> int:
        payloads = [
            EpisodicMemoryPayload.create(
                scope=scope,
                episode_id=episode_id,
                kind=EpisodeKind.USER_INTENT,
                text=user_text,
                source_turn_ids=source_turn_ids,
            ),
            EpisodicMemoryPayload.create(
                scope=scope,
                episode_id=episode_id,
                kind=EpisodeKind.FINAL_ANSWER,
                text=assistant_text,
                source_turn_ids=source_turn_ids,
                evidence_ids=evidence_ids,
                artifact_ids=artifact_ids,
            ),
        ]
        vectors = self.embedding_service.embed(
            [payload.text for payload in payloads], batch_size=len(payloads)
        )
        self.vector_store.upsert_episodes([
            {**payload.to_dict(), "embedding": vectors[index]}
            for index, payload in enumerate(payloads)
        ])
        return len(payloads)

    def recall(
        self,
        *,
        scope: MemoryScope,
        query: str,
        top_k: int = EPISODIC_MEMORY_TOP_K,
        max_chars: int = EPISODIC_MEMORY_MAX_CHARS,
        min_score: float = EPISODIC_MEMORY_MIN_SCORE,
    ) -> list[dict[str, Any]]:
        limit = max(1, min(int(top_k), 12))
        char_budget = max(256, min(int(max_chars), 8000))
        embedding = self.embedding_service.embed_single(query)
        qdrant_started = time.perf_counter()
        candidates = self.vector_store.search_episodes(
            embedding,
            filters=scope.filters(),
            top_k=min(limit * 3, 24),
        )
        qdrant_ms = round((time.perf_counter() - qdrant_started) * 1000, 3)
        now = int(time.time())
        ranked = sorted(
            candidates,
            key=lambda item: (
                float(item.get("score") or 0.0),
                int(item.get("metadata", {}).get("created_at") or 0),
            ),
            reverse=True,
        )
        selected = []
        seen_hashes = set()
        used = 0
        for item in ranked:
            metadata = dict(item.get("metadata") or {})
            if metadata.get("schema") != "oreolook-episode-v1":
                continue
            if any(metadata.get(key) != value for key, value in scope.filters().items()):
                continue
            if int(metadata.get("expires_at") or 0) <= now:
                continue
            if float(item.get("score") or 0.0) < float(min_score):
                continue
            content_hash = str(metadata.get("content_hash") or "")
            if not content_hash or content_hash in seen_hashes:
                continue
            text = str(metadata.get("text") or "").strip()
            if not text:
                continue
            remaining = char_budget - used
            if remaining <= 0:
                break
            metadata["text"] = text[:remaining]
            metadata["score"] = float(item.get("score") or 0.0)
            metadata["qdrant_ms"] = qdrant_ms
            metadata["factual_evidence"] = False
            selected.append(metadata)
            seen_hashes.add(content_hash)
            used += len(metadata["text"])
            if len(selected) >= limit:
                break
        return selected

    def delete(self, scope: MemoryScope) -> None:
        self.vector_store.delete_episodes(filters=scope.filters())

    def delete_owner(
        self, tenant_id: str, user_id: str, *, session_id: str | None = None,
    ) -> int:
        return self.vector_store.delete_owned_episodes(
            tenant_id=tenant_id, user_id=user_id, session_id=session_id,
        )

    def expire(self, now: int | None = None) -> int:
        return self.vector_store.delete_expired_episodes(int(now or time.time()))


def format_episodic_context(memories: Iterable[Mapping[str, Any]]) -> str:
    parts = []
    for memory in memories:
        kind = str(memory.get("kind") or "memory").replace("_", " ")
        text = str(memory.get("text") or "").strip()
        if text:
            parts.append(f"[{kind}; continuity only] {text}")
    if not parts:
        return ""
    return (
        "Semantic episodic context follows. Exact current-session turns are authoritative. "
        "Use these snippets only for continuity, decisions, preferences, and referents; "
        "never cite them or treat them as current factual evidence.\n" + "\n".join(parts)
    )


def continuation_episodic_context(
    context_mode: str,
    memories: Iterable[Mapping[str, Any]],
) -> str:
    """Fresh/standalone requests never receive old episodic factual text."""
    if str(context_mode).strip().lower() != "continuation":
        return ""
    return format_episodic_context(memories)
