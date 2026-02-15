from datetime import datetime
from loguru import logger 
from ragService.semanticCache import SemanticCache
import random
import requests
import json
from pipeline.tools import tools
from datetime import datetime, timezone
from sessions.conversation_cache import ConversationCacheManager
import os 
from dotenv import load_dotenv
from pipeline.config import (POLLINATIONS_ENDPOINT, 
                             CACHE_WINDOW_SIZE, CACHE_MAX_ENTRIES, CACHE_TTL_SECONDS, 
                             CACHE_SIMILARITY_THRESHOLD, CACHE_COMPRESSION_METHOD, 
                             CACHE_EMBEDDING_MODEL,
                             SEMANTIC_CACHE_DIR, CONVERSATION_CACHE_DIR)
from pipeline.instruction import system_instruction, user_instruction, synthesis_instruction
from pipeline.optimized_tool_execution import optimized_tool_execution
from pipeline.utils import format_sse, get_model_server
from functionCalls.getImagePrompt import generate_prompt_from_image
import asyncio
load_dotenv()

POLLINATIONS_TOKEN = os.getenv("TOKEN")
MODEL = os.getenv("MODEL")
logger.debug(f"Model configured: {MODEL}")


async def run_elixposearch_pipeline(user_query: str, user_image: str, event_id: str = None, request_id: str = None):
    logger.info(f"Starting Optimized ElixpoSearch Pipeline for query: '{user_query}' with image: '{user_image[:50] + '...' if user_image else 'None'}' [RequestID: {request_id}]")
    def emit_event(event_type, message):
        if event_id:
            return format_sse(event_type, message)
        return None

    initial_event = emit_event("INFO", "<TASK>Understanding Query</TASK>")
    if initial_event:
        yield initial_event
    try:
        current_utc_time = datetime.now(timezone.utc)
        headers = {"Content-Type": "application/json",
                   "Authorization": f"Bearer {POLLINATIONS_TOKEN}"}
        
        try:
            model_server = get_model_server()
            core_service = model_server.CoreEmbeddingService()
            logger.info("[Pipeline] Connected to model_server CoreEmbeddingService via IPC")
        except Exception as e:
            logger.warning(f"[Pipeline] Could not connect to model_server, using standalone mode: {e}")
            core_service = None
                   
        memoized_results = {
            "timezone_info": {},
            "web_searches": {},
            "fetched_urls": {},
            "youtube_metadata": {},
            "youtube_transcripts": {},
            "base64_cache": {},
            "context_sufficient": False,  # Early exit marker
            "cache_hit": False,
            "cached_response": None
        }
        
        conversation_cache = ConversationCacheManager(
            window_size=CACHE_WINDOW_SIZE,
            max_entries=CACHE_MAX_ENTRIES,
            ttl_seconds=CACHE_TTL_SECONDS,
            compression_method=CACHE_COMPRESSION_METHOD,
            embedding_model=CACHE_EMBEDDING_MODEL,
            similarity_threshold=CACHE_SIMILARITY_THRESHOLD,
            cache_dir=CONVERSATION_CACHE_DIR
        )
        memoized_results["conversation_cache"] = conversation_cache
        logger.info(f"[Pipeline] Initialized Conversation Cache Manager (window_size={CACHE_WINDOW_SIZE}, max_entries={CACHE_MAX_ENTRIES})")
        
        # Load conversation cache from disk if session exists
        if request_id:
            if conversation_cache.load_from_disk(session_id=request_id):
                logger.info(f"[Pipeline] Loaded conversation cache from disk (session: {request_id})")
        
        # Initialize persistent semantic cache with 5-min TTL per request
        semantic_cache = SemanticCache(ttl_seconds=300, cache_dir=SEMANTIC_CACHE_DIR)
        if request_id:
            semantic_cache.load_for_request(request_id)
            logger.info(f"[Pipeline] Loaded persistent cache for request {request_id}")
        
        # IMAGE HANDLING: Detect and process image-only queries
        image_context_provided = False
        if user_image and not user_query.strip():
            logger.info(f"[Pipeline] Image-only query detected. Generating search query from image...")
            try:
                image_event = emit_event("INFO", "<TASK>Analyzing image to generate search query</TASK>")
                if image_event:
                    yield image_event
                
                # Generate search query from image
                generated_query = await generate_prompt_from_image(user_image)
                user_query = generated_query
                image_context_provided = True
                logger.info(f"[Pipeline] Generated query from image: '{user_query}'")
                
                query_event = emit_event("INFO", f"<TASK>Generated search query: {user_query}</TASK>")
                if query_event:
                    yield query_event
            except Exception as e:
                logger.warning(f"[Pipeline] Failed to generate query from image, continuing with empty query: {e}")
                image_context_provided = False
        elif user_image and user_query.strip():
            logger.info(f"[Pipeline] Image + Query mode: Will analyze image in context of query")
            image_context_provided = True
        
        max_iterations = 3 
        current_iteration = 0
        collected_sources = []
        collected_images_from_web = []
        collected_similar_images = []
        final_message_content = None
        tool_call_count = 0  # Track cumulative tools executed
        
        rag_context = ""
        if core_service:
            try:
                retrieval_result = core_service.retrieve(user_query, top_k=3)
                if retrieval_result.get("count", 0) > 0:
                    rag_context = "\n".join([r["metadata"]["text"] for r in retrieval_result.get("results", [])])
                    logger.info(f"[Pipeline] Retrieved {retrieval_result.get('count', 0)} chunks from vector store")
            except Exception as e:
                logger.warning(f"[Pipeline] Vector store retrieval failed, continuing without context: {e}")
        else:
            logger.info("[Pipeline] Skipping vector store retrieval (model_server unavailable)")
        
        logger.info(f"[Pipeline] RAG context prepared: {len(rag_context)} chars")
        
        messages = [
            
            {
                "role": "system",
                "name": "elixposearch-agent-system",
                "content": system_instruction(rag_context, current_utc_time)
            },
            {
                "role": "user",
                "content": user_instruction(user_query, user_image)
            }
        ]

        # OPTIMIZATION FIX #13: Cache RAG context to avoid regeneration in multi-turn
        rag_context_cache = rag_context
        last_context_refresh = current_iteration

        while current_iteration < max_iterations:
            current_iteration += 1
            if messages and len(messages) > 0:
                for m in messages:
                    if m.get("role") == "assistant":
                        # Ensure assistant messages have content even if tool_calls exist
                        if m.get("content") is None or m.get("content") == "":
                            if "tool_calls" in m and len(m.get("tool_calls", [])) > 0:
                                m["content"] = f"Executing {len(m['tool_calls'])} tool(s)..."
                            else:
                                m["content"] = "Processing your request..."

            iteration_event = emit_event("INFO", f"<TASK>Iteration {current_iteration}: Analyzing query</TASK>")
            if iteration_event:
                yield iteration_event
            # OPTIMIZATION: Trim old messages to reduce token overhead
            if len(messages) > 8:
                # Keep system + user messages at start, last 6 messages
                trimmed = messages[:2] + messages[-6:]
                logger.info(f"[OPTIMIZATION] Trimmed messages from {len(messages)} to {len(trimmed)}")
                messages = trimmed
            
            payload = {
                "model": MODEL,
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
                "seed": random.randint(1000, 9999),
                "max_tokens": 2000,  # OPTIMIZATION: Reduced from 3000
            }

            try:
                loop = asyncio.get_event_loop()
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        requests.post,
                        POLLINATIONS_ENDPOINT,
                        json=payload,
                        headers=headers,
                        timeout=120
                    ),
                    timeout=125.0
                )
                response.raise_for_status()
                response_data = response.json()
            except asyncio.TimeoutError:
                logger.error(f"API timeout at iteration {current_iteration}")
                if event_id:
                    yield format_sse("error", "<TASK>Request Timeout - Retrying</TASK>")
                break
            except requests.exceptions.HTTPError as http_err:
                # Print detailed HTTP error information
                print(f"\n{'='*80}")
                print(f"[HTTP ERROR] Status Code: {http_err.response.status_code}")
                print(f"[HTTP ERROR] URL: {http_err.response.url}")
                print(f"[HTTP ERROR] Headers: {http_err.response.headers}")
                print(f"[HTTP ERROR] Response Text:\n{http_err.response.text}")
                print(f"{'='*80}\n")
                logger.error(f"Pollinations API HTTP error at iteration {current_iteration}: {http_err}")
                logger.error(f"Response content: {http_err.response.text}")
                if event_id:
                    yield format_sse("error", "<TASK>API Error - Invalid Request</TASK>")
                break
            except requests.exceptions.RequestException as e:
                print(f"\n{'='*80}")
                print(f"[REQUEST ERROR] Type: {type(e).__name__}")
                print(f"[REQUEST ERROR] Message: {str(e)}")
                if hasattr(e, 'response') and e.response is not None:
                    print(f"[REQUEST ERROR] Status Code: {e.response.status_code}")
                    print(f"[REQUEST ERROR] Response: {e.response.text}")
                print(f"{'='*80}\n")
                logger.error(f"Pollinations API request failed at iteration {current_iteration}: {e}")
                if event_id:
                    yield format_sse("error", "<TASK>Connection Error</TASK>")
                break
            except Exception as e:
                print(f"\n{'='*80}")
                print(f"[UNEXPECTED ERROR] Type: {type(e).__name__}")
                print(f"[UNEXPECTED ERROR] Message: {str(e)}")
                print(f"{'='*80}\n")
                logger.error(f"Unexpected API error at iteration {current_iteration}: {e}", exc_info=True)
                if event_id:
                    yield format_sse("error", "<TASK>System Error</TASK>")
                break
            assistant_message = response_data["choices"][0]["message"]
            
            # Fix: Ensure content is always a string
            if not assistant_message.get("content"):
                if assistant_message.get("tool_calls"):
                    assistant_message["content"] = "I'll help you with that. Let me gather the information you need."
                else:
                    assistant_message["content"] = "Processing your request..."
            
            # Fix: Ensure content is a string, not None
            if assistant_message.get("content") is None:
                assistant_message["content"] = ""
                
            messages.append(assistant_message)
            tool_calls = assistant_message.get("tool_calls")
            logger.info(f"Tool calls suggested by model: {len(tool_calls) if tool_calls else 0} tools")
            if not tool_calls:
                final_message_content = assistant_message.get("content")
                logger.info(f"[COMPLETION] No tool calls found, setting final message: {final_message_content[:100] if final_message_content else 'EMPTY'}")
                break
            tool_outputs = []
            print(tool_calls)
            logger.info(f"Processing {len(tool_calls)} tool call(s):")
            
            # Separate tool calls by type for optimal parallel execution
            fetch_calls = []
            web_search_calls = []
            other_calls = []
            for tool_call in tool_calls:
                fn_name = tool_call["function"]["name"]
                if fn_name == "fetch_full_text":
                    fetch_calls.append(tool_call)
                elif fn_name == "web_search":
                    web_search_calls.append(tool_call)
                else:
                    other_calls.append(tool_call)
            
            async def execute_tool_async(idx, tool_call, is_web_search=False):
                function_name = tool_call["function"]["name"]
                function_args = json.loads(tool_call["function"]["arguments"])
                logger.info(f"[Async Tool #{idx+1}] {function_name}")
                
                tool_result_gen = optimized_tool_execution(function_name, function_args, memoized_results, emit_event)
                tool_result = None
                image_urls = []
                if hasattr(tool_result_gen, '__aiter__'):
                    async for result in tool_result_gen:
                        if isinstance(result, str) and result.startswith("event:"):
                            pass  # SSE already handled internally
                        elif isinstance(result, tuple):
                            tool_result, image_urls = result
                        else:
                            tool_result = result
                else:
                    tool_result = await tool_result_gen if asyncio.iscoroutine(tool_result_gen) else tool_result_gen
                
                return {
                    "tool_call_id": tool_call["id"],
                    "name": function_name,
                    "result": tool_result,
                    "image_urls": image_urls
                }
            
            # Run web searches in parallel
            if web_search_calls:
                emit_sse = emit_event("INFO", f"<TASK>Running {len(web_search_calls)} parallel searches</TASK>")
                if emit_sse:
                    yield emit_sse
                web_search_results = await asyncio.gather(
                    *[execute_tool_async(idx, tc, True) for idx, tc in enumerate(web_search_calls)],
                    return_exceptions=True
                )
                for result in web_search_results:
                    if not isinstance(result, Exception):
                        if result["name"] == "web_search" and "current_search_urls" in memoized_results:
                            collected_sources.extend(memoized_results["current_search_urls"][:3])
                        tool_outputs.append({
                            "role": "tool",
                            "tool_call_id": result["tool_call_id"],
                            "name": result["name"],
                            "content": str(result["result"]) if result["result"] else "No result"
                        })
            
            # Execute other non-fetch tools sequentially (usually timezone/image analysis)
            for idx, tool_call in enumerate(other_calls):
                function_name = tool_call["function"]["name"]
                function_args = json.loads(tool_call["function"]["arguments"])
                logger.info(f"[Sequential Tool #{idx+1}] {function_name}")
                if event_id:
                    yield format_sse("INFO", f"<TASK>{function_name.replace('_', ' ').title()}</TASK>")
                
                tool_result_gen = optimized_tool_execution(function_name, function_args, memoized_results, emit_event)
                if hasattr(tool_result_gen, '__aiter__'):
                    tool_result = None
                    image_urls = []
                    async for result in tool_result_gen:
                        if isinstance(result, str) and result.startswith("event:"):
                            yield result
                        elif isinstance(result, tuple):
                            tool_result, image_urls = result
                        else:
                            tool_result = result
                    if function_name == "image_search" and image_urls:
                        if user_image and user_query.strip():
                            collected_images_from_web.extend(image_urls[:5])
                        elif user_image and not user_query.strip():
                            collected_similar_images.extend(image_urls[:10])
                        elif not user_image and user_query.strip():
                            collected_images_from_web.extend(image_urls[:10])
                else:
                    tool_result = await tool_result_gen if asyncio.iscoroutine(tool_result_gen) else tool_result_gen
                
                if function_name in ["transcribe_audio"]:
                    collected_sources.append(function_args.get("url"))
                
                tool_outputs.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "name": function_name,
                    "content": str(tool_result) if tool_result else "No result"
                })
            
            tool_call_count += len(tool_calls)
            
            if fetch_calls:
                logger.info(f"Executing {len(fetch_calls)} fetch_full_text calls in PARALLEL")
                if event_id:
                    yield format_sse("INFO", f"<TASK>Fetching {len(fetch_calls)} URLs in parallel</TASK>")
                
                async def execute_fetch(idx, tool_call):
                    function_name = tool_call["function"]["name"]
                    function_args = json.loads(tool_call["function"]["arguments"])
                    url = function_args.get('url', 'N/A')
                    logger.info(f"[PARALLEL FETCH #{idx+1}] {url[:60]}")
                    
                    tool_result_gen = optimized_tool_execution(function_name, function_args, memoized_results, emit_event)
                    tool_result = None
                    async for result in tool_result_gen:
                        if not isinstance(result, str) or not result.startswith("event:"):
                            tool_result = result
                    
                    return {
                        "tool_call_id": tool_call["id"],
                        "function_name": function_name,
                        "url": url,
                        "result": tool_result
                    }
                
                # OPTIMIZATION: Run fetches with timeout to prevent stragglers
                fetch_results = await asyncio.wait_for(
                    asyncio.gather(
                        *[execute_fetch(idx, tc) for idx, tc in enumerate(fetch_calls)],
                        return_exceptions=True
                    ),
                    timeout=8.0  # OPTIMIZATION: Hard timeout for parallel fetches
                )
                
                ingest_tasks = []
                for fetch_result in fetch_results:
                    if isinstance(fetch_result, Exception):
                        logger.error(f"Fetch failed: {fetch_result}")
                        continue
                    
                    url = fetch_result["url"]
                    tool_result = fetch_result["result"]
                    
                    # Add to sources (limit to top 5 URLs)
                    if len(collected_sources) < 5:
                        collected_sources.append(url)
                    
                    # OPTIMIZATION: Only ingest if core_service available (skip if unavailable)
                    if core_service:
                        async def ingest_url_async(url_to_ingest):
                            try:
                                core_svc = get_model_server().CoreEmbeddingService()
                                ingest_result = await asyncio.wait_for(
                                    asyncio.to_thread(core_svc.ingest_url, url_to_ingest),
                                    timeout=3.0  # OPTIMIZATION: Timeout per ingest
                                )
                                chunks = ingest_result.get('chunks_ingested', 0)
                                logger.info(f"[INGEST] {chunks} chunks from {url_to_ingest[:40]}")
                            except asyncio.TimeoutError:
                                logger.warning(f"[INGEST TIMEOUT] {url_to_ingest[:40]}")
                            except Exception as e:
                                logger.warning(f"[INGEST FAILED] {url_to_ingest[:40]}: {e}")
                        
                        ingest_tasks.append(ingest_url_async(url))
                    
                    tool_outputs.append({
                        "role": "tool",
                        "tool_call_id": fetch_result["tool_call_id"],
                        "name": "fetch_full_text",
                        "content": str(tool_result)[:500] if tool_result else "No result"  # OPTIMIZATION: Trim content
                    })
                
                # Run all ingestion tasks in parallel with timeout
                if ingest_tasks:
                    try:
                        await asyncio.wait_for(
                            asyncio.gather(*ingest_tasks, return_exceptions=True),
                            timeout=5.0  # OPTIMIZATION: Overall timeout for all ingestions
                        )
                    except asyncio.TimeoutError:
                        logger.warning("[INGESTION] Timeout reached, continuing anyway")
            messages.extend(tool_outputs)
            logger.info(f"Completed iteration {current_iteration}. Messages: {len(messages)}, Total tools: {tool_call_count}")
            if event_id:
                yield format_sse("INFO", f"<TASK>Processing responses ({tool_call_count} tools completed)</TASK>")
            

        if not final_message_content and current_iteration >= max_iterations:
            logger.info(f"[SYNTHESIS CONDITION MET] final_message_content={bool(final_message_content)}, current_iteration={current_iteration}, max_iterations={max_iterations}")
            if event_id:
                yield format_sse("INFO", f"<TASK>Generating Final Response</TASK>")
            
            logger.info("[SYNTHESIS] Starting synthesis of gathered information")
            synthesis_prompt = {
                "role": "user",
                "content": synthesis_instruction(user_query, image_context=image_context_provided)
            }
            
            # OPTIMIZATION: Trim messages before final synthesis
            original_msg_count = len(messages)
            if len(messages) > 6:
                messages = messages[:2] + messages[-4:]
                logger.info(f"[SYNTHESIS] Trimmed messages from {original_msg_count} to {len(messages)}")
            else:
                logger.info(f"[SYNTHESIS] Messages count: {len(messages)} (no trim needed)")
            
            messages.append(synthesis_prompt)
            payload = {
                "model": MODEL,
                "messages": messages,
                "seed": random.randint(1000, 9999),
                "max_tokens": 2500,
                "stream": False,
            }

            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        requests.post,
                        POLLINATIONS_ENDPOINT,
                        json=payload,
                        headers=headers,
                        timeout=20
                    ),
                    timeout=22.0
                )
                response.raise_for_status()
                response_data = response.json()
                logger.info(f"[SYNTHESIS] Raw API response status: {response.status_code}, response keys: {response_data.keys() if isinstance(response_data, dict) else 'unknown'}")
                logger.debug(f"[SYNTHESIS] Full response data: {json.dumps(response_data, indent=2)[:500]}")
                try:
                    message = response_data["choices"][0]["message"]
                    logger.debug(f"[SYNTHESIS] Message keys: {message.keys()}")
                    logger.debug(f"[SYNTHESIS] Content value: {repr(message.get('content'))}")
                    logger.debug(f"[SYNTHESIS] Tool calls: {message.get('tool_calls')}")
                    
                    final_message_content = message.get("content", "").strip()
                    
                    # If content is empty but we have reasoning_content, use that
                    if not final_message_content and "reasoning_content" in message:
                        final_message_content = message.get("reasoning_content", "").strip()
                        logger.info("[SYNTHESIS] Using reasoning_content as fallback")
                    
                    # If still empty and model returned tool_calls, extract meaningful info or respond directly
                    if not final_message_content and message.get("tool_calls"):
                        logger.warning(f"[SYNTHESIS] Model returned tool_calls instead of content in synthesis")
                        final_message_content = f"I searched for information about '{user_query}' and gathered {len(collected_sources)} relevant sources."
                        if collected_sources:
                            final_message_content += f"\n\nKey sources:\n" + "\n".join([f"- {src}" for src in collected_sources[:5]])
                    
                    if not final_message_content:
                        logger.error(f"[SYNTHESIS] API returned empty content after all fallbacks. Full response: {response_data}")
                        # Provide fallback response
                        final_message_content = f"I processed your query about '{user_query}'."
                        if collected_sources:
                            final_message_content += f"\n\nRelevant sources found:\n" + "\n".join([f"- {src}" for src in collected_sources[:5]])
                    else:
                        logger.info(f"[SYNTHESIS] Successfully extracted content. Length: {len(final_message_content)}")
                except (KeyError, IndexError, TypeError) as e:
                    logger.error(f"[SYNTHESIS] Failed to extract content from response. Expected structure not found. Error: {e}")
                    logger.error(f"[SYNTHESIS] Response data keys: {response_data.keys() if isinstance(response_data, dict) else 'Not a dict'}")
                    logger.error(f"[SYNTHESIS] Full response: {response_data}")
                    # Provide fallback instead of None
                    final_message_content = f"I gathered {len(collected_sources)} relevant sources about '{user_query}'."
                    if collected_sources:
                        final_message_content += f"\n\nRelevant sources:\n" + "\n".join([f"- {src}" for src in collected_sources[:5]])
            except asyncio.TimeoutError:
                logger.error("[SYNTHESIS TIMEOUT] Request timed out")
                logger.warning(f"[SYNTHESIS FALLBACK] Using collected information as response")
                final_message_content = f"Based on the gathered information about '{user_query}', here's what I found:"
                if collected_sources:
                    final_message_content += f"\n\nRelevant sources: {', '.join(collected_sources[:3])}"
            except requests.exceptions.HTTPError as http_err:
                logger.error(f"[SYNTHESIS HTTP ERROR] Status Code: {http_err.response.status_code} - {str(http_err)[:100]}")
                final_message_content = f"I gathered information related to '{user_query}' but encountered an API error while synthesizing the response."
                if collected_sources:
                    final_message_content += f" Sources: {', '.join(collected_sources[:3])}"
            except requests.exceptions.RequestException as e:
                logger.error(f"[SYNTHESIS REQUEST ERROR] {type(e).__name__}: {str(e)[:100]}")
                final_message_content = f"I found relevant information about '{user_query}' but encountered a connection error while formatting the response."
                if collected_sources:
                    final_message_content += f" Sources: {', '.join(collected_sources[:3])}"
            except Exception as e:
                logger.error(f"[SYNTHESIS ERROR] {type(e).__name__}: {str(e)[:100]}", exc_info=True)
                final_message_content = f"I processed your query about '{user_query}' but encountered an error while generating the final response."

        if final_message_content:
            logger.info(f"Preparing optimized final response")
            logger.info(f"[FINAL] final_message_content starts with: {final_message_content[:100] if final_message_content else 'None'}")
            response_parts = [final_message_content]
            if user_image and not user_query.strip() and collected_similar_images:
                response_parts.append("\n\n**Similar Images:**\n")
                for img in collected_similar_images[:8]:
                    if img and img.startswith("http"):
                        response_parts.append(f"![Similar Image]({img})\n")
            elif collected_images_from_web:
                response_parts.append("\n\n**Related Images:**\n")
                limit = 5 if user_image and user_query.strip() else 8
                for img in collected_images_from_web[:limit]:
                    if img and img.startswith("http"):
                        response_parts.append(f"![Image]({img})\n")
            if collected_sources:
                response_parts.append("\n\n---\n**Sources:**\n")
                unique_sources = sorted(list(set(collected_sources)))[:5]
                for i, src in enumerate(unique_sources):
                    response_parts.append(f"{i+1}. [{src}]({src})\n")
            response_with_sources = "".join(response_parts)
            
            # Save to conversation cache for future queries
            try:
                cache_metadata = {
                    "sources": collected_sources[:5],
                    "tool_calls": tool_call_count,
                    "iteration": current_iteration,
                    "had_cache_hit": memoized_results.get("cache_hit", False)
                }
                conversation_cache.add_to_cache(
                    query=user_query, 
                    response=final_message_content,
                    metadata=cache_metadata
                )
                cache_stats = conversation_cache.get_cache_stats()
                logger.info(f"[Pipeline] Saved to conversation cache. Stats: {cache_stats}")
            except Exception as e:
                logger.warning(f"[Pipeline] Failed to save to conversation cache: {e}")
            
            if event_id:
                yield format_sse("INFO", "<TASK>SUCCESS - Sending response</TASK>")
                chunk_size = 8000
                for i in range(0, len(response_with_sources), chunk_size):
                    chunk = response_with_sources[i:i+chunk_size]
                    event_name = "final" if i + chunk_size >= len(response_with_sources) else "final-part"
                    yield format_sse(event_name, chunk)
            else:
                yield response_with_sources
            return
        else:
            error_msg = f"[ERROR] ElixpoSearch failed - no final content after {max_iterations} iterations (tool_calls: {tool_call_count})"
            logger.error(error_msg)
            logger.error(f"[DIAGNOSTIC] final_message_content is: {repr(final_message_content)}, type: {type(final_message_content)}")
            logger.error(f"[DIAGNOSTIC] collected_sources: {collected_sources}, tool_call_count: {tool_call_count}")
            if collected_sources or tool_call_count > 0:
                logger.warning(f"[FALLBACK] Generating response from {len(collected_sources)} sources and {tool_call_count} tools")
                final_message_content = f"I searched for information about '{user_query}' and found some relevant sources. "
                if collected_sources:
                    final_message_content += f"Sources: {', '.join(collected_sources[:3])}"
                
                # Send the fallback response
                response_parts = [final_message_content]
                if collected_sources:
                    response_parts.append("\n\n---\n**Sources:**\n")
                    unique_sources = sorted(list(set(collected_sources)))[:5]
                    for i, src in enumerate(unique_sources):
                        response_parts.append(f"{i+1}. [{src}]({src})\n")
                response_with_fallback = "".join(response_parts)
                
                if event_id:
                    yield format_sse("INFO", "<TASK>FALLBACK - Sending collected information</TASK>")
                    chunk_size = 8000
                    for i in range(0, len(response_with_fallback), chunk_size):
                        chunk = response_with_fallback[i:i+chunk_size]
                        event_name = "final" if i + chunk_size >= len(response_with_fallback) else "final-part"
                        yield format_sse(event_name, chunk)
                else:
                    yield response_with_fallback
                return
            else:
                if event_id:
                    yield format_sse("error", "Ooops! I crashed, can you please query again?")
                return
    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        if event_id:
            yield format_sse("error", "<TASK>System Error</TASK>")
    finally:
        # Save persistent cache for this request
        if request_id:
            semantic_cache.save_for_request(request_id)
            logger.info(f"[Pipeline] Saved persistent cache for request {request_id}")
            
            # Save conversation cache to disk
            try:
                if "conversation_cache" in memoized_results:
                    conversation_cache.save_to_disk(session_id=request_id)
                    cache_stats = conversation_cache.get_cache_stats()
                    logger.info(f"[Pipeline] Saved conversation cache to disk: {cache_stats}")
            except Exception as e:
                logger.warning(f"[Pipeline] Failed to save conversation cache: {e}")
        
        logger.info("Optimized Search Completed")

