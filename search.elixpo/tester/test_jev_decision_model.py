import asyncio
import importlib
import os
import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lixsearch"))


VALID_ROUTE = '{"mode":"DIRECT","context":"STANDALONE","clarification":{"required":false,"fields":[]}}'


class _Response:
    def __init__(self, content):
        self._content = content

    def raise_for_status(self):
        return None

    def json(self):
        return {"choices": [{"message": {"content": self._content}}]}


def _enable_jev(monkeypatch, module):
    monkeypatch.setattr(module, "JEV_ENABLED", True, raising=False)
    monkeypatch.setattr(module, "LLM_MODEL", "main-model", raising=False)
    monkeypatch.setattr(module, "LLM_MODEL_FALLBACK", "fallback-model", raising=False)


def _dispatch(monkeypatch, pipeline, jev_reply, llm_models=None):
    """One requests.post patch: jev model gets jev_reply, others get VALID_ROUTE."""
    def post(_url, json, **_kwargs):
        if json["model"] == "jev":
            if isinstance(jev_reply, Exception):
                raise jev_reply
            return _Response(jev_reply)
        if llm_models is None:
            raise AssertionError("LLM router must not run")
        llm_models.append(json["model"])
        return _Response(VALID_ROUTE)

    monkeypatch.setattr(pipeline.requests, "post", post)


def _jev_reply(mode="tools", conf=1, context="standalone", blocking=0.05):
    import json
    return json.dumps({
        "mode": {"type": "choice", "choice": mode, "confidence": conf, "probabilities": {}},
        "context": {"type": "choice", "choice": context, "confidence": conf, "probabilities": {}},
        "blocking_clarification": {"type": "noul", "noul": blocking},
    })


def test_jev_is_disabled_by_default():
    config = importlib.import_module("pipeline.config")
    if os.getenv("JEV_ENABLED") is not None:
        pytest.skip("JEV_ENABLED is set in this environment")
    assert config.JEV_ENABLED is False
    assert config.LLM_DECISION_MODEL != config.JEV_MODEL
    assert config.JEV_MIN_CONFIDENCE == 0.6


def test_jev_never_becomes_decision_model(monkeypatch):
    monkeypatch.setenv("JEV_ENABLED", "true")
    import pipeline.config as config
    config = importlib.reload(config)
    try:
        assert config.JEV_ENABLED and config.LLM_DECISION_MODEL != config.JEV_MODEL
    finally:
        monkeypatch.undo()
        importlib.reload(config)


def test_build_request_shape():
    import json
    jev = importlib.import_module("pipeline.jev")
    qs = {"m": jev.choice_question("q?", {"a": "A", "b": "B"}), "y": jev.yes_no_question("ok?")}
    body = jev.build_request("hello", qs)
    assert body["model"] == "jev" and len(body["messages"]) == 1
    msg = body["messages"][0]
    assert msg["role"] == "user"
    assert json.loads(msg["content"]) == {"state": "hello", "questions": qs}


def test_parse_choice_and_noul():
    jev = importlib.import_module("pipeline.jev")
    qs = {"m": jev.choice_question("q", {"a": "A", "b": "B"}), "y": jev.yes_no_question("ok?")}
    reply = '{"m":{"type":"choice","choice":"b","confidence":0.9},"y":{"type":"noul","noul":0.2}}'
    out = jev.parse_reply(reply, qs, 0.6)
    assert out["m"] == ("b", 0.9)
    assert out["y"][0] is False and out["y"][1] == pytest.approx(0.8)
    assert jev.parse_reply(reply.replace("0.2", "0.9"), qs, 0.6)["y"][0] is True
    assert jev.parse_reply(reply.replace('"b"', '"zzz"'), qs, 0.6) is None


def test_classify_low_confidence_returns_none(monkeypatch):
    jev = importlib.import_module("pipeline.jev")
    qs = {"y": jev.yes_no_question("ok?")}
    monkeypatch.setattr(jev.requests, "post", lambda *a, **k: _Response('{"y":{"type":"noul","noul":0.55}}'))
    assert jev.classify("x", qs, headers={}) is None
    monkeypatch.setattr(jev.requests, "post", lambda *a, **k: _Response('{"y":{"type":"noul","noul":0.95}}'))
    assert jev.classify("x", qs, headers={})["y"][0] is True


