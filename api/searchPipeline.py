import requests
import json
from getImagePrompt import generate_prompt_from_image, replyFromImage
from tools import tools
from datetime import datetime, timezone
from getYoutubeDetails import transcribe_audio, youtubeMetadata
from getTimeZone import get_local_time
from utility import fetch_url_content_parallel, webSearch, imageSearch, cleanQuery
from semantic_cache import SemanticCache
import random
import logging
import dotenv
import os
import asyncio
import time
from multiprocessing.managers import BaseManager

from functools import lru_cache
from config import POLLINATIONS_ENDPOINT, RAG_CONTEXT_REFRESH
from instruction import system_instruction, user_instruction, synthesis_instruction


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("elixpo")
dotenv.load_dotenv()
POLLINATIONS_TOKEN = os.getenv("TOKEN")
MODEL = os.getenv("MODEL")
logger.debug(f"Model configured: {MODEL}")



class ModelServerClient(BaseManager):
    pass
ModelServerClient.register('CoreEmbeddingService')
ModelServerClient.register('accessSearchAgents')

_model_server = None

def get_model_server():
    global _model_server
    if _model_server is None:
        try:
            _model_server = ModelServerClient(address=("localhost", 5010), authkey=b"ipcService")
            _model_server.connect()
            logger.info("[SearchPipeline] Connected to model_server via IPC")
        except Exception as e:
            logger.error(f"[SearchPipeline] Failed to connect to model_server: {e}")
            raise
    return _model_server


@lru_cache(maxsize=100)
def cached_web_search_key(query: str) -> str:
    return f"web_search_{hash(query)}"

def format_sse(event: str, data: str) -> str:
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_str}\n\n"


