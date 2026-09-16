
import json
import random
import asyncio
import requests
import os
import uuid
from datetime import datetime, timezone
from loguru import logger
from commons.environment import load_local_environment
from commons.auth_context import pollinations_auth_headers

from pipeline.config import *
from pipeline.instruction import (
    system_instruction,
    synthesis_instruction,
    deep_search_gating_instruction,
    deep_search_sub_query_instruction,
    deep_search_final_synthesis_instruction,
)
from pipeline.tools import tools
from pipeline.optimized_tool_execution import optimized_tool_execution
from pipeline.response_builder import artifact_ledger_fields, auto_generate_pdf
from pipeline.helpers import (
    _scrub_tool_names,
    _decompose_query_with_llm,
)
from pipeline.utils import format_sse
from sessions.conversation_cache import ConversationCacheManager
from ragService.semanticCacheRedis import SemanticCacheRedis as SemanticCache
from sessions.ledger import LedgerSessionContext
from sessions.episodic_memory import request_memory_scope

load_local_environment()

MODEL = LLM_MODEL

import re as _re

# Patterns that indicate the model is reasoning/thinking instead of writing user-facing content
_AD_URL_PATTERNS = ("doubleclick.net", "clickserve.", "dartsearch.net", "googleads.",
                    "googlesyndication", "facebook.com/tr", "bing.com/aclick",
                    "ads.", "redirect.", "track.", "ad.doubleclick")


def _is_clean_url(url: str) -> bool:

    if not url or len(url) > 300:
        return False
    lower = url.lower()
    return not any(ad in lower for ad in _AD_URL_PATTERNS)


_REASONING_PATTERNS = _re.compile(
    r"^(?:"
    r"(?:The user|I (?:need|should|will|have to|must|can see|see|notice|want))|"
    r"(?:Looking at|Let me|Wait,|Actually,|However,|Given (?:the|that|this))|"
    r"(?:Based on (?:the|my)|I (?:don't|also) (?:see|have|need))|"
    r"(?:So (?:I|the|let)|Hmm|OK,|Alright)|"
    r"(?:The (?:context|question|query|instruction|prompt|search) )"
    r")",
    _re.IGNORECASE,
)


def _strip_reasoning_leak(text: str) -> str:

    if not text:
        return text

    lines = text.split("\n")
    start_idx = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        # Keep everything from the first "real content" line
        if (
            stripped.startswith("#")
            or stripped.startswith("**")
            or stripped.startswith("- ")
            or stripped.startswith("* ")
            or _re.match(r"^\d+\.", stripped)
            or stripped.startswith("> ")
            or stripped.startswith("![")
            or stripped.startswith("[")
        ):
            start_idx = i
            break
        # If it matches reasoning patterns, skip it
        if _REASONING_PATTERNS.match(stripped):
            continue
        # Otherwise it's real content — keep from here
        start_idx = i
        break

    result = "\n".join(lines[start_idx:]).strip()
    if len(result) < len(text) * 0.3:
        # Safety: if we'd strip more than 70% of the content, keep original
        return text
    return result


def _build_evidence_synthesis_messages(
    messages: list,
    sub_query: str,
) -> list:
    """Build a valid, tool-free handoff for forced sub-query synthesis.

    The research transcript may contain assistant ``tool_calls`` followed by
    several ``tool`` messages. Slicing that transcript can orphan either side
    of the OpenAI tool-call pair, which providers reject with HTTP 400. The
    synthesis pass only needs the gathered evidence, so flatten it into one
    ordinary user message instead of replaying protocol state.
    """
    evidence_parts = []
    for message in messages:
        if message.get("role") != "tool":
            continue
        content = str(message.get("content") or "").strip()
        if content and content != "No result":
            evidence_parts.append(content[:1200])

    evidence = "\n\n".join(evidence_parts)
    if len(evidence) > 6000:
        evidence = evidence[:6000]

    return [
        {
            "role": "system",
            "content": (
                "You are OreoLook's research writer. Produce only the final, "
                "user-facing, sourced answer. Use only the supplied evidence; "
                "never mention tools, internal processing, or missing protocol state."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Research question: {sub_query}\n\n"
                f"Gathered evidence:\n{evidence or 'No usable evidence was returned.'}\n\n"
                f"{synthesis_instruction(sub_query, is_detailed=True)}"
            ),
        },
    ]


