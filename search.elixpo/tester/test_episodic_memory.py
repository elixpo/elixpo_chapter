import asyncio
import importlib.util
from pathlib import Path
import sys
import threading
from unittest import mock

from commons.auth_context import RequestAuthContext, reset_request_auth, set_request_auth
from sessions.episodic_memory import (
    EpisodeKind,
    EpisodicMemoryManager,
    EpisodicMemoryPayload,
    MemoryScope,
    continuation_episodic_context,
    request_memory_scope,
)
from ragService.vectorStore import VectorStore
from qdrant_client import QdrantClient, models

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location(
    "episodic_responses_gateway",
    ROOT / "lixsearch" / "app" / "gateways" / "responses.py",
)
responses = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = responses
_spec.loader.exec_module(responses)


class FakeEmbeddingService:
    def __init__(self):
        self.batch_calls = 0
        self.single_calls = 0

    def embed(self, texts, batch_size=32):
        self.batch_calls += 1
        return [[float(index + 1), 1.0] for index, _ in enumerate(texts)]

    def embed_single(self, text):
        self.single_calls += 1
        return [1.0, float(len(text) or 1)]


class FakeVectorStore:
    def __init__(self):
        self.points = {}
        self.last_filters = None

    def upsert_episodes(self, episodes):
        for episode in episodes:
            self.points[episode["point_id"]] = dict(episode)

    def search_episodes(self, embedding, *, filters, top_k):
        self.last_filters = dict(filters)
        rows = []
        for point in self.points.values():
            if all(point.get(key) == value for key, value in filters.items()):
                rows.append({"score": point.get("score", 0.9), "metadata": dict(point)})
        return rows[:top_k]

    def delete_episodes(self, *, filters):
        self.last_filters = dict(filters)
        self.points = {
            key: point for key, point in self.points.items()
            if not all(point.get(field) == value for field, value in filters.items())
        }

    def delete_expired_episodes(self, now):
        self.points = {
            key: point for key, point in self.points.items()
            if int(point.get("expires_at") or 0) >= now
        }


def _scope(user="user-a", session="session-a"):
    return MemoryScope(tenant_id="tenant-a", user_id=user, session_id=session)


def _payload(scope, episode_id, kind, text, created_at=None):
    return EpisodicMemoryPayload.create(
        scope=scope,
        episode_id=episode_id,
        kind=kind,
        text=text,
        created_at=created_at,
    )


def test_all_required_episode_types_are_explicit():
    assert {kind.value for kind in EpisodeKind} == {
        "user_intent", "final_answer", "evidence", "decision", "preference", "artifact"
    }


def test_request_scope_is_principal_and_session_scoped():
    token = set_request_auth(RequestAuthContext(mode="delegated", principal_id="poll_user_a"))
    try:
        assert request_memory_scope("conv_a", namespace="responses").filters() == {
            "tenant_id": "pollinations",
            "user_id": "poll_user_a",
            "session_id": "responses:conv_a",
        }
    finally:
        reset_request_auth(token)


def test_payload_identity_is_deterministic_for_idempotent_retries():
    first = _payload(_scope(), "resp_1", EpisodeKind.FINAL_ANSWER, "First answer")
    retry = _payload(_scope(), "resp_1", EpisodeKind.FINAL_ANSWER, "Updated answer")
    other = _payload(_scope(), "resp_2", EpisodeKind.FINAL_ANSWER, "First answer")
    assert first.point_id == retry.point_id
    assert first.point_id != other.point_id


def test_cpu_only_manager_reuses_injected_embedding_service_and_deduplicates_retries():
    embeddings = FakeEmbeddingService()
    vectors = FakeVectorStore()
    manager = EpisodicMemoryManager(embeddings, vectors)
    kwargs = dict(
        scope=_scope(), episode_id="resp_1", user_text="Compare databases",
        assistant_text="PostgreSQL is the best fit for this workload.",
    )
    assert manager.remember_turn(**kwargs) == 2
    assert manager.remember_turn(**kwargs) == 2
    assert len(vectors.points) == 2
    assert embeddings.batch_calls == 2


def test_recall_has_mandatory_scope_filters_and_no_cross_session_or_user_leakage():
    embeddings = FakeEmbeddingService()
    vectors = FakeVectorStore()
    manager = EpisodicMemoryManager(embeddings, vectors)
    manager.remember_turn(
        scope=_scope("user-a", "session-a"), episode_id="a",
        user_text="private alpha", assistant_text="alpha answer",
    )
    manager.remember_turn(
        scope=_scope("user-b", "session-a"), episode_id="b",
        user_text="private beta", assistant_text="beta answer",
    )
    manager.remember_turn(
        scope=_scope("user-a", "session-b"), episode_id="c",
        user_text="private gamma", assistant_text="gamma answer",
    )
    recalled = manager.recall(scope=_scope("user-a", "session-a"), query="private", min_score=0)
    assert recalled
    assert all(item["user_id"] == "user-a" and item["session_id"] == "session-a" for item in recalled)
    assert "beta" not in " ".join(item["text"] for item in recalled)
    assert "gamma" not in " ".join(item["text"] for item in recalled)
    assert vectors.last_filters == _scope("user-a", "session-a").filters()
    assert all(item["qdrant_ms"] < 50 for item in recalled)


