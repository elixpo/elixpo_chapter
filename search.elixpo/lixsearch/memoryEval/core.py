"""Small dependency-free metrics contract shared by local and Compose gates."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import time
from typing import Any, Callable, Iterable


@dataclass(frozen=True, slots=True)
class LatencyBudget:
    name: str
    p95_ms: float


@dataclass(frozen=True, slots=True)
class LatencyResult:
    name: str
    samples: int
    p50_ms: float
    p95_ms: float
    max_ms: float
    budget_ms: float
    passed: bool


@dataclass(frozen=True, slots=True)
class GateResult:
    name: str
    passed: bool
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class EvaluationReport:
    mode: str
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    gates: list[GateResult] = field(default_factory=list)
    latencies: list[LatencyResult] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        return all(item.passed for item in (*self.gates, *self.latencies))

    def gate(self, name: str, passed: bool, **details: Any) -> None:
        self.gates.append(GateResult(name, bool(passed), details))

    def latency(self, result: LatencyResult) -> None:
        self.latencies.append(result)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "oreolook-memory-eval-v1",
            "mode": self.mode,
            "started_at": self.started_at,
            "passed": self.passed,
            "metadata": self.metadata,
            "gates": [asdict(item) for item in self.gates],
            "latencies": [asdict(item) for item in self.latencies],
        }

    def write(self, directory: str | Path) -> tuple[Path, Path]:
        target = Path(directory)
        target.mkdir(parents=True, exist_ok=True)
        json_path = target / f"memory-eval-{self.mode}.json"
        markdown_path = target / f"memory-eval-{self.mode}.md"
        json_path.write_text(json.dumps(self.to_dict(), indent=2) + "\n", encoding="utf-8")
        lines = [
            f"# OreoLook memory evaluation ({self.mode})",
            "",
            f"Overall: **{'PASS' if self.passed else 'FAIL'}**",
            "",
            "## Correctness gates",
            "",
            "| Gate | Result | Details |",
            "|---|---:|---|",
        ]
        for item in self.gates:
            details = json.dumps(item.details, sort_keys=True).replace("|", "\\|")
            lines.append(f"| {item.name} | {'PASS' if item.passed else 'FAIL'} | `{details}` |")
        lines.extend(("", "## Latency gates", "", "| Layer | p50 | p95 | Budget | Result |", "|---|---:|---:|---:|---:|"))
        for item in self.latencies:
            lines.append(
                f"| {item.name} | {item.p50_ms:.3f} ms | {item.p95_ms:.3f} ms | "
                f"{item.budget_ms:.3f} ms | {'PASS' if item.passed else 'FAIL'} |"
            )
        markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return json_path, markdown_path


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(percentile * len(ordered)) - 1))
    return ordered[index]


def benchmark(
    budget: LatencyBudget, operation: Callable[[], Any], *, repeats: int = 100, warmups: int = 5,
) -> LatencyResult:
    for _ in range(max(0, warmups)):
        operation()
    samples = []
    for _ in range(max(1, repeats)):
        started = time.perf_counter_ns()
        operation()
        samples.append((time.perf_counter_ns() - started) / 1_000_000)
    p95 = _percentile(samples, .95)
    return LatencyResult(
        name=budget.name, samples=len(samples), p50_ms=round(_percentile(samples, .50), 4),
        p95_ms=round(p95, 4), max_ms=round(max(samples), 4),
        budget_ms=float(budget.p95_ms), passed=p95 <= budget.p95_ms,
    )


def estimate_tokens(text: str) -> int:
    """Conservative dependency-free estimate used only as an injection guard."""
    return math.ceil(len((text or "").encode("utf-8")) / 4)


def retrieval_quality(expected: Iterable[str], returned: Iterable[str]) -> dict[str, float]:
    expected_set = set(expected)
    returned_list = list(returned)
    returned_set = set(returned_list)
    relevant = len(expected_set & returned_set)
    precision = relevant / len(returned_list) if returned_list else 0.0
    recall = relevant / len(expected_set) if expected_set else 1.0
    return {"precision": round(precision, 4), "recall": round(recall, 4)}