@pytest.mark.parametrize("failure", ["http", "garbage", "missing"])
def test_classify_error_returns_none(monkeypatch, failure):
    jev = importlib.import_module("pipeline.jev")
    qs = {"y": jev.yes_no_question("ok?")}

    def post(*_a, **_k):
        if failure == "http":
            raise requests.exceptions.ConnectionError("down")
        return _Response("not json" if failure == "garbage" else "{}")

    monkeypatch.setattr(jev.requests, "post", post)
    assert jev.classify("x", qs, headers={}) is None


def test_router_uses_jev_when_confident(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")
    _enable_jev(monkeypatch, pipeline)
    _dispatch(monkeypatch, pipeline, _jev_reply("direct"))
    mode, context, need = asyncio.run(pipeline._decide_request_mode("hi", 0, {}))
    assert (mode, context, need.required) == ("direct", "standalone", False)


def test_router_images_force_tools(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")
    _enable_jev(monkeypatch, pipeline)
    _dispatch(monkeypatch, pipeline, _jev_reply("direct"))
    mode, _, _ = asyncio.run(pipeline._decide_request_mode("what is this", 1, {}))
    assert mode == "tools"


@pytest.mark.parametrize("reply", [_jev_reply(conf=0.3), _jev_reply(blocking=0.9), "boom",
                                   requests.exceptions.ConnectionError("down")])
def test_router_falls_back_to_llm(monkeypatch, reply):
    pipeline = importlib.import_module("pipeline.lixsearch")
    _enable_jev(monkeypatch, pipeline)
    models = []
    _dispatch(monkeypatch, pipeline, reply, models)
    mode, context, need = asyncio.run(pipeline._decide_request_mode("hello", 0, {}))
    assert (mode, context, need.required) == ("direct", "standalone", False)
    assert models and "jev" not in models


def test_router_surfaces_upstream_outage_instead_of_clarifying(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")

    def down(*_args, **_kwargs):
        raise requests.exceptions.ConnectionError("gen.pollinations.ai unreachable")

    monkeypatch.setattr(pipeline.requests, "post", down)
    with pytest.raises(pipeline.UpstreamUnavailableError):
        asyncio.run(pipeline._decide_request_mode("a full question", 0, {}))


def test_tool_selection_chain_never_uses_jev(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")
    _enable_jev(monkeypatch, pipeline)
    assert pipeline._llm_model_chain("main-model") == ("main-model", "fallback-model")


def test_decision_completion_uses_llm_models_only(monkeypatch):
    helpers = importlib.import_module("pipeline.helpers")
    _enable_jev(monkeypatch, helpers)
    calls = []

    def post(_url, json, **_kwargs):
        calls.append(json["model"])
        if json["model"] == "main-model":
            raise requests.exceptions.ConnectionError("down")
        return _Response('["a"]')

    monkeypatch.setattr(helpers.requests, "post", post)
    data = asyncio.run(helpers.decision_completion({"messages": []}, {}, 1, "test"))
    assert data["choices"][0]["message"]["content"] == '["a"]'
    assert calls == ["main-model", "fallback-model"]


def test_deep_search_gating_uses_jev_then_llm(monkeypatch):
    ds = importlib.import_module("pipeline.deep_search")
    jev = importlib.import_module("pipeline.jev")
    monkeypatch.setattr(ds, "JEV_ENABLED", True)
    monkeypatch.setattr(jev.requests, "post", lambda *a, **k: _Response('{"needs_deep_search":{"type":"noul","noul":0.97}}'))
    assert asyncio.run(ds._evaluate_deep_search_need("q", {})) is True
    monkeypatch.setattr(jev.requests, "post", lambda *a, **k: _Response('{"needs_deep_search":{"type":"noul","noul":0.4}}'))

    async def llm(*_a, **_k):
        return {"choices": [{"message": {"content": '{"needs_deep_search": false}'}}]}

    monkeypatch.setattr(ds, "decision_completion", llm)
    assert asyncio.run(ds._evaluate_deep_search_need("q", {})) is False


def test_upstream_error_output_is_explicit(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")
    streamed = list(pipeline._upstream_error_output("evt-1"))
    assert streamed[0].startswith("event: ERROR")
    assert "<TASK>DONE</TASK>" in streamed[1]
    (text,) = list(pipeline._upstream_error_output(None))
    assert isinstance(text, pipeline.PipelineErrorText)
