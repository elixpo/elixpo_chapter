import asyncio
import base64
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

from quart import Quart, Response

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lixsearch"))

from agentRuntime.state import ResponseStateStore
from commons.artifact_access import artifact_access_allowed, prepare_artifact_access
from commons.auth_context import (
    DelegatedCredentialError,
    RequestAuthContext,
    downstream_pollinations_key,
    pollinations_auth_headers,
    reset_request_auth,
    set_request_auth,
)

_auth_spec = importlib.util.spec_from_file_location(
    "agent_token_app_auth", ROOT / "lixsearch" / "app" / "auth.py"
)
app_auth = importlib.util.module_from_spec(_auth_spec)
sys.modules[_auth_spec.name] = app_auth
_auth_spec.loader.exec_module(app_auth)


def _agent_token(*, sub="parent-key-id", expires_in=300, request_id="req_test"):
    def encode(value):
        raw = json.dumps(value, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    now = int(time.time())
    return "ag_" + ".".join([
        encode({"alg": "HS256", "typ": "JWT"}),
        encode({
            "sub": sub,
            "parentRequestId": request_id,
            "iat": now,
            "exp": now + expires_in,
            "iss": "gen.pollinations.ai",
            "aud": "pollinations-api",
        }),
        "signature",
    ])


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


class AgentTokenValidatorTests(unittest.TestCase):
    def test_success_is_cached_by_fingerprint_without_raw_token(self):
        token = _agent_token()
        response = Mock(status_code=200)
        response.raise_for_status.return_value = None
        response.json.return_value = {"valid": True, "userId": "user-123"}
        validator = app_auth.AgentTokenValidator()

        with patch.object(app_auth.requests, "get", return_value=response) as get:
            first = validator.validate(token)
            second = validator.validate(token)

        self.assertEqual(get.call_count, 1)
        self.assertEqual(first.principal_id, second.principal_id)
        self.assertEqual(first.delegated_token, token)
        self.assertNotIn(token, repr(first))
        self.assertNotIn(token, validator._cache)
        self.assertIn(app_auth.AgentTokenValidator._fingerprint(token), validator._cache)

    def test_timeout_fails_closed(self):
        validator = app_auth.AgentTokenValidator()
        with patch.object(
            app_auth.requests,
            "get",
            side_effect=app_auth.requests.Timeout("validation unavailable"),
        ):
            with self.assertRaises(app_auth.AgentTokenValidationUnavailable):
                validator.validate(_agent_token())

    def test_malformed_and_expired_tokens_fail_before_remote_call(self):
        validator = app_auth.AgentTokenValidator()
        for token in ("ag_not-a-jwt", _agent_token(expires_in=-1)):
            with self.subTest(token=token[:16]):
                with self.assertRaises(app_auth.AgentTokenInvalid):
                    validator.validate(token)


class AgentTokenRequestTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.static_key = "local-static-test-key"
        self.token = _agent_token()
        self.context = RequestAuthContext(
            mode="delegated",
            principal_id="poll_test",
            delegated_token=self.token,
            expires_at=int(time.time()) + 300,
            parent_request_id="req_test",
        )
        self.app = Quart(__name__)
        app_auth.install_api_auth(self.app)

        async def endpoint():
            async def events():
                await asyncio.sleep(0)
                yield pollinations_auth_headers()["Authorization"]

            return Response(events(), content_type="text/plain")

        self.app.add_url_rule(
            "/v1/chat/completions", "completion", endpoint, methods=["POST"]
        )

    async def test_bearer_agent_token_survives_streaming_context(self):
        with patch.dict(os.environ, {"API_KEY": self.static_key}), patch.object(
            app_auth._VALIDATOR, "validate", return_value=self.context
        ):
            reply = await self.app.test_client().post(
                "/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.token}"},
            )
            self.assertEqual(reply.status_code, 200)
            self.assertEqual((await reply.get_data()).decode(), f"Bearer {self.token}")

    async def test_agent_token_is_rejected_outside_bearer_header(self):
        with patch.dict(os.environ, {"API_KEY": self.static_key}):
            header_reply = await self.app.test_client().post(
                "/v1/chat/completions", headers={"X-API-Key": self.token}
            )
            query_reply = await self.app.test_client().post(
                f"/v1/chat/completions?key={self.token}"
            )
        self.assertEqual(header_reply.status_code, 401)
        self.assertEqual(query_reply.status_code, 401)

    async def test_validation_outage_returns_openai_503(self):
        with patch.dict(os.environ, {"API_KEY": self.static_key}), patch.object(
            app_auth._VALIDATOR,
            "validate",
            side_effect=app_auth.AgentTokenValidationUnavailable(),
        ):
            reply = await self.app.test_client().post(
                "/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.token}"},
            )
        self.assertEqual(reply.status_code, 503)
        body = await reply.get_json()
        self.assertEqual(body["error"]["type"], "server_error")
        self.assertNotIn(self.token, json.dumps(body))

    async def test_parallel_requests_keep_their_own_credential(self):
        async def worker(name):
            token = _agent_token(sub=name, request_id=f"req_{name}")
            context = RequestAuthContext(
                mode="delegated",
                principal_id=f"poll_{name}",
                delegated_token=token,
                expires_at=int(time.time()) + 300,
            )
            marker = set_request_auth(context)
            try:
                await asyncio.sleep(0)
                return downstream_pollinations_key()
            finally:
                reset_request_auth(marker)

        first, second = await asyncio.gather(worker("one"), worker("two"))
        self.assertNotEqual(first, second)
        self.assertTrue(first.startswith("ag_"))
        self.assertTrue(second.startswith("ag_"))

    async def test_delegated_request_never_falls_back_to_server_key(self):
        context = RequestAuthContext(
            mode="delegated",
            principal_id="poll_missing",
            delegated_token=None,
            expires_at=int(time.time()) + 300,
        )
        marker = set_request_auth(context)
        try:
            with patch.dict(os.environ, {"POLLINATIONS_API_KEY": "server-key"}):
                with self.assertRaises(DelegatedCredentialError):
                    downstream_pollinations_key()
        finally:
            reset_request_auth(marker)

    async def test_direct_mode_uses_server_pollinations_key(self):
        marker = set_request_auth(
            RequestAuthContext(mode="static", principal_id="local")
        )
        try:
            with patch.dict(os.environ, {"POLLINATIONS_API_KEY": "server-key"}):
                self.assertEqual(downstream_pollinations_key(), "server-key")
        finally:
            reset_request_auth(marker)


