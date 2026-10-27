"""Repeatable CPU-only memory correctness and latency release gate."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
from typing import Any

from graphMemory.backends import SQLiteTemporalGraphBackend
from graphMemory.models import ApprovedGraphFact
from sessions.artifacts import ArtifactRejected, create_artifact_snapshot
from sessions.clarification import (
    ClarificationResolution,
    ResolutionAction,
    apply_resolution,
    create_pending_task,
)
from sessions.episodic_memory import EpisodicMemoryManager, MemoryScope, format_episodic_context
from sessions.request_context import build_request_context

from .core import EvaluationReport, LatencyBudget, benchmark, estimate_tokens, retrieval_quality


class _Embedding:
    def embed_single(self, text: str) -> list[float]:
        return [float(len(text) % 17), 1.0]


class _VectorStore:
    def __init__(self, candidates: list[dict[str, Any]]):
        self.candidates = candidates
        self.deleted: list[dict[str, str]] = []

    def search_episodes(self, embedding, *, filters, top_k):
        del embedding
        return [
            item for item in self.candidates
            if all(item.get("metadata", {}).get(key) == value for key, value in filters.items())
        ][:top_k]

    def delete_episodes(self, *, filters):
        self.deleted.append(dict(filters))
        self.candidates = [
            item for item in self.candidates
            if not all(item.get("metadata", {}).get(key) == value for key, value in filters.items())
        ]


def _candidate(scope: MemoryScope, episode_id: str, text: str, *, score: float = .95,
               expires_at: int | None = None, created_at: int | None = None) -> dict[str, Any]:
    created = int(created_at or time.time())
    return {
        "score": score,
        "metadata": {
            "schema": "oreolook-episode-v1",
            "episode_id": episode_id,
            "kind": "decision",
            "text": text,
            "content_hash": hashlib.sha256(text.encode()).hexdigest(),
            "created_at": created,
            "expires_at": int(expires_at if expires_at is not None else created + 3600),
            **scope.filters(),
        },
    }


def _fact(scope: MemoryScope, value: str, at: str) -> ApprovedGraphFact:
    return ApprovedGraphFact.create(
        scope=scope, subject="deployment", predicate="preferred database", object=value,
        source_turn="eval", confidence=.99, approval_fingerprint="eval:doctor-approved",
        event_time=at,
    )


async def _graph_scenarios(path: Path) -> tuple[dict[str, bool], SQLiteTemporalGraphBackend, MemoryScope]:
    backend = SQLiteTemporalGraphBackend(str(path))
    owner = MemoryScope("tenant-a", "user-a", "session-a")
    outsider_user = MemoryScope("tenant-a", "user-b", "session-a")
    outsider_session = MemoryScope("tenant-a", "user-a", "session-b")
    await backend.upsert(_fact(owner, "PostgreSQL", "2026-01-01T00:00:00Z"))
    await backend.upsert(_fact(owner, "MongoDB", "2026-02-01T00:00:00Z"))
    historical = await backend.query(owner, at_time="2026-01-15T00:00:00Z")
    current = await backend.query(owner, at_time="2026-03-01T00:00:00Z")
    user_isolated = await backend.query(outsider_user, at_time="2026-03-01T00:00:00Z")
    session_isolated = await backend.query(outsider_session, at_time="2026-03-01T00:00:00Z")
    await backend.revoke_scope(owner, event_time="2026-04-01T00:00:00Z")
    deleted = await backend.query(owner, at_time="2026-05-01T00:00:00Z")
    return {
        "fact_revision": [item.object for item in historical] == ["PostgreSQL"]
            and [item.object for item in current] == ["MongoDB"],
        "graph_isolation": user_isolated == [] and session_isolated == [],
        "graph_deleted": deleted == [],
    }, backend, owner


def run_local(*, repeats: int = 100) -> EvaluationReport:
    report = EvaluationReport(mode="local", metadata={
        "runtime": "cpu-only", "services": "in-process adapters + SQLite",
        "repeats": repeats,
    })

    substantive = "PostgreSQL offers relational integrity and mature operations. " * 4
    messages = [
        {"sequence": 1, "role": "assistant", "content": substantive,
         "metadata": {"evidence_refs": ["source-a", "source-b"]}},
        {"sequence": 2, "role": "user", "content": "Turn filler"},
        {"sequence": 99, "role": "assistant", "content": "Could you specify that?"},
    ]
    context = build_request_context(
        request_id="eval-followup", current_request="Export that as a PDF", messages=messages,
    )
    report.gate(
        "referential_followup",
        context.referent_source is not None and context.referent_source.turn_id == 1,
        source_turn_ids=list(context.source_turn_ids),
    )
    report.gate(
        "artifact_source_selection",
        context.evidence_ids == ("source-a", "source-b"),
        evidence_ids=list(context.evidence_ids),
    )

    active, pending = create_pending_task(
        "Compare several options and create a PDF", ("options",),
        "Which options should be compared?", source_turn=3, request_id="eval-clarify",
    )
    blocked_context = build_request_context(
        request_id="eval-blocked", current_request="Make the PDF",
        active_task=active, pending_clarification=pending,
    )
    artifact_blocked = False
    try:
        create_artifact_snapshot(
            kind="pdf", title="Incomplete report", content=substantive,
            request_context=blocked_context,
        )
    except ArtifactRejected:
        artifact_blocked = True
    resolved, waiting, executable = apply_resolution(
        active, pending, ClarificationResolution(
            action=ResolutionAction.RESOLVE,
            values={"options": "PostgreSQL, MySQL, and MongoDB"},
        ),
    )
    report.gate(
        "clarification_recovery",
        artifact_blocked and waiting is None and executable is not None
        and "PostgreSQL, MySQL, and MongoDB" in executable,
        artifact_blocked=artifact_blocked, status=resolved.get("status"),
    )

    scope = MemoryScope("tenant-a", "user-a", "session-long")
    outsider_user = MemoryScope("tenant-a", "user-b", "session-long")
    outsider_session = MemoryScope("tenant-a", "user-a", "session-other")
    now = int(time.time())
    store = _VectorStore([
        _candidate(scope, "old", "obsolete preference", expires_at=now - 1, created_at=now - 4000),
        _candidate(scope, "wanted", "Use PostgreSQL for the primary ledger", created_at=now - 1000),
        _candidate(scope, "recent", "The workload is write heavy", score=.90),
        _candidate(outsider_user, "private-user", "other user's secret", score=.99),
        _candidate(outsider_session, "private-session", "other session secret", score=.99),
    ])
    episodic = EpisodicMemoryManager(_Embedding(), store)
    recalled = episodic.recall(scope=scope, query="database choice", top_k=8, max_chars=2000)
    ids = [item["episode_id"] for item in recalled]
    quality = retrieval_quality(("wanted", "recent"), ids)
    report.gate(
        "long_session_recall", "wanted" in ids and quality["recall"] == 1.0,
        returned=ids, **quality,
    )
    report.gate("stale_memory_rejection", "old" not in ids, returned=ids)
    outsider_user_recall = episodic.recall(scope=outsider_user, query="database choice", top_k=8)
    outsider_session_recall = episodic.recall(scope=outsider_session, query="database choice", top_k=8)
    episodic_isolated = bool(
        "private-user" not in ids and "private-session" not in ids
        and outsider_user_recall and outsider_user_recall[0]["episode_id"] == "private-user"
        and outsider_session_recall and outsider_session_recall[0]["episode_id"] == "private-session"
    )
    episodic.delete(scope)
    episodic_deleted = episodic.recall(scope=scope, query="database choice", top_k=8) == []

    injected = context.routing_excerpt() + "\n" + format_episodic_context(recalled)
    token_budget = int(os.getenv("MEMORY_EVAL_MAX_INJECTION_TOKENS", "1400"))
    injection_tokens = estimate_tokens(injected)
    report.gate(
        "injection_budget", injection_tokens <= token_budget,
        estimated_tokens=injection_tokens, budget_tokens=token_budget, characters=len(injected),
    )

    with tempfile.TemporaryDirectory(prefix="oreolook-memory-eval-") as directory:
        graph_results, graph, graph_scope = asyncio.run(
            _graph_scenarios(Path(directory) / "memory.db")
        )
        report.gate("fact_revision", graph_results["fact_revision"], backend="sqlite")
        report.gate(
            "deletion_visibility",
            episodic_deleted and graph_results["graph_deleted"],
            episodic_deleted=episodic_deleted, graph_deleted=graph_results["graph_deleted"],
            deleted_filters=store.deleted,
        )
        report.gate(
            "cross_scope_isolation",
            episodic_isolated and graph_results["graph_isolation"],
            episodic_isolated=episodic_isolated,
            graph_isolated=graph_results["graph_isolation"],
            owner_returned=ids,
        )

        redis_payload = json.dumps({"turns": messages, "active_task": active}, sort_keys=True)
        report.latency(benchmark(
            LatencyBudget("redis_protocol", float(os.getenv("MEMORY_EVAL_REDIS_P95_MS", "25"))),
            lambda: json.loads(redis_payload), repeats=repeats,
        ))
        report.latency(benchmark(
            LatencyBudget("qdrant_retrieval_pipeline", float(os.getenv("MEMORY_EVAL_QDRANT_P95_MS", "100"))),
            lambda: episodic.recall(scope=outsider_user, query="database choice", top_k=8), repeats=repeats,
        ))
        report.latency(benchmark(
            LatencyBudget("context_build", float(os.getenv("MEMORY_EVAL_CONTEXT_P95_MS", "10"))),
            lambda: build_request_context(
                request_id="benchmark", current_request="Export that as a PDF", messages=messages,
            ), repeats=repeats,
        ))

        def query_graph() -> None:
            asyncio.run(graph.query(graph_scope, at_time="2026-03-01T00:00:00Z"))

        report.latency(benchmark(
            LatencyBudget("graph_lookup", float(os.getenv("MEMORY_EVAL_GRAPH_P95_MS", "25"))),
            query_graph, repeats=repeats,
        ))
        asyncio.run(graph.close())

    return report
