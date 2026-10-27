"""Capability access for artifacts created by delegated agent requests."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets

from commons.auth_context import current_request_auth

_METADATA_SUFFIX = ".access.json"


def metadata_path(directory: str, artifact_id: str) -> str:
    return os.path.join(directory, f"{artifact_id}{_METADATA_SUFFIX}")


def prepare_artifact_access(
    directory: str, artifact_id: str, ownership: dict | None = None,
) -> str | None:
    """Create a hashed download capability for delegated artifacts.

    Local/static-key artifacts retain the existing public-link behavior. The
    raw delegated credential is never used as an artifact capability.
    """
    context = current_request_auth()
    if not context or not context.delegated:
        return None

    capability = secrets.token_urlsafe(24)
    metadata = {
        "owner": context.principal_id,
        "access_sha256": hashlib.sha256(capability.encode("utf-8")).hexdigest(),
        **{key: value for key, value in (ownership or {}).items()
           if key in {"tenant_id", "user_id", "session_id"} and value},
    }
    path = metadata_path(directory, artifact_id)
    temporary = f"{path}.{secrets.token_hex(4)}.tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, separators=(",", ":"))
    os.replace(temporary, path)
    return capability


def artifact_access_allowed(directory: str, artifact_id: str, capability: str) -> bool:
    path = metadata_path(directory, artifact_id)
    if not os.path.exists(path):
        return True
    try:
        with open(path, "r", encoding="utf-8") as handle:
            metadata = json.load(handle)
        expected = metadata.get("access_sha256", "")
    except (OSError, ValueError, AttributeError):
        return False
    actual = hashlib.sha256((capability or "").encode("utf-8")).hexdigest()
    return bool(expected) and hmac.compare_digest(actual, expected)
