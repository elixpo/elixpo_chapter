import importlib.util
import json
from pathlib import Path
import sys

import pytest

from sessions.artifacts import (
    ArtifactRejected,
    artifact_slug,
    create_artifact_snapshot,
    validate_artifact_boundary,
)
from sessions.request_context import (
    DeliverableKind,
    build_request_context,
    detect_deliverable,
)
from pipeline.response_builder import artifact_ledger_fields


def _answer(subject="PostgreSQL, MySQL, and MongoDB"):
    return (
        f"# {subject}\n\n"
        "## Findings\n\n"
        + "Grounded comparison with concrete trade-offs and cited evidence. " * 8
    )


@pytest.mark.parametrize(
    ("query", "kind"),
    [
        ("Export this as a PDF", DeliverableKind.PDF),
        ("Summarize the findings", DeliverableKind.SUMMARY),
        ("Compare the three options", DeliverableKind.COMPARISON),
    ],
)
def test_deliverable_contract_is_typed(query, kind):
    assert detect_deliverable(query).kind == kind


def test_followup_resolves_latest_substantive_exact_turn_before_routing():
    messages = [
        {
            "sequence": 2,
            "role": "assistant",
            "content": _answer("Older answer"),
            "metadata": {"evidence_refs": ["ev-old"]},
        },
        {
            "sequence": 4,
            "role": "assistant",
            "content": "<thinking>internal plan</thinking>" + ("x" * 200),
            "metadata": {"evidence_refs": ["ev-internal"]},
        },
        {
            "sequence": 6,
            "role": "assistant",
            "content": _answer(),
            "metadata": {
                "evidence_refs": ["ev-db-1", "ev-db-2"],
                "artifact_refs": ["art_previous"],
            },
        },
    ]
    context = build_request_context(
        request_id="req-followup",
        current_request="Make a PDF of that",
        source_turn_id=7,
        messages=messages,
        active_task={"original_request": "Compare the databases", "status": "completed"},
    )

    assert context.referent_source.turn_id == 6
    assert context.referent_source.content == _answer().strip()
    assert context.source_turn_ids == (6, 7)
    assert context.evidence_ids == ("ev-db-1", "ev-db-2")
    assert "Exact active task: Compare the databases" in context.routing_excerpt()
    assert "Resolved referent source turn 6" in context.routing_excerpt()


def test_self_contained_document_request_does_not_capture_unrelated_prior_answer():
    context = build_request_context(
        request_id="req-new",
        current_request=(
            "Create a detailed PDF comparing SQLite and DuckDB for analytical workloads"
        ),
        source_turn_id=9,
        messages=[{"sequence": 8, "role": "assistant", "content": _answer("Space travel")}],
    )
    assert context.referent_source is None
    assert context.source_turn_ids == (9,)


def test_discourse_followup_reuses_the_latest_substantive_answer_generically():
    context = build_request_context(
        request_id="req-followup",
        current_request="Ah, so should I do that?",
        messages=[
            {
                "sequence": 4,
                "role": "assistant",
                "content": _answer(),
            }
        ],
    )

    assert context.referent_source is not None
    assert context.referent_source.turn_id == 4
    assert "Resolved referent source turn 4" in context.routing_excerpt()


def test_exact_task_fields_become_typed_entities_constraints_and_missing_fields():
    context = build_request_context(
        request_id="req-fields",
        current_request="Continue",
        active_task={
            "resolved_fields": {"market": "India", "items": "three databases"},
            "required_fields": ["budget"],
        },
        pending_clarification={"missing_fields": ["budget"]},
    )
    assert context.entities == ("three databases", "India")
    assert context.constraints == ("items=three databases", "market=India")
    assert context.missing_fields == ("budget",)


