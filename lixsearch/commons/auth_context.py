"""Request-local authentication and downstream Pollinations delegation."""
from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass, field
import hashlib
import os
import time


class DelegatedCredentialError(RuntimeError):
    """A delegated request cannot safely authorize another provider call."""


@dataclass(frozen=True, slots=True)
class RequestAuthContext:
    mode: str
    principal_id: str
    delegated_token: str | None = field(default=None, repr=False)
    expires_at: int | None = None
    parent_request_id: str | None = None

    @property
    def delegated(self) -> bool:
        return self.mode == "delegated"


_CURRENT_AUTH: ContextVar[RequestAuthContext | None] = ContextVar(
    "oreolook_request_auth",
    default=None,
)


def set_request_auth(context: RequestAuthContext | None) -> Token:
    return _CURRENT_AUTH.set(context)


def reset_request_auth(token: Token) -> None:
    _CURRENT_AUTH.reset(token)


def current_request_auth() -> RequestAuthContext | None:
    return _CURRENT_AUTH.get()


def current_principal_id() -> str:
    context = current_request_auth()
    return context.principal_id if context else "local"


def scoped_resource_id(value: str) -> str:
    """Create a stable internal namespace without exposing caller identity."""
    raw = f"{current_principal_id()}\0{value}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def downstream_pollinations_key() -> str:
    """Return the only credential allowed for the current provider call."""
    context = current_request_auth()
    if context and context.delegated:
        if not context.delegated_token:
            raise DelegatedCredentialError("Delegated credential is unavailable")
        if context.expires_at is not None and int(time.time()) >= context.expires_at:
            raise DelegatedCredentialError("Delegated credential has expired")
        return context.delegated_token

    key = os.getenv("POLLINATIONS_API_KEY", "").strip()
    if not key:
        raise DelegatedCredentialError(
            "POLLINATIONS_API_KEY is required for direct/local provider calls"
        )
    return key


def pollinations_auth_headers(*, json_content: bool = True) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {downstream_pollinations_key()}"}
    if json_content:
        headers["Content-Type"] = "application/json"
    return headers
