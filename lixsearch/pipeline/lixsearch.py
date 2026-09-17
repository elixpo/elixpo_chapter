from datetime import datetime, timezone
from loguru import logger
from ragService.semanticCacheRedis import SemanticCacheRedis as SemanticCache
import random
import requests
import json
import re
from pipeline.tools import tools
from sessions.conversation_cache import ConversationCacheManager
from sessions.clarification import (
    ClarificationNeed,
    ResolutionAction,
    TaskStatus,
    apply_resolution,
    create_pending_task,
    has_decision_contract,
    has_resolution_contract,
    parse_clarification_need,
    parse_resolution,
    pending_for_request,
    task_with_status,
)
from sessions.ledger import LedgerSessionContext
from sessions.request_context import DeliverableKind, build_request_context
from sessions.episodic_memory import continuation_episodic_context, request_memory_scope
from graphMemory.client import GraphMemoryClient, format_graph_context

import os
from commons.environment import load_local_environment
from commons.auth_context import pollinations_auth_headers
from pipeline.config import *
from pipeline.instruction import direct_system_instruction, system_instruction, user_instruction, synthesis_instruction
from pipeline.optimized_tool_execution import optimized_tool_execution
from pipeline.utils import format_sse, clean_url, clean_source_list
from pipeline.sse_messages import SSEStatusTracker
from pipeline.streaming import TaskAwareChunkBuffer
from pipeline.helpers import (
    _scrub_tool_names,
    get_user_message,
    _looks_like_internal_reasoning,
    _evaluate_fetch_quality,
    sanitize_final_response,
    extract_leaked_tool_call,
    StreamingTagFilter,
)
from pipeline.synthesis import (
    run_standard_synthesis,
    build_synthesis_fallback,
    re_retrieve_rag_context,
    run_detailed_synthesis,
)
from pipeline.response_builder import (
    is_placeholder_or_fallback,
    try_image_synthesis,
    auto_generate_pdf,
    assemble_images,
    append_sources,
    build_fallback_response,
    save_to_caches,
    normalize_pdf_document,
    requested_coverage_gap,
    requested_day_count,
    missing_local_date_anchor,
    artifact_ledger_fields,
)
from pipeline.deep_search import _run_deep_search_pipeline
from functionCalls.getImagePrompt import describe_image, replyFromImage
import asyncio
import uuid

load_local_environment()

MODEL = LLM_MODEL
MODEL_FALLBACK = LLM_MODEL_FALLBACK


async def _recall_session_episodes(core_service, scope, query: str) -> list[dict]:
    if core_service is None or scope is None:
        return []
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(
                core_service.recall_episodes,
                scope.filters(),
                query,
                EPISODIC_MEMORY_TOP_K,
                EPISODIC_MEMORY_MAX_CHARS,
            ),
            timeout=EPISODIC_MEMORY_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.debug(f"[EpisodicMemory] Recall skipped: {exc}")
        return []


async def _remember_session_episode(core_service, scope, episode_id, user_text, assistant_text,
                                    source_turn_ids, evidence_ids, artifact_ids) -> None:
    if core_service is None or scope is None or not assistant_text:
        return
    try:
        await asyncio.wait_for(
            asyncio.to_thread(
                core_service.remember_episodes,
                scope.filters(),
                episode_id,
                user_text,
                assistant_text,
                list(source_turn_ids),
                list(evidence_ids),
                list(artifact_ids),
            ),
            timeout=max(2.0, EPISODIC_MEMORY_TIMEOUT_SECONDS * 4),
        )
    except Exception as exc:
        logger.debug(f"[EpisodicMemory] Write skipped: {exc}")


async def _recall_cached_graph(scope) -> list[dict]:
    """One Redis GET only; graph traversal and writes stay off the request path."""
    if scope is None or not GRAPH_MEMORY_ENABLED:
        return []
    try:
        return await asyncio.to_thread(GraphMemoryClient().get_cached_for_request, scope)
    except Exception as exc:
        logger.debug(f"[GraphMemory] Cached neighborhood skipped: {exc}")
        return []


_DECISION_INSTRUCTION = """Classify tool need, conversation dependence, and absent inputs. Never answer the request.
Return only JSON: {"mode":"DIRECT|TOOLS","context":"STANDALONE|CONTINUATION","clarification":{"required":false,"blocking_fields":[],"defaultable_fields":[],"questions":{}}}.
Use exact snake_case field names. Put only indispensable inputs in blocking_fields. Put optional preferences and output metadata in defaultable_fields. For every blocking field, questions must contain one concise question under the identical key.
TOOLS: live/current facts, search, URL reading, time zones, images, audio, YouTube, artifact creation, or multi-step research.
DIRECT: greetings, casual conversation, opinions, explanations, writing, coding, math, and stable knowledge.
CONTINUATION: the request cannot be interpreted correctly without earlier turns because it refers to earlier content or continues earlier work.
STANDALONE: the request states a complete subject and desired output. A new result remains standalone even when its output is an artifact; transforming an earlier result is a continuation.
Identity, user-owned values, credentials, authorization decisions, irreversible choices, and genuinely required scope are blocking. Preferences and output metadata are always safely defaultable and never block execution. Output names, titles, styling, layout, verbosity, and presentation belong in defaultable_fields unless the user explicitly made a particular value mandatory. A count, category, pronoun, generic label, or placeholder is not an identity. A referent supplied by conversation context is not absent. Set required=true exactly when blocking_fields is non-empty. Defaultable fields must never appear in questions. The runtime ignores defaultable_fields when constructing clarification state.
Attached images require TOOLS."""


_RESOLUTION_INSTRUCTION = """Resolve a reply against one pending clarification task.
Return only JSON: {"action":"resolve|partial|unrelated|cancel|replace","values":{},"defaulted_fields":[],"question":"","replacement_request":""}.
resolve: the reply plus the original request makes the task executable. Put explicitly supplied information under exact missing-field keys in values. Put any remaining nonessential fields that have safe, reversible, context-appropriate defaults in defaulted_fields.
partial: indispensable information is still absent; include supplied values, any safely defaulted fields, and one concise question covering only what remains indispensable.
unrelated: it does not answer or complete the pending task; keep values and defaulted_fields empty and repeat or improve the concise question.
cancel: it clearly cancels the pending task.
replace: it clearly requests a different task; put that complete new request in replacement_request.
Never default an identity, secret, user-owned value, authorization decision, or irreversible choice. Never invent supplied values, never treat an unrelated reply as an answer, and never execute the task."""


def _parse_decision_mode(content: str) -> str:
    match = re.search(r"\b(DIRECT|TOOLS)\b", content or "", re.IGNORECASE)
    return match.group(1).lower() if match else "tools"


def _parse_context_mode(content: str) -> str:
    match = re.search(r"\b(STANDALONE|CONTINUATION)\b", content or "", re.IGNORECASE)
    return match.group(1).lower() if match else "standalone"


def _may_stream_uncommitted_output(
    event_id: str | None,
    *,
    has_tools: bool,
    artifact_requested: bool,
) -> bool:
    """Allow progressive output only when no validation/export commit is pending."""
    return bool(event_id) and not has_tools and not artifact_requested


def _enforce_capability_route(request_mode: str, *, artifact_requested: bool) -> str:
    """Keep explicit artifact work on the tool-capable orchestration path."""
    if artifact_requested and request_mode == "direct":
        return "tools"
    return request_mode


