"""Replica-safe, append-only Redis session ledger.

The ledger is the authoritative hot history for a durable session.  It uses a
Redis stream for ordered turns and a hash for compact workflow state.  A Lua
append makes sequence allocation and request-id deduplication atomic.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import re
import time
import uuid
from typing import Any, Dict, List, Optional

from pipeline.config import (
    SESSION_LEDGER_LOCK_SECONDS,
    SESSION_LEDGER_LOCK_WAIT_SECONDS,
    SESSION_LEDGER_REDIS_DB,
    SESSION_LEDGER_TTL_SECONDS,
    SESSION_LEDGER_WINDOW_SIZE,
    create_redis_client,
)


_APPEND_SCRIPT = """
local existing = redis.call('HGET', KEYS[3], ARGV[1])
if existing then
  redis.call('EXPIRE', KEYS[1], ARGV[3])
  redis.call('EXPIRE', KEYS[2], ARGV[3])
  redis.call('EXPIRE', KEYS[3], ARGV[3])
  redis.call('EXPIRE', KEYS[4], ARGV[3])
  return {tonumber(existing), 0}
end
local seq = redis.call('INCR', KEYS[2])
redis.call('XADD', KEYS[1], '*', 'seq', tostring(seq), 'payload', ARGV[2])
redis.call('HSET', KEYS[3], ARGV[1], tostring(seq))
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[3])
redis.call('EXPIRE', KEYS[3], ARGV[3])
redis.call('EXPIRE', KEYS[4], ARGV[3])
return {seq, 1}
"""

_RELEASE_LOCK_SCRIPT = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""

_INTERNAL_BLOCKS = re.compile(
    r"<(?:thinking|analysis|reasoning)\b[^>]*>.*?</(?:thinking|analysis|reasoning)>|"
    r"<TASK\b[^>]*>.*?</TASK>|"
    r"<(?:function_calls|invoke|parameter|tool_call)\b[^>]*>.*?</(?:function_calls|invoke|parameter|tool_call)>",
    re.IGNORECASE | re.DOTALL,
)
_UNSET = object()


def sanitize_ledger_content(content: Any) -> str:
    """Keep only bounded, user-visible text in durable session history."""
    value = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
    value = _INTERNAL_BLOCKS.sub("", value)
    return re.sub(r"\n{3,}", "\n\n", value).strip()


@dataclass(frozen=True)
class SessionSnapshot:
    messages: List[Dict[str, Any]]
    active_task: Optional[Dict[str, Any]] = None
    pending_clarification: Optional[Dict[str, Any]] = None
    last_sequence: int = 0


class RedisSessionLedger:
    """Atomic append/read/state operations for one durable session."""

    def __init__(
        self,
        session_id: str,
        *,
        redis_client=None,
        ttl_seconds: int = SESSION_LEDGER_TTL_SECONDS,
        window_size: int = SESSION_LEDGER_WINDOW_SIZE,
        lock_seconds: int = SESSION_LEDGER_LOCK_SECONDS,
        lock_wait_seconds: float = SESSION_LEDGER_LOCK_WAIT_SECONDS,
    ):
        if not session_id or not str(session_id).strip():
            raise ValueError("session_id is required")
        self.session_id = str(session_id)
        self.ttl_seconds = int(ttl_seconds)
        self.window_size = int(window_size)
        self.lock_seconds = int(lock_seconds)
        self.lock_wait_seconds = float(lock_wait_seconds)
        self.redis = redis_client or create_redis_client(
            db=SESSION_LEDGER_REDIS_DB, decode_responses=True
        )
        root = f"elixpo:session-ledger:v1:{{{self.session_id}}}"
        self.turns_key = f"{root}:turns"
        self.sequence_key = f"{root}:sequence"
        self.idempotency_key = f"{root}:idempotency"
        self.state_key = f"{root}:state"
        self.lock_key = f"{root}:lock"
        self._append_script = self.redis.register_script(_APPEND_SCRIPT)
        self._release_script = self.redis.register_script(_RELEASE_LOCK_SCRIPT)

    def append_turn(
        self,
        role: str,
        content: Any,
        *,
        request_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        if role not in {"user", "assistant"}:
            raise ValueError("ledger role must be 'user' or 'assistant'")
        safe_content = sanitize_ledger_content(content)
        operation_id = request_id or uuid.uuid4().hex
        payload = json.dumps(
            {
                "role": role,
                "content": safe_content,
                "timestamp": time.time(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "request_id": operation_id,
                "metadata": metadata or {},
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        result = self._append_script(
            keys=[self.turns_key, self.sequence_key, self.idempotency_key, self.state_key],
            args=[operation_id, payload, self.ttl_seconds],
        )
        return int(result[0])

    def load_snapshot(self, limit: Optional[int] = None) -> SessionSnapshot:
        """Load recent turns and workflow state in one Redis round-trip."""
        take = max(1, int(limit or self.window_size))
        pipe = self.redis.pipeline(transaction=False)
        pipe.xrevrange(self.turns_key, count=take)
        pipe.hgetall(self.state_key)
        for key in (self.turns_key, self.sequence_key, self.idempotency_key, self.state_key):
            pipe.expire(key, self.ttl_seconds)
        results = pipe.execute()
        rows, raw_state = results[0], results[1]
        messages: List[Dict[str, Any]] = []
        last_sequence = 0
        for _, fields in reversed(rows):
            raw_payload = fields.get("payload", fields.get(b"payload"))
            raw_sequence = fields.get("seq", fields.get(b"seq"))
            payload = json.loads(raw_payload)
            sequence = int(raw_sequence)
            last_sequence = max(last_sequence, sequence)
            payload["sequence"] = sequence
            messages.append(payload)
        return SessionSnapshot(
            messages=messages,
            active_task=self._decode_state(raw_state.get("active_task", raw_state.get(b"active_task"))),
            pending_clarification=self._decode_state(
                raw_state.get("pending_clarification", raw_state.get(b"pending_clarification"))
            ),
            last_sequence=last_sequence,
        )

    @staticmethod
    def _decode_state(value: Optional[str]) -> Optional[Dict[str, Any]]:
        if not value:
            return None
        decoded = json.loads(value)
        return decoded if isinstance(decoded, dict) else {"value": decoded}

    def set_task_state(self, *, active_task=_UNSET, pending_clarification=_UNSET) -> None:
        pipe = self.redis.pipeline(transaction=True)
        for field, value in (
            ("active_task", active_task),
            ("pending_clarification", pending_clarification),
        ):
            if value is _UNSET:
                continue
            if value is None:
                pipe.hdel(self.state_key, field)
            else:
                pipe.hset(self.state_key, field, json.dumps(value, separators=(",", ":")))
        pipe.expire(self.state_key, self.ttl_seconds)
        pipe.execute()

    def acquire_lock(self) -> Optional[str]:
        token = uuid.uuid4().hex
        deadline = time.monotonic() + self.lock_wait_seconds
        while True:
            if self.redis.set(self.lock_key, token, nx=True, ex=self.lock_seconds):
                return token
            if time.monotonic() >= deadline:
                return None
            time.sleep(0.025)

    def release_lock(self, token: str) -> bool:
        return bool(self._release_script(keys=[self.lock_key], args=[token]))

    def clear(self) -> bool:
        return bool(self.redis.delete(
            self.turns_key,
            self.sequence_key,
            self.idempotency_key,
            self.state_key,
            self.lock_key,
        ))


class LedgerSessionContext:
    """Compatibility surface replacing ``SessionContextWindow`` in runtimes."""

    def __init__(self, session_id: str, **kwargs):
        self.session_id = session_id
        self.window_size = int(kwargs.pop("window_size", SESSION_LEDGER_WINDOW_SIZE))
        self.ttl_seconds = int(kwargs.pop("ttl_seconds", SESSION_LEDGER_TTL_SECONDS))
        self.max_tokens = kwargs.pop("max_tokens", None)
        self.ledger = RedisSessionLedger(
            session_id,
            window_size=self.window_size,
            ttl_seconds=self.ttl_seconds,
            **kwargs,
        )

    def add_message(self, role: str, content: Any, metadata: Optional[Dict] = None) -> int:
        details = dict(metadata or {})
        request_id = details.pop("request_id", None)
        return self.ledger.append_turn(role, content, request_id=request_id, metadata=details)

    def get_context(self) -> List[Dict[str, Any]]:
        return self.ledger.load_snapshot().messages

    def get_full_history(self) -> List[Dict[str, Any]]:
        return self.ledger.load_snapshot(limit=max(self.window_size, 1000)).messages

    def smart_context(self, query: str, query_embedding=None, recent_k: int = 10, disk_k: int = 5) -> Dict:
        return {"recent": self.ledger.load_snapshot(limit=recent_k).messages, "relevant": []}

    def get_formatted_context(self, max_lines: int = 50) -> str:
        lines = [
            f"{message['role'].title()}: {message['content'][:200]}"
            for message in self.get_context()
            if message.get("content")
        ]
        return "\n".join(lines[-max_lines:])

    def get_stats(self) -> Dict[str, Any]:
        snapshot = self.ledger.load_snapshot()
        return {
            "session_id": self.session_id,
            "hot_messages": len(snapshot.messages),
            "last_sequence": snapshot.last_sequence,
            "ttl_seconds": self.ttl_seconds,
            "max_tokens": self.max_tokens,
        }

    def clear(self) -> bool:
        return self.ledger.clear()

    def flush_to_disk(self) -> bool:
        return True