def _search_urls_from_tool_result(tool_result) -> list[str]:
    """Read URLs from this search result, never from shared request state."""
    try:
        payload = json.loads(tool_result) if isinstance(tool_result, str) else tool_result
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(payload, dict):
        return []
    return [
        item.get("url")
        for item in payload.get("results", [])
        if isinstance(item, dict) and _is_clean_url(item.get("url"))
    ]


async def _evaluate_deep_search_need(query: str, headers: dict) -> bool:
    gating_messages = [
        {"role": "system", "content": "You are a query complexity evaluator. Return only JSON."},
        {"role": "user", "content": deep_search_gating_instruction(query)},
    ]
    payload = {
        "model": MODEL,
        "messages": gating_messages,
        "seed": random.randint(1000, 9999),
        "max_tokens": 200,
        "stream": False,
    }
    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                requests.post,
                POLLINATIONS_ENDPOINT,
                json=payload,
                headers=headers,
                timeout=8
            ),
            timeout=10.0
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        result = json.loads(content)
        needs = result.get("needs_deep_search", True)
        reason = result.get("reason", "")
        logger.info(f"[DeepSearch] Gating LLM verdict: needs_deep_search={needs}, reason={reason}")
        return bool(needs)
    except Exception as e:
        logger.warning(f"[DeepSearch] Gating LLM call failed ({e}), defaulting to complexity heuristic")
        return None