def test_recall_drops_stale_and_duplicate_episodes_and_obeys_budgets():
    embeddings = FakeEmbeddingService()
    vectors = FakeVectorStore()
    manager = EpisodicMemoryManager(embeddings, vectors)
    scope = _scope()
    fresh = _payload(scope, "fresh", EpisodeKind.DECISION, "x" * 300)
    duplicate = _payload(scope, "duplicate", EpisodeKind.DECISION, "x" * 300)
    stale = _payload(scope, "stale", EpisodeKind.FINAL_ANSWER, "stale fact", created_at=1)
    for payload in (fresh, duplicate, stale):
        point = {**payload.to_dict(), "embedding": [1.0, 1.0], "score": 0.9}
        vectors.points[payload.point_id] = point
    recalled = manager.recall(
        scope=scope, query="x", top_k=2, max_chars=256, min_score=0,
    )
    assert len(recalled) == 1
    assert len(recalled[0]["text"]) == 256
    assert recalled[0]["factual_evidence"] is False
    assert all(item["text"] != "stale fact" for item in recalled)


def test_standalone_requests_never_receive_episodic_factual_text():
    memories = [{"kind": "final_answer", "text": "old price is 10"}]
    assert continuation_episodic_context("standalone", memories) == ""
    context = continuation_episodic_context("continuation", memories)
    assert "continuity only" in context
    assert "never cite" in context
    assert "Exact current-session turns are authoritative" in context


def test_vector_store_refuses_unscoped_episodic_retrieval():
    try:
        VectorStore._required_filter({"session_id": "session-a"})
    except ValueError as exc:
        assert "tenant_id" in str(exc) and "user_id" in str(exc)
    else:
        raise AssertionError("unscoped episodic filter was accepted")


def test_delete_hook_removes_only_the_exact_scope():
    embeddings = FakeEmbeddingService()
    vectors = FakeVectorStore()
    manager = EpisodicMemoryManager(embeddings, vectors)
    for user in ("user-a", "user-b"):
        manager.remember_turn(
            scope=_scope(user, "session-a"), episode_id=user,
            user_text=f"intent {user}", assistant_text=f"answer {user}",
        )
    manager.delete(_scope("user-a", "session-a"))
    assert all(point["user_id"] == "user-b" for point in vectors.points.values())


def test_retention_hook_removes_only_expired_episodes():
    vectors = FakeVectorStore()
    manager = EpisodicMemoryManager(FakeEmbeddingService(), vectors)
    stale = _payload(_scope(), "stale", EpisodeKind.USER_INTENT, "old", created_at=1)
    fresh = _payload(_scope(), "fresh", EpisodeKind.USER_INTENT, "new")
    for payload in (stale, fresh):
        vectors.points[payload.point_id] = payload.to_dict()
    manager.expire(now=fresh.created_at)
    assert stale.point_id not in vectors.points
    assert fresh.point_id in vectors.points


def test_qdrant_adapter_filters_and_deletes_by_full_scope_even_with_stale_local_count():
    client = QdrantClient(":memory:")
    client.create_collection(
        collection_name="episodes",
        vectors_config=models.VectorParams(size=2, distance=models.Distance.COSINE),
    )
    store = object.__new__(VectorStore)
    store.client = client
    store.collection_name = "episodes"
    store._ready = True
    store.chunk_count = 0
    store.lock = threading.RLock()
    episode = _payload(_scope(), "qdrant", EpisodeKind.PREFERENCE, "prefers concise reports")
    store.upsert_episodes([{**episode.to_dict(), "embedding": [1.0, 0.0]}])
    store.chunk_count = 0  # simulate a replica initialized before another replica wrote
    own = store.search_episodes([1.0, 0.0], filters=_scope().filters(), top_k=4)
    other = store.search_episodes(
        [1.0, 0.0], filters=_scope("other-user", "session-a").filters(), top_k=4,
    )
    assert len(own) == 1
    assert other == []
    store.delete_episodes(filters=_scope().filters())
    assert store.search_episodes([1.0, 0.0], filters=_scope().filters(), top_k=4) == []


def test_responses_exact_redis_history_outranks_and_skips_semantic_memory():
    class State:
        def resolve_context(self, **kwargs):
            return "conv_exact", [{"role": "assistant", "content": "exact hot state"}]

    async def run():
        with mock.patch.object(responses, "_recall_durable", mock.AsyncMock()) as recall:
            conversation_id, history = await responses._resolve_history(
                State(), previous_response_id=None, requested_conversation="conv_exact",
                request_history=[], query="continue",
            )
            await asyncio.sleep(0)
            assert conversation_id == "conv_exact"
            assert history == [{"role": "assistant", "content": "exact hot state"}]
            assert recall.call_count <= 1

    asyncio.run(run())


def test_responses_qdrant_recall_starts_while_redis_is_loading():
    recall_started = threading.Event()

    class State:
        def resolve_context(self, **kwargs):
            assert recall_started.wait(0.5)
            return "conv_parallel", []

    async def fake_recall(conversation_id, query):
        recall_started.set()
        await asyncio.sleep(0)
        return [{"role": "system", "content": "bounded memory"}]

    async def run():
        with mock.patch.object(responses, "_recall_durable", side_effect=fake_recall):
            conversation_id, history = await responses._resolve_history(
                State(), previous_response_id=None, requested_conversation="conv_parallel",
                request_history=[], query="continue",
            )
            assert conversation_id == "conv_parallel"
            assert history[0]["content"] == "bounded memory"

    asyncio.run(run())


def test_new_responses_conversation_does_not_initialize_durable_recall():
    class State:
        def resolve_context(self, **kwargs):
            return "conv_new", []

    async def run():
        with mock.patch.object(responses, "_recall_durable", mock.AsyncMock()) as recall:
            conversation_id, history = await responses._resolve_history(
                State(), previous_response_id=None, requested_conversation=None,
                request_history=[], query="hello",
            )
            assert conversation_id == "conv_new"
            assert history == []
            recall.assert_not_called()

    asyncio.run(run())
