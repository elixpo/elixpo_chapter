import json
from pathlib import Path
import sys

import pytest


SPACE = Path(__file__).resolve().parents[1] / "spaces" / "oreolook"
sys.path.insert(0, str(SPACE))

from oreolook_client import (  # noqa: E402
    OreoLookAPIError, begin_device_authorization, extract_links,
    parse_sse, poll_device_authorization, resolve_key, stream_completion,
    verification_url_with_code,
)


def event(content, *, event_type=None):
    value = {"choices": [{"delta": {"content": content}}]}
    if event_type:
        value["event_type"] = event_type
    return "data: " + json.dumps(value)


class FakeResponse:
    def __init__(self, lines=(), status=200, payload=None):
        self.lines = list(lines); self.status_code = status; self.closed = False
        self.payload = payload or {}
    def iter_lines(self, chunk_size=512, decode_unicode=True):
        assert chunk_size == 1
        assert decode_unicode is True
        return iter(self.lines)
    def json(self): return self.payload
    def close(self): self.closed = True


class FakeSession:
    def __init__(self, response): self.response = response; self.calls = []
    def post(self, url, **kwargs):
        self.calls.append((url, kwargs)); return self.response


def test_sse_tasks_are_separate_and_reasoning_is_not_rendered():
    events = list(parse_sse([
        event("<TASK>Searching fresh sources</TASK>", event_type="INFO"),
        event("<thinking>private chain</thinking>"),
        event("Grounded answer "), event("with receipts."), "data: [DONE]",
    ]))
    assert [(item.kind, item.content) for item in events] == [
        ("task", "Searching fresh sources"),
        ("text", "Grounded answer "),
        ("text", "with receipts."),
    ]


def test_normal_keys_are_session_input_and_agent_tokens_are_rejected(monkeypatch):
    monkeypatch.setenv("POLLINATIONS_API_KEY", "sk_shared_must_not_be_used")
    assert resolve_key("sk_user") == "sk_user"
    with pytest.raises(OreoLookAPIError, match="Agent-run tokens"):
        resolve_key("ag_internal")
    with pytest.raises(OreoLookAPIError, match="Connect your Pollinations"):
        resolve_key("")


def test_device_oauth_uses_public_app_key_and_returns_user_token():
    start = FakeSession(FakeResponse(payload={
        "device_code": "device-1", "user_code": "OREO-1234",
        "verification_uri": "/device", "interval": 5, "expires_in": 600,
    }))
    authorization = begin_device_authorization("pk_public", session=start)
    assert authorization.verification_uri == "https://enter.pollinations.ai/device"
    assert start.calls[0][1]["json"] == {"client_id": "pk_public"}

    pending = FakeSession(FakeResponse(status=400, payload={"error": "authorization_pending"}))
    assert poll_device_authorization("device-1", session=pending) is None
    approved = FakeSession(FakeResponse(payload={"access_token": "sk_user_scoped"}))
    assert poll_device_authorization("device-1", session=approved) == "sk_user_scoped"


def test_device_verification_url_prefills_and_preserves_query():
    assert verification_url_with_code(
        "https://enter.pollinations.ai/device?source=oreolook",
        "OREO 1234",
    ) == (
        "https://enter.pollinations.ai/device?source=oreolook&user_code=OREO+1234"
    )


@pytest.mark.parametrize(
    ("mode", "instruction"),
    [
        ("Quick Search", "Use quick search"),
        ("Deep Research", "Use deep research"),
    ],
)
def test_stream_calls_pollinations_without_persisting_or_exposing_key(mode, instruction):
    response = FakeResponse([event("Hello"), "data: [DONE]"])
    session = FakeSession(response)
    messages = [{"role": "user", "content": "What changed today?"}]
    assert [item.content for item in stream_completion(
        messages, api_key="sk_private", mode=mode, session=session,
    )] == ["Hello"]
    url, call = session.calls[0]
    assert url == "https://gen.pollinations.ai/v1/chat/completions"
    assert call["headers"]["Authorization"] == "Bearer sk_private"
    assert call["json"]["store"] is False
    assert call["json"]["model"] == "Circuit-Overtime/OreoLook"
    assert instruction in call["json"]["messages"][-1]["content"]
    assert "sk_private" not in json.dumps(call["json"])
    assert messages == [{"role": "user", "content": "What changed today?"}]
    assert response.closed is True


