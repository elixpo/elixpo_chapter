from pipeline.helpers import StreamingTagFilter
from pipeline.lixsearch import _enforce_capability_route, _may_stream_uncommitted_output
from pipeline.response_builder import is_exportable_pdf_document


def test_reasoning_tags_split_across_chunks_never_reach_sse_text():
    filter_ = StreamingTagFilter()
    chunks = ["<thi", "nking>private plan", "</think", "ing>Final answer"]
    visible = "".join(filter_.feed(chunk) for chunk in chunks) + filter_.flush()
    assert visible == "Final answer"


def test_unclosed_reasoning_block_is_discarded_on_flush():
    filter_ = StreamingTagFilter()
    visible = filter_.feed("<analysis>private plan") + filter_.flush()
    assert visible == ""


def test_artifact_draft_is_buffered_until_commit():
    assert _may_stream_uncommitted_output(
        "event-id", has_tools=False, artifact_requested=True
    ) is False


def test_plain_final_answer_can_stream_after_tool_boundary_is_clear():
    assert _may_stream_uncommitted_output(
        "event-id", has_tools=False, artifact_requested=False
    ) is True
    assert _may_stream_uncommitted_output(
        "event-id", has_tools=True, artifact_requested=False
    ) is False


def test_explicit_artifact_cannot_remain_on_direct_route():
    assert _enforce_capability_route("direct", artifact_requested=True) == "tools"
    assert _enforce_capability_route("direct", artifact_requested=False) == "direct"


def test_pdf_commit_rejects_conversational_clarification_draft():
    draft = (
        "Got it! Crafting a comparison that dives into the details.\n\n"
        "One quick clarification: are you looking for a conceptual overview "
        "or the latest benchmarks and pricing?"
    )
    assert is_exportable_pdf_document(draft) is False


def test_pdf_commit_accepts_finished_structured_document():
    document = (
        "# Database Comparison\n\n"
        "## Executive Summary\n\n"
        + "This report compares the supplied systems using the requested criteria. " * 5
    )
    assert is_exportable_pdf_document(document) is True