async def _decide_request_mode(
    user_query: str,
    image_count: int,
    headers: dict,
    context_excerpt: str = "",
) -> tuple[str, str, object]:
    """Return the first valid decision from redundant bounded routers."""
    query = user_query or "(no text)"
    if image_count:
        query += f"\n[Attached images: {image_count}]"
    if context_excerpt:
        query += f"\n[Available conversation context]\n{context_excerpt[:1200]}"

    messages = [
        {"role": "system", "content": _DECISION_INSTRUCTION},
        {"role": "user", "content": query},
    ]
    models = list(dict.fromkeys((LLM_DECISION_MODEL, LLM_MODEL_FALLBACK)))

    def _call(model):
        response = requests.post(
            POLLINATIONS_ENDPOINT,
            json={
                "model": model,
                "messages": messages,
                "max_tokens": 260,
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            headers=headers,
            timeout=max(LLM_DECISION_TIMEOUT_SECONDS, 5.0),
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"].get("content", "")
        if not has_decision_contract(content):
            raise ValueError(f"router model {model} returned an invalid contract")
        return (
            _parse_decision_mode(content),
            _parse_context_mode(content),
            parse_clarification_need(content),
        )

    tasks = [asyncio.create_task(asyncio.to_thread(_call, model)) for model in models]
    try:
        for completed in asyncio.as_completed(tasks):
            try:
                mode, context_mode, clarification = await completed
                for task in tasks:
                    if not task.done():
                        task.cancel()
                logger.debug(
                    f"[pipeline] request_mode={mode} context_mode={context_mode}"
                )
                logger.info(
                    "[clarification] route required={} blocking_fields={}",
                    clarification.required,
                    list(clarification.missing_fields),
                )
                return mode, context_mode, clarification
            except Exception as exc:
                logger.warning(f"[pipeline] request router attempt failed: {exc}")
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()

    # Routing is an admission boundary. If every bounded router fails, do not
    # let the more permissive tool orchestrator guess at an underspecified
    # request. Persist one generic, resolvable field so the next turn can
    # continue the original task in the same session.
    logger.error("[pipeline] every request router failed; requesting safe clarification")
    return (
        "tools",
        "standalone",
        ClarificationNeed(
            required=True,
            missing_fields=("request_details",),
            question="What specific subject or inputs should I use for this request?",
        ),
    )


async def _resolve_pending_clarification(
    active_task: dict,
    pending: dict,
    user_reply: str,
    headers: dict,
):
    base_messages = [
        {"role": "system", "content": _RESOLUTION_INSTRUCTION},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "active_task": active_task,
                    "pending_clarification": pending,
                    "reply": user_reply,
                },
                ensure_ascii=False,
            ),
        },
    ]
    models = list(dict.fromkeys((LLM_DECISION_MODEL, LLM_MODEL_FALLBACK)))

    def _call(model):
        response = requests.post(
            POLLINATIONS_ENDPOINT,
            json={
                "model": model,
                "messages": base_messages,
                "max_tokens": 220,
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            headers=headers,
            timeout=max(LLM_DECISION_TIMEOUT_SECONDS, 5.0),
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"].get("content", "")
        if not has_resolution_contract(content):
            raise ValueError(f"resolver model {model} returned an invalid contract")
        return parse_resolution(content)

    tasks = [asyncio.create_task(asyncio.to_thread(_call, model)) for model in models]
    try:
        for completed in asyncio.as_completed(tasks):
            try:
                resolution = await completed
                for task in tasks:
                    if not task.done():
                        task.cancel()
                return resolution
            except Exception as exc:
                logger.warning(f"[pipeline] clarification resolver attempt failed: {exc}")
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()

    # The admission fallback creates exactly one generic field. Its answer is
    # the user's next explicit message, so it can be bound without semantic
    # guessing when resolver models are unavailable. All model-declared fields
    # remain fail-closed.
    missing_fields = tuple(pending.get("missing_fields") or ())
    reply = (user_reply or "").strip()
    if missing_fields == ("request_details",) and reply:
        logger.warning("[pipeline] resolver unavailable; binding generic request details")
        return parse_resolution(json.dumps({
            "action": "resolve",
            "values": {"request_details": reply},
            "defaulted_fields": [],
            "question": "",
            "replacement_request": "",
        }))

    logger.warning("[pipeline] every clarification resolver failed safely")
    return parse_resolution("")

async def _stream_llm_call(payload: dict, headers: dict):
    """Stream an LLM call from Pollinations. Yields ("content", str) for text
    deltas and ("done", assistant_message_dict) when finished. Tool call deltas
    are accumulated silently and returned in the final message.
    Yields ("keepalive", None) every few seconds while waiting for the first token."""
    loop = asyncio.get_event_loop()
    queue = asyncio.Queue()

    def _blocking_stream():
        try:
            with requests.post(
                POLLINATIONS_ENDPOINT, json={**payload, "stream": True},
                headers=headers, stream=True, timeout=55,
            ) as r:
                r.raise_for_status()
                for line in r.iter_lines(decode_unicode=True):
                    if line:
                        loop.call_soon_threadsafe(queue.put_nowait, line)
        except Exception as e:
            loop.call_soon_threadsafe(queue.put_nowait, e)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    asyncio.ensure_future(asyncio.to_thread(_blocking_stream))

    content = ""
    tool_calls = []
    got_first_token = False
    _keepalive_count = 0

    while True:
        try:
            line = await asyncio.wait_for(queue.get(), timeout=8.0)
        except asyncio.TimeoutError:
            if not got_first_token and _keepalive_count < 7:
                _keepalive_count += 1
                yield ("keepalive", None)
                continue
            break
        if line is None:
            break
        if isinstance(line, Exception):
            raise line
        if not isinstance(line, str) or not line.startswith("data: "):
            continue
        data_str = line[6:]
        if data_str.strip() == "[DONE]":
            break
        try:
            obj = json.loads(data_str)
            choices = obj.get("choices", [])
            if not choices:
                continue
            delta = choices[0].get("delta", {})

            if "content" in delta and delta["content"]:
                got_first_token = True
                content += delta["content"]
                yield ("content", delta["content"])

            if "tool_calls" in delta:
                for tc_delta in delta["tool_calls"]:
                    idx = tc_delta.get("index", 0)
                    while len(tool_calls) <= idx:
                        tool_calls.append({"id": "", "type": "function",
                                           "function": {"name": "", "arguments": ""}})
                    if "id" in tc_delta:
                        tool_calls[idx]["id"] = tc_delta["id"]
                    if "function" in tc_delta:
                        fn = tc_delta["function"]
                        if "name" in fn:
                            tool_calls[idx]["function"]["name"] += fn["name"]
                        if "arguments" in fn:
                            tool_calls[idx]["function"]["arguments"] += fn["arguments"]

            if choices[0].get("finish_reason"):
                break
        except json.JSONDecodeError:
            continue

    message = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls
    yield ("done", message)

async def run_elixposearch_pipeline(user_query: str, user_image: str, event_id: str = None,
                                     session_id: str = None, user_images: list = None,
                                     chat_history: list = None, is_ephemeral: bool = False):
    if user_images is None:
        user_images = [user_image] if user_image else []
    if not user_image and user_images:
        user_image = user_images[0]

    import time as _time
    _pipeline_start = _time.time()
    logger.info(f"[pipeline] session={session_id} model={MODEL} fallback={MODEL_FALLBACK} query='{user_query[:LOG_MESSAGE_QUERY_TRUNCATE]}...' images={len(user_images)}")

    if session_id and not is_ephemeral:
        try:
            from sessions.main import get_session_manager
            sm = get_session_manager()
            if not sm.get_session(session_id):
                sm.create_session(user_query or "(image query)", session_id=session_id)
        except Exception:
            pass

    def emit_event(event_type, message):
        if event_id:
            return format_sse(event_type, message)
        return None

    original_user_query = user_query or ""
    image_only_mode = bool(user_image and not original_user_query.strip())

    initial_event = emit_event("INFO", get_user_message("processing"))
    if initial_event:
        yield initial_event

    # Search depth comes from scoped model tool calls, never keyword matching.
    is_detailed_mode = False
    active_min_links = MIN_LINKS_TO_TAKE_DETAILED if is_detailed_mode else MIN_LINKS_TO_TAKE
    active_max_links = MAX_LINKS_TO_TAKE_DETAILED if is_detailed_mode else MAX_LINKS_TO_TAKE
    active_max_tokens = LLM_MAX_TOKENS_DETAILED if is_detailed_mode else LLM_MAX_TOKENS
    active_max_sources = MAX_SOURCES_DETAILED if is_detailed_mode else MAX_SOURCES_STANDARD
    active_sources_per_search = SOURCES_PER_SEARCH

    status_tracker = SSEStatusTracker(emit_fn=emit_event, stale_threshold=10.0)
    semantic_cache = None
    memoized_results = {}
    session_context = None
    session_lock_token = None
    ledger_request_id = event_id or uuid.uuid4().hex
    task_failed = False
    episodic_recall_task = None
    graph_recall_task = None
    episodic_scope = None

    try:
        current_utc_time = datetime.now(timezone.utc)
        headers = pollinations_auth_headers()
        try:
            from ipcService.coreServiceManager import get_core_embedding_service
            core_service = get_core_embedding_service()
        except Exception:
            core_service = None

        memoized_results = {
            "timezone_info": {}, "web_searches": {}, "fetched_urls": {},
            "youtube_metadata": {}, "youtube_transcripts": {}, "base64_cache": {},
            "context_sufficient": False, "cache_hit": False, "cached_response": None,
            "session_id": session_id or "", "generated_images": [],
        }

        if session_id and not is_ephemeral:
            episodic_scope = request_memory_scope(session_id, namespace="search")
            memoized_results["memory_scope"] = episodic_scope

        if session_id and not is_ephemeral and core_service is not None:
            episodic_recall_task = asyncio.create_task(
                _recall_session_episodes(core_service, episodic_scope, original_user_query)
            )
        if session_id and not is_ephemeral and GRAPH_MEMORY_ENABLED:
            graph_recall_task = asyncio.create_task(_recall_cached_graph(episodic_scope))

        # --- Session context (skip for ephemeral — no history to load or persist) ---
        previous_messages = []
        snapshot = None
        source_turn = 0
        if session_id and not is_ephemeral:
            try:
                session_context = LedgerSessionContext(session_id=session_id)
                session_lock_token = await asyncio.to_thread(session_context.ledger.acquire_lock)
                if not session_lock_token:
                    raise RuntimeError(f"session {session_id} is busy")
                memoized_results["session_context"] = session_context
                snapshot = await asyncio.to_thread(session_context.ledger.load_snapshot)
                previous_messages = snapshot.messages
                memoized_results["session_snapshot"] = snapshot
                memoized_results["ledger_request_id"] = ledger_request_id
                source_turn = session_context.add_message(
                    role="user",
                    content=user_query,
                    metadata={"request_id": f"{ledger_request_id}:user"},
                )
                logger.info(f"[Pipeline] Session {session_id}: {len(previous_messages)} hot messages")
            except Exception as exc:
                if session_context and session_lock_token:
                    try:
                        await asyncio.to_thread(session_context.ledger.release_lock, session_lock_token)
                    except Exception:
                        pass
                    session_lock_token = None
                session_context = None
                logger.error(f"[Pipeline] Session ledger unavailable: {exc}")
                raise

        resolved_pending_task = False

        # Pending clarification is resolved before general routing. Only the
        # same durable session can load and consume this state.
        request_pending = pending_for_request(snapshot, session_id, is_ephemeral)
        if request_pending:
            memoized_results["active_task"] = snapshot.active_task or {}
            memoized_results["pending_clarification"] = request_pending
            memoized_results["suppress_pdf_export"] = True
            resolution = await _resolve_pending_clarification(
                snapshot.active_task or {},
                snapshot.pending_clarification,
                user_query,
                headers,
            )
            logger.info(
                "[clarification] resolution action={} supplied_fields={} defaulted_fields={}",
                resolution.action.value,
                sorted(resolution.values),
                list(resolution.defaulted_fields),
            )
            next_task, next_pending, executable_request = apply_resolution(
                snapshot.active_task or {},
                snapshot.pending_clarification,
                resolution,
            )
            await asyncio.to_thread(
                session_context.ledger.set_task_state,
                active_task=next_task or None,
                pending_clarification=next_pending,
            )
            memoized_results["active_task"] = next_task
            memoized_results["pending_clarification"] = next_pending

            if resolution.action == ResolutionAction.CANCEL:
                reply = "Got it — I’ve cancelled that request."
                memoized_results["final_response"] = reply
                memoized_results["task_terminal"] = True
                if event_id:
                    yield format_sse("RESPONSE", reply)
                    yield format_sse("INFO", "<TASK>DONE</TASK>")
                else:
                    yield reply
                return

            if resolution.action == ResolutionAction.REPLACE and executable_request:
                user_query = executable_request
                original_user_query = executable_request
                memoized_results["suppress_pdf_export"] = False
            elif executable_request:
                user_query = executable_request
                original_user_query = executable_request
                memoized_results["suppress_pdf_export"] = False
                resolved_pending_task = True
            else:
                question = (
                    (next_pending or {}).get("question")
                    or request_pending.get("question")
                    or "Could you clarify the missing information?"
                )
                memoized_results["final_response"] = question
                memoized_results["clarification_blocked"] = True
                if event_id:
                    yield format_sse("RESPONSE", question)
                    yield format_sse("INFO", "<TASK>DONE</TASK>")
                else:
                    yield question
                return

        context_messages = chat_history if chat_history is not None else previous_messages
        request_context = build_request_context(
            request_id=ledger_request_id,
            current_request=original_user_query,
            source_turn_id=source_turn,
            messages=context_messages or (),
            active_task=(
                memoized_results.get("active_task")
                if "active_task" in memoized_results
                else (snapshot.active_task if snapshot else None)
            ),
            pending_clarification=(
                memoized_results.get("pending_clarification")
                if "pending_clarification" in memoized_results
                else (snapshot.pending_clarification if snapshot else None)
            ),
        )
        memoized_results["request_context"] = request_context
        context_excerpt = request_context.routing_excerpt()
        if (
            request_context.requested_deliverable
            and request_context.requested_deliverable.kind == DeliverableKind.PDF
            and request_context.referent_source
        ):
            memoized_results["continuation_pdf_content"] = (
                request_context.referent_source.content
            )
        decision_task = None
        if resolved_pending_task:
            stored_routing = (memoized_results.get("active_task") or {}).get("routing") or {}
            request_mode = stored_routing.get("mode") or "tools"
            context_mode = "standalone"
            clarification = ClarificationNeed()
        else:
            decision_task = asyncio.create_task(
                _decide_request_mode(
                    original_user_query,
                    len(user_images),
                    headers,
                    context_excerpt=context_excerpt,
                )
            )

        # --- Conversation cache + Semantic cache (skip for ephemeral — no history) ---
        conversation_cache = None
        if session_id and not is_ephemeral:
            _embed_fn = core_service.embed_single_text if core_service else None
            conversation_cache = ConversationCacheManager(
                window_size=CACHE_WINDOW_SIZE, max_entries=CACHE_MAX_ENTRIES,
                ttl_seconds=CACHE_TTL_SECONDS, compression_method=CACHE_COMPRESSION_METHOD,
                embedding_model=CACHE_EMBEDDING_MODEL, similarity_threshold=CACHE_SIMILARITY_THRESHOLD,
                cache_dir=CONVERSATION_CACHE_DIR, embed_fn=_embed_fn,
            )
            memoized_results["conversation_cache"] = conversation_cache
            conversation_cache.load_from_disk(session_id=session_id)

            semantic_cache = SemanticCache(
                session_id=session_id,
                ttl_seconds=SEMANTIC_CACHE_TTL_SECONDS,
                similarity_threshold=SEMANTIC_CACHE_SIMILARITY_THRESHOLD,
                redis_host=SEMANTIC_CACHE_REDIS_HOST,
                redis_port=SEMANTIC_CACHE_REDIS_PORT,
                redis_db=SEMANTIC_CACHE_REDIS_DB
            )
            semantic_cache.load_for_request(session_id)

        if decision_task is not None:
            request_mode, context_mode, clarification = await decision_task

        episodic_memories = []
        graph_memories = []
        if episodic_recall_task is not None:
            if context_mode == "continuation":
                episodic_memories = await episodic_recall_task
            else:
                episodic_recall_task.cancel()
            episodic_recall_task = None
        if graph_recall_task is not None:
            if context_mode == "continuation":
                graph_memories = await graph_recall_task
            else:
                graph_recall_task.cancel()
            graph_recall_task = None

        _pdf_requested = any(
            keyword in original_user_query.lower()
            for keyword in ("pdf", "export", "save as", "document", "download")
        )
        enforced_mode = _enforce_capability_route(
            request_mode,
            artifact_requested=_pdf_requested,
        )
        if enforced_mode != request_mode:
            logger.warning(
                "[pipeline] overriding contradictory direct route for explicit artifact request"
            )
            request_mode = enforced_mode

        if clarification.required:
            memoized_results["suppress_pdf_export"] = True
            memoized_results["clarification_blocked"] = True
            if session_context:
                active_task, pending = create_pending_task(
                    original_user_query,
                    clarification.missing_fields,
                    clarification.question,
                    source_turn=source_turn,
                    request_id=ledger_request_id,
                    routing={"mode": request_mode, "context": context_mode},
                )
                await asyncio.to_thread(
                    session_context.ledger.set_task_state,
                    active_task=active_task,
                    pending_clarification=pending,
                )
                memoized_results["active_task"] = active_task
                memoized_results["pending_clarification"] = pending
            memoized_results["final_response"] = clarification.question
            if event_id:
                yield format_sse("RESPONSE", clarification.question)
                yield format_sse("INFO", "<TASK>DONE</TASK>")
            else:
                yield clarification.question
            return

        if session_context:
            current_task = memoized_results.get("active_task") or {}
            if current_task.get("status") == TaskStatus.READY_TO_EXECUTE.value:
                active_task = task_with_status(current_task, TaskStatus.ACTIVE)
            else:
                active_task = task_with_status(
                    {
                        "original_request": original_user_query,
                        "source_turn": source_turn,
                        "request_id": ledger_request_id,
                    },
                    TaskStatus.ACTIVE,
                )
            await asyncio.to_thread(
                session_context.ledger.set_task_state,
                active_task=active_task,
                pending_clarification=None,
            )
            memoized_results["active_task"] = active_task
            memoized_results["pending_clarification"] = None

        # --- Image handling ---
        image_context_provided = False
        image_analysis_result = None
        _active_images = user_images if user_images else ([user_image] if user_image else [])
        _num_images = len(_active_images)

        if image_only_mode:
            try:
                image_event = emit_event("INFO", f"<TASK>Analyzing {_num_images} image{'s' if _num_images > 1 else ''}</TASK>")
                if image_event:
                    yield image_event
                descriptions = await asyncio.gather(
                    *[describe_image(img) for img in _active_images], return_exceptions=True,
                )
                parts = []
                for idx, desc in enumerate(descriptions):
                    if isinstance(desc, Exception):
                        continue
                    parts.append(f"### Image {idx+1}\n\n{desc}" if _num_images > 1 else desc)
                image_description = "\n\n".join(parts) if parts else ""
                if not image_description:
                    raise RuntimeError("All image descriptions failed")
                done_event = emit_event("INFO", "<TASK>Image analysis complete</TASK>")
                if done_event:
                    yield done_event
                if event_id:
                    for i in range(0, len(image_description), 80):
                        yield format_sse("RESPONSE", image_description[i:i+80])
                    yield format_sse("INFO", "<TASK>DONE</TASK>")
                else:
                    yield image_description
                memoized_results["final_response"] = image_description
                if session_id and semantic_cache is not None:
                    semantic_cache.save_for_request(session_id)
                return
            except Exception:
                user_query = "describe this image"
        elif _active_images and user_query.strip():
            try:
                image_event = emit_event("INFO", f"<TASK>Analyzing {_num_images} image{'s' if _num_images > 1 else ''}</TASK>")
                if image_event:
                    yield image_event
                analyses = await asyncio.gather(
                    *[replyFromImage(img, user_query) for img in _active_images], return_exceptions=True,
                )
                parts = []
                for idx, analysis in enumerate(analyses):
                    if isinstance(analysis, Exception):
                        continue
                    parts.append(f"[Image {idx+1} Analysis]\n{analysis}" if _num_images > 1 else analysis)
                image_analysis_result = "\n\n".join(parts) if parts else None
                if image_analysis_result:
                    image_context_provided = True
                done_event = emit_event("INFO", f"<TASK>Image{'s' if _num_images > 1 else ''} analyzed</TASK>")
                if done_event:
                    yield done_event
            except Exception:
                image_context_provided = False

        # --- Tool loop ---
        max_iterations = 3
        current_iteration = 0
        collected_sources = []
        collected_images_from_web = []
        collected_similar_images = []
        final_message_content = None
        tool_call_count = 0

        # Request memory is opt-in through the recall-memory tool. Automatically
        # mixing semantic memory into a self-contained live-web request can turn
        # old, merely similar text into apparent evidence.
        rag_context = ""

        # --- One bounded DB4 lookup shared by every replica; fail open. ---
        global_revelations = ""
        try:
            from agentRuntime.global_memory import get_global_memory_store
            global_revelations = await asyncio.to_thread(get_global_memory_store().get_context)
        except Exception as e:
            logger.debug(f"[GlobalMemory] Read skipped: {e}")

        # --- Compact mood signals reuse already-loaded history; no extra model or Redis call. ---
        _signal_messages = chat_history if chat_history is not None else previous_messages
        _prior_user_turns = sum(1 for _m in _signal_messages if _m.get("role") == "user")
        _signal_last_ts = next((_m.get("timestamp") for _m in reversed(_signal_messages) if _m.get("timestamp")), None)
        _minutes_since_last = "unknown"
        _continuity = "new" if _prior_user_turns == 0 else "continuing"
        if _signal_last_ts:
            try:
                _gap_seconds = max(0, current_utc_time.timestamp() - float(_signal_last_ts))
                _minutes_since_last = str(int(_gap_seconds / 60))
                if _gap_seconds >= 3600:
                    _continuity = "returning"
            except (TypeError, ValueError):
                pass
        interaction_signals = (
            f"request_number={_prior_user_turns + 1}; continuity={_continuity}; "
            f"minutes_since_last={_minutes_since_last}"
        )

        # --- Build initial messages ---
        user_msg_content = user_instruction(user_query, user_image if not image_analysis_result else None, is_detailed=is_detailed_mode)
        if image_analysis_result:
            user_msg_content += f"\n\n[Image Analysis]\n{image_analysis_result}"

        messages = [
            {"role": "system", "name": "elixposearch-agent-system",
             "content": system_instruction(rag_context, current_utc_time, is_detailed=is_detailed_mode, session_id=session_id, interaction_signals=interaction_signals, global_revelations=global_revelations)},
        ]
        episodic_context = continuation_episodic_context(context_mode, episodic_memories)
        if episodic_context:
            messages.append({"role": "system", "content": episodic_context})
        graph_context = format_graph_context(graph_memories)
        if graph_context:
            messages.append({"role": "system", "content": graph_context})
        direct_prompt = direct_system_instruction(
            current_utc_time, session_id=session_id, interaction_signals=interaction_signals,
            global_revelations=global_revelations, rag_context="",
        )

        # Explicit OpenAI messages history is authoritative. Server-loaded
        # session history enters only genuine continuation requests.
        _injected_history = 0
        _history_token_budget = HISTORY_TOKEN_BUDGET_DETAILED if is_detailed_mode else HISTORY_TOKEN_BUDGET
        _history_tokens_used = 0
        _last_msg_ts = None

        if chat_history:
            for msg in chat_history:
                _role = msg.get("role", "user")
                _content = msg.get("content", "")
                if _role in ("user", "assistant") and _content:
                    _msg_tokens = len(_content) // 4
                    if _history_tokens_used + _msg_tokens > _history_token_budget:
                        break
                    messages.append({"role": _role, "content": _content})
                    _history_tokens_used += _msg_tokens
                    _injected_history += 1
        elif context_mode == "continuation" and session_id and session_context:
            try:
                _prev = previous_messages
                _trimmed = []
                for msg in reversed(_prev):
                    _content = msg.get("content", "")
                    _msg_tokens = len(_content) // 4
                    if _history_tokens_used + _msg_tokens > _history_token_budget:
                        break
                    _trimmed.insert(0, msg)
                    _history_tokens_used += _msg_tokens
                for msg in _trimmed:
                    _role = msg.get("role", "user")
                    _content = msg.get("content", "")
                    _ts = msg.get("timestamp")
                    if _role in ("user", "assistant") and _content:
                        messages.append({"role": _role, "content": _content})
                        _injected_history += 1
                        if _ts:
                            _last_msg_ts = float(_ts)
            except Exception as e:
                logger.warning(f"[Pipeline] Failed to inject conversation history: {e}")

        # Inject timing context for returning users
        if _injected_history > 0 and _last_msg_ts:
            try:
                _gap = current_utc_time.timestamp() - _last_msg_ts
                _note = None
                if _gap > 86400:
                    _note = f"The user is returning after {int(_gap // 86400)} day(s) away."
                elif _gap > 3600:
                    _note = f"The user is returning after {int(_gap // 3600)} hour(s) away."
                if _note:
                    messages.append({
                        "role": "system",
                        "content": f"[Private context — do NOT mention this in your response] {_note}"
                    })
            except Exception:
                pass

        messages.append({"role": "user", "content": user_msg_content})
        force_synthesis = False

        # Detect meta-queries (summaries, recaps)
        _query_lower = user_query.lower()
        _meta_keywords = ["summarize", "summary", "recap", "what did we", "what have we",
                          "conversation so far", "previous conversation", "our conversation",
                          "what we discussed", "what we talked", "chat history"]
        if _injected_history >= 2 and any(kw in _query_lower for kw in _meta_keywords):
            force_synthesis = True

        # ==================== TOOL LOOP ====================
        _streamed_content = ""
        while current_iteration < max_iterations:
            current_iteration += 1

            # Ensure all assistant messages have content
            for m in messages:
                if m.get("role") == "assistant" and not m.get("content"):
                    m["content"] = f"Executing {len(m.get('tool_calls', []))} tool(s)..." if m.get("tool_calls") else "Processing..."

            # Trim context if too long
            if len(messages) > 20:
                _system = [messages[0]]
                _tool_msgs = messages[-6:]
                _history_msgs = messages[1:-6]
                if len(_history_msgs) > 8:
                    _history_msgs = _history_msgs[-8:]
                messages = _system + _history_msgs + _tool_msgs

            # When force_synthesis is set, strip tool_calls from assistant messages
            # and remove tool-role messages to avoid API errors (no tools in payload).
            if force_synthesis:
                _synth_messages = []
                for m in messages:
                    if m.get("role") == "tool":
                        # Convert tool results to system context so the LLM still sees them
                        _tool_content = m.get("content", "")
                        if _tool_content and _tool_content != "No result":
                            _synth_messages.append({
                                "role": "user",
                                "content": f"[Search result from {m.get('name', 'tool')}]: {_tool_content}"
                            })
                        continue
                    _mc = dict(m)
                    if _mc.get("role") == "assistant":
                        _mc.pop("tool_calls", None)
                    _synth_messages.append(_mc)
                payload = {"model": MODEL, "messages": _synth_messages, "seed": random.randint(1000, 9999), "max_tokens": active_max_tokens}
            elif request_mode == "direct" and current_iteration == 1:
                _direct_messages = [dict(message) for message in messages]
                _direct_messages[0] = {"role": "system", "name": "oreolook-direct-system", "content": direct_prompt}
                payload = {"model": MODEL, "messages": _direct_messages, "seed": random.randint(1000, 9999), "max_tokens": active_max_tokens}
            else:
                payload = {"model": MODEL, "messages": messages, "seed": random.randint(1000, 9999), "max_tokens": active_max_tokens}
                # Document export is a final commit owned by the runtime after
                # synthesis and validation. It is never available during
                # planning/tool selection.
                payload["tools"] = [
                    tool for tool in tools
                    if not (
                        _pdf_requested
                        and tool.get("function", {}).get("name") == "export_to_pdf"
                    )
                ]
                payload["tool_choice"] = "auto"

            _stale_event = status_tracker.refresh_if_stale()
            if _stale_event:
                yield _stale_event

            # Provider-routed tool selection is currently non-streaming: both configured
            # models reject stream=true with this tool catalog (HTTP 400). Final
            # synthesis has no tools and remains progressively streamed.
            # Buffer PDF synthesis until document structure and coverage validate.
            # Artifact drafts are buffered until synthesis, validation, and export
            # complete; uncommitted model text must never leak to the client.
            _use_streaming = _may_stream_uncommitted_output(
                event_id,
                has_tools=bool(payload.get("tools")),
                artifact_requested=_pdf_requested,
            )
            _streamed_content = ""

            if _use_streaming:
                assistant_message = None
                for _stream_model in (payload.get("model", MODEL), MODEL_FALLBACK):
                    try:
                        _stream_payload = {**payload, "model": _stream_model}
                        _streamed_content = ""
                        _tag_filter = StreamingTagFilter()
                        _chunk_buffer = TaskAwareChunkBuffer(chunk_chars=SSE_CHUNK_CHARS)
                        _visible_streamed_content = ""
                        async for _stype, _sdata in _stream_llm_call(_stream_payload, headers):
                            if _stype == "keepalive":
                                _ke = emit_event("INFO", "<TASK>Thinking</TASK>")
                                if _ke:
                                    yield _ke
                                status_tracker.touch()
                            elif _stype == "content":
                                _streamed_content += _sdata
                                safe_text = _tag_filter.feed(_sdata)
                                for _kind, _buffered in _chunk_buffer.feed(safe_text):
                                    if _kind == "text" and _buffered:
                                        _visible_streamed_content += _buffered
                                        yield format_sse("RESPONSE", _buffered)
                                status_tracker.touch()
                            elif _stype == "done":
                                _tail = _tag_filter.flush()
                                for _kind, _buffered in _chunk_buffer.feed(_tail):
                                    if _kind == "text" and _buffered:
                                        _visible_streamed_content += _buffered
                                        yield format_sse("RESPONSE", _buffered)
                                for _kind, _buffered in _chunk_buffer.flush():
                                    if _kind == "text" and _buffered:
                                        _visible_streamed_content += _buffered
                                        yield format_sse("RESPONSE", _buffered)
                                assistant_message = _sdata
                                assistant_message["content"] = _visible_streamed_content
                        if assistant_message and (assistant_message.get("content") or assistant_message.get("tool_calls")):
                            break  # direct answer or structured tool call
                        logger.warning(f"Streaming model={_stream_model} returned empty, trying fallback")
                    except Exception as e:
                        logger.warning(f"Streaming API error with model={_stream_model}: {e}")
                        if _stream_model == MODEL_FALLBACK:
                            logger.error(f"Streaming fallback also failed at iteration {current_iteration}")
                        continue
                if not assistant_message:
                    break
                # Direct text is already delivered. Tool-call streams normally contain no
                # content and continue through the tool loop.
                if assistant_message.get("tool_calls"):
                    _streamed_content = ""
                else:
                    _streamed_content = assistant_message.get("content", "")
            else:
                # --- Non-streaming path: blocking call with keepalive + fallback ---
                response_data = None
                for _model_attempt in (payload.get("model", MODEL), MODEL_FALLBACK):
                    _attempt_payload = {**payload, "model": _model_attempt}
                    try:
                        _api_task = asyncio.ensure_future(
                            asyncio.to_thread(requests.post, POLLINATIONS_ENDPOINT, json=_attempt_payload, headers=headers, timeout=55)
                        )
                        while not _api_task.done():
                            await asyncio.wait({_api_task}, timeout=5.0)
                            if not _api_task.done() and event_id:
                                _thinking_event = status_tracker.refresh_if_stale()
                                if _thinking_event:
                                    yield _thinking_event
                                else:
                                    _ke = emit_event("INFO", "<TASK>Thinking</TASK>")
                                    if _ke:
                                        yield _ke
                                    status_tracker.touch()
                        response = _api_task.result()
                        response.raise_for_status()
                        response_data = response.json()
                        status_tracker.touch()
                        break  # success — no need for fallback
                    except (requests.exceptions.RequestException, asyncio.TimeoutError) as e:
                        logger.warning(f"API error with model={_model_attempt} at iteration {current_iteration}: {e}")
                        if _model_attempt == MODEL_FALLBACK:
                            logger.error(f"Fallback model also failed at iteration {current_iteration}")
                        continue
                    except Exception as e:
                        logger.error(f"Unexpected API error at iteration {current_iteration}: {e}")
                        break

                if not response_data:
                    break

                choice = response_data.get("choices", [{}])[0]
                assistant_message = choice.get("message") or choice.get("delta")
                if not assistant_message:
                    break

            assistant_message.pop("reasoning_content", None)
            if not assistant_message.get("content"):
                assistant_message["content"] = "I'll help you with that." if assistant_message.get("tool_calls") else "Processing..."

            messages.append(assistant_message)
            tool_calls = assistant_message.get("tool_calls")

            if not tool_calls:
                raw_content = assistant_message.get("content", "")

                if force_synthesis and _pdf_requested:
                    raw_content = normalize_pdf_document(raw_content)
                    assistant_message["content"] = raw_content
                    gap = requested_coverage_gap(original_user_query, raw_content)
                    missing_anchor = missing_local_date_anchor(
                        original_user_query, raw_content, memoized_results.get("timezone_info", {}),
                    )
                    if (gap or missing_anchor) and current_iteration < max_iterations:
                        required = requested_day_count(original_user_query)
                        observed = gap[1] if gap else required
                        memoized_results["coverage_retry"] = True
                        coverage_note = (
                            f"The draft covered only {observed} of {required} requested days. " if gap else ""
                        )
                        anchor_note = (
                            f"The range must start on the resolved local date {missing_anchor}. "
                            if missing_anchor else ""
                        )
                        messages.append({
                            "role": "user",
                            "content": (
                                coverage_note + anchor_note
                                + (f"Rewrite the final document with exactly {required} distinct dated entries, one per day, "
                                   if required else "Rewrite the final document with the complete requested local date range, ")
                                + "using only fetched evidence. Return finished Markdown only: no preamble, code fence, "
                                + "function name, arguments, or export instructions."
                            ),
                        })
                        continue
                    if gap or missing_anchor:
                        required = requested_day_count(original_user_query)
                        observed = gap[1] if gap else required
                        memoized_results["suppress_pdf_export"] = True
                        detail = (
                            f"{observed} of {required} dated entries were available" if gap
                            else f"the required local start date {missing_anchor} was missing"
                        )
                        raw_content = (
                            "I could not verify the complete requested date range from the fetched sources "
                            f"({detail}), so I did not create a misleading PDF."
                        )
                        assistant_message["content"] = raw_content

                # Recovery is for tool-selection turns only. Synthesis owns final documents.
                leaked_fn, leaked_args = (None, None) if force_synthesis else extract_leaked_tool_call(raw_content)
                if leaked_fn:
                    import uuid as _uuid
                    tool_calls = [{"id": f"recovered-{_uuid.uuid4().hex[:8]}", "type": "function",
                                   "function": {"name": leaked_fn, "arguments": json.dumps(leaked_args)}}]
                    assistant_message["content"] = f"Calling {leaked_fn}..."
                    assistant_message["tool_calls"] = tool_calls

                if not tool_calls:
                    # A model-authored artifact draft is never committed directly.
                    # Give it one bounded synthesis pass under the final-document
                    # contract before runtime-owned export.
                    if _pdf_requested and not force_synthesis and current_iteration < max_iterations:
                        messages.append({
                            "role": "user",
                            "content": synthesis_instruction(
                                original_user_query,
                                image_context=image_context_provided,
                                is_detailed=is_detailed_mode,
                                pdf_already_generated=False,
                            ),
                        })
                        force_synthesis = True
                        continue

                    is_reasoning_leak = _looks_like_internal_reasoning(raw_content)
                    is_placeholder = (
                        raw_content.strip() in ("Processing your request...", "I'll help you with that.", "")
                        or is_placeholder_or_fallback(raw_content)
                    )
                    has_useful_context = bool(collected_sources) or tool_call_count > 0

                    # If PDF was already generated, don't force synthesis — just use the response or build one
                    if (is_reasoning_leak or is_placeholder) and memoized_results.get("generated_pdfs"):
                        _pdf_url = memoized_results["generated_pdfs"][-1]
                        final_message_content = raw_content if not (is_reasoning_leak or is_placeholder) else ""
                        break

                    if (is_reasoning_leak or is_placeholder) and has_useful_context and current_iteration < max_iterations:
                        if event_id:
                            yield format_sse("INFO", get_user_message("synthesizing"))
                            status_tracker.touch()
                        _has_images = image_context_provided or bool(collected_images_from_web) or bool(collected_similar_images)
                        _pdf_done = bool(memoized_results.get("generated_pdfs"))
                        messages.append({"role": "user", "content": synthesis_instruction(user_query, image_context=_has_images, is_detailed=is_detailed_mode, pdf_already_generated=_pdf_done)})
                        force_synthesis = True
                        continue

                    if (is_reasoning_leak or is_placeholder) and not has_useful_context and current_iteration == 1:
                        messages.append({"role": "user", "content": "Your previous response was empty. Re-read the query and either call the appropriate tool or answer directly."})
                        continue

                    final_message_content = raw_content
                    break

            # --- Process tool calls ---
            tool_outputs = []
            fetch_calls, web_search_calls, other_calls = [], [], []
            _deep_research_call = None

            for tc in tool_calls:
                fn_name = tc["function"]["name"]
                logger.info(
                    "[runtime] tool_selected=%s iteration=%s max_links=%s max_tokens=%s",
                    fn_name, current_iteration, active_max_links, active_max_tokens,
                )
                if fn_name == "deep_research":
                    _deep_research_call = tc
                elif fn_name == "fetch_full_text":
                    fetch_calls.append(tc)
                elif fn_name == "web_search":
                    web_search_calls.append(tc)
                    try:
                        _ws_args = json.loads(tc["function"]["arguments"])
                        _depth = _ws_args.get("search_depth")
                        if _depth and not is_detailed_mode:
                            _bounds = SEARCH_DEPTH_BOUNDS.get(_depth)
                            if _bounds:
                                active_min_links = _bounds["min"]
                                active_max_links = _bounds["max"]
                    except (json.JSONDecodeError, KeyError):
                        pass
                else:
                    other_calls.append(tc)

            # Deep research handoff
            if _deep_research_call:
                # The tool argument is a model-generated research hint and may
                # narrow or rewrite the request. Decomposition must start from
                # the complete user/clarification intent retained by runtime.
                _dr_query = original_user_query
                async for event in _run_deep_search_pipeline(
                    user_query=_dr_query, user_image=user_image,
                    event_id=event_id, session_id=session_id, emit_event=emit_event,
                    ledger_request_id=ledger_request_id,
                    request_intent=original_user_query,
                    request_context=request_context,
                ):
                    yield event
                return

            if len(fetch_calls) > active_max_links:
                fetch_calls = fetch_calls[:active_max_links]

            async def execute_tool_async(idx, tool_call, is_web_search=False):
                fn_name = tool_call["function"]["name"]
                fn_args = json.loads(tool_call["function"]["arguments"])
                tool_result_gen = optimized_tool_execution(fn_name, fn_args, memoized_results, emit_event)
                tool_result, image_urls = None, []
                if hasattr(tool_result_gen, '__aiter__'):
                    async for result in tool_result_gen:
                        if isinstance(result, str) and result.startswith("event:"):
                            pass
                        elif isinstance(result, tuple):
                            tool_result, image_urls = result
                        else:
                            tool_result = result
                else:
                    tool_result = await tool_result_gen if asyncio.iscoroutine(tool_result_gen) else tool_result_gen
                return {"tool_call_id": tool_call["id"], "name": fn_name, "result": tool_result, "image_urls": image_urls}

            # --- Web search ---
            if web_search_calls:
                try:
                    search_label = f"Searching for: {json.loads(web_search_calls[0]['function']['arguments']).get('query', '')[:80]}"
                except Exception:
                    search_label = "Searching the web"
                emit_sse = emit_event("INFO", f"<TASK>{search_label}</TASK>")
                if emit_sse:
                    yield emit_sse
                status_tracker.touch()
                ws_results = await asyncio.gather(
                    *[execute_tool_async(idx, tc, True) for idx, tc in enumerate(web_search_calls)],
                    return_exceptions=True
                )
                for result in ws_results:
                    if not isinstance(result, Exception):
                        if result["name"] == "web_search" and "current_search_urls" in memoized_results:
                            _raw_urls = memoized_results["current_search_urls"][:active_sources_per_search]
                            collected_sources.extend(clean_source_list(_raw_urls))
                        tool_outputs.append({"role": "tool", "tool_call_id": result["tool_call_id"],
                                             "name": result["name"], "content": str(result["result"]) if result["result"] else "No result"})
                if event_id and collected_sources:
                    yield format_sse("INFO", f"<TASK>Found {len(collected_sources)} sources</TASK>")
                    status_tracker.touch()

                # Search results are leads, not evidence. Follow the strongest
                # URLs immediately instead of spending another model round-trip
                # asking it to issue fetch calls.
                if not fetch_calls:
                    import uuid as _uuid
                    for url in clean_source_list(memoized_results.get("current_search_urls", []))[:active_max_links]:
                        fetch_calls.append({
                            "id": f"auto-fetch-{_uuid.uuid4().hex[:8]}",
                            "type": "function",
                            "function": {
                                "name": "fetch_full_text",
                                "arguments": json.dumps({"url": url}),
                            },
                        })

            # --- Other tools ---
            _tool_labels = {"image_search": "Searching for images", "youtubeMetadata": "Looking up YouTube videos",
                            "transcribe_audio": "Transcribing audio", "get_local_time": "Getting local time", "create_image": "Generating image"}
            for idx, tc in enumerate(other_calls):
                fn_name = tc["function"]["name"]
                fn_args = json.loads(tc["function"]["arguments"])
                _label = _tool_labels.get(fn_name)
                if _label and event_id:
                    yield format_sse("INFO", f"<TASK>{_label}</TASK>")
                    status_tracker.touch()

                tool_result_gen = optimized_tool_execution(fn_name, fn_args, memoized_results, emit_event)
                if hasattr(tool_result_gen, '__aiter__'):
                    tool_result, image_urls = None, []
                    async for result in tool_result_gen:
                        if isinstance(result, str) and result.startswith("event:"):
                            yield result
                        elif isinstance(result, tuple):
                            tool_result, image_urls = result
                        else:
                            tool_result = result
                    if fn_name == "image_search" and image_urls:
                        (collected_similar_images if image_only_mode else collected_images_from_web).extend(image_urls)
                        if event_id:
                            yield format_sse("INFO", f"<TASK>Found {len(image_urls)} images</TASK>")
                            status_tracker.touch()
                else:
                    tool_result = await tool_result_gen if asyncio.iscoroutine(tool_result_gen) else tool_result_gen

                if fn_name == "transcribe_audio":
                    collected_sources.append(fn_args.get("url"))
                tool_outputs.append({"role": "tool", "tool_call_id": tc["id"], "name": fn_name,
                                     "content": str(tool_result) if tool_result else "No result"})

            tool_call_count += len(tool_calls)

            # --- Fetch URLs ---
            if fetch_calls:
                _stale_event = status_tracker.refresh_if_stale()
                if _stale_event:
                    yield _stale_event
                if event_id:
                    yield format_sse("INFO", f"<TASK>Reading {len(fetch_calls)} source{'s' if len(fetch_calls) != 1 else ''}</TASK>")
                    status_tracker.touch()

                async def execute_fetch(idx, tc):
                    fn_args = json.loads(tc["function"]["arguments"])
                    url = fn_args.get('url', 'N/A')
                    tool_result = None
                    async for result in optimized_tool_execution(tc["function"]["name"], fn_args, memoized_results, emit_event):
                        if not isinstance(result, str) or not result.startswith("event:"):
                            tool_result = result
                    return {"tool_call_id": tc["id"], "url": url, "result": tool_result}

                try:
                    fetch_results = await asyncio.wait_for(
                        asyncio.gather(*[execute_fetch(idx, tc) for idx, tc in enumerate(fetch_calls)], return_exceptions=True),
                        timeout=8.0
                    )
                except (asyncio.TimeoutError, TimeoutError):
                    fetch_results = []

                ingest_tasks = []
                for fr in fetch_results:
                    if isinstance(fr, Exception):
                        continue
                    url = clean_url(fr["url"]) or fr["url"]
                    if len(collected_sources) < active_max_sources:
                        collected_sources.append(url)
                    if core_service:
                        async def ingest_url_async(u):
                            try:
                                from ipcService.coreServiceManager import get_core_embedding_service
                                svc = get_core_embedding_service()
                                await asyncio.wait_for(asyncio.to_thread(svc.ingest_url, u), timeout=3.0)
                            except Exception:
                                pass
                        ingest_tasks.append(ingest_url_async(url))
                    tool_outputs.append({"role": "tool", "tool_call_id": fr["tool_call_id"], "name": "fetch_full_text",
                                         "content": str(fr["result"])[:FETCH_EVIDENCE_MAX_CHARS] if fr["result"] else "No result"})

                # Fire-and-forget: ingest into vector store without blocking the response
                if ingest_tasks:
                    asyncio.gather(*ingest_tasks, return_exceptions=True)

                good, total = _evaluate_fetch_quality(tool_outputs)
                if total > 0 and event_id and good > 0:
                    _len = sum(len(o.get("content", "")) for o in tool_outputs
                               if o.get("name") == "fetch_full_text" and len(o.get("content", "")) >= FETCH_MIN_USEFUL_CHARS)
                    yield format_sse("INFO", f"<TASK>Extracted ~{max(1, _len // 80)} sentences from {good} source{'s' if good != 1 else ''}</TASK>")
                    status_tracker.touch()

            messages.extend(tool_outputs)

            # A fetch result is evidence, not a user-facing answer. Always make
            # the following turn a tool-free synthesis turn so the model must
            # ground its answer in the returned content. Previously, any
            # non-empty post-fetch draft bypassed synthesis, which allowed
            # unresolved values such as "[Accurate temperature details]".
            usable_fetches = [
                output for output in tool_outputs
                if output.get("name") == "fetch_full_text"
                and output.get("content") not in ("", "No result")
            ]
            if usable_fetches:
                force_synthesis = True
                logger.info(
                    "[runtime] synthesis_required reason=fetched_evidence sources=%s",
                    len(usable_fetches),
                )
                if event_id:
                    yield format_sse("INFO", get_user_message("synthesizing"))
                    status_tracker.touch()

        # ==================== FORCED SYNTHESIS ====================
        if not final_message_content and current_iteration >= max_iterations:
            if event_id:
                yield format_sse("INFO", get_user_message("synthesizing"))
                status_tracker.touch()

            # RAG context already retrieved at pipeline start — skip redundant re-retrieval

            if is_detailed_mode:
                async for item in run_detailed_synthesis(
                    user_query, messages, headers, active_max_tokens,
                    rag_context, collected_sources, event_id, emit_event,
                ):
                    if isinstance(item, tuple) and item[0] == "__FINAL__":
                        final_message_content = item[1]
                    else:
                        yield item

                if final_message_content and conversation_cache is not None:
                    try:
                        _emb = core_service.embed_single_text(user_query) if core_service else None
                        conversation_cache.add_to_cache(
                            query=user_query, response=final_message_content,
                            metadata={"sources": collected_sources[:5], "tool_calls": tool_call_count,
                                      "iteration": current_iteration, "decomposed": True},
                            query_embedding=_emb,
                        )
                    except Exception:
                        pass
                    if session_context:
                        try:
                            session_context.add_message(
                                role="assistant",
                                content=final_message_content,
                                metadata={
                                    "request_id": f"{ledger_request_id}:assistant",
                                    "evidence_refs": collected_sources[:5],
                                    "artifact_refs": memoized_results.get("generated_pdfs", [])[:10],
                                    **artifact_ledger_fields(memoized_results),
                                },
                            )
                            memoized_results["_assistant_response_saved"] = True
                        except Exception:
                            pass
                    memoized_results["final_response"] = final_message_content

                if event_id:
                    yield format_sse("INFO", "<TASK>DONE</TASK>")
                return

            # Standard synthesis — use streaming to keep connection alive
            _has_images = image_context_provided or bool(collected_images_from_web) or bool(collected_similar_images)
            _pdf_done = bool(memoized_results.get("generated_pdfs"))

            # Clean messages for synthesis (strip tool_calls/tool-role messages)
            _synth_msgs = []
            for m in messages:
                if m.get("role") == "tool":
                    _tool_content = m.get("content", "")
                    if _tool_content and _tool_content != "No result":
                        _synth_msgs.append({
                            "role": "user",
                            "content": f"[Search result from {m.get('name', 'tool')}]: {_tool_content}"
                        })
                    continue
                _mc = dict(m)
                if _mc.get("role") == "assistant":
                    _mc.pop("tool_calls", None)
                _synth_msgs.append(_mc)

            _synth_msgs.append({
                "role": "user",
                "content": synthesis_instruction(user_query, image_context=_has_images, is_detailed=is_detailed_mode, pdf_already_generated=_pdf_done)
            })

            _synth_payload = {
                "model": MODEL, "messages": _synth_msgs,
                "seed": random.randint(1000, 9999), "max_tokens": active_max_tokens,
            }

            if event_id:
                # Stream synthesis to keep connection alive and deliver content progressively
                _synth_streamed = ""
                _synth_ok = False
                for _synth_model in (MODEL, MODEL_FALLBACK):
                    try:
                        _sp = {**_synth_payload, "model": _synth_model}
                        _synth_streamed = ""
                        async for _stype, _sdata in _stream_llm_call(_sp, headers):
                            if _stype == "keepalive":
                                _ke = emit_event("INFO", "<TASK>Thinking</TASK>")
                                if _ke:
                                    yield _ke
                                status_tracker.touch()
                            elif _stype == "content":
                                _synth_streamed += _sdata
                                yield format_sse("RESPONSE", _sdata)
                                status_tracker.touch()
                            elif _stype == "done":
                                pass
                        if _synth_streamed.strip():
                            final_message_content = _scrub_tool_names(_synth_streamed.strip())
                            _streamed_content = final_message_content
                            _synth_ok = True
                            break
                        logger.warning(f"[FORCED SYNTHESIS] model={_synth_model} returned empty, trying fallback")
                    except Exception as e:
                        logger.warning(f"[FORCED SYNTHESIS] Streaming error with model={_synth_model}: {e}")
                        continue

                if not _synth_ok:
                    final_message_content = build_synthesis_fallback(messages, user_query, rag_context, collected_sources)
            else:
                final_message_content = await run_standard_synthesis(
                    messages, user_query, active_max_tokens, headers, is_detailed_mode,
                    image_context_provided, collected_images_from_web, collected_similar_images,
                )
                if not final_message_content:
                    final_message_content = build_synthesis_fallback(messages, user_query, rag_context, collected_sources)

        # ==================== FINAL RESPONSE FORMATTING ====================
        # If PDF was generated but LLM gave a placeholder/empty response, construct one
        if not final_message_content and memoized_results.get("generated_pdfs"):
            _pdf_url = memoized_results["generated_pdfs"][-1]
            final_message_content = f"Here's your PDF, ready to download:\n\n[Download PDF]({_pdf_url})"

        if final_message_content:
            # Check if content was already streamed to the user
            _already_streamed = bool(_streamed_content) and _streamed_content == final_message_content

            if not _already_streamed:
                final_message_content = await sanitize_final_response(final_message_content, user_query, collected_sources, headers)
            final_message_content = _scrub_tool_names(final_message_content)
            memoized_results["collected_sources"] = collected_sources[:active_max_sources]

            # Research/document requests are exported only after synthesis. This
            # single runtime-owned call prevents partial exports and tool loops.
            try:
                await auto_generate_pdf(
                    final_message_content,
                    original_user_query,
                    memoized_results,
                    event_id,
                )
            except Exception as exc:
                logger.error(f"[FINAL] PDF auto-generation failed: {exc}")

            # If we got placeholder content with images, try one more synthesis
            if not _already_streamed and is_placeholder_or_fallback(final_message_content) and (collected_images_from_web or collected_similar_images):
                _pool = collected_similar_images if (image_only_mode and collected_similar_images) else collected_images_from_web
                better = await try_image_synthesis(messages, user_query, _pool, headers, event_id)
                if better:
                    final_message_content = better

            # Append PDF link if tool generated one during the loop
            if memoized_results.get("generated_pdfs"):
                _pdf_url = memoized_results["generated_pdfs"][-1]
                if _pdf_url not in final_message_content:
                    final_message_content += f"\n\n---\n\n[Download PDF]({_pdf_url})"

            # Assemble images and sources
            response_parts = assemble_images(final_message_content, collected_images_from_web,
                                              collected_similar_images, image_only_mode, memoized_results)
            response_with_sources = append_sources(response_parts, collected_sources)

            # Save to caches (skip for ephemeral sessions)
            if not is_ephemeral:
                await save_to_caches(user_query, final_message_content, collected_sources, tool_call_count,
                                      current_iteration, memoized_results, core_service, conversation_cache,
                                      session_context, session_id)

            memoized_results["final_response"] = response_with_sources

            if _already_streamed and event_id:
                # Content was already streamed — only send extras (sources, images, PDF)
                _extras = response_with_sources[len(final_message_content):]
                if _extras.strip():
                    yield format_sse("RESPONSE", _extras)
                yield format_sse("INFO", "<TASK>DONE</TASK>")
            elif event_id:
                yield format_sse("RESPONSE", response_with_sources)
                yield format_sse("INFO", "<TASK>DONE</TASK>")
            else:
                yield response_with_sources
            return
        else:
            logger.error(f"[ERROR] No final content after {max_iterations} iterations")
            if collected_sources or tool_call_count > 0:
                response = build_fallback_response(user_query, collected_sources, collected_images_from_web,
                                                    collected_similar_images, image_only_mode, memoized_results)
                memoized_results["final_response"] = response
                if event_id:
                    yield format_sse("INFO", get_user_message("finalizing"))
                    yield format_sse("RESPONSE", response)
                    yield format_sse("INFO", "<TASK>DONE</TASK>")
                else:
                    yield response
                return
            _error_msg = (
                "Hmm, I hit a snag — my brain (the LLM upstream) seems to be "
                "taking a nap right now. This usually resolves in a few seconds. "
                "Give it another shot and I should be back to my usual brilliant self."
            )
            if event_id:
                yield format_sse("RESPONSE", _error_msg)
                yield format_sse("INFO", "<TASK>DONE</TASK>")
            else:
                yield _error_msg
            return

    except Exception as e:
        task_failed = True
        logger.error(f"Pipeline error: {e}", exc_info=True)
        _error_msg = (
            "Oops — something unexpected went wrong on my end. "
            "It's not you, it's me (probably a temporary hiccup). "
            "Try again in a moment?"
        )
        if event_id:
            yield format_sse("RESPONSE", _error_msg)
            yield format_sse("INFO", "<TASK>DONE</TASK>")
        else:
            yield _error_msg
    finally:
        if episodic_recall_task is not None:
            episodic_recall_task.cancel()
        if graph_recall_task is not None:
            graph_recall_task.cancel()
        # Skip all persistence for ephemeral sessions — nothing to save
        if not is_ephemeral:
            if session_context and memoized_results.get("active_task") and not memoized_results.get("clarification_blocked") and not memoized_results.get("task_terminal"):
                try:
                    terminal_status = TaskStatus.FAILED if task_failed else TaskStatus.COMPLETED
                    terminal_task = task_with_status(
                        memoized_results["active_task"],
                        terminal_status,
                    )
                    await asyncio.to_thread(
                        session_context.ledger.set_task_state,
                        active_task=terminal_task,
                        pending_clarification=None,
                    )
                    memoized_results["active_task"] = terminal_task
                except Exception as exc:
                    logger.warning(f"[Pipeline] Failed to finalize task state: {exc}")
            if session_id and "session_context" in memoized_results and memoized_results["session_context"]:
                try:
                    ctx = memoized_results["session_context"]
                    if memoized_results.get("final_response") and not memoized_results.get("_assistant_response_saved"):
                        ctx.add_message(
                            role="assistant",
                            content=memoized_results["final_response"],
                            metadata={
                                "request_id": f"{ledger_request_id}:assistant",
                                "evidence_refs": memoized_results.get("collected_sources", [])[:5],
                                "artifact_refs": memoized_results.get("generated_pdfs", [])[:10],
                                **artifact_ledger_fields(memoized_results),
                            },
                        )
                except Exception:
                    pass

            if (
                memoized_results.get("final_response")
                and not memoized_results.get("clarification_blocked")
                and not task_failed
            ):
                request_context = memoized_results.get("request_context")
                snapshots = memoized_results.get("artifact_snapshots") or []
                await _remember_session_episode(
                    core_service,
                    episodic_scope,
                    ledger_request_id,
                    original_user_query,
                    memoized_results["final_response"],
                    request_context.source_turn_ids if request_context else (),
                    memoized_results.get("collected_sources") or (),
                    [item.get("artifact_id") for item in snapshots if item.get("artifact_id")],
                )

            if session_id and semantic_cache is not None:
                semantic_cache.save_for_request(session_id)
                try:
                    if "conversation_cache" in memoized_results:
                        conversation_cache.save_to_disk(session_id=session_id)
                except Exception:
                    pass

        if session_context and session_lock_token:
            try:
                await asyncio.to_thread(session_context.ledger.release_lock, session_lock_token)
            except Exception as exc:
                logger.warning(f"[Pipeline] Failed to release session lock: {exc}")

        # Publish latency metrics to Redis for the monitor service
        try:
            from pipeline.config import create_redis_client
            _total_ms = round((_time.time() - _pipeline_start) * 1000, 1)
            _metrics = json.dumps({
                "request_id": event_id or "",
                "session_id": session_id or "",
                "total_ms": _total_ms,
                "tool_calls": memoized_results.get("_tool_call_count", 0) if isinstance(memoized_results, dict) else 0,
                "timestamp": _time.time(),
            })
            _rc = create_redis_client(db=0)
            _rc.lpush("lixsearch:metrics:latency", _metrics)
            _rc.ltrim("lixsearch:metrics:latency", 0, 999)
        except Exception:
            pass