def test_auto_mode_preserves_exact_followup_and_prior_turns():
    response = FakeResponse([event("Bring one."), "data: [DONE]"])
    session = FakeSession(response)
    messages = [
        {"role": "user", "content": "What is the weather in Kolkata?"},
        {"role": "assistant", "content": "Rain is expected in Kolkata this afternoon."},
        {"role": "user", "content": "aah! so shall I carry an umbrella?"},
    ]

    assert [item.content for item in stream_completion(
        messages, api_key="sk_private", mode="Auto", session=session,
    )] == ["Bring one."]

    outbound = session.calls[0][1]["json"]["messages"]
    assert outbound == messages
    assert "Choose the appropriate research depth" not in json.dumps(outbound)


def test_citations_and_pdf_artifacts_are_deduplicated_and_separated():
    text = (
        "See [Original report](https://example.com/report) and https://example.com/report. "
        "[Download PDF](https://search.elixpo.com/api/content/briefing.pdf?access=cap)."
    )
    sources, artifacts = extract_links(text)
    assert sources == [("Original report", "https://example.com/report")]
    assert artifacts == ["https://search.elixpo.com/api/content/briefing.pdf?access=cap"]


@pytest.mark.parametrize("status, phrase", [
    (401, "not accepted"), (403, "cannot access"), (429, "lot of love"), (503, "temporarily unavailable"),
])
def test_upstream_failures_are_safe(status, phrase):
    session = FakeSession(FakeResponse(status=status))
    with pytest.raises(OreoLookAPIError, match=phrase):
        list(stream_completion(
            [{"role": "user", "content": "hello"}],
            api_key="sk_private", mode="Quick Search", session=session,
        ))


def test_space_uses_gradio_6_app_level_and_chatbot_apis():
    source = (SPACE / "app.py").read_text(encoding="utf-8")
    assert "gr.Blocks(css=" not in source
    assert 'type="messages"' not in source
    assert 'label="Start with an example", elem_id="examples"' in source
    assert 'elem_classes="workspace"' in source
    assert 'elem_classes="research-rail"' in source
    assert 'rel="canonical"' in source
    assert 'type="application/ld+json"' in source
    assert 'PAPER_URL = "https://arxiv.org/abs/2609.05463"' in source
    assert 'HF_PAPER_URL = "https://huggingface.co/papers/2609.05463"' in source
    assert 'class="paper-citation"' in source
    assert '>Paper ↗</a>' in source
    assert "css=CSS, head=SEO_HEAD, js=APP_JS, ssr_mode=False" in source
    assert 'APP_KEY = os.getenv("OREOLOOK_APP_KEY"' in source
    assert 'api_key = gr.State("")' in source
    assert 'mode = gr.State("Auto")' in source
    assert "gr.Radio(" not in source
    assert 'gr.Accordion("Sources", open=False' in source
    assert 'gr.Accordion("Downloads", open=False' in source
    assert "Get an API key" not in source
    assert "POLLINATIONS_KEY_URL" not in source
    assert ".chatbot .message.user *" in source
    assert "oauth_connect, oauth_disconnect," in source
    assert '"Disconnect account", elem_classes="oauth-disconnect",' in source
    assert "interactive=False," in source
    assert 'Enter code <code>' not in source
    assert 'Enter code <strong>{code}</strong>' in source
    assert "Session controls" not in source
    assert 'class="chat-heading"' in source
    assert source.index('elem_classes="workspace"') < source.index(
        'elem_classes="hero-wrap"'
    )
    assert "height:clamp(300px,calc(100dvh - 500px),410px)!important" in source
    assert source.index('elem_classes="composer-row"') < source.index("gr.Examples(")
    assert "interactive=False, render=False" in source
    assert "placeholder=EMPTY_CHAT" in source
    assert 'elem_id="research-prompt"' in source
    assert 'elem_id="research-send"' in source
    assert 'elem_id="research-chat"' in source
    assert 'gr.Button("Send"' in source
    assert "prompt.submit(" not in source
    assert 'trigger_mode="once"' in source
    assert "def stage_request(" in source
    assert "queue=False," in source
    assert "stage.then(" in source
    assert "stream_every=0.1" in source
    assert "_model_history" in source
    assert 'class="research-trail"' in source
    assert "yield display, history" not in source
    assert "progress-card" not in source
    assert 'class="empty-connect"' in source
    assert 'elem_id="pollinations-connect"' in source
    assert "verification_url_with_code(" in source
    assert 'height:48px!important' in source