def test_artifact_snapshot_is_deterministic_and_traceable_across_retries():
    first_context = build_request_context(
        request_id="req-one",
        current_request="Export this as a PDF",
        source_turn_id=12,
        messages=[{
            "sequence": 11,
            "role": "assistant",
            "content": _answer(),
            "metadata": {"evidence_refs": ["ev-a", "ev-b"]},
        }],
    )
    second_context = build_request_context(
        request_id="req-retry",
        current_request="Export this as a PDF",
        source_turn_id=12,
        messages=[{
            "sequence": 11,
            "role": "assistant",
            "content": _answer(),
            "metadata": {"evidence_refs": ["ev-a", "ev-b"]},
        }],
    )
    first = create_artifact_snapshot(
        kind="pdf", title="Database Comparison", content=_answer(),
        request_context=first_context,
    )
    retry = create_artifact_snapshot(
        kind="pdf", title="Database Comparison", content=_answer(),
        request_context=second_context,
    )

    assert first.artifact_id == retry.artifact_id
    assert first.content_hash == retry.content_hash
    assert first.source_turn_ids == (11, 12)
    assert first.evidence_ids == ("ev-a", "ev-b")
    assert first.slug == "database-comparison"
    assert first.status == "committed"
    assert first.request_id != retry.request_id


def test_artifact_identity_changes_when_document_content_changes():
    one = create_artifact_snapshot(kind="summary", title="Weekly Brief", content=_answer("Week one"))
    two = create_artifact_snapshot(kind="summary", title="Weekly Brief", content=_answer("Week two"))
    assert one.artifact_id != two.artifact_id


def test_artifact_snapshot_merges_context_and_current_request_provenance():
    context = build_request_context(
        request_id="req-current",
        current_request="Create a PDF comparing current database options",
        source_turn_id=21,
    )
    snapshot = create_artifact_snapshot(
        kind="pdf",
        title="Current Database Options",
        content=_answer(),
        request_context=context,
        source_turn_ids=(22,),
        evidence_ids=("https://example.test/evidence",),
    )
    assert snapshot.source_turn_ids == (21, 22)
    assert snapshot.evidence_ids == ("https://example.test/evidence",)


def test_artifact_ledger_fields_are_bounded_and_traceable():
    snapshots = [
        {"artifact_id": f"art_{index}", "content_hash": f"hash-{index}"}
        for index in range(12)
    ]
    fields = artifact_ledger_fields({"artifact_snapshots": snapshots})
    assert fields["artifact_ids"] == [f"art_{index}" for index in range(10)]
    assert fields["artifact_provenance"] == snapshots[:10]


@pytest.mark.parametrize(
    "content",
    [
        "<thinking>private reasoning</thinking>" + ("x" * 150),
        "export_to_pdf(content={})\n" + ("x" * 150),
        "[ERROR] render failed\n" + ("x" * 150),
        "One quick clarification: which market?\n" + ("x" * 150),
        "too short",
    ],
)
def test_artifact_boundary_rejects_internal_incomplete_and_placeholder_content(content):
    with pytest.raises(ArtifactRejected):
        validate_artifact_boundary(content)


def test_artifact_boundary_rejects_pending_task_even_with_polished_content():
    with pytest.raises(ArtifactRejected, match="incomplete_task_state"):
        validate_artifact_boundary(
            _answer(),
            active_task={"status": "awaiting_clarification"},
            pending_clarification={"missing_fields": ["subject"]},
        )


def test_slug_is_subject_based_and_bounded():
    assert artifact_slug("PostgreSQL vs MySQL: High-Traffic Trade-offs") == (
        "postgresql-vs-mysql-high-traffic-trade-offs"
    )


def test_content_gateway_preserves_first_binary_and_immutable_snapshot(tmp_path, monkeypatch):
    monkeypatch.setenv("CONTENT_STORE_DIR", str(tmp_path))
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location(
        "artifact_content_gateway",
        root / "lixsearch" / "app" / "gateways" / "content.py",
    )
    gateway = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = gateway
    spec.loader.exec_module(gateway)
    snapshot = create_artifact_snapshot(
        kind="pdf", title="Database Comparison", content=_answer()
    ).to_dict()
    content_id = f"database-comparison-{snapshot['artifact_id']}"

    gateway.store_content(content_id, b"first-pdf", artifact_metadata=snapshot)
    gateway.store_content(content_id, b"retry-render", artifact_metadata=snapshot)

    assert Path(tmp_path, f"{content_id}.pdf").read_bytes() == b"first-pdf"
    stored = json.loads(Path(tmp_path, f"{content_id}.artifact.json").read_text())
    assert stored["artifact_id"] == snapshot["artifact_id"]
    assert stored["source_turn_ids"] == []
