import asyncio
from unittest import mock

from pipeline.instruction import _runtime_skill_guidance, synthesis_instruction
from pipeline.optimized_tool_execution import optimized_tool_execution
from pipeline.response_builder import (
    auto_generate_pdf,
    derive_pdf_title,
    normalize_pdf_document,
    requested_coverage_gap,
    requested_day_count,
    missing_local_date_anchor,
)
from pipeline.tools import tools


def _tool_schema(name):
    return next(item["function"] for item in tools if item["function"]["name"] == name)


def test_live_research_skills_are_injected_into_runtime_prompt():
    guidance = _runtime_skill_guidance()
    assert "search snippets only as leads" in guidance
    assert "search → fetch → synthesize → export" in guidance
    assert "Never recall semantic memory for a self-contained current-information request" in guidance


def test_pdf_synthesis_requests_final_content_not_an_export_tool_call():
    prompt = synthesis_instruction("give me a pdf of the latest news from india")
    assert "complete, polished, evidence-backed document" in prompt
    assert "do not call export_to_pdf" in prompt
    assert "MUST call the export_to_pdf tool" not in prompt
    assert "N distinct dated entries" in prompt
    assert "Never emit a tool name" in prompt


def test_web_search_exposes_freshness_window():
    properties = _tool_schema("web_search")["parameters"]["properties"]
    assert properties["freshness"]["enum"] == ["any", "day", "week", "month", "year"]


def test_local_time_tool_anchors_relative_location_dates():
    tool = _tool_schema("get_local_time")
    assert "relative dates" in tool["description"]
    assert "local date anchors" in tool["description"]


def test_pdf_synthesis_includes_local_today_in_next_n_days():
    prompt = synthesis_instruction("weather in Kolkata for next 7 days")
    assert "Anchor relative ranges to" in prompt
    assert "includes local today as entry one" in prompt


def test_runtime_pdf_export_is_idempotent():
    memo = {"generated_pdfs": []}
    content = "# India news\n\n" + ("A grounded, cited news item. " * 8)

    async def run():
        with mock.patch(
            "functionCalls.generatePDF.create_pdf_from_content",
            new=mock.AsyncMock(return_value="https://search.elixpo.com/generated/report.pdf"),
        ) as create:
            first = await auto_generate_pdf(content, "give me a pdf", memo, "event")
            second = await auto_generate_pdf(content, "give me a pdf", memo, "event")
            assert first == "https://search.elixpo.com/generated/report.pdf"
            assert second is None
            create.assert_awaited_once()

    asyncio.run(run())


def test_runtime_does_not_export_error_text_after_failed_tool_export():
    memo = {"generated_pdfs": [], "pdf_export_attempted": True,
            "pdf_export_error": "render failed"}
    content = "PDF generation failed. " * 10

    async def run():
        with mock.patch(
            "functionCalls.generatePDF.create_pdf_from_content",
            new=mock.AsyncMock(),
        ) as create:
            result = await auto_generate_pdf(content, "give me a pdf", memo, "event")
            assert result is None
            create.assert_not_awaited()

    asyncio.run(run())


def test_runtime_does_not_export_uncommitted_clarification_draft():
    memo = {"generated_pdfs": []}
    draft = (
        "Got it! I am preparing the report.\n\n"
        "One quick clarification: which scope should the report use?"
    )

    async def run():
        with mock.patch(
            "functionCalls.generatePDF.create_pdf_from_content",
            new=mock.AsyncMock(),
        ) as create:
            result = await auto_generate_pdf(draft, "create a PDF", memo, "event")
            assert result is None
            assert memo["pdf_export_blocked"] == "uncommitted_document"
            create.assert_not_awaited()

    asyncio.run(run())

def test_followup_pdf_exports_trusted_prior_answer_instead_of_model_rewrite():
    prior = "# Grounded space discovery\n\n" + ("Evidence with citation. " * 12)
    memo = {"generated_pdfs": [], "continuation_pdf_content": prior}

    async def collect():
        with mock.patch(
            "pipeline.optimized_tool_execution.commit_pdf_artifact",
            new=mock.AsyncMock(return_value="https://search.elixpo.com/generated/space.pdf"),
        ) as create:
            output = []
            async for item in optimized_tool_execution(
                "export_to_pdf",
                {"content": "Generic rewritten space overview", "title": "Space Technology"},
                memo, lambda *_: None,
            ):
                output.append(item)
            assert create.await_args.args[0] == prior
            assert create.await_args.args[1] == "Grounded space discovery"
            assert create.await_args.args[2] is memo
        return output

    output = asyncio.run(collect())
    assert output[-1].endswith("https://search.elixpo.com/generated/space.pdf")

