import json
from pathlib import Path
import time

import pytest

from memoryEval.core import EvaluationReport, LatencyBudget, benchmark, estimate_tokens, retrieval_quality
from memoryEval.live import parse_sse, run_compose
from memoryEval.local import run_local


def test_cpu_only_release_gate_covers_manifest_and_passes():
    report = run_local(repeats=3)
    manifest = json.loads(Path("evals/memory/scenarios.json").read_text())
    expected = {item["id"] for item in manifest["scenarios"] if item["gate"] == "local"}
    actual = {item.name for item in report.gates}
    assert expected == actual
    assert report.passed, report.to_dict()


def test_report_is_machine_and_human_readable(tmp_path):
    report = EvaluationReport(mode="test")
    report.gate("isolation", True, leaked=False)
    report.latency(benchmark(LatencyBudget("lookup", 100), lambda: None, repeats=2, warmups=0))
    json_path, markdown_path = report.write(tmp_path)
    assert json.loads(json_path.read_text())["passed"] is True
    assert "Overall: **PASS**" in markdown_path.read_text()


def test_token_and_retrieval_metrics_are_deterministic():
    assert estimate_tokens("abcd" * 4) == 4
    assert retrieval_quality(("a", "b"), ("a", "c")) == {"precision": .5, "recall": .5}


def test_sse_parser_ignores_metadata_and_collects_content():
    lines = [
        b'data: {"event_type":"INFO","choices":[{"delta":{"content":"<TASK>On it</TASK>"}}]}\n',
        b'event: message\n',
        b'data: {"choices":[{"delta":{"content":"hello "}}]}\n',
        b'data: {"choices":[{"delta":{"content":"world"}}]}\n',
        b'data: [DONE]\n',
    ]
    content, ttfe = parse_sse(lines, started=time.perf_counter())
    assert content == "hello world"
    assert ttfe is not None


def test_compose_gate_requires_two_distinct_replicas():
    with pytest.raises(ValueError, match="two distinct"):
        run_compose(base_urls=["http://app:9002", "http://app:9002"], token="secret")