class CallerIsolationTests(unittest.TestCase):
    def test_response_state_is_namespaced_by_caller(self):
        redis = FakeRedis()
        owner_a = ResponseStateStore(client=redis, owner_scope="caller-a")
        owner_b = ResponseStateStore(client=redis, owner_scope="caller-b")
        owner_a.save(
            response_id="resp_shared",
            conversation_id="conv_shared",
            previous_response_id=None,
            messages=[{"role": "user", "content": "private"}],
            model="auto",
            agent="auto",
        )
        self.assertIsNotNone(owner_a.get_response("resp_shared"))
        self.assertIsNone(owner_b.get_response("resp_shared"))
        with self.assertRaises(KeyError):
            owner_b.resolve_context(previous_response_id="resp_shared")

    def test_delegated_artifact_requires_independent_capability(self):
        token = _agent_token()
        context = RequestAuthContext(
            mode="delegated",
            principal_id="poll_artifact_owner",
            delegated_token=token,
            expires_at=int(time.time()) + 300,
        )
        marker = set_request_auth(context)
        try:
            with tempfile.TemporaryDirectory() as directory:
                capability = prepare_artifact_access(directory, "report")
                self.assertTrue(capability)
                self.assertTrue(artifact_access_allowed(directory, "report", capability))
                self.assertFalse(artifact_access_allowed(directory, "report", "wrong"))
                metadata = Path(directory, "report.access.json").read_text()
                self.assertNotIn(capability, metadata)
                self.assertNotIn(token, metadata)
        finally:
            reset_request_auth(marker)

    def test_nginx_passes_agent_tokens_only_to_openai_routes(self):
        config = (ROOT / "nginx.conf").read_text()
        self.assertIn("$openai_auth_result", config)
        self.assertIn("^/v1/(chat/completions|responses)$", config)
        search_block = config.rsplit("location /api/search", 1)[1].split("}", 1)[0]
        self.assertIn("$api_auth_result", search_block)
        self.assertNotIn("$openai_auth_result", search_block)


if __name__ == "__main__":
    unittest.main()
