"""Redis-backed OpenAI Responses and conversation state."""
from __future__ import annotations

import hashlib
import json
import time
import uuid
from typing import Any

from commons.auth_context import current_principal_id
from pipeline.config import AGENT_HISTORY_MAX_MESSAGES, AGENT_RESPONSE_TTL_SECONDS, AGENT_STATE_REDIS_DB, create_redis_client

_PREFIX = "elixpo:agent"


def new_response_id() -> str:
    return f"resp_{uuid.uuid4().hex}"


def new_message_id() -> str:
    return f"msg_{uuid.uuid4().hex}"


def new_conversation_id() -> str:
    return f"conv_{uuid.uuid4().hex}"


def canonical_conversation_id(value: str | None) -> str:
    if not value:
        return new_conversation_id()
    value = str(value).strip()
    if value.startswith("conv_") and value[5:].replace("-", "").replace("_", "").isalnum():
        return value
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]
    return f"conv_{digest}"


class ResponseStateStore:
    def __init__(
        self,
        client=None,
        ttl_seconds: int = AGENT_RESPONSE_TTL_SECONDS,
        owner_scope: str | None = None,
    ):
        self.client = client or create_redis_client(db=AGENT_STATE_REDIS_DB)
        self.ttl_seconds = ttl_seconds
        self.owner_scope = owner_scope or current_principal_id()

    def _response_key(self, response_id: str) -> str:
        if self.owner_scope == "local":
            return f"{_PREFIX}:response:{response_id}"
        return f"{_PREFIX}:{self.owner_scope}:response:{response_id}"

    def _conversation_key(self, conversation_id: str) -> str:
        if self.owner_scope == "local":
            return f"{_PREFIX}:conversation:{conversation_id}"
        return f"{_PREFIX}:{self.owner_scope}:conversation:{conversation_id}"

    def get_response(self, response_id: str) -> dict[str, Any] | None:
        raw = self.client.get(self._response_key(response_id))
        return json.loads(raw) if raw else None

    def get_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        raw = self.client.get(self._conversation_key(conversation_id))
        return json.loads(raw) if raw else None

    def resolve_context(
        self,
        *,
        previous_response_id: str | None = None,
        conversation_id: str | None = None,
    ) -> tuple[str, list[dict[str, str]]]:
        if previous_response_id:
            previous = self.get_response(previous_response_id)
            if previous is None:
                raise KeyError(previous_response_id)
            previous_conversation = previous["conversation_id"]
            if conversation_id and canonical_conversation_id(conversation_id) != previous_conversation:
                raise ValueError("conversation does not match previous_response_id")
            return previous_conversation, list(previous.get("messages", []))

        resolved = canonical_conversation_id(conversation_id)
        conversation = self.get_conversation(resolved)
        return resolved, list(conversation.get("messages", [])) if conversation else []

    def save(
        self,
        *,
        response_id: str,
        conversation_id: str,
        previous_response_id: str | None,
        messages: list[dict[str, str]],
        model: str,
        agent: str,
    ) -> None:
        now = int(time.time())
        messages = messages[-AGENT_HISTORY_MAX_MESSAGES:]
        response = {
            "id": response_id,
            "conversation_id": conversation_id,
            "previous_response_id": previous_response_id,
            "messages": messages,
            "model": model,
            "agent": agent,
            "created_at": now,
        }
        conversation = {
            "id": conversation_id,
            "object": "conversation",
            "created_at": now,
            "last_response_id": response_id,
            "messages": messages,
        }
        pipe = self.client.pipeline(transaction=True)
        pipe.set(self._response_key(response_id), json.dumps(response), ex=self.ttl_seconds)
        pipe.set(self._conversation_key(conversation_id), json.dumps(conversation), ex=self.ttl_seconds)
        pipe.execute()