async def _execute_deep_search_sub_query(
    sub_query: str,
    original_query: str,
    sub_query_index: int,
    total_sub_queries: int,
    headers: dict,
    memoized_results: dict,
    emit_event,
    core_service,
    current_utc_time,
    search_semaphore,
):
    collected_sources = []
    collected_images = []

    rag_context = ""
    if core_service:
        try:
            retrieval_result = core_service.retrieve(sub_query, top_k=10)
            if retrieval_result.get("count", 0) > 0:
                rag_context = "\n".join(
                    [r["metadata"]["text"] for r in retrieval_result.get("results", [])]
                )
        except Exception:
            pass

    messages = [
        {
            "role": "system",
            "name": "elixposearch-agent-system",
            "content": system_instruction(rag_context, current_utc_time, is_detailed=True),
        },
        {
            "role": "user",
            "content": deep_search_sub_query_instruction(
                sub_query, original_query, sub_query_index, total_sub_queries
            ),
        },
    ]

    final_content = None
    tool_call_count = 0

    for iteration in range(1, DEEP_SEARCH_MAX_ITERATIONS_PER_SUB + 1):
        if len(messages) > 8:
            messages = messages[:2] + messages[-6:]

        # Truncate tool output content to keep context lean
        for m in messages:
            if m.get("role") == "tool":
                content = m.get("content", "")
                if len(content) > 400:
                    m["content"] = content[:400] + "..."
            elif m.get("role") == "assistant" and not m.get("content"):
                if m.get("tool_calls"):
                    m["content"] = f"Executing {len(m['tool_calls'])} tool(s)..."
                else:
                    m["content"] = "Researching..."

        payload = {
            "model": MODEL,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "seed": random.randint(1000, 9999),
            "max_tokens": DEEP_SEARCH_MAX_TOKENS_PER_SUB,
        }

        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    requests.post,
                    POLLINATIONS_ENDPOINT,
                    json=payload,
                    headers=headers,
                    timeout=45
                ),
                timeout=50.0,
            )
            response.raise_for_status()
            response_data = response.json()
        except Exception as e:
            logger.error(f"[DeepSearch:Sub{sub_query_index}] API error at iteration {iteration}: {e}")
            break

        assistant_message = response_data["choices"][0]["message"]
        # Strip internal reasoning — never user-facing
        assistant_message.pop("reasoning_content", None)

        if not assistant_message.get("content"):
            if assistant_message.get("tool_calls"):
                assistant_message["content"] = "Gathering information..."
            else:
                assistant_message["content"] = "Researching..."

        messages.append(assistant_message)
        tool_calls = assistant_message.get("tool_calls")

        if not tool_calls:
            # Deep research is not allowed to manufacture an answer from model
            # memory. Give the model bounded chances to gather web evidence;
            # the caller applies a second commit gate before any text reaches
            # SSE, caches, or an artifact.
            if not collected_sources and iteration < DEEP_SEARCH_MAX_ITERATIONS_PER_SUB:
                messages.append({
                    "role": "user",
                    "content": (
                        "No verifiable web evidence has been collected yet. Use the available "
                        "search and fetch tools now. Do not answer from memory or invent sources."
                    ),
                })
                logger.warning(
                    f"[DeepSearch:Sub{sub_query_index}] Iteration {iteration}: "
                    "source-free answer rejected; requesting evidence"
                )
                continue
            final_content = assistant_message.get("content")
            logger.info(f"[DeepSearch:Sub{sub_query_index}] Iteration {iteration}: no tool calls, final content ready ({len(final_content or '')} chars)")
            break

        logger.info(f"[DeepSearch:Sub{sub_query_index}] Iteration {iteration}: {len(tool_calls)} tool calls")
        tool_outputs = []
        fetch_calls = []
        web_search_calls = []
        other_calls = []

        for tc in tool_calls:
            fn_name = tc["function"]["name"]
            if fn_name == "fetch_full_text":
                fetch_calls.append(tc)
            elif fn_name == "web_search":
                web_search_calls.append(tc)
            else:
                other_calls.append(tc)

        fetch_calls = fetch_calls[:DEEP_SEARCH_MAX_LINKS_PER_SUB]
        tool_call_count += len(tool_calls)

        if web_search_calls:
            if len(web_search_calls) > DEEP_SEARCH_MAX_WEB_SEARCHES_PER_SUB:
                logger.info(
                    f"[DeepSearch:Sub{sub_query_index}] Bounding web search fan-out "
                    f"from {len(web_search_calls)} to {DEEP_SEARCH_MAX_WEB_SEARCHES_PER_SUB}"
                )
            web_search_calls = web_search_calls[:DEEP_SEARCH_MAX_WEB_SEARCHES_PER_SUB]

            async def _exec_ws(idx, tc):
                fn_name = tc["function"]["name"]
                fn_args = json.loads(tc["function"]["arguments"])
                logger.info(f"[DeepSearch:Sub{sub_query_index}] WebSearch #{idx+1}: {fn_args.get('query', '')[:50]}")
                tool_result = None

                async def _consume_search():
                    nonlocal tool_result
                    async for result in optimized_tool_execution(
                        fn_name, fn_args, memoized_results, emit_event
                    ):
                        if isinstance(result, tuple):
                            tool_result = result[0]
                        elif isinstance(result, str) and not result.startswith("event:"):
                            tool_result = result

                try:
                    async with search_semaphore:
                        await asyncio.wait_for(
                            _consume_search(),
                            timeout=float(DEEP_SEARCH_WEB_SEARCH_TIMEOUT_SECONDS),
                        )
                except (asyncio.TimeoutError, TimeoutError):
                    logger.warning(
                        f"[DeepSearch:Sub{sub_query_index}] Web search timed out "
                        f"after {DEEP_SEARCH_WEB_SEARCH_TIMEOUT_SECONDS}s"
                    )
                return {"tool_call_id": tc["id"], "name": fn_name, "result": tool_result}

            ws_results = await asyncio.gather(
                *[_exec_ws(idx, tc) for idx, tc in enumerate(web_search_calls)],
                return_exceptions=True,
            )
            for r in ws_results:
                if not isinstance(r, Exception):
                    collected_sources.extend(_search_urls_from_tool_result(r["result"])[:3])
                    tool_outputs.append({
                        "role": "tool",
                        "tool_call_id": r["tool_call_id"],
                        "name": r["name"],
                        "content": str(r["result"]) if r["result"] else "No result",
                    })

        for tc in other_calls:
            fn_name = tc["function"]["name"]
            fn_args = json.loads(tc["function"]["arguments"])
            logger.info(f"[DeepSearch:Sub{sub_query_index}] Tool: {fn_name}")
            tool_result = None
            image_urls = []
            tool_result_gen = optimized_tool_execution(fn_name, fn_args, memoized_results, emit_event)
            if hasattr(tool_result_gen, '__aiter__'):
                async for result in tool_result_gen:
                    if isinstance(result, tuple):
                        tool_result, image_urls = result
                    elif isinstance(result, str) and not result.startswith("event:"):
                        tool_result = result
            if fn_name == "image_search" and image_urls:
                collected_images.extend(image_urls)
            tool_outputs.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "name": fn_name,
                "content": str(tool_result) if tool_result else "No result",
            })

        if fetch_calls:
            async def _exec_fetch(idx, tc):
                fn_name = tc["function"]["name"]
                fn_args = json.loads(tc["function"]["arguments"])
                url = fn_args.get("url", "")
                logger.info(f"[DeepSearch:Sub{sub_query_index}] Fetch #{idx+1}: {url[:60]}")
                tool_result = None
                async for result in optimized_tool_execution(fn_name, fn_args, memoized_results, emit_event):
                    if not isinstance(result, str) or not result.startswith("event:"):
                        tool_result = result
                return {"tool_call_id": tc["id"], "url": url, "result": tool_result}

            try:
                fetch_results = await asyncio.wait_for(
                    asyncio.gather(
                        *[_exec_fetch(idx, tc) for idx, tc in enumerate(fetch_calls)],
                        return_exceptions=True,
                    ),
                    timeout=8.0,
                )
            except (asyncio.TimeoutError, TimeoutError):
                logger.warning(f"[DeepSearch:Sub{sub_query_index}] Fetch timeout")
                fetch_results = []

            for fr in fetch_results:
                if isinstance(fr, Exception):
                    continue
                url = fr.get("url", "")
                if _is_clean_url(url) and len(collected_sources) < 6:
                    collected_sources.append(url)
                tool_outputs.append({
                    "role": "tool",
                    "tool_call_id": fr["tool_call_id"],
                    "name": "fetch_full_text",
                    "content": str(fr["result"])[:500] if fr["result"] else "No result",
                })

        messages.extend(tool_outputs)

    if not final_content:
        logger.info(f"[DeepSearch:Sub{sub_query_index}] Forcing synthesis after {DEEP_SEARCH_MAX_ITERATIONS_PER_SUB} iterations")
        synthesis_messages = _build_evidence_synthesis_messages(messages, sub_query)
        try:
            resp = await asyncio.wait_for(
                asyncio.to_thread(
                    requests.post,
                    POLLINATIONS_ENDPOINT,
                    json={
                        "model": MODEL,
                        "messages": synthesis_messages,
                        "seed": random.randint(1000, 9999),
                        "max_tokens": DEEP_SEARCH_MAX_TOKENS_PER_SUB,
                        "stream": False,
                    },
                    headers=headers,
                    timeout=20,
                ),
                timeout=22.0,
            )
            resp.raise_for_status()
            final_content = resp.json()["choices"][0]["message"].get("content", "").strip()
        except Exception as e:
            logger.error(f"[DeepSearch:Sub{sub_query_index}] Forced synthesis failed: {e}")
            final_content = f"Research on '{sub_query}' gathered {len(collected_sources)} sources."

    # Strip any reasoning leaks from the final content
    if final_content:
        final_content = _strip_reasoning_leak(final_content)

    logger.info(
        f"[DeepSearch:Sub{sub_query_index}] Complete: {len(final_content or '')} chars, "
        f"{len(collected_sources)} sources, {tool_call_count} tool calls"
    )
    return final_content or "", collected_sources, collected_images


