"""Normalize answer citations against structured search and fetched evidence."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any, Iterable

from pipeline.utils import clean_url

_MARKDOWN_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^\s\)]+)\)")
_BARE_URL = re.compile(r"https?://[^\s<>\]\)\"']+")


@dataclass(slots=True)
class Citation:
    id: str
    title: str
    url: str
    author: str | None
    published_at: str | None
    accessed_at: str
    excerpt: str | None
    claim: str | None
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _item_dict(item: Any) -> dict[str, Any]:
    if hasattr(item, "to_dict"):
        return item.to_dict()
    return dict(item) if isinstance(item, dict) else {}


def _claim_for(answer: str, start: int, end: int) -> str | None:
    left = max(answer.rfind(".", 0, start), answer.rfind("\n", 0, start)) + 1
    right_candidates = [value for value in (answer.find(".", end), answer.find("\n", end)) if value >= 0]
    right = min(right_candidates) + 1 if right_candidates else min(len(answer), end + 300)
    claim = re.sub(r"\s+", " ", answer[left:right]).strip()
    return claim[:500] or None


def normalize_citations(answer: str, evidence: Iterable[Any] = (), limit: int = 8) -> list[Citation]:
    metadata: dict[str, dict[str, Any]] = {}
    for item in evidence:
        data = _item_dict(item)
        url = clean_url(str(data.get("canonical_url") or data.get("url") or ""))
        if url:
            metadata[url] = data

    matches: list[tuple[str | None, str, int, int]] = [
        (match.group(1), match.group(2), match.start(), match.end())
        for match in _MARKDOWN_LINK.finditer(answer or "")
    ]
    occupied = [(start, end) for _, _, start, end in matches]
    for match in _BARE_URL.finditer(answer or ""):
        if not any(start <= match.start() < end for start, end in occupied):
            matches.append((None, match.group(0).rstrip(".,;:"), match.start(), match.end()))
    matches.sort(key=lambda value: value[2])

    citations: list[Citation] = []
    seen: set[str] = set()
    accessed_at = datetime.now(UTC).isoformat()
    for label, raw_url, start, end in matches:
        url = clean_url(raw_url)
        if not url or url in seen:
            continue
        seen.add(url)
        data = metadata.get(url, {})
        highlights = data.get("highlights") or []
        excerpt = data.get("excerpt") or data.get("text") or (highlights[0] if highlights else None)
        citations.append(Citation(
            id=f"src_{len(citations) + 1}",
            title=str(data.get("title") or label or url)[:500],
            url=url,
            author=data.get("author"),
            published_at=data.get("published_at"),
            accessed_at=str(data.get("fetched_at") or accessed_at),
            excerpt=str(excerpt)[:500] if excerpt else None,
            claim=_claim_for(answer, start, end),
            confidence=1.0 if data else 0.7,
        ))
        if len(citations) >= limit:
            break
    return citations
