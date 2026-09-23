"""Small, testable Pollinations streaming client used by the Gradio Space."""
from __future__ import annotations

from dataclasses import dataclass
import json
import os
import re
from typing import Iterable, Iterator, Mapping
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlsplit, urlunsplit

import requests


DEFAULT_BASE_URL = "https://gen.pollinations.ai/v1"
DEFAULT_MODEL = "Circuit-Overtime/OreoLook"
DEFAULT_ENTER_URL = "https://enter.pollinations.ai"
_TASK = re.compile(r"<TASK>(.*?)</TASK>", re.I | re.S)
_MARKDOWN_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
_BARE_URL = re.compile(r"(?<!\()https?://[^\s<>\]]+")
_PDF_URL = re.compile(r"https?://[^\s<>\])]+\.pdf(?:\?[^\s<>\])]*)?", re.I)


class OreoLookAPIError(RuntimeError):
    """Safe user-facing upstream error; never includes credentials."""


@dataclass(frozen=True, slots=True)
class StreamEvent:
    kind: str
    content: str


@dataclass(frozen=True, slots=True)
class DeviceAuthorization:
    device_code: str
    user_code: str
    verification_uri: str
    interval: int = 5
    expires_in: int = 600


def verification_url_with_code(verification_uri: str, user_code: str) -> str:
    """Return the verification URL with its device code ready to submit."""
    parts = urlsplit(str(verification_uri))
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["user_code"] = str(user_code).strip()
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


def resolve_key(user_key: str | None) -> str:
    key = (user_key or "").strip()
    if not key:
        raise OreoLookAPIError(
            "Connect your Pollinations account in the sidebar to begin."
        )
    if key.startswith("ag_"):
        raise OreoLookAPIError(
            "Agent-run tokens are internal. Reconnect with Pollinations to continue."
        )
    return key


def begin_device_authorization(app_key: str, *, session=requests) -> DeviceAuthorization:
    """Start Pollinations device OAuth using the public OreoLook app key."""
    client_id = str(app_key or "").strip()
    if not client_id.startswith("pk_"):
        raise OreoLookAPIError("OreoLook OAuth is not configured yet.")
    enter_url = os.getenv("POLLINATIONS_ENTER_URL", DEFAULT_ENTER_URL).rstrip("/")
    try:
        response = session.post(
            f"{enter_url}/api/device/code",
            headers={"Content-Type": "application/json"},
            json={"client_id": client_id}, timeout=(10.0, 20.0),
        )
        payload = response.json()
    except (requests.RequestException, TypeError, ValueError) as exc:
        raise OreoLookAPIError("Could not start Pollinations sign-in. Please retry.") from exc
    if response.status_code >= 400:
        raise OreoLookAPIError("Pollinations sign-in is temporarily unavailable.")
    try:
        return DeviceAuthorization(
            device_code=str(payload["device_code"]),
            user_code=str(payload["user_code"]),
            verification_uri=urljoin(f"{enter_url}/", str(payload["verification_uri"])),
            interval=max(3, int(payload.get("interval", 5))),
            expires_in=max(30, int(payload.get("expires_in", 600))),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise OreoLookAPIError("Pollinations returned an incomplete sign-in response.") from exc


def poll_device_authorization(device_code: str, *, session=requests) -> str | None:
    """Return the user-scoped key once device OAuth is approved, otherwise None."""
    enter_url = os.getenv("POLLINATIONS_ENTER_URL", DEFAULT_ENTER_URL).rstrip("/")
    try:
        response = session.post(
            f"{enter_url}/api/oauth/token",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": device_code,
            }, timeout=(10.0, 20.0),
        )
        payload = response.json()
    except (requests.RequestException, TypeError, ValueError) as exc:
        raise OreoLookAPIError("Could not finish Pollinations sign-in. Please retry.") from exc
    if response.status_code < 400:
        token = str(payload.get("access_token") or "").strip()
        if not token.startswith("sk_"):
            raise OreoLookAPIError("Pollinations returned an invalid access token.")
        return token
    error = str(payload.get("error") or "")
    if error in {"authorization_pending", "slow_down"}:
        return None
    if error == "access_denied":
        raise OreoLookAPIError("Pollinations sign-in was cancelled.")
    if error in {"expired_token", "invalid_grant"}:
        raise OreoLookAPIError("That sign-in code expired. Start again.")
    raise OreoLookAPIError("Pollinations sign-in could not be completed.")