async def _deep_search_final_synthesis(
    original_query: str,
    sub_results: list,
    headers: dict,
) -> str:

    system_msg = (
        "You are OreoLook. Write a cohesive summary that ties together research findings. "
        "Never mention sub-queries, research threads, findings, or internal processes. "
        "NEVER mention internal tool names, function calls, or cache operations. "
        "NEVER include your thinking or reasoning — output only the final answer."
    )

    user_content = deep_search_final_synthesis_instruction(original_query, sub_results)

    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_content},
    ]

    payload = {
        "model": MODEL,
        "messages": messages,
        "seed": random.randint(1000, 9999),
        "max_tokens": DEEP_SEARCH_FINAL_SYNTHESIS_MAX_TOKENS,
        "stream": False,
    }

    # Attempt 1: full synthesis
    for attempt in range(1, 3):
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    requests.post,
                    POLLINATIONS_ENDPOINT,
                    json=payload,
                    headers=headers,
                    timeout=45,
                ),
                timeout=50.0,
            )
            response.raise_for_status()
            result = response.json()["choices"][0]["message"]
            result.pop("reasoning_content", None)
            content = result.get("content", "").strip()
            if content:
                content = _strip_reasoning_leak(content)
                if content:
                    logger.info(f"[DeepSearch] Final synthesis succeeded (attempt {attempt}): {len(content)} chars")
                    return content
            logger.warning(f"[DeepSearch] Final synthesis returned empty (attempt {attempt})")
        except asyncio.TimeoutError:
            logger.error(f"[DeepSearch] Final synthesis timed out (attempt {attempt})")
        except requests.exceptions.HTTPError as e:
            logger.error(f"[DeepSearch] Final synthesis HTTP error (attempt {attempt}): {e}")
        except Exception as e:
            logger.error(f"[DeepSearch] Final synthesis failed (attempt {attempt}): {e}")

        # Retry with aggressively trimmed input
        if attempt == 1:
            logger.info("[DeepSearch] Retrying synthesis with trimmed context")
            # Keep only first 1000 chars of each sub-result
            trimmed_results = []
            for sub_q, summary, sources in sub_results:
                trimmed_results.append((sub_q, summary[:1000], sources))
            user_content = deep_search_final_synthesis_instruction(original_query, trimmed_results)
            messages = [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_content},
            ]
            payload["messages"] = messages

    logger.warning("[DeepSearch] Final synthesis failed after all attempts — sub-results already streamed")
    return ""