def test_export_tool_reuses_existing_pdf_without_rendering_again():
    memo = {"generated_pdfs": ["https://search.elixpo.com/generated/report.pdf"]}

    async def collect():
        output = []
        with mock.patch("pipeline.optimized_tool_execution.commit_pdf_artifact") as create:
            async for item in optimized_tool_execution(
                "export_to_pdf", {"content": "draft"}, memo, lambda *_: None
            ):
                output.append(item)
            create.assert_not_called()
        return output

    result = asyncio.run(collect())
    assert result == [
        "PDF already exported.\nDownload: https://search.elixpo.com/generated/report.pdf"
    ]


def test_leaked_python_pdf_wrapper_is_unwrapped_to_document_only():
    leaked = "Got it!\n```markdown\nexport_to_pdf(\n  content=\"# Kolkata Forecast\\n\\n## September 2nd 2026\\nRain\"\n)\n```"
    assert normalize_pdf_document(leaked) == "# Kolkata Forecast\n\n## September 2nd 2026\nRain"


def test_bounded_day_coverage_is_generic_for_any_subject_and_count():
    query = "make a PDF itinerary for next 3 days"
    incomplete = "September 2nd 2026 through September 4th 2026"
    complete = "\n".join(f"## September {day}th 2026" for day in range(2, 5))
    assert requested_day_count(query) == 3
    assert requested_coverage_gap(query, incomplete) == (3, 2)
    assert requested_coverage_gap(query, complete) is None


def test_pdf_title_comes_from_subject_not_conversational_preamble():
    query = "give me a pdf of the latest weather forecast for Kolkata for next 7 days"
    content = "Got it! I will whip up a PDF of that."
    assert derive_pdf_title(query, content) == "Latest Weather Forecast For Kolkata For Next 7 Days"


def test_pdf_title_never_exposes_internal_clarification_envelope():
    query = (
        "Compare several options and create a PDF\n\n"
        "Clarified requirements: request_details: Compare PostgreSQL, MySQL, and MongoDB "
        "for a high-traffic application"
    )
    assert derive_pdf_title(query, "No document heading") == (
        "Compare PostgreSQL, MySQL, And MongoDB For A High-Traffic Application"
    )


def test_local_date_anchor_must_be_present_in_range():
    info = {"Kolkata": "The current time in Kolkata is 12:30 AM on 2026-09-02"}
    query = "weather in Kolkata for next 7 days"
    assert missing_local_date_anchor(query, "## September 3rd 2026", info) == "2026-09-02"
    assert missing_local_date_anchor(query, "## September 2nd 2026", info) is None


def test_explicit_tomorrow_shifts_generic_local_anchor():
    info = {"Tokyo": "The current time in Tokyo is 11:30 PM on 2026-09-02"}
    query = "make a three day itinerary starting tomorrow"
    assert missing_local_date_anchor(query, "## September 2nd 2026", info) == "2026-09-03"
    assert missing_local_date_anchor(query, "## September 3rd 2026", info) is None


def test_deep_research_completes_requested_artifact_before_done():
    import pipeline.deep_search as deep_search

    research_query = "Compare the candidate storage engines"
    original_request = "Research the candidate storage engines and provide a PDF"
    pdf_url = "https://search.elixpo.com/generated/storage-engines.pdf"

    async def run():
        with (
            mock.patch.object(
                deep_search,
                "_decompose_query_with_llm",
                new=mock.AsyncMock(return_value=["orbital materials"]),
            ),
            mock.patch.object(
                deep_search,
                "_execute_deep_search_sub_query",
                new=mock.AsyncMock(
                    return_value=(
                        "# Findings\n\n" + "Grounded evidence. " * 12,
                        ["https://example.test/evidence"],
                        [],
                    )
                ),
            ),
            mock.patch.object(
                deep_search,
                "auto_generate_pdf",
                new=mock.AsyncMock(return_value=pdf_url),
            ) as generate,
        ):
            chunks = [
                chunk
                async for chunk in deep_search._run_deep_search_pipeline(
                    user_query=research_query,
                    user_image=None,
                    event_id="deep-artifact",
                    session_id=None,
                    emit_event=lambda _kind, content: content,
                    request_intent=original_request,
                )
            ]
            generate.assert_awaited_once()
            assert generate.await_args.args[1] == original_request
            return chunks

    chunks = asyncio.run(run())
    output = "".join(chunks)
    assert pdf_url in output
    assert output.index("PDF ready for download") < output.index("<TASK>DONE</TASK>")


