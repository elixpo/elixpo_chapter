#!/usr/bin/env python3
"""Dependency-free structural and privacy validation for the dataset release."""
from __future__ import annotations

import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SECRET_PATTERNS = (
    re.compile(r"Authorization\s*:\s*Bearer", re.IGNORECASE),
    re.compile(r"\b(?:sk|ag)_[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"\b(?:API_KEY|SECRET_KEY|ACCESS_TOKEN)\s*=", re.IGNORECASE),
)


def load_jsonl(name: str) -> list[dict]:
    path = DATA / name
    rows = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as error:
            raise AssertionError(f"{path}:{line_number}: {error}") from error
        assert isinstance(row, dict), f"{path}:{line_number}: row must be an object"
        rows.append(row)
    assert rows, f"{path}: expected at least one row"
    return rows


def require_keys(rows: list[dict], required: set[str], identity: str) -> None:
    seen = set()
    for index, row in enumerate(rows, 1):
        missing = required - row.keys()
        assert not missing, f"row {index}: missing {sorted(missing)}"
        item_id = row[identity]
        assert item_id not in seen, f"duplicate id: {item_id}"
        seen.add(item_id)
        serialized = json.dumps(row, ensure_ascii=False)
        for pattern in SECRET_PATTERNS:
            assert not pattern.search(serialized), f"possible credential in {item_id}"


def main() -> int:
    evaluations = load_jsonl("evaluations.jsonl")
    cache_pairs = load_jsonl("cache_pairs.jsonl")
    benchmarks = load_jsonl("benchmark_results.jsonl")
    require_keys(evaluations, {
        "id", "category", "messages", "expected_route", "expected_context",
        "freshness_required", "citations_required", "artifact",
        "required_capabilities", "acceptance_criteria", "source_test",
    }, "id")
    require_keys(cache_pairs, {
        "id", "query_a", "query_b", "label", "scope", "rationale",
    }, "id")
    require_keys(benchmarks, {
        "metric_id", "metric", "value", "unit", "evaluation_scope",
        "environment", "source", "reported_at", "notes",
    }, "metric_id")

    routes = {"direct", "tools", "deep_research", "clarify"}
    contexts = {"standalone", "continuation"}
    assert all(row["expected_route"] in routes for row in evaluations)
    assert all(row["expected_context"] in contexts for row in evaluations)
    assert all(row["artifact"] in {"none", "pdf"} for row in evaluations)
    assert all(row["label"] in {"equivalent", "different"} for row in cache_pairs)
    assert all(row["evaluation_scope"] == "historical_production_snapshot" for row in benchmarks)
    assert (ROOT / "VERSION").read_text(encoding="utf-8").strip() == "1.0.0"

    print(
        "validated OreoLook research evals v1.0.0: "
        f"{len(evaluations)} evaluations, {len(cache_pairs)} cache pairs, "
        f"{len(benchmarks)} historical metrics"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
