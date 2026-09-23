"""Pluggable temporal backends.

The production backend uses Graphiti's FalkorDB driver directly. Facts arrive
already approved, so an extraction LLM would be both lossy and wasteful.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
import json
import sqlite3
from typing import Any

from sessions.episodic_memory import MemoryScope
from .models import ApprovedGraphFact, TemporalGraphFact, _utc_iso, scope_id


class TemporalGraphBackend(ABC):
    @abstractmethod
    async def upsert(self, fact: ApprovedGraphFact) -> None: ...

    @abstractmethod
    async def query(
        self, scope: MemoryScope, *, at_time: str | None = None, limit: int = 24
    ) -> list[TemporalGraphFact]: ...

    @abstractmethod
    async def revoke_scope(self, scope: MemoryScope, *, event_time: str | None = None) -> int: ...

    @abstractmethod
    async def revoke_owner(
        self, tenant_id: str, user_id: str, *, session_id: str | None = None,
        event_time: str | None = None,
    ) -> int: ...

    @abstractmethod
    async def cleanup(self, *, now: int, revoked_before: str) -> int: ...

    async def close(self) -> None:
        return None


class SQLiteTemporalGraphBackend(TemporalGraphBackend):
    """CPU-only deterministic backend for local development and test gates."""

    def __init__(self, path: str):
        self.path = path
        self.connection = sqlite3.connect(path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS temporal_facts (
              fact_id TEXT PRIMARY KEY, scope_id TEXT NOT NULL,
              tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
              subject TEXT NOT NULL, predicate TEXT NOT NULL, object_value TEXT NOT NULL,
              event_time TEXT NOT NULL, ingestion_time TEXT NOT NULL,
              source_turn TEXT NOT NULL, confidence REAL NOT NULL,
              approval_fingerprint TEXT NOT NULL, invalid_at TEXT,
              superseded_by TEXT, revoked INTEGER NOT NULL DEFAULT 0,
              memory_class TEXT NOT NULL DEFAULT 'session', source TEXT NOT NULL DEFAULT 'internal',
              evidence_json TEXT NOT NULL DEFAULT '[]', project_id TEXT,
              candidate_fingerprint TEXT, approved_at INTEGER, approval_action TEXT,
              expires_at INTEGER
            )
            """
        )
        for column, definition in (
            ("memory_class", "TEXT NOT NULL DEFAULT 'session'"),
            ("source", "TEXT NOT NULL DEFAULT 'internal'"),
            ("evidence_json", "TEXT NOT NULL DEFAULT '[]'"),
            ("project_id", "TEXT"),
            ("candidate_fingerprint", "TEXT"),
            ("approved_at", "INTEGER"),
            ("approval_action", "TEXT"),
            ("expires_at", "INTEGER"),
        ):
            existing = {row[1] for row in self.connection.execute("PRAGMA table_info(temporal_facts)")}
            if column not in existing:
                self.connection.execute(f"ALTER TABLE temporal_facts ADD COLUMN {column} {definition}")
        self.connection.execute(
            "CREATE INDEX IF NOT EXISTS temporal_scope_idx ON temporal_facts(scope_id, event_time, invalid_at)"
        )
        self.connection.commit()

    async def upsert(self, fact: ApprovedGraphFact) -> None:
        with self.connection:
            self.connection.execute(
                """
                UPDATE temporal_facts SET invalid_at = ?, superseded_by = ?
                WHERE scope_id = ? AND lower(subject) = lower(?) AND predicate = ?
                  AND invalid_at IS NULL AND revoked = 0 AND fact_id <> ?
                """,
                (fact.event_time, fact.fact_id, fact.scope_id, fact.subject, fact.predicate, fact.fact_id),
            )
            self.connection.execute(
                """
                INSERT OR IGNORE INTO temporal_facts (
                  fact_id, scope_id, tenant_id, user_id, session_id, subject, predicate,
                  object_value, event_time, ingestion_time, source_turn, confidence,
                  approval_fingerprint, revoked, memory_class, source, evidence_json, project_id,
                  candidate_fingerprint, approved_at, approval_action, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (fact.fact_id, fact.scope_id, fact.tenant_id, fact.user_id, fact.session_id,
                 fact.subject, fact.predicate, fact.object, fact.event_time,
                 fact.ingestion_time, fact.source_turn, fact.confidence,
                 fact.approval_fingerprint, fact.memory_class, fact.source,
                 json.dumps(fact.evidence_ids), fact.project_id,
                 fact.candidate_fingerprint, fact.approved_at, fact.approval_action,
                 fact.expires_at),
            )

    async def query(
        self, scope: MemoryScope, *, at_time: str | None = None, limit: int = 24
    ) -> list[TemporalGraphFact]:
        at = _utc_iso(at_time)
        at_epoch = int(datetime.fromisoformat(at.replace("Z", "+00:00")).timestamp())
        rows = self.connection.execute(
            """
            SELECT * FROM temporal_facts
            WHERE scope_id = ? AND event_time <= ?
              AND (invalid_at IS NULL OR invalid_at > ?)
              AND (expires_at IS NULL OR expires_at > ?)
            ORDER BY confidence DESC, event_time DESC LIMIT ?
            """,
            (scope_id(scope), at, at, at_epoch, max(1, int(limit))),
        ).fetchall()
        return [_row_to_fact(dict(row)) for row in rows]

    async def revoke_scope(self, scope: MemoryScope, *, event_time: str | None = None) -> int:
        at = _utc_iso(event_time)
        with self.connection:
            cursor = self.connection.execute(
                """UPDATE temporal_facts SET revoked = 1, invalid_at = COALESCE(invalid_at, ?)
                   WHERE scope_id = ? AND revoked = 0""",
                (at, scope_id(scope)),
            )
        return int(cursor.rowcount)

    async def revoke_owner(
        self, tenant_id: str, user_id: str, *, session_id: str | None = None,
        event_time: str | None = None,
    ) -> int:
        at = _utc_iso(event_time)
        clause = "tenant_id = ? AND user_id = ?"
        params: list[Any] = [at, tenant_id, user_id]
        if session_id is not None:
            clause += " AND session_id = ?"
            params.append(session_id)
        with self.connection:
            cursor = self.connection.execute(
                f"UPDATE temporal_facts SET revoked = 1, invalid_at = COALESCE(invalid_at, ?) "
                f"WHERE {clause} AND revoked = 0",
                params,
            )
        return int(cursor.rowcount)

    async def cleanup(self, *, now: int, revoked_before: str) -> int:
        with self.connection:
            cursor = self.connection.execute(
                "DELETE FROM temporal_facts WHERE "
                "(expires_at IS NOT NULL AND expires_at <= ?) OR "
                "(revoked = 1 AND invalid_at IS NOT NULL AND invalid_at <= ?) OR "
                "(superseded_by IS NOT NULL AND invalid_at IS NOT NULL AND invalid_at <= ?)",
                (int(now), revoked_before, revoked_before),
            )
        return int(cursor.rowcount)

    async def close(self) -> None:
        self.connection.close()


class GraphitiFalkorBackend(TemporalGraphBackend):
    """Exact temporal ledger built on Graphiti's pluggable FalkorDB driver."""

    def __init__(self, *, host: str, port: int = 6379, username: str | None = None,
                 password: str | None = None, database: str = "oreolook_memory",
                 driver: Any | None = None):
        if driver is None:
            try:
                from graphiti_core.driver.falkordb_driver import FalkorDriver
            except ImportError as exc:
                raise RuntimeError(
                    "Install requirements-graph-memory.txt to use the Graphiti backend"
                ) from exc
            driver = FalkorDriver(host=host, port=int(port), username=username,
                                  password=password, database=database)
        self.driver = driver

    async def upsert(self, fact: ApprovedGraphFact) -> None:
        await self.driver.execute_query(
            """
            MERGE (subject:OreoEntity {scope_id: $scope_id, name: $subject})
            MERGE (object:OreoEntity {scope_id: $scope_id, name: $object})
            WITH subject, object
            OPTIONAL MATCH (subject)-[old:APPROVED_FACT]->()
            WHERE old.scope_id = $scope_id AND old.predicate = $predicate
              AND old.invalid_at IS NULL AND old.revoked = false
              AND old.fact_id <> $fact_id
            SET old.invalid_at = $event_time, old.superseded_by = $fact_id
            WITH subject, object
            MERGE (subject)-[fact:APPROVED_FACT {fact_id: $fact_id}]->(object)
            SET fact.scope_id = $scope_id, fact.tenant_id = $tenant_id,
                fact.user_id = $user_id, fact.session_id = $session_id,
                fact.predicate = $predicate, fact.object_value = $object,
                fact.event_time = $event_time, fact.ingestion_time = $ingestion_time,
                fact.source_turn = $source_turn, fact.confidence = $confidence,
                fact.approval_fingerprint = $approval_fingerprint,
                fact.memory_class = $memory_class, fact.source = $source,
                fact.evidence_json = $evidence_json, fact.project_id = $project_id,
                fact.candidate_fingerprint = $candidate_fingerprint,
                fact.approved_at = $approved_at, fact.approval_action = $approval_action,
                fact.expires_at = $expires_at,
                fact.revoked = false
            """,
            scope_id=fact.scope_id, fact_id=fact.fact_id, tenant_id=fact.tenant_id,
            user_id=fact.user_id, session_id=fact.session_id, subject=fact.subject,
            predicate=fact.predicate, object=fact.object, event_time=fact.event_time,
            ingestion_time=fact.ingestion_time, source_turn=fact.source_turn,
            confidence=float(fact.confidence), approval_fingerprint=fact.approval_fingerprint,
            memory_class=fact.memory_class, source=fact.source,
            evidence_json=json.dumps(fact.evidence_ids), project_id=fact.project_id,
            candidate_fingerprint=fact.candidate_fingerprint, approved_at=fact.approved_at,
            approval_action=fact.approval_action,
            expires_at=fact.expires_at,
        )

    async def query(
        self, scope: MemoryScope, *, at_time: str | None = None, limit: int = 24
    ) -> list[TemporalGraphFact]:
        records, *_ = await self.driver.execute_query(
            """
            MATCH (subject:OreoEntity)-[fact:APPROVED_FACT]->(object:OreoEntity)
            WHERE fact.scope_id = $scope_id AND fact.event_time <= $at_time
              AND (fact.invalid_at IS NULL OR fact.invalid_at > $at_time)
              AND (fact.expires_at IS NULL OR fact.expires_at > $at_epoch)
            RETURN fact.fact_id AS fact_id, fact.tenant_id AS tenant_id,
              fact.user_id AS user_id, fact.session_id AS session_id,
              subject.name AS subject, fact.predicate AS predicate,
              fact.object_value AS object_value, fact.event_time AS event_time,
              fact.ingestion_time AS ingestion_time, fact.source_turn AS source_turn,
              fact.confidence AS confidence,
              fact.approval_fingerprint AS approval_fingerprint,
              fact.memory_class AS memory_class, fact.source AS source,
              fact.evidence_json AS evidence_json, fact.project_id AS project_id,
              fact.candidate_fingerprint AS candidate_fingerprint,
              fact.approved_at AS approved_at, fact.approval_action AS approval_action,
              fact.expires_at AS expires_at,
              fact.invalid_at AS invalid_at, fact.superseded_by AS superseded_by,
              fact.revoked AS revoked
            ORDER BY fact.confidence DESC, fact.event_time DESC LIMIT $limit
            """,
            scope_id=scope_id(scope), at_time=_utc_iso(at_time),
            at_epoch=int(datetime.fromisoformat(_utc_iso(at_time).replace("Z", "+00:00")).timestamp()),
            limit=max(1, int(limit)),
        )
        return [_row_to_fact(dict(row)) for row in records]

    async def revoke_scope(self, scope: MemoryScope, *, event_time: str | None = None) -> int:
        records, *_ = await self.driver.execute_query(
            """
            MATCH ()-[fact:APPROVED_FACT]->()
            WHERE fact.scope_id = $scope_id AND fact.revoked = false
            SET fact.revoked = true, fact.invalid_at = coalesce(fact.invalid_at, $event_time)
            RETURN count(fact) AS count
            """,
            scope_id=scope_id(scope), event_time=_utc_iso(event_time),
        )
        return int(records[0].get("count", 0)) if records else 0

    async def revoke_owner(
        self, tenant_id: str, user_id: str, *, session_id: str | None = None,
        event_time: str | None = None,
    ) -> int:
        records, *_ = await self.driver.execute_query(
            """
            MATCH ()-[fact:APPROVED_FACT]->()
            WHERE fact.tenant_id = $tenant_id AND fact.user_id = $user_id
              AND ($session_id IS NULL OR fact.session_id = $session_id)
              AND fact.revoked = false
            SET fact.revoked = true, fact.invalid_at = coalesce(fact.invalid_at, $event_time)
            RETURN count(fact) AS count
            """,
            tenant_id=tenant_id, user_id=user_id, session_id=session_id,
            event_time=_utc_iso(event_time),
        )
        return int(records[0].get("count", 0)) if records else 0

    async def cleanup(self, *, now: int, revoked_before: str) -> int:
        records, *_ = await self.driver.execute_query(
            """
            MATCH ()-[fact:APPROVED_FACT]->()
            WHERE (fact.expires_at IS NOT NULL AND fact.expires_at <= $now)
               OR (fact.revoked = true AND fact.invalid_at <= $revoked_before)
               OR (fact.superseded_by IS NOT NULL AND fact.invalid_at <= $revoked_before)
            WITH collect(fact) AS doomed, count(fact) AS count
            FOREACH (item IN doomed | DELETE item)
            RETURN count
            """,
            now=int(now), revoked_before=revoked_before,
        )
        return int(records[0].get("count", 0)) if records else 0

    async def close(self) -> None:
        await self.driver.close()


def _row_to_fact(row: dict[str, Any]) -> TemporalGraphFact:
    return TemporalGraphFact(
        fact_id=str(row["fact_id"]), tenant_id=str(row["tenant_id"]),
        user_id=str(row["user_id"]), session_id=str(row["session_id"]),
        subject=str(row["subject"]), predicate=str(row["predicate"]),
        object=str(row.get("object_value", row.get("object", ""))),
        event_time=str(row["event_time"]), ingestion_time=str(row["ingestion_time"]),
        source_turn=str(row["source_turn"]), confidence=float(row["confidence"]),
        approval_fingerprint=str(row["approval_fingerprint"]),
        memory_class=str(row.get("memory_class") or "session"),
        source=str(row.get("source") or "internal"),
        evidence_ids=tuple(json.loads(row.get("evidence_json") or "[]")),
        project_id=str(row["project_id"]) if row.get("project_id") else None,
        candidate_fingerprint=(str(row["candidate_fingerprint"])
                               if row.get("candidate_fingerprint") else None),
        approved_at=int(row["approved_at"]) if row.get("approved_at") is not None else None,
        approval_action=str(row["approval_action"]) if row.get("approval_action") else None,
        expires_at=int(row["expires_at"]) if row.get("expires_at") is not None else None,
        invalid_at=str(row["invalid_at"]) if row.get("invalid_at") else None,
        superseded_by=str(row["superseded_by"]) if row.get("superseded_by") else None,
        revoked=bool(row.get("revoked", False)),
    )
