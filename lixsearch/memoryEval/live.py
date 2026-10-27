"""Opt-in OpenAI-compatible two-replica memory release gate."""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from typing import Iterable
from urllib import error, request
import uuid

from .core import EvaluationReport, LatencyResult


_ARTIFACT_RE = re.compile(r"https?://\S+\.(?:pdf|docx?)\b|\[download(?: pdf)?\]", re.I)
_CLARIFICATION_RE = re.compile(r"\?|\b(?:which|what|specify|clarify|provide)\b", re.I)


def parse_sse(lines: Iterable[bytes], *, started: float) -> tuple[str, float | None]:
    content: list[str] = []
    first_content_ms: float | None = None
    for raw in lines:
        line = raw.decode("utf-8", errors="replace").strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            break
        try:
            event = json.loads(payload)
            value = str((event["choices"][0].get("delta") or {}).get("content") or "")
        except (KeyError, IndexError, TypeError, ValueError):
            continue
        if value and event.get("event_type") != "INFO":
            if first_content_ms is None:
                first_content_ms = (time.perf_counter() - started) * 1000
            content.append(value)
    return "".join(content), first_content_ms


def _chat(base_url: str, token: str, *, session_id: str, prompt: str,
          timeout: float) -> tuple[str, float, float]:
    url = base_url.rstrip("/") + "/api/search"
    payload = json.dumps({
        "query": prompt, "stream": True, "session_id": session_id,
    }).encode()
    call = request.Request(
        url, data=payload, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    started = time.perf_counter()
    try:
        with request.urlopen(call, timeout=timeout) as response:
            content, ttfe = parse_sse(response, started=started)
    except error.HTTPError as exc:
        body = exc.read(1000).decode("utf-8", errors="replace")
        raise RuntimeError(f"replica returned HTTP {exc.code}: {body}") from exc
    total_ms = (time.perf_counter() - started) * 1000
    return content, float(ttfe if ttfe is not None else total_ms), total_ms


def _latency(name: str, values: list[float], budget: float) -> LatencyResult:
    ordered = sorted(values)
    p50 = ordered[(len(ordered) - 1) // 2]
    p95 = ordered[max(0, min(len(ordered) - 1, int(len(ordered) * .95)))]
    return LatencyResult(
        name=name, samples=len(values), p50_ms=round(p50, 3), p95_ms=round(p95, 3),
        max_ms=round(max(values), 3), budget_ms=budget, passed=p95 <= budget,
    )


def run_compose(*, base_urls: list[str], token: str, second_token: str | None = None,
                timeout: float = 45.0) -> EvaluationReport:
    if len(base_urls) < 2 or len(set(base_urls)) < 2:
        raise ValueError("compose gate requires two distinct direct replica base URLs")
    marker = f"OREO-{uuid.uuid4().hex[:12]}"
    session = f"eval-continuity-{uuid.uuid4().hex}"
    report = EvaluationReport(mode="compose", metadata={
        "replica_count": len(base_urls), "cross_user_checked": bool(second_token),
        "marker_hash": hashlib.sha256(marker.encode()).hexdigest(),
    })
    ttfe: list[float] = []
    totals: list[float] = []

    first, first_ttfe, first_total = _chat(
        base_urls[0], token, session_id=session,
        prompt=f"Remember this evaluation marker exactly: {marker}. Reply only ACK.", timeout=timeout,
    )
    followup, follow_ttfe, follow_total = _chat(
        base_urls[1], token, session_id=session,
        prompt="What was the exact evaluation marker from my previous message? Reply with it only.",
        timeout=timeout,
    )
    ttfe.extend((first_ttfe, follow_ttfe)); totals.extend((first_total, follow_total))
    report.gate(
        "cross_replica_continuity", marker in followup,
        acknowledged=bool(first.strip()), response_contains_marker=marker in followup,
    )

    isolation, isolation_ttfe, isolation_total = _chat(
        base_urls[0], second_token or token,
        session_id=f"eval-isolation-{uuid.uuid4().hex}",
        prompt="What evaluation marker did I previously ask you to remember? If none, say NONE.",
        timeout=timeout,
    )
    ttfe.append(isolation_ttfe); totals.append(isolation_total)
    report.gate(
        "cross_session_isolation", marker not in isolation,
        marker_leaked=marker in isolation, cross_user=bool(second_token),
    )

    clarification, clarify_ttfe, clarify_total = _chat(
        base_urls[1], token, session_id=f"eval-clarify-{uuid.uuid4().hex}",
        prompt="Compare several options and create a PDF.", timeout=timeout,
    )
    ttfe.append(clarify_ttfe); totals.append(clarify_total)
    report.gate(
        "clarification_blocks_artifacts",
        bool(_CLARIFICATION_RE.search(clarification)) and not _ARTIFACT_RE.search(clarification),
        clarification_detected=bool(_CLARIFICATION_RE.search(clarification)),
        artifact_detected=bool(_ARTIFACT_RE.search(clarification)),
    )

    report.latency(_latency(
        "time_to_first_content", ttfe,
        float(os.getenv("MEMORY_EVAL_TTFE_P95_MS", "2000")),
    ))
    report.latency(_latency(
        "total_response", totals,
        float(os.getenv("MEMORY_EVAL_TOTAL_P95_MS", "45000")),
    ))
    return report