def test_deep_research_rejects_source_free_output_before_stream_or_export():
    import pipeline.deep_search as deep_search

    async def run():
        with (
            mock.patch.object(
                deep_search,
                "_decompose_query_with_llm",
                new=mock.AsyncMock(return_value=["unverified thread"]),
            ),
            mock.patch.object(
                deep_search,
                "_execute_deep_search_sub_query",
                new=mock.AsyncMock(return_value=("Confident but unsupported answer", [], [])),
            ),
            mock.patch.object(
                deep_search,
                "auto_generate_pdf",
                new=mock.AsyncMock(),
            ) as generate,
        ):
            chunks = [
                chunk
                async for chunk in deep_search._run_deep_search_pipeline(
                    user_query="Research a subject and provide a PDF",
                    user_image=None,
                    event_id="deep-no-evidence",
                    session_id=None,
                    emit_event=lambda _kind, content: content,
                )
            ]
            generate.assert_not_awaited()
            return chunks

    output = "".join(asyncio.run(run()))
    assert "Confident but unsupported answer" not in output
    assert "enough verifiable sources" in output
    assert output.endswith("<TASK>DONE</TASK>")


def test_deep_research_exports_canonical_synthesis_with_source_appendix():
    import pipeline.deep_search as deep_search

    canonical = (
        "# Database Comparison for High-Traffic Applications\n\n"
        "## Executive Summary\n\nA complete, polished comparison."
    )

    async def run():
        with (
            mock.patch.object(
                deep_search,
                "_decompose_query_with_llm",
                new=mock.AsyncMock(return_value=["performance", "operations"]),
            ),
            mock.patch.object(
                deep_search,
                "_execute_deep_search_sub_query",
                new=mock.AsyncMock(side_effect=[
                    ("Raw performance notes", ["https://example.test/performance"], []),
                    ("Raw operations notes", ["https://example.test/operations"], []),
                ]),
            ),
            mock.patch.object(
                deep_search,
                "_deep_search_final_synthesis",
                new=mock.AsyncMock(return_value=canonical),
            ),
            mock.patch.object(
                deep_search,
                "auto_generate_pdf",
                new=mock.AsyncMock(return_value="https://example.test/report.pdf"),
            ) as generate,
        ):
            return [
                chunk
                async for chunk in deep_search._run_deep_search_pipeline(
                    user_query="Compare the databases",
                    user_image=None,
                    event_id="canonical-report",
                    session_id=None,
                    emit_event=lambda _kind, content: content,
                    request_intent="Compare the databases and create a PDF",
                )
            ], generate

    _chunks, generate = asyncio.run(run())
    exported = generate.await_args.args[0]
    assert exported.startswith(canonical)
    assert "**Sources:**" in exported
    assert "https://example.test/performance" in exported
    assert "Raw performance notes" not in exported


def test_forced_subquery_synthesis_flattens_tool_protocol_into_evidence():
    import pipeline.deep_search as deep_search

    transcript = [
        {"role": "system", "content": "research"},
        {"role": "user", "content": "investigate"},
        {
            "role": "assistant",
            "content": "Gathering information...",
            "tool_calls": [{"id": "call-1", "type": "function"}],
        },
        {
            "role": "tool",
            "tool_call_id": "call-1",
            "name": "web_search",
            "content": "Verified database evidence with https://example.test/source",
        },
    ]

    messages = deep_search._build_evidence_synthesis_messages(
        transcript,
        "Compare the database options",
    )

    assert [message["role"] for message in messages] == ["system", "user"]
    assert all("tool_calls" not in message for message in messages)
    assert all("tool_call_id" not in message for message in messages)
    assert "Verified database evidence" in messages[1]["content"]
    assert "Compare the database options" in messages[1]["content"]


def test_parallel_search_sources_are_read_from_each_result_not_shared_state():
    import pipeline.deep_search as deep_search

    first = '{"results":[{"url":"https://one.example/report"}]}'
    second = '{"results":[{"url":"https://two.example/report"}]}'

    assert deep_search._search_urls_from_tool_result(first) == [
        "https://one.example/report"
    ]
    assert deep_search._search_urls_from_tool_result(second) == [
        "https://two.example/report"
    ]
    assert deep_search._search_urls_from_tool_result("not-json") == []