def _mode_prompt(prompt: str, mode: str) -> str:
    if str(mode).lower().startswith("deep"):
        return (
            "Use deep research for this request. Investigate multiple relevant angles, verify current "
            "claims against sources, and synthesize a thorough cited answer.\n\n" + prompt.strip()
        )
    if str(mode).lower().startswith("quick"):
        return (
            "Use quick search for this request. Prefer a fast, focused search with a concise cited answer.\n\n"
            + prompt.strip()
        )
    # Auto is the normal Space path. Keep the user's exact turn intact so an
    # elliptical follow-up ("so should I...?", "what about tomorrow?", etc.)
    # can be resolved against the preceding assistant answer. Injecting routing
    # prose into the user turn makes that prose look like the primary request
    # and can overpower otherwise valid conversation history.
    return prompt.strip()


def _safe_error(status: int) -> OreoLookAPIError:
    messages = {
        401: "Your Pollinations connection was not accepted or has expired. Reconnect and try again.",
        403: "Your connected Pollinations account cannot access OreoLook yet. Check its approved budget or model access.",
        429: "OreoLook is getting a lot of love right now. Please wait a moment and retry.",
    }
    if status in messages:
        return OreoLookAPIError(messages[status])
    if status >= 500:
        return OreoLookAPIError("OreoLook's research service is temporarily unavailable. Your connection is fine—please retry shortly.")
    return OreoLookAPIError(f"The request could not be completed (HTTP {status}).")


def parse_sse(lines: Iterable[str | bytes]) -> Iterator[StreamEvent]:
    for raw in lines:
        line = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            return
        try:
            event = json.loads(payload)
            delta = event["choices"][0].get("delta") or {}
            content = str(delta.get("content") or "")
        except (KeyError, IndexError, TypeError, ValueError):
            continue
        if not content:
            continue
        task_match = _TASK.search(content)
        if event.get("event_type") == "INFO" or task_match:
            task = task_match.group(1).strip() if task_match else content.strip()
            if task and task.upper() != "DONE":
                yield StreamEvent("task", task)
            continue
        # Defensive last-mile suppression. OreoLook filters reasoning server-side;
        # the Space also drops any complete tagged block rather than displaying it.
        content = re.sub(r"<(thinking|reasoning|analysis)\b[^>]*>.*?</\1\s*>", "", content,
                         flags=re.I | re.S)
        if content:
            yield StreamEvent("text", content)


def stream_completion(
    messages: list[Mapping[str, str]], *, api_key: str | None, mode: str,
    timeout: tuple[float, float] = (10.0, 120.0), session=requests,
) -> Iterator[StreamEvent]:
    key = resolve_key(api_key)
    base_url = os.getenv("POLLINATIONS_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    model = os.getenv("POLLINATIONS_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    outbound = [dict(message) for message in messages]
    if not outbound or outbound[-1].get("role") != "user":
        raise OreoLookAPIError("Please enter a question first.")
    outbound[-1]["content"] = _mode_prompt(str(outbound[-1].get("content") or ""), mode)
    try:
        response = session.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model, "messages": outbound, "stream": True, "store": False,
                "metadata": {"oreolook_mode": "deep" if str(mode).lower().startswith("deep") else "quick"},
            },
            stream=True, timeout=timeout,
        )
    except requests.Timeout as exc:
        raise OreoLookAPIError("The request timed out before OreoLook could finish. Please retry.") from exc
    except requests.RequestException as exc:
        raise OreoLookAPIError("Could not reach Pollinations. Check your connection and retry.") from exc
    if response.status_code >= 400:
        response.close()
        raise _safe_error(response.status_code)
    try:
        # requests defaults to a 512-byte read buffer. Small SSE frames can sit in
        # that buffer until the response ends, which makes a streaming UI look
        # like a single delayed response. Read one line at a time instead.
        yield from parse_sse(
            response.iter_lines(chunk_size=1, decode_unicode=True)
        )
    finally:
        response.close()


def extract_links(markdown: str) -> tuple[list[tuple[str, str]], list[str]]:
    """Return unique source links and PDF artifacts without fetching either."""
    sources: list[tuple[str, str]] = []
    artifacts: list[str] = []
    seen_sources: set[str] = set()
    seen_artifacts: set[str] = set()
    labelled = {url: label.strip() or urlparse(url).netloc for label, url in _MARKDOWN_LINK.findall(markdown)}
    urls = [url for _, url in _MARKDOWN_LINK.findall(markdown)] + _BARE_URL.findall(markdown)
    for raw_url in urls:
        url = raw_url.rstrip(".,;:!?")
        if _PDF_URL.fullmatch(url):
            if url not in seen_artifacts:
                artifacts.append(url); seen_artifacts.add(url)
            continue
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or url in seen_sources:
            continue
        sources.append((labelled.get(url) or parsed.netloc.removeprefix("www."), url))
        seen_sources.add(url)
    return sources, artifacts
