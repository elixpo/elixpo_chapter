"""Application authentication for OpenAI-compatible OreoLook endpoints."""
from __future__ import annotations

import asyncio
import base64
from dataclasses import dataclass
import hashlib
import hmac
import json
import os
import threading
import time

import requests
from quart import g, jsonify, request

from commons.auth_context import RequestAuthContext, set_request_auth

_PROTECTED_OPENAI_PATHS = {"/v1/chat/completions", "/v1/responses"}
_AGENT_PREFIX = "ag_"
_MAX_AGENT_TTL_SECONDS = 1800


class AgentTokenInvalid(ValueError):
    pass


class AgentTokenValidationUnavailable(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class _ValidatedIdentity:
    principal_id: str
    expires_at: int
    parent_request_id: str


class AgentTokenValidator:
    """Validate delegated tokens remotely and cache only fingerprinted identity."""

    def __init__(self) -> None:
        self.url = os.getenv(
            "POLLINATIONS_TOKEN_VALIDATION_URL",
            "https://enter.pollinations.ai/api/account/key",
        ).strip()
        self.timeout = float(
            os.getenv("POLLINATIONS_TOKEN_VALIDATION_TIMEOUT_SECONDS", "3")
        )
        self._cache: dict[str, _ValidatedIdentity] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _fingerprint(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _claims(token: str) -> dict:
        try:
            encoded = token[len(_AGENT_PREFIX):].split(".")[1]
            encoded += "=" * (-len(encoded) % 4)
            payload = json.loads(base64.urlsafe_b64decode(encoded).decode("utf-8"))
        except Exception as exc:
            raise AgentTokenInvalid("Malformed delegated token") from exc
        now = int(time.time())
        if (
            not isinstance(payload.get("sub"), str)
            or not payload["sub"]
            or not isinstance(payload.get("parentRequestId"), str)
            or not payload["parentRequestId"]
            or not isinstance(payload.get("exp"), int)
            or payload["exp"] <= now
            or payload["exp"] > now + _MAX_AGENT_TTL_SECONDS + 5
            or payload.get("iss") != "gen.pollinations.ai"
            or payload.get("aud") != "pollinations-api"
        ):
            raise AgentTokenInvalid("Invalid or expired delegated token")
        return payload

    def validate(self, token: str) -> RequestAuthContext:
        if not token.startswith(_AGENT_PREFIX):
            raise AgentTokenInvalid("Invalid delegated token")
        claims = self._claims(token)
        fingerprint = self._fingerprint(token)
        now = int(time.time())
        with self._lock:
            cached = self._cache.get(fingerprint)
            if cached and cached.expires_at > now:
                return RequestAuthContext(
                    mode="delegated",
                    principal_id=cached.principal_id,
                    delegated_token=token,
                    expires_at=cached.expires_at,
                    parent_request_id=cached.parent_request_id,
                )
            self._cache.pop(fingerprint, None)

        try:
            response = requests.get(
                self.url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise AgentTokenValidationUnavailable(
                "Delegated-token validation is temporarily unavailable"
            ) from exc
        if response.status_code in {401, 403}:
            raise AgentTokenInvalid("Invalid or expired delegated token")
        try:
            response.raise_for_status()
            body = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise AgentTokenValidationUnavailable(
                "Delegated-token validation is temporarily unavailable"
            ) from exc
        user_id = body.get("userId") if isinstance(body, dict) else None
        if (
            not isinstance(body, dict)
            or body.get("valid") is not True
            or not isinstance(user_id, str)
            or not user_id
        ):
            raise AgentTokenInvalid("Invalid delegated token")

        principal_material = f"{user_id}\0{claims['sub']}".encode("utf-8")
        identity = _ValidatedIdentity(
            principal_id="poll_" + hashlib.sha256(principal_material).hexdigest(),
            expires_at=min(int(claims["exp"]), now + _MAX_AGENT_TTL_SECONDS),
            parent_request_id=claims["parentRequestId"],
        )
        with self._lock:
            self._cache[fingerprint] = identity
            expired = [key for key, value in self._cache.items() if value.expires_at <= now]
            for key in expired:
                self._cache.pop(key, None)
        return RequestAuthContext(
            mode="delegated",
            principal_id=identity.principal_id,
            delegated_token=token,
            expires_at=identity.expires_at,
            parent_request_id=identity.parent_request_id,
        )


_VALIDATOR = AgentTokenValidator()


def _error(message: str, status: int, error_type: str):
    return jsonify({"error": {"message": message, "type": error_type}}), status


def install_api_auth(app) -> None:
    @app.before_request
    async def authenticate_openai_endpoint():
        # Test clients and long-lived workers can reuse an asyncio task. Always
        # clear any prior request context before evaluating this request.
        set_request_auth(None)
        if request.path not in _PROTECTED_OPENAI_PATHS:
            return None

        authorization = request.headers.get("Authorization", "")
        bearer = (
            authorization[7:].strip()
            if authorization.lower().startswith("bearer ")
            else ""
        )
        header_key = request.headers.get("X-API-Key", "").strip()
        query_key = request.args.get("key", "").strip()

        if header_key.startswith(_AGENT_PREFIX) or query_key.startswith(_AGENT_PREFIX):
            return _error(
                "Delegated agent tokens must use Authorization: Bearer",
                401,
                "authentication_error",
            )

        if bearer.startswith(_AGENT_PREFIX):
            if header_key or query_key:
                return _error(
                    "Delegated agent tokens cannot be combined with another credential",
                    401,
                    "authentication_error",
                )
            try:
                context = await asyncio.to_thread(_VALIDATOR.validate, bearer)
            except AgentTokenInvalid:
                return _error(
                    "Invalid or expired delegated token", 401, "authentication_error"
                )
            except AgentTokenValidationUnavailable:
                return _error(
                    "Delegated-token validation is temporarily unavailable",
                    503,
                    "server_error",
                )
            g.oreolook_auth = context
            set_request_auth(context)
            return None

        expected = os.getenv("API_KEY", "")
        if not expected:
            return _error("API authentication is not configured", 503, "server_error")
        provided = header_key or bearer or query_key
        if not provided:
            return _error("API key required", 401, "authentication_error")
        if not hmac.compare_digest(provided, expected):
            return _error("Invalid API key", 403, "authentication_error")
        context = RequestAuthContext(mode="static", principal_id="local")
        g.oreolook_auth = context
        set_request_auth(context)
        return None
