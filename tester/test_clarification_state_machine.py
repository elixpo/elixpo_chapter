import asyncio
import importlib

from pipeline.optimized_tool_execution import optimized_tool_execution
from pipeline.response_builder import auto_generate_pdf
from sessions.clarification import (
    ClarificationResolution,
    ClarificationNeed,
    ResolutionAction,
    TaskStatus,
    apply_resolution,
    artifacts_blocked,
    create_pending_task,
    has_decision_contract,
    has_resolution_contract,
    parse_clarification_need,
    parse_resolution,
    pending_for_request,
)
from sessions.ledger import SessionSnapshot


def make_task(fields=("comparison_subjects",)):
    return create_pending_task(
        "Compare options in the Indian market and make a PDF",
        fields,
        "Which options should I compare?",
        source_turn=7,
        request_id="request-7",
    )


def test_router_parses_exact_missing_comparison_subjects():
    need = parse_clarification_need(
        "{\"mode\":\"TOOLS\",\"context\":\"STANDALONE\",\"clarification\":"
        "{\"required\":true,\"fields\":["
        "{\"name\":\"comparison subjects\",\"kind\":\"identity\","
        "\"question\":\"Which three products should I compare?\"}]} }"
    )
    assert need.required is True
    assert need.missing_fields == ("comparison_subjects",)
    assert need.question == "Which three products should I compare?"


def test_router_records_ambiguous_referent_as_an_exact_missing_field():
    need = parse_clarification_need(
        "{\"mode\":\"DIRECT\",\"context\":\"CONTINUATION\",\"clarification\":"
        "{\"required\":true,\"fields\":["
        "{\"name\":\"referenced content\",\"kind\":\"user_owned\","
        "\"question\":\"What should I turn into a PDF?\"}]} }"
    )
    assert need.required is True
    assert need.missing_fields == ("referenced_content",)


def test_incomplete_or_malformed_router_output_fails_open_without_fake_state():
    assert parse_clarification_need("not json").required is False
    assert parse_clarification_need(
        '{"clarification":{"required":true,"missing_fields":[],"question":"What?"}}'
    ).required is False


def test_compact_complete_router_contract_is_valid_without_unused_arrays():
    contract = (
        '{"mode":"TOOLS","context":"STANDALONE",'
        '"clarification":{"required":false}}'
    )
    assert has_decision_contract(contract) is True
    assert parse_clarification_need(contract).required is False


def test_pending_task_preserves_original_routing_for_post_resolution_execution():
    active, pending = create_pending_task(
        "Original task",
        ("required_subject",),
        "Which subject?",
        source_turn=3,
        request_id="request-3",
        routing={"mode": "tools", "context": "standalone"},
    )
    assert active["routing"] == {"mode": "tools", "context": "standalone"}
    next_task, next_pending, executable = apply_resolution(
        active,
        pending,
        ClarificationResolution(
            ResolutionAction.RESOLVE,
            {"required_subject": "the supplied subject"},
        ),
    )
    assert next_pending is None
    assert executable
    assert next_task["routing"]["mode"] == "tools"


def test_complete_reply_fills_fields_and_preserves_original_request():
    active, pending = make_task()
    resolution = ClarificationResolution(
        ResolutionAction.RESOLVE,
        {"comparison_subjects": "A, B, and C"},
    )
    next_task, next_pending, executable = apply_resolution(active, pending, resolution)

    assert next_pending is None
    assert next_task["status"] == TaskStatus.READY_TO_EXECUTE.value
    assert next_task["source_turn"] == 7
    assert "Compare options in the Indian market" in executable
    assert "comparison_subjects: A, B, and C" in executable


def test_single_validated_value_maps_to_the_only_pending_field_generically():
    active, pending = make_task(("required_entity_set",))
    resolution = ClarificationResolution(
        ResolutionAction.RESOLVE,
        {"entities": "first, second, and third"},
    )
    next_task, next_pending, executable = apply_resolution(active, pending, resolution)
    assert next_pending is None
    assert next_task["resolved_fields"] == {
        "required_entity_set": "first, second, and third"
    }
    assert "required_entity_set: first, second, and third" in executable


