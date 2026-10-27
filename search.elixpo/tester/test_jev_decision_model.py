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
    monkeypatch.setattr(module, "JEV_ENABLED", True)
    monkeypatch.setattr(module, "LLM_DECISION_MODEL", "jev")
    monkeypatch.setattr(module, "LLM_MODEL", "main-model")
    monkeypatch.setattr(module, "LLM_MODEL_FALLBACK", "fallback-model", raising=False)


def test_jev_is_disabled_by_default():
    config = importlib.import_module("pipeline.config")
    if os.getenv("JEV_ENABLED") is not None:
        pytest.skip("JEV_ENABLED is set in this environment")
    assert config.JEV_ENABLED is False
    assert config.LLM_DECISION_MODEL != config.JEV_MODEL


def test_router_falls_back_from_jev_to_llm_model(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")
    _enable_jev(monkeypatch, pipeline)
    calls = []

    def post(_url, json, **_kwargs):
        calls.append(json["model"])
        if json["model"] == "jev":
            raise requests.exceptions.HTTPError("jev rejected")
        return _Response(VALID_ROUTE)

    monkeypatch.setattr(pipeline.requests, "post", post)
    mode, context, need = asyncio.run(pipeline._decide_request_mode("hello", 0, {}))
    assert (mode, context, need.required) == ("direct", "standalone", False)
    assert calls[0] == "jev"
    assert set(calls[1:]) <= {"main-model", "fallback-model"} and calls[1:]


def test_router_surfaces_upstream_outage_instead_of_clarifying(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")

    def down(*_args, **_kwargs):
        raise requests.exceptions.ConnectionError("gen.pollinations.ai unreachable")

    monkeypatch.setattr(pipeline.requests, "post", down)
    with pytest.raises(pipeline.UpstreamUnavailableError):
        asyncio.run(pipeline._decide_request_mode("a full question", 0, {}))


def test_tool_selection_chain_includes_llm_model_after_jev(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")
    _enable_jev(monkeypatch, pipeline)
    assert pipeline._llm_model_chain("jev") == ("jev", "main-model", "fallback-model")
    assert pipeline._llm_model_chain("main-model") == ("main-model", "fallback-model")


def test_decision_completion_falls_back_from_jev(monkeypatch):
    helpers = importlib.import_module("pipeline.helpers")
    _enable_jev(monkeypatch, helpers)
    calls = []

    def post(_url, json, **_kwargs):
        calls.append(json["model"])
        if json["model"] == "jev":
            raise requests.exceptions.ConnectionError("jev down")
        return _Response('["a"]')

    monkeypatch.setattr(helpers.requests, "post", post)
    data = asyncio.run(helpers.decision_completion({"messages": []}, {}, 1, "test"))
    assert data["choices"][0]["message"]["content"] == '["a"]'
    assert calls == ["jev", "main-model"]


def test_upstream_error_output_is_explicit(monkeypatch):
    pipeline = importlib.import_module("pipeline.lixsearch")
    streamed = list(pipeline._upstream_error_output("evt-1"))
    assert streamed[0].startswith("event: ERROR")
    assert "<TASK>DONE</TASK>" in streamed[1]
    (text,) = list(pipeline._upstream_error_output(None))
    assert isinstance(text, pipeline.PipelineErrorText)
