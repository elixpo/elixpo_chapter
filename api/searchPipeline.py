import requests
import json
from getImagePrompt import generate_prompt_from_image, replyFromImage
from tools import tools
from datetime import datetime, timezone
from getYoutubeDetails import transcribe_audio, youtubeMetadata
from getTimeZone import get_local_time
from utility import fetch_url_content_parallel, webSearch, imageSearch, cleanQuery
import random
import logging
import dotenv
import os
import asyncio
import time
import concurrent.futures  
from functools import lru_cache
from config import POLLINATIONS_ENDPOINT, RAG_CONTEXT_REFRESH
from session_manager import get_session_manager
from rag_engine import get_retrieval_system
from instruction import system_instruction, user_instruction, synthesis_instruction


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("elixpo")
dotenv.load_dotenv()
POLLINATIONS_TOKEN = os.getenv("TOKEN")
MODEL = os.getenv("MODEL")
logger.debug(f"Model configured: {MODEL}")


@lru_cache(maxsize=100)
def cached_web_search_key(query: str) -> str:
    return f"web_search_{hash(query)}"

def format_sse(event: str, data: str) -> str:
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_str}\n\n"


async def optimized_tool_execution(function_name: str, function_args: dict, memoized_results: dict, emit_event_func):
    try:
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
                if isinstance(search_results_raw, str):
                    image_dict = json.loads(search_results_raw)
                    if isinstance(image_dict, dict):
                        for src_url, imgs in image_dict.items():
                            if not imgs:
                                continue
                            for img_url in imgs[:8]:
                                if img_url and img_url.startswith("http"):
                                    image_urls.append(img_url)
                                    url_context += f"\t{img_url}\n"
                yield (f"Found relevant images:\n{url_context}\n", image_urls)
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
                yield parallel_results if parallel_results else "[No content fetched from URL]"
            except asyncio.TimeoutError:
                logger.warning(f"URL fetch timed out for {url}")
                yield f"[TIMEOUT] Fetching {url} took too long"
            except Exception as e:
                logger.error(f"URL fetch error for {url}: {e}")
                yield f"[ERROR] Failed to fetch {url}: {str(e)[:100]}"
        else:
            logger.warning(f"Unknown tool called: {function_name}")
            yield f"Unknown tool: {function_name}"
    except concurrent.futures.TimeoutError:
        logger.warning(f"Tool {function_name} timed out")
        yield f"[TIMEOUT] Tool {function_name} took too long to execute"
    except Exception as e:
        logger.error(f"Error executing tool {function_name}: {e}")
        yield f"[ERROR] Tool execution failed: {str(e)[:100]}"

