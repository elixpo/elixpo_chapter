import sys
import time
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, patch
from quart import Quart
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
ENV = dotenv_values(ROOT / ".env.local")
API_KEY = ENV.get("API_KEY", "")
sys.path.insert(0, str(ROOT / "lixsearch"))

from agentRuntime.state import ResponseStateStore, canonical_conversation_id
from commons.auth_context import RequestAuthContext
import importlib.util

_spec = importlib.util.spec_from_file_location("responses_gateway", ROOT / "lixsearch" / "app" / "gateways" / "responses.py")
responses = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(responses)

_auth_spec = importlib.util.spec_from_file_location("app_auth", ROOT / "lixsearch" / "app" / "auth.py")
app_auth = importlib.util.module_from_spec(_auth_spec)
sys.modules[_auth_spec.name] = app_auth
_auth_spec.loader.exec_module(app_auth)


class FakePipeline:
    def __init__(self, client):
        self.client = client
        self.operations = []

    def set(self, key, value, ex=None):
        self.operations.append((key, value))
        return self

    def execute(self):
        for key, value in self.operations:
            self.client.values[key] = value


class FakeRedis:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def pipeline(self, transaction=True):
        return FakePipeline(self)


class FakeRunner:
    calls = []

    async def stream(self, agent, prompt, history=None, *, effort="low"):
        self.calls.append((agent, prompt, list(history or []), effort))
        for content in ("answer:", prompt[:2], prompt[2:]):
            yield {"type": "delta", "content": content}
        yield {"type": "done", "result": {
            "agent": "coding", "role": "code", "model": "qwen-coder", "effort": effort,
            "response": {"usage": {"prompt_tokens": 4, "completion_tokens": 2}},
        }}

    async def run(self, agent, prompt, history=None, *, effort="low"):
        self.calls.append((agent, prompt, list(history or []), effort))
        return {
            "agent": "coding",
            "role": "code",
            "model": "qwen-coder",
            "effort": effort,
            "response": {
                "choices": [{"message": {"role": "assistant", "content": f"answer:{prompt}"}}],
                "usage": {"prompt_tokens": 4, "completion_tokens": 2, "total_tokens": 6},
            },
        }


class AgentResponseTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        FakeRunner.calls.clear()
        self.redis = FakeRedis()
        self.state = ResponseStateStore(client=self.redis, ttl_seconds=60)
        self.app = Quart(__name__)
        app_auth.install_api_auth(self.app)
        if not API_KEY:
            self.fail("API_KEY is required in .env.local for conversation API tests")


        async def endpoint():
            return await responses.responses(True)

        self.app.add_url_rule("/v1/responses", "responses", endpoint, methods=["POST"])

    async def test_previous_response_id_restores_history(self):
        with patch.object(responses, "AgentRunner", FakeRunner), patch.object(responses, "_remember_turn", AsyncMock()):
            first = await responses._run_response({"model": "coding", "input": "first"}, self.state)
            second = await responses._run_response({
                "model": "coding", "input": "second", "previous_response_id": first["id"]
            }, self.state)
        self.assertEqual(second["previous_response_id"], first["id"])
        self.assertEqual(second["conversation"]["id"], first["conversation"]["id"])
        self.assertEqual([item["content"] for item in FakeRunner.calls[-1][2]], ["first", "answer:first"])

    async def test_store_false_writes_no_state(self):
        with patch.object(responses, "AgentRunner", FakeRunner), patch.object(responses, "_remember_turn", AsyncMock()) as remember:
            result = await responses._run_response({"input": "private", "store": False}, self.state)
        self.assertFalse(result["store"])
        self.assertIsNone(self.state.get_response(result["id"]))
        remember.assert_not_awaited()

    async def test_conversation_endpoint_rejects_missing_api_key(self):
        client = self.app.test_client()
        reply = await client.post("/v1/responses", json={"input": "hello"})
        self.assertEqual(reply.status_code, 401)

    async def test_http_json_and_sse_contracts(self):
        with patch.object(responses, "AgentRunner", FakeRunner), patch.object(responses, "ResponseStateStore", return_value=self.state), patch.object(responses, "_remember_turn", AsyncMock()):
            client = self.app.test_client()
            reply = await client.post("/v1/responses", json={"model": "coding", "input": "hello", "stream": False}, headers={"Authorization": f"Bearer {API_KEY}"})
            self.assertEqual(reply.status_code, 200)
            body = await reply.get_json()
            self.assertEqual(body["object"], "response")
            self.assertTrue(body["id"].startswith("resp_"))
            self.assertEqual(body["output"][0]["content"][0]["type"], "output_text")

            streamed = await client.post("/v1/responses", json={"input": "stream me", "stream": True}, headers={"Authorization": f"Bearer {API_KEY}"})
            stream_body = (await streamed.get_data()).decode()
            self.assertIn("event: response.created", stream_body)
            self.assertIn("event: response.output_text.delta", stream_body)
            self.assertIn("event: response.completed", stream_body)
            self.assertIn("data: [DONE]", stream_body)

    async def test_delegated_bearer_streams_responses_api(self):
        token = "ag_test-delegated-token"
        context = RequestAuthContext(
            mode="delegated",
            principal_id="poll_responses_test",
            delegated_token=token,
            expires_at=int(time.time()) + 300,
        )
        delegated_state = ResponseStateStore(
            client=self.redis,
            ttl_seconds=60,
            owner_scope=context.principal_id,
        )
        with patch.object(
            app_auth._VALIDATOR, "validate", return_value=context
        ), patch.object(
            responses, "AgentRunner", FakeRunner
        ), patch.object(
            responses, "ResponseStateStore", return_value=delegated_state
        ), patch.object(responses, "_remember_turn", AsyncMock()):
            reply = await self.app.test_client().post(
                "/v1/responses",
                json={"input": "delegated stream", "stream": True},
                headers={"Authorization": f"Bearer {token}"},
            )
            body = (await reply.get_data()).decode()
        self.assertEqual(reply.status_code, 200)
        self.assertIn("event: response.completed", body)
        self.assertNotIn(token, body)


    async def test_reasoning_effort_reaches_non_streaming_and_streaming_runner(self):
        with patch.object(responses, "AgentRunner", FakeRunner), patch.object(responses, "ResponseStateStore", return_value=self.state), patch.object(responses, "_remember_turn", AsyncMock()):
            client = self.app.test_client()
            headers = {"Authorization": f"Bearer {API_KEY}"}
            reply = await client.post("/v1/responses", json={
                "model": "coding", "input": "think", "stream": False,
                "reasoning": {"effort": "high"},
            }, headers=headers)
            self.assertEqual(reply.status_code, 200)
            body = await reply.get_json()
            self.assertEqual(body["reasoning"]["effort"], "high")
            self.assertEqual(FakeRunner.calls[-1][3], "high")

            streamed = await client.post("/v1/responses", json={
                "model": "coding", "input": "stream", "stream": True,
                "reasoning": {"effort": "medium"},
            }, headers=headers)
            self.assertEqual(streamed.status_code, 200)
            await streamed.get_data()
            self.assertEqual(FakeRunner.calls[-1][3], "medium")

    async def test_invalid_reasoning_effort_returns_openai_error(self):
        with patch.object(responses, "AgentRunner", FakeRunner), patch.object(responses, "ResponseStateStore", return_value=self.state):
            client = self.app.test_client()
            reply = await client.post("/v1/responses", json={
                "input": "hello", "stream": False,
                "reasoning": {"effort": "extreme"},
            }, headers={"Authorization": f"Bearer {API_KEY}"})
            self.assertEqual(reply.status_code, 400)
            body = await reply.get_json()
            self.assertEqual(body["error"]["type"], "invalid_request_error")
            self.assertIn("reasoning.effort", body["error"]["message"])

    def test_cli_session_alias_is_stable_and_private(self):
        first = canonical_conversation_id("my-project")
        self.assertEqual(first, canonical_conversation_id("my-project"))
        self.assertTrue(first.startswith("conv_"))
        self.assertNotIn("my-project", first)


if __name__ == "__main__":
    unittest.main()