def test_resolution_contract_rejects_malformed_or_unscoped_actions():
    assert has_resolution_contract('{"action":"resolve","values":{}}') is True
    assert has_resolution_contract('{"action":"execute","values":{}}') is False
    assert has_resolution_contract("not-json") is False


def test_partial_reply_keeps_only_unresolved_fields_pending():
    active, pending = make_task(("first_subject", "second_subject"))
    resolution = ClarificationResolution(
        ResolutionAction.PARTIAL,
        {"first_subject": "A"},
        question="What is the second subject?",
    )
    next_task, next_pending, executable = apply_resolution(active, pending, resolution)

    assert executable is None
    assert next_task["resolved_fields"] == {"first_subject": "A"}
    assert next_pending["missing_fields"] == ["second_subject"]


def test_unrelated_reply_cannot_silently_complete_even_with_values():
    active, pending = make_task()
    resolution = ClarificationResolution(
        ResolutionAction.UNRELATED,
        {"comparison_subjects": "should not be accepted"},
        question="Which options should I compare?",
    )
    next_task, next_pending, executable = apply_resolution(active, pending, resolution)

    assert executable is None
    assert next_task["resolved_fields"] == {}
    assert next_pending["missing_fields"] == ["comparison_subjects"]


def test_cancellation_clears_pending_without_execution():
    active, pending = make_task()
    next_task, next_pending, executable = apply_resolution(
        active, pending, ClarificationResolution(ResolutionAction.CANCEL, {})
    )
    assert executable is None
    assert next_pending is None
    assert next_task["status"] == TaskStatus.COMPLETED.value
    assert next_task["outcome"] == "cancelled"


def test_replacement_clears_old_task_and_routes_new_request():
    active, pending = make_task()
    next_task, next_pending, executable = apply_resolution(
        active,
        pending,
        ClarificationResolution(
            ResolutionAction.REPLACE,
            {},
            replacement_request="Summarize today's technology news",
        ),
    )
    assert next_task == {}
    assert next_pending is None
    assert executable == "Summarize today's technology news"


def test_pending_state_requires_its_same_non_ephemeral_session_carrier():
    _, pending = make_task()
    snapshot = SessionSnapshot([], pending_clarification=pending)
    assert pending_for_request(snapshot, "conv_owner", False) == pending
    assert pending_for_request(snapshot, None, False) is None
    assert pending_for_request(snapshot, "conv_owner", True) is None


def test_artifacts_and_all_tools_are_blocked_while_waiting():
    active, pending = make_task()
    memo = {"active_task": active, "pending_clarification": pending}
    assert artifacts_blocked(memo) is True

    async def exercise():
        pdf = await auto_generate_pdf("x" * 200, "make a pdf", memo, "event")
        chunks = []
        async for chunk in optimized_tool_execution(
            "web_search", {"query": "x"}, memo, lambda *_: None
        ):
            chunks.append(chunk)
        return pdf, chunks

    pdf, chunks = asyncio.run(exercise())
    assert pdf is None
    assert chunks == ["[BLOCKED] Required clarification is still pending; no tool was executed."]


def test_resolution_parser_defaults_to_unrelated_on_invalid_output():
    assert parse_resolution("garbage").action == ResolutionAction.UNRELATED