async def optimized_tool_execution(function_name: str, function_args: dict, memoized_results: dict, emit_event_func):
    try:
        VALID_TOOL_NAMES = {tool["function"]["name"] for tool in tools}
        if function_name not in VALID_TOOL_NAMES:
            error_msg = f"Tool '{function_name}' is not available. Valid tools are: {', '.join(sorted(VALID_TOOL_NAMES))}"
            logger.error(f"Unknown tool called: {function_name}")
            yield error_msg
            return
        
        if function_name == "cleanQuery":
            websites, youtube, cleaned_query = cleanQuery(function_args.get("query"))
            yield f"Cleaned Query: {cleaned_query}\nWebsites: {websites}\nYouTube URLs: {youtube}"

        elif function_name == "get_local_time":
            location_name = function_args.get("location_name")
            if location_name in memoized_results["timezone_info"]:
                yield memoized_results["timezone_info"][location_name]
            localTime = get_local_time(location_name)
            result = f"Location: {location_name} and Local Time is: {localTime}, Please mention the location and time when making the final response!"
            memoized_results["timezone_info"][location_name] = result
            yield result

        elif function_name == "web_search":
            start_time = time.time()
            search_query = function_args.get("query")
            memoized_results["search_query"] = search_query
            web_event = emit_event_func("INFO", f"<TASK>Searching for '{search_query}'</TASK>")
            if web_event:
                yield web_event
            cache_key = cached_web_search_key(search_query)
            if cache_key in memoized_results["web_searches"]:
                logger.info(f"Using cached web search for: {search_query}")
                yield memoized_results["web_searches"][cache_key]
            logger.info(f"Performing optimized web search for: {search_query}")
            tool_result = webSearch(search_query)
            source_urls = tool_result
            memoized_results["web_searches"][cache_key] = tool_result
            if "current_search_urls" not in memoized_results:
                memoized_results["current_search_urls"] = []
            memoized_results["current_search_urls"] = source_urls
            yield tool_result

        elif function_name == "generate_prompt_from_image":
            web_event = emit_event_func("INFO", "<TASK>Analyzing Image</TASK>")
            if web_event:
                yield web_event
            image_url = function_args.get("imageURL")
            try:
                get_prompt = await generate_prompt_from_image(image_url)
                result = f"Generated Search Query: {get_prompt}"
                logger.info(f"Generated prompt: {get_prompt}")
                yield result
            except Exception as e:
                logger.error(f"Image analysis error: {e}")
                yield f"[ERROR] Image analysis failed: {str(e)[:100]}"

        elif function_name == "replyFromImage":
            web_event = emit_event_func("INFO", "<TASK>Processing Image Query</TASK>")
            if web_event:
                yield web_event
            image_url = function_args.get("imageURL")
            query = function_args.get("query")
            try:
                reply = await replyFromImage(image_url, query)
                result = f"Reply from Image: {reply}"
                logger.info(f"Reply from image for query '{query}': {reply[:100]}...")
                yield result
            except Exception as e:
                logger.error(f"Image query error: {e}")
                yield f"[ERROR] Image query failed: {str(e)[:100]}"

        elif function_name == "image_search":
            start_time = time.time()
            web_event = emit_event_func("INFO", f"<TASK>Finding Images</TASK>")
            if web_event:
                yield web_event
            elapsed = time.time() - start_time
            if elapsed > 10:
                web_event = emit_event_func("INFO", f"<TASK>Taking a bit of time... just a minute</TASK>")
                if web_event:
                    yield web_event
            image_query = function_args.get("image_query")
            max_images = function_args.get("max_images", 10)
            search_results_raw = await imageSearch(image_query, max_images=max_images)
            logger.info(f"Image search for '{image_query[:50]}...' completed.")
            image_urls = []
            url_context = ""
            try:
                # Handle different return types from imageSearch
                if isinstance(search_results_raw, list):
                    # Direct list of URLs from IPC service
                    image_urls = search_results_raw[:max_images]
                elif isinstance(search_results_raw, str):
                    # Try to parse as JSON (fallback for older format)
                    try:
                        image_dict = json.loads(search_results_raw)
                        if isinstance(image_dict, dict):
                            for src_url, imgs in image_dict.items():
                                if not imgs:
                                    continue
                                for img_url in imgs[:8]:
                                    if img_url and img_url.startswith("http"):
                                        image_urls.append(img_url)
                    except json.JSONDecodeError:
                        logger.warning(f"Could not parse image search results as JSON")
                
                # Build context string from URLs
                for url in image_urls:
                    if url.startswith("http"):
                        url_context += f"\t{url}\n"
                
                yield (f"Found {len(image_urls)} relevant images:\n{url_context}\n", image_urls)
            except Exception as e:
                logger.error(f"Failed to process image search results: {e}")
                yield ("Image search completed but results processing failed", [])

        elif function_name == "youtubeMetadata":
            url = function_args.get("url")
            web_event = emit_event_func("INFO", f"<TASK>Fetching YouTube Metadata</TASK>")
            if web_event:
                yield web_event
            metadata = await youtubeMetadata(url)
            result = f"YouTube Metadata:\n{metadata if metadata else '[No metadata available]'}"
            memoized_results["youtube_metadata"][url] = result
            yield result

        elif function_name == "transcribe_audio":
            logger.info("Getting YouTube transcript")
            web_event = emit_event_func("INFO", "<TASK>Processing Video, This will take a minute</TASK>")
            if web_event:
                yield web_event
            try:
                url = function_args.get("url")
                search_query = memoized_results.get("search_query", "")
                result = await transcribe_audio(url, full_transcript=False, query=search_query)
                transcript_text = f"YouTube Transcript:\n{result if result else '[No transcript available]'}"
                memoized_results["youtube_transcripts"][url] = transcript_text
                yield transcript_text
            except asyncio.TimeoutError:
                logger.warning("Transcribe audio timed out")
                yield "[TIMEOUT] Video transcription took too long"
            except Exception as e:
                logger.error(f"Transcription error: {e}")
                yield f"[ERROR] Failed to transcribe: {str(e)[:100]}"

        elif function_name == "fetch_full_text":
            logger.info("Fetching webpage content")
            web_event = emit_event_func("INFO", "<TASK>Reading Webpage</TASK>")
            if web_event:
                yield web_event
            url = function_args.get("url")
            try:
                queries = memoized_results.get("search_query", "")
                if isinstance(queries, str):
                    queries = [queries]
                # Use async directly instead of ThreadPoolExecutor
                parallel_results = await asyncio.wait_for(
                    asyncio.to_thread(fetch_url_content_parallel, queries, [url]),
                    timeout=15.0
                )
                
                # CRITICAL FIX #2: Ingest fetched content into vector store for RAG via IPC
                try:
                    model_server = get_model_server()
                    core_service = model_server.CoreEmbeddingService()
                    # Run ingest_url in thread to avoid blocking
                    ingest_result = await asyncio.to_thread(core_service.ingest_url, url)
                    chunks_count = ingest_result.get('chunks_ingested', 0)
                    logger.info(f"[Pipeline] Ingested {chunks_count} chunks from {url} into vector store")
                except Exception as e:
                    logger.warning(f"[Pipeline] Failed to ingest content to vector store: {e}")
                
                yield parallel_results if parallel_results else "[No content fetched from URL]"
            except asyncio.TimeoutError:
                logger.warning(f"URL fetch timed out for {url}")
                yield f"[TIMEOUT] Fetching {url} took too long"
            except Exception as e:
                logger.error(f"URL fetch error for {url}: {e}")
                yield f"[ERROR] Failed to fetch {url}: {str(e)[:100]}"
    except asyncio.TimeoutError:
        logger.warning(f"Tool {function_name} timed out")
        yield f"[TIMEOUT] Tool {function_name} took too long to execute"
    except Exception as e:
        logger.error(f"Error executing tool {function_name}: {e}")
        yield f"[ERROR] Tool execution failed: {str(e)[:100]}"

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
        
        # Connect to model_server via IPC instead of reinitializing
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
            "context_sufficient": False  # Early exit marker
        }
        
        # Initialize persistent semantic cache with 5-min TTL per request
        semantic_cache = SemanticCache(ttl_seconds=300, cache_dir="./cache")
        if request_id:
            semantic_cache.load_for_request(request_id)
            logger.info(f"[Pipeline] Loaded persistent cache for request {request_id}")
        
        max_iterations = 2 
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
                        if m.get("content") is None:
                            m["content"] = "Processing your request..."
                        if "tool_calls" in m and not m.get("content"):
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
            
            # OPTIMIZATION: Early exit if we processed many tools (good signal of completeness)
            if tool_call_count >= 6 and current_iteration >= 1:
                logger.info(f"[EARLY EXIT] Processed {tool_call_count} tools, stopping early")
                final_message_content = "Have gathered sufficient information. Let me compile the comprehensive response now."
                break

        if not final_message_content and current_iteration >= max_iterations:
            logger.info(f"[SYNTHESIS CONDITION MET] final_message_content={bool(final_message_content)}, current_iteration={current_iteration}, max_iterations={max_iterations}")
            if event_id:
                yield format_sse("INFO", f"<TASK>Generating Final Response</TASK>")
            
            logger.info("[SYNTHESIS] Starting synthesis of gathered information")
            synthesis_prompt = {
                "role": "user",
                "content": synthesis_instruction(user_query)
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
                try:
                    final_message_content = response_data["choices"][0]["message"].get("content")
                    if not final_message_content:
                        logger.error(f"[SYNTHESIS] API returned empty content. Full response: {response_data}")
                    else:
                        logger.info(f"[SYNTHESIS] Successfully extracted content. Length: {len(final_message_content)}")
                except (KeyError, IndexError, TypeError) as e:
                    logger.error(f"[SYNTHESIS] Failed to extract content from response. Expected structure not found. Error: {e}")
                    logger.error(f"[SYNTHESIS] Response data keys: {response_data.keys() if isinstance(response_data, dict) else 'Not a dict'}")
                    logger.error(f"[SYNTHESIS] Full response: {response_data}")
                    final_message_content = None
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
            if event_id:
                yield format_sse("INFO", "<TASK>SUCCESS - Sending response</TASK>")
                chunk_size = 8000
                for i in range(0, len(response_with_sources), chunk_size):
                    chunk = response_with_sources[i:i+chunk_size]
                    event_name = "final" if i + chunk_size >= len(response_with_sources) else "final-part"
                    yield format_sse(event_name, chunk)
            else:
                yield format_sse("final", response_with_sources)
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
        logger.info("Optimized Search Completed")

if __name__ == "__main__":
    import asyncio
    from api.commons.requestID import reqID
    async def main():
        user_query = "hii"
        user_image = None
        event_id = None
        request_id = reqID()  # Generate request ID for caching
        start_time = asyncio.get_event_loop().time()
        async_generator = run_elixposearch_pipeline(user_query, user_image, event_id=event_id, request_id=request_id)
        answer = None
        try:
            async for event_chunk in async_generator:
                if event_chunk and "event: final" in event_chunk:
                    lines = event_chunk.split('\n')
                    for line in lines:
                        if line.startswith('data: '):
                            if answer is None:
                                answer = line[6:]
                            else:
                                answer += line[6:]
                    break
                elif event_chunk and "event: final-part" in event_chunk:
                    lines = event_chunk.split('\n')
                    for line in lines:
                        if line.startswith('data: '):
                            if answer is None:
                                answer = line[6:]
                            else:
                                answer += line[6:]
        except Exception as e:
            logger.error(f"Error during async generator iteration: {e}", exc_info=True)
            answer = "Failed to get answer due to an error."
        end_time = asyncio.get_event_loop().time()
        processing_time = end_time - start_time
        if answer:
            print(f"\n--- Final Answer Received in {processing_time:.2f}s ---\n{answer}")
        else:
            print(f"\n--- No answer received after {processing_time:.2f}s ---")
    asyncio.run(main())