async def _run_deep_search_pipeline(
    user_query: str,
    user_image: str,
    event_id: str,
    session_id: str,
    emit_event,
    ledger_request_id: str = None,
    request_intent: str = None,
    request_context=None,
):
    logger.info(f"[DeepSearch] Starting deep search for: '{user_query[:80]}'")
    ledger_request_id = ledger_request_id or event_id or uuid.uuid4().hex

    current_utc_time = datetime.now(timezone.utc)
    headers = pollinations_auth_headers()

    core_service = None
    try:
        from ipcService.coreServiceManager import get_core_embedding_service
        core_service = get_core_embedding_service()
    except Exception as e:
        logger.warning(f"[DeepSearch] IPC CoreEmbeddingService unavailable: {e}")

    session_context = None
    if session_id:
        try:
            session_context = LedgerSessionContext(session_id=session_id)
            if request_context is None:
                session_context.add_message(
                    role="user",
                    content=user_query,
                    metadata={"request_id": f"{ledger_request_id}:user"},
                )
        except Exception as e:
            logger.warning(f"[DeepSearch] session ledger init failed: {e}")

    memoized_results = {
        "timezone_info": {},
        "web_searches": {},
        "fetched_urls": {},
        "youtube_metadata": {},
        "youtube_transcripts": {},
        "base64_cache": {},
        "context_sufficient": False,
        "cache_hit": False,
        "cached_response": None,
        "session_id": session_id or "",
        "generated_images": [],
        "request_context": request_context,
        "ledger_request_id": ledger_request_id,
    }

    conversation_cache = None
    semantic_cache = None
    if session_id:
        _embed_fn = core_service.embed_single_text if core_service else None
        conversation_cache = ConversationCacheManager(
            window_size=CACHE_WINDOW_SIZE,
            max_entries=CACHE_MAX_ENTRIES,
            ttl_seconds=CACHE_TTL_SECONDS,
            compression_method=CACHE_COMPRESSION_METHOD,
            embedding_model=CACHE_EMBEDDING_MODEL,
            similarity_threshold=CACHE_SIMILARITY_THRESHOLD,
            cache_dir=CONVERSATION_CACHE_DIR,
            embed_fn=_embed_fn,
        )
        memoized_results["conversation_cache"] = conversation_cache
        try:
            conversation_cache.load_from_disk(session_id=session_id)
        except Exception as e:
            logger.warning(f"[DeepSearch] Failed to load conversation cache: {e}")

        try:
            semantic_cache = SemanticCache(
                session_id=session_id,
                ttl_seconds=SEMANTIC_CACHE_TTL_SECONDS,
                similarity_threshold=SEMANTIC_CACHE_SIMILARITY_THRESHOLD,
                redis_host=SEMANTIC_CACHE_REDIS_HOST,
                redis_port=SEMANTIC_CACHE_REDIS_PORT,
                redis_db=SEMANTIC_CACHE_REDIS_DB,
            )
            semantic_cache.load_for_request(session_id)
        except Exception as e:
            logger.warning(f"[DeepSearch] Semantic cache init failed: {e}")

    decompose_event = emit_event("INFO", "<TASK>Analyzing query for deep search</TASK>")
    if decompose_event:
        yield decompose_event

    sub_queries = await _decompose_query_with_llm(
        user_query, headers, max_parts=DEEP_SEARCH_MAX_SUB_QUERIES
    )
    logger.info(f"[DeepSearch] Decomposed into {len(sub_queries)} sub-queries: {sub_queries}")

    # A single model-produced sub-query is valid. Do not replace the model's
    # decision with keyword/aspect heuristics.

    plan_event = emit_event(
        "INFO",
        f"<TASK>Deep searching {len(sub_queries)} aspects of your question</TASK>",
    )
    if plan_event:
        yield plan_event

    # Emit all sub-query topics upfront so the user sees the plan
    for sq_idx, sub_query in enumerate(sub_queries, 1):
        sq_event = emit_event(
            "INFO",
            f"<TASK>Researching ({sq_idx}/{len(sub_queries)}): {sub_query[:80]}</TASK>",
        )
        if sq_event:
            yield sq_event

    all_sub_results = []
    all_collected_sources = []
    all_collected_images = []
    search_semaphore = asyncio.Semaphore(DEEP_SEARCH_WEB_SEARCH_CONCURRENCY)

    # Run ALL sub-queries in parallel — results stream as they complete
    async def _run_sub(sq_idx, sub_query):

        logger.info(f"[DeepSearch] Sub-query {sq_idx}/{len(sub_queries)}: '{sub_query[:80]}'")
        try:
            sq_response, sq_sources, sq_images = await asyncio.wait_for(
                _execute_deep_search_sub_query(
                    sub_query=sub_query,
                    original_query=user_query,
                    sub_query_index=sq_idx,
                    total_sub_queries=len(sub_queries),
                    headers=headers,
                    memoized_results=memoized_results,
                    emit_event=emit_event,
                    core_service=core_service,
                    current_utc_time=current_utc_time,
                    search_semaphore=search_semaphore,
                ),
                timeout=float(DEEP_SEARCH_TIMEOUT_PER_SUB),
            )
            if sq_response:
                sq_response = _scrub_tool_names(sq_response)
                # Strip reasoning leaks: remove everything before the first markdown heading or real content
                sq_response = _strip_reasoning_leak(sq_response)
            evidence_sources = list(dict.fromkeys(
                source for source in (sq_sources or []) if _is_clean_url(source)
            ))
            if sq_response and not evidence_sources:
                logger.warning(
                    f"[DeepSearch] Sub-query {sq_idx} rejected by evidence commit gate: "
                    "no clean sources"
                )
                sq_response = None
            return sq_idx, sub_query, sq_response, evidence_sources, sq_images
        except asyncio.TimeoutError:
            logger.error(f"[DeepSearch] Sub-query {sq_idx} timed out after {DEEP_SEARCH_TIMEOUT_PER_SUB}s")
            return sq_idx, sub_query, None, [], []
        except Exception as e:
            logger.error(f"[DeepSearch] Sub-query {sq_idx} failed: {e}", exc_info=True)
            return sq_idx, sub_query, None, [], []

    # Launch all sub-queries concurrently and stream results as they finish
    tasks = [
        asyncio.create_task(_run_sub(sq_idx, sq))
        for sq_idx, sq in enumerate(sub_queries, 1)
    ]
    for coro in asyncio.as_completed(tasks):
        sq_idx, sub_query, sq_response, sq_sources, sq_images = await coro
        if sq_response:
            all_sub_results.append((sub_query, sq_response, sq_sources))
            all_collected_sources.extend(sq_sources)
            all_collected_images.extend(sq_images)

            done_event = emit_event(
                "INFO",
                f"<TASK>Completed ({sq_idx}/{len(sub_queries)}): {sub_query[:60]}</TASK>",
            )
            if done_event:
                yield done_event

            if event_id:
                yield format_sse("RESPONSE", sq_response)
            else:
                yield sq_response

            logger.info(
                f"[DeepSearch] Sub-query {sq_idx} complete: "
                f"{len(sq_response)} chars, {len(sq_sources)} sources"
            )
        else:
            logger.warning(f"[DeepSearch] Sub-query {sq_idx} returned empty response")
            timeout_event = emit_event(
                "INFO",
                f"<TASK>Research thread {sq_idx} timed out, continuing</TASK>",
            )
            if timeout_event:
                yield timeout_event

    if not all_sub_results:
        failure = (
            "I couldn’t gather enough verifiable sources to answer this reliably. "
            "Please try again in a moment."
        )
        if event_id:
            yield format_sse("RESPONSE", failure)
        else:
            yield failure
        done_event = emit_event("INFO", "<TASK>DONE</TASK>")
        if done_event:
            yield done_event
        logger.warning("[DeepSearch] Aborted: no source-backed research passed the commit gate")
        return

    # ── Clean sources: filter out ad tracking / redirect URLs ──
    unique_sources = sorted(set(s for s in all_collected_sources if _is_clean_url(s)))[:8]
    memoized_results["collected_sources"] = unique_sources

    # Append sources to the stream and retain the same verified appendix for
    # the canonical document/cache payload.
    source_block = ""
    if unique_sources:
        source_block = "\n\n---\n**Sources:**\n"
        for i, src in enumerate(unique_sources, 1):
            source_block += f"{i}. [{src}]({src})\n"
        if event_id:
            yield format_sse("RESPONSE", source_block)
        else:
            yield source_block

    final_response = ""
    if len(all_sub_results) > 1:
        # Only attempt synthesis if total content isn't already too large
        _total_chars = sum(len(r[1]) for r in all_sub_results)
        if _total_chars > 15000:
            # Content is already very comprehensive — skip synthesis to avoid timeout
            logger.info(f"[DeepSearch] Skipping synthesis — {_total_chars} chars already delivered")
        else:
            synth_event = emit_event("INFO", "<TASK>Combining all research into final answer</TASK>")
            if synth_event:
                yield synth_event

            try:
                final_response = await _deep_search_final_synthesis(
                    original_query=user_query,
                    sub_results=all_sub_results,
                    headers=headers,
                )

                if final_response:
                    final_response = _scrub_tool_names(final_response)

                    if event_id:
                        yield format_sse("RESPONSE", final_response)
                    else:
                        yield final_response
                else:
                    logger.info("[DeepSearch] Synthesis empty — sub-results already delivered")

            except Exception as e:
                logger.error(f"[DeepSearch] Final synthesis failed: {e}", exc_info=True)

    # The global synthesis is the canonical report. Raw per-thread content is
    # only a fallback when no global synthesis was needed or could be produced.
    research_content = "\n\n".join(r[1] for r in all_sub_results)
    combined_content = final_response or research_content
    document_content = f"{combined_content}{source_block}" if combined_content else None

    # Never turn metadata-only emergency summaries into a document. A failed
    # synthesis should remain a failed export instead of producing a polished-
    # looking PDF with no substantive content.
    status_only = bool(research_content) and all(
        re.fullmatch(r"Research on '.+' gathered \d+ sources\.?", result[1].strip())
        for result in all_sub_results
    )
    if status_only and not final_response:
        document_content = None
        logger.warning("[DeepSearch] PDF blocked: only source-count status summaries available")

    # Complete any requested artifact from the researched content before DONE.
    # The shared finalizer determines whether this request asks for an export;
    # this path does not special-case a subject, field name, or prompt shape.
    if document_content:
        try:
            pdf_url = await auto_generate_pdf(
                document_content,
                request_intent or user_query,
                memoized_results,
                event_id,
            )
            if pdf_url:
                ready_event = emit_event("INFO", "<TASK>PDF ready for download</TASK>")
                if ready_event:
                    yield ready_event
                link = f"\n\n---\n\n[Download PDF]({pdf_url})"
                if event_id:
                    yield format_sse("RESPONSE", link)
                else:
                    yield link
        except Exception as e:
            logger.error(f"[DeepSearch] PDF auto-generation failed: {e}")

    # ── Save to caches (fire-and-forget, never block DONE) ──
    try:
        if document_content:
            memoized_results["final_response"] = document_content
            cache_metadata = {
                "sources": unique_sources,
                "evidence_refs": unique_sources,
                "artifact_refs": memoized_results.get("generated_pdfs", [])[:10],
                "deep_search": True,
                "sub_queries": len(all_sub_results),
            }
            cache_metadata.update(artifact_ledger_fields(memoized_results))
            _cache_embedding = None
            if core_service:
                try:
                    _cache_embedding = core_service.embed_single_text(user_query)
                except Exception:
                    pass
            if conversation_cache is not None:
                conversation_cache.add_to_cache(
                    query=user_query,
                    response=document_content,
                    metadata=cache_metadata,
                    query_embedding=_cache_embedding,
                )

            if session_context:
                session_context.add_message(
                    role="assistant",
                    content=document_content,
                    metadata={
                        "request_id": f"{ledger_request_id}:assistant",
                        **cache_metadata,
                    },
                )
                memoized_results["_assistant_response_saved"] = True
            if core_service and session_id:
                snapshots = memoized_results.get("artifact_snapshots") or []
                try:
                    await asyncio.wait_for(
                        asyncio.to_thread(
                            core_service.remember_episodes,
                            request_memory_scope(session_id, namespace="search").filters(),
                            ledger_request_id,
                            request_intent or user_query,
                            document_content,
                            list(request_context.source_turn_ids if request_context else ()),
                            list(unique_sources),
                            [item.get("artifact_id") for item in snapshots if item.get("artifact_id")],
                        ),
                        timeout=max(2.0, EPISODIC_MEMORY_TIMEOUT_SECONDS * 4),
                    )
                except Exception as exc:
                    logger.debug(f"[EpisodicMemory] Deep-search write skipped: {exc}")
    except Exception as e:
        logger.warning(f"[DeepSearch] Cache save failed: {e}")

    try:
        if session_id and semantic_cache is not None:
            semantic_cache.save_for_request(session_id)
        if session_id and conversation_cache is not None:
            conversation_cache.save_to_disk(session_id=session_id)
    except Exception:
        pass

    # ── DONE — always fire, never skip ──
    done_event = emit_event("INFO", "<TASK>DONE</TASK>")
    if done_event:
        yield done_event

    logger.info(
        f"[DeepSearch] Complete: {len(all_sub_results)} sub-queries answered, "
        f"{len(unique_sources)} clean sources"
    )