def test_pipeline_clarification_returns_before_tools_without_session(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")

    async def classify(*args, **kwargs):
        return (
            "tools",
            "standalone",
            ClarificationNeed(True, ("subjects",), "Which subjects should I compare?"),
        )

    monkeypatch.setattr(pipeline, "_decide_request_mode", classify)

    async def exercise():
        return [
            chunk
            async for chunk in pipeline.run_elixposearch_pipeline(
                "Compare these and make a PDF",
                None,
                event_id="clarify-no-session",
                is_ephemeral=True,
            )
        ]

    output = "".join(asyncio.run(exercise()))
    assert "Which subjects should I compare?" in output
    assert "Download PDF" not in output


def test_same_session_unrelated_reply_keeps_pending_state(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")
    active, pending = make_task()

    class FakeLedger:
        def __init__(self):
            self.states = []

        def acquire_lock(self):
            return "owned"

        def release_lock(self, token):
            return token == "owned"

        def load_snapshot(self):
            return SessionSnapshot([], active, pending, 7)

        def set_task_state(self, **state):
            self.states.append(state)

    fake_ledger = FakeLedger()

    class FakeContext:
        def __init__(self, session_id):
            self.ledger = fake_ledger

        def add_message(self, *args, **kwargs):
            return 8

    async def resolve(*args, **kwargs):
        return ClarificationResolution(
            ResolutionAction.UNRELATED,
            {},
            question="Which options should I compare?",
        )

    monkeypatch.setattr(pipeline, "LedgerSessionContext", FakeContext)
    monkeypatch.setattr(pipeline, "_resolve_pending_clarification", resolve)

    async def exercise():
        return [
            chunk
            async for chunk in pipeline.run_elixposearch_pipeline(
                "How is the weather?",
                None,
                event_id="unrelated-reply",
                session_id="conv_owner",
            )
        ]

    output = "".join(asyncio.run(exercise()))
    assert "Which options should I compare?" in output
    assert fake_ledger.states[-1]["pending_clarification"]["missing_fields"] == ["comparison_subjects"]


def test_router_failure_creates_safe_generic_pending_state(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")

    def unavailable(*args, **kwargs):
        raise TimeoutError("router timeout")

    monkeypatch.setattr(pipeline, "LLM_DECISION_MODEL", "router-a")
    monkeypatch.setattr(pipeline, "LLM_MODEL_FALLBACK", "router-b")
    monkeypatch.setattr(pipeline.requests, "post", unavailable)
    mode, context, need = asyncio.run(
        pipeline._decide_request_mode("a complete-looking request", 0, {})
    )
    assert mode == "tools"
    assert context == "standalone"
    assert need.required is True
    assert need.missing_fields == ("request_details",)
    assert need.question == "What specific subject or inputs should I use for this request?"


def test_generic_admission_fallback_resolves_next_turn_without_router(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")

    def unavailable(*args, **kwargs):
        raise TimeoutError("resolver timeout")

    monkeypatch.setattr(pipeline, "LLM_DECISION_MODEL", "router-a")
    monkeypatch.setattr(pipeline, "LLM_MODEL_FALLBACK", "router-b")
    monkeypatch.setattr(pipeline.requests, "post", unavailable)
    resolution = asyncio.run(
        pipeline._resolve_pending_clarification(
            {"original_request": "Complete the requested task"},
            {"missing_fields": ["request_details"]},
            "Use the three supplied database systems",
            {},
        )
    )
    assert resolution.action == ResolutionAction.RESOLVE
    assert resolution.values == {
        "request_details": "Use the three supplied database systems"
    }


def test_clarification_resolver_requests_json_mode(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [{"message": {"content": (
                    '{"action":"resolve","values":{"required_subject":"databases"},'
                    '"defaulted_fields":[],"question":"","replacement_request":""}'
                )}}]
            }

    def resolve(_url, json, **_kwargs):
        assert json["response_format"] == {"type": "json_object"}
        return Response()

    monkeypatch.setattr(pipeline.requests, "post", resolve)
    resolution = asyncio.run(
        pipeline._resolve_pending_clarification(
            {"original_request": "Compare a subject"},
            {"missing_fields": ["required_subject"]},
            "databases",
            {},
        )
    )
    assert resolution.action == ResolutionAction.RESOLVE
    assert resolution.values == {"required_subject": "databases"}


def test_router_uses_first_valid_redundant_contract(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [{
                    "message": {
                        "content": (
                            "{\"mode\":\"TOOLS\",\"context\":\"STANDALONE\","
                            "\"clarification\":{\"required\":true,\"fields\":["
                            "{\"name\":\"required_subject\",\"kind\":\"identity\","
                            "\"question\":\"Which subject?\"}]} }"
                        )
                    }
                }]
            }

    def route(_url, json, **_kwargs):
        assert json["response_format"] == {"type": "json_object"}
        if json["model"] == "router-a":
            raise TimeoutError("primary unavailable")
        return Response()

    monkeypatch.setattr(pipeline, "LLM_DECISION_MODEL", "router-a")
    monkeypatch.setattr(pipeline, "LLM_MODEL_FALLBACK", "router-b")
    monkeypatch.setattr(pipeline.requests, "post", route)

    mode, context, need = asyncio.run(
        pipeline._decide_request_mode("an incomplete request", 0, {})
    )
    assert (mode, context) == ("tools", "standalone")
    assert need.missing_fields == ("required_subject",)


def test_safe_default_can_complete_any_generic_pending_contract():
    active, pending = create_pending_task(
        "Evaluate the supplied candidates and create the requested artifact",
        ("candidate_identities", "evaluation_preferences"),
        "Which candidates and preferences should be used?",
        source_turn=11,
        request_id="request-11",
    )
    resolution = ClarificationResolution(
        ResolutionAction.RESOLVE,
        {"candidate_identities": "candidate A and candidate B"},
        defaulted_fields=("evaluation_preferences",),
    )

    next_task, next_pending, executable = apply_resolution(active, pending, resolution)

    assert next_pending is None
    assert next_task["status"] == TaskStatus.READY_TO_EXECUTE.value
    assert next_task["defaulted_fields"] == ["evaluation_preferences"]
    assert "candidate_identities: candidate A and candidate B" in executable
    assert "evaluation_preferences: use a context-appropriate default" in executable


def test_resolution_parser_accepts_only_named_defaulted_fields():
    resolution = parse_resolution(
        "{\"action\":\"resolve\",\"values\":{},"
        "\"defaulted_fields\":[\"Presentation Preferences\",\"***\"]}"
    )
    assert resolution.defaulted_fields == ("presentation_preferences",)


def test_unrelated_reply_cannot_default_pending_fields():
    active, pending = make_task(("required_subject",))
    resolution = ClarificationResolution(
        ResolutionAction.UNRELATED,
        {},
        defaulted_fields=("required_subject",),
        question="Which subject?",
    )

    next_task, next_pending, executable = apply_resolution(active, pending, resolution)

    assert executable is None
    assert next_task["defaulted_fields"] == []
    assert next_pending["missing_fields"] == ["required_subject"]


def test_decision_contract_requires_complete_structured_state():
    valid = (
        "{\"mode\":\"DIRECT\",\"context\":\"STANDALONE\","
        "\"clarification\":{\"required\":false,\"fields\":[]}}"
    )
    assert has_decision_contract(valid) is True
    assert has_decision_contract("Use tools and continue") is False
    assert has_decision_contract(
        "{\"mode\":\"TOOLS\",\"context\":\"STANDALONE\","
        "\"clarification\":{\"required\":true}}"
    ) is False


def test_typed_admission_discards_defaultable_output_metadata():
    decision = (
        "{\"mode\":\"TOOLS\",\"context\":\"STANDALONE\",\"clarification\":"
        "{\"required\":true,\"blocking_fields\":[\"candidate_identities\"],"
        "\"defaultable_fields\":[\"artifact_title\"],"
        "\"questions\":{\"candidate_identities\":"
        "\"Which candidates should be evaluated?\"}}}"
    )

    assert has_decision_contract(decision) is True
    need = parse_clarification_need(decision)
    assert need.required is True
    assert need.missing_fields == ("candidate_identities",)
    assert need.question == "Which candidates should be evaluated?"


def test_typed_admission_cannot_mark_only_defaultable_fields_as_required():
    inconsistent = (
        "{\"mode\":\"TOOLS\",\"context\":\"STANDALONE\",\"clarification\":"
        "{\"required\":true,\"blocking_fields\":[],"
        "\"defaultable_fields\":[\"presentation_style\"],\"questions\":{}}}"
    )
    assert has_decision_contract(inconsistent) is False