async def run_elixposearch_pipeline(user_query: str, user_image: str, event_id: str = None):
    logger.info(f"Starting Optimized ElixpoSearch Pipeline for query: '{user_query}' with image: '{user_image[:50] + '...' if user_image else 'None'}'")
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
        
        retrieval_system = get_retrieval_system()
        session_manager = get_session_manager()
        session_id = session_manager.create_session(user_query)
        
        rag_engine = retrieval_system.get_rag_engine(session_id)
        logger.info(f"[Pipeline] RAG engine initialized for session {session_id}")
                   
        memoized_results = {
            "timezone_info": {},
            "web_searches": {},
            "fetched_urls": {},
            "youtube_metadata": {},
            "youtube_transcripts": {},
            "base64_cache": {}
        }
        
        max_iterations = 5
        current_iteration = 0
        collected_sources = []
        collected_images_from_web = []
        collected_similar_images = []
        final_message_content = None
        
        # Build initial RAG context from session data
        rag_context = session_manager.get_rag_context(
            session_id,
            refresh=RAG_CONTEXT_REFRESH,
            query_embedding=None
        )
        logger.info(f"[Pipeline] Initial RAG context built: {len(rag_context)} chars")
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

        while current_iteration < max_iterations:
            current_iteration += 1
            if messages and len(messages) > 0:
                for m in messages:
                    if m.get("role") == "assistant":
                        if m.get("content") is None:
                            m["content"] = "Processing your request..."
                        if "tool_calls" in m and not m.get("content"):
                            m["content"] = "Processing your request..."

            iteration_event = emit_event("INFO", f"<TASK>Analysing a sub-task.</TASK>")
            if iteration_event:
                yield iteration_event
            payload = {
                "model": MODEL,
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
                "seed": random.randint(1000, 9999),
                "max_tokens": 3000,
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
            except requests.exceptions.RequestException as e:
                logger.error(f"Pollinations API request failed at iteration {current_iteration}: {e}")
                if event_id:
                    yield format_sse("error", "<TASK>Connection Error</TASK>")
                break
            except Exception as e:
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
            for tool_call in tool_calls:
                function_name = tool_call["function"]["name"]
                function_args = json.loads(tool_call["function"]["arguments"])
                logger.info(f"Executing optimized tool: {function_name}")
                if event_id:
                    yield format_sse("INFO", f"<TASK>Running Task</TASK>")
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
                elif function_name == "web_search":
                    if "current_search_urls" in memoized_results:
                        collected_sources.extend(memoized_results["current_search_urls"])
                elif function_name == "fetch_full_text":
                    collected_sources.append(function_args.get("url"))
                    session_manager.add_content_to_session(session_id, function_args.get("url"), str(tool_result)[:2000])
                tool_outputs.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "name": function_name,
                    "content": str(tool_result) if tool_result else "No result"
                })
            messages.extend(tool_outputs)
            logger.info(f"Completed iteration {current_iteration}. Messages: {len(messages)}")
            if event_id:
                yield format_sse("INFO", f"<TASK>Synthesizing Information</TASK>")

        if not final_message_content and current_iteration >= max_iterations:
            synthesis_prompt = {
                "role": "user",
                "content": synthesis_instruction(user_query)
            }
            messages.append(synthesis_prompt)
            payload = {
                "model": MODEL,
                "messages": messages,
                "seed": random.randint(1000, 9999),
                "max_tokens": 3000,
                "stream": False,
            }

            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        requests.post,
                        POLLINATIONS_ENDPOINT,
                        json=payload,
                        headers=headers,
                        timeout=25
                    ),
                    timeout=30.0
                )
                response.raise_for_status()
                response_data = response.json()
                final_message_content = response_data["choices"][0]["message"].get("content")
            except asyncio.TimeoutError:
                logger.error("Synthesis step timed out")
            except requests.exceptions.RequestException as e:
                logger.error(f"Synthesis API call failed: {e}")
            except Exception as e:
                logger.error(f"Synthesis step failed: {e}")

        if final_message_content:
            logger.info(f"Preparing optimized final response")
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
            logger.info(f"Optimized response ready. Length: {len(response_with_sources)}")
            if event_id:
                yield format_sse("INFO", "<TASK>SUCCESS</TASK>")
                chunk_size = 8000
                for i in range(0, len(response_with_sources), chunk_size):
                    chunk = response_with_sources[i:i+chunk_size]
                    event_name = "final" if i + chunk_size >= len(response_with_sources) else "final-part"
                    yield format_sse(event_name, chunk)
            else:
                yield format_sse("final", response_with_sources)
            return
        else:
            error_msg = f"[ERROR] ElixpoSearch failed after {max_iterations} iterations"
            logger.error(error_msg)
            if event_id:
                yield format_sse("error", "Ooops! I crashed, can you please query again?")
                return
    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        if event_id:
            yield format_sse("error", "<TASK>System Error</TASK>")
    finally:
        logger.info("Optimized Search Completed")

if __name__ == "__main__":
    import asyncio
    async def main():
        user_query = "summarize me the content here in details https://www.geeksforgeeks.org/dsa/greedy-algorithms/"
        user_image = None
        event_id = None
        start_time = asyncio.get_event_loop().time()
        async_generator = run_elixposearch_pipeline(user_query, user_image, event_id=event_id)
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