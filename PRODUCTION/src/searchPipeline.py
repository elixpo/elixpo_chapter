import requests
import json
from clean_query import cleanQuery
from getImagePrompt import generate_prompt_from_image, replyFromImage
from tools import tools
from datetime import datetime, timezone
from getTimeZone import get_local_time
from utility import fetch_youtube_parallel, agent_manager, fetch_url_content_parallel
import random
import logging
import dotenv
import os
import asyncio
import concurrent.futures
from model_client import parent_conn, p
from functools import lru_cache
from yahooSearch import agent_pool, image_search




logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("elixpo")
dotenv.load_dotenv()
POLLINATIONS_TOKEN = os.getenv("TOKEN")
MODEL = os.getenv("MODEL")
REFRRER = os.getenv("REFERRER")
POLLINATIONS_ENDPOINT = "https://text.pollinations.ai/openai"
print(MODEL, POLLINATIONS_TOKEN)

async def initialize_search_agents():
    if not agent_pool.initialized:
        logger.info("Initializing search agent pool...")
        await agent_pool.initialize_pool()
        logger.info("Search agent pool pre-warmed and ready")
        status = await agent_pool.get_status()
        logger.info(f"Agent pool status: {status}")
    else:
        logger.info("Search agent pool already initialized")

# model = get_embedding_model()

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
            search_query = function_args.get("query")
            cache_key = cached_web_search_key(search_query)
            if cache_key in memoized_results["web_searches"]:
                logger.info(f"Using cached web search for: {search_query}")
                yield memoized_results["web_searches"][cache_key]
            web_event = emit_event_func("INFO", f"<TASK>Fast Internet Search</TASK>")
            if web_event:
                yield web_event
            logger.info(f"Performing optimized web search for: {search_query}")
            parent_conn.send({"cmd": "search", "query": f"{search_query}", "max_chars": 2000})
            response = parent_conn.recv()
            tool_result = response.get("result")
            source_urls = response.get("urls")
            memoized_results["web_searches"][cache_key] = tool_result
            if "current_search_urls" not in memoized_results:
                memoized_results["current_search_urls"] = []
            memoized_results["current_search_urls"] = source_urls
            yield tool_result
        elif function_name == "generate_prompt_from_image":
            web_event = emit_event_func("INFO", f"<TASK>Analyzing Image</TASK>")
            if web_event:
                yield web_event
            image_url = function_args.get("imageURL")
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(asyncio.create_task, generate_prompt_from_image(image_url))
                get_prompt = await future.result()
            result = f"Generated Search Query: {get_prompt}"
            logger.info(f"Generated prompt: {get_prompt}")
            yield result
        elif function_name == "replyFromImage":
            web_event = emit_event_func("INFO", f"<TASK>Processing Image Query</TASK>")
            if web_event:
                yield web_event
            image_url = function_args.get("imageURL")
            query = function_args.get("query")
            reply = await replyFromImage(image_url, query)
            result = f"Reply from Image: {reply}"
            logger.info(f"Reply from image for query '{query}': {reply[:100]}...")
            yield result
        elif function_name == "image_search":
            web_event = emit_event_func("INFO", f"<TASK>Finding Images</TASK>")
            if web_event:
                yield web_event
            image_query = function_args.get("image_query")
            max_images = function_args.get("max_images", 10)
            search_results_raw = await image_search(image_query, max_images=max_images)
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
        elif function_name == "get_youtube_metadata":
            logger.info(f"Getting YouTube metadata")
            urls = [function_args.get("url")]
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(fetch_youtube_parallel, urls, 'metadata')
                results = future.result(timeout=10)
            for url, metadata in results.items():
                result = json.dumps(metadata)
                memoized_results["youtube_metadata"][url] = result
                yield result
        elif function_name == "get_youtube_transcript":
            logger.info(f"Getting YouTube transcript")
            web_event = emit_event_func("INFO", f"<TASK>Processing Video</TASK>")
            if web_event:
                yield web_event
            urls = [function_args.get("url")]
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(fetch_youtube_parallel, urls, 'transcript')
                results = future.result(timeout=15)
            for url, transcript in results.items():
                result = f"YouTube Transcript for {url}:\n{transcript if transcript else '[No transcript available]'}"
                memoized_results["youtube_transcripts"][url] = result
                yield result
        elif function_name == "fetch_full_text":
            logger.info(f"Fetching webpage content")
            web_event = emit_event_func("INFO", f"<TASK>Reading Webpage</TASK>")
            if web_event:
                yield web_event
            urls = [function_args.get("url")]
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(fetch_url_content_parallel, urls)
                parallel_results = future.result(timeout=10)
            yield parallel_results if parallel_results else "[No content fetched from URL]"
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
        headers = {"Content-Type": "application/json"}
        memoized_results = {
            "timezone_info": {},
            "web_searches": {},
            "fetched_urls": {},
            "youtube_metadata": {},
            "youtube_transcripts": {},
            "base64_cache": {}
        }
        messages = [
            {
                "role": "system",
                "content": f"""
                Mission: Provide comprehensive, detailed, and well-researched answers that synthesize ALL gathered information into rich content.
                CRITICAL CONTENT REQUIREMENTS:
                - Write detailed, substantive responses (minimum 800 words for substantial topics)
                - SYNTHESIZE information from all tools into the main answer content
                - Include specific facts, data, statistics, examples from your research
                - Structure responses with clear sections and detailed explanations
                - The main content should be 80% of your response, sources only 20%
                - Time Context if needed use this information to resolve any time related queries: {current_utc_time}
                - Mention time of the respective location if user query is time related.
                RESPONSE PRIORITY ORDER:
                1. **Comprehensive Main Answer** (most important - detailed analysis)
                2. **Supporting Details & Context** (from research findings)
                3. **Images** (when applicable)
                4. **Sources** (minimal, at the end)
                USE TOOLS STRATEGICALLY:
                Answer directly if you know the answer (basic facts, math, general knowledge) — no tools needed.
                Use tools when:
                - Query needs recent info (weather, news, stocks, etc.)
                - Current events or time-sensitive information
                - User provides an image
                - Explicit research requested
                When you use tools, INTEGRATE the results into your main response content, don't just list sources.
                Available Tools:
                - cleanQuery(query: str)
                - web_search(query: str) - Optimized for speed, limit to 3-4 searches
                - fetch_full_text(url: str)
                - get_youtube_metadata(url: str)
                - get_youtube_transcript(url: str)
                - get_local_time(location: str)
                - generate_prompt_from_image(imgURL: str)
                - replyFromImage(imgURL: str, query: str)
                - image_search(image_query: str, max_images=10)
                IMAGE HANDLING:
                1. Text Only → Answer directly or web_search (NO image_search unless requested)
                2. Image Only → generate_prompt + image_search(10) + detailed analysis
                3. Image + Text → replyFromImage + image_search(5) + comprehensive response
                WRITING STYLE:
                - Rich, informative content with specific details
                - Professional yet conversational tone
                - Well-structured with clear sections
                - Include ALL relevant information from research
                - Make it comprehensive and thoroughly informative
                - Sources should supplement, not dominate the response
                """
            },
            {
                "role": "user",
                "content": f"""Query: {user_query} {"Image: " + user_image if user_image else ''}"""
            }
        ]
        max_iterations = 5
        current_iteration = 0
        collected_sources = []
        collected_images_from_web = []
        collected_similar_images = []
        final_message_content = None

        while current_iteration < max_iterations:
            current_iteration += 1
            iteration_event = emit_event("INFO", f"<TASK>Analysing a sub-task.</TASK>")
            if iteration_event:
                yield iteration_event
            payload = {
                "model": MODEL,
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
                "token": POLLINATIONS_TOKEN,
                "referrer": REFRRER,
                "private": True,
                "seed": random.randint(1000, 9999),
                "max_tokens": 3000
            }
            try:
                loop = asyncio.get_event_loop()
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(requests.post, POLLINATIONS_ENDPOINT, headers=headers, json=payload, timeout=20)
                    response = await loop.run_in_executor(None, lambda: future.result())
                response.raise_for_status()
                response_data = response.json()
            except Exception as e:
                logger.error(f"Pollinations API call failed at iteration {current_iteration}: {e}")
                if event_id:
                    yield format_sse("error", f"<TASK>Connection Error - Retrying</TASK>")
                break
            assistant_message = response_data["choices"][0]["message"]
            if not assistant_message.get("content") and assistant_message.get("tool_calls"):
                assistant_message["content"] = "I'll help you with that. Let me gather the information you need."
            elif not assistant_message.get("content"):
                assistant_message["content"] = "Processing your request..."
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
                if function_name in ["get_youtube_metadata", "get_youtube_transcript"]:
                    collected_sources.append(function_args.get("url"))
                elif function_name == "web_search":
                    if "current_search_urls" in memoized_results:
                        collected_sources.extend(memoized_results["current_search_urls"])
                elif function_name == "fetch_full_text":
                    collected_sources.append(function_args.get("url"))
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
                "content": f""" Provide me with a detailed aggregation of the -- {user_query}".
                Requirements:
                - Synthesize ALL information into a detailed response with max (3000 tokens) adjust if needed
                - Respond in proper markdown formatting
                - Pack all the details
                - Include specific facts and context from the research
                - Structure with clear sections
                - Include sources with a different section
                """
            }
            messages.append(synthesis_prompt)
            payload = {
                "model": MODEL,
                "messages": messages,
                "token": POLLINATIONS_TOKEN,
                "referrer": REFRRER,
                "private": True,
                "seed": random.randint(1000, 9999),
                "max_tokens": 3000
            }
            try:
                response = requests.post(POLLINATIONS_ENDPOINT, headers=headers, json=payload, timeout=25)
                response.raise_for_status()
                response_data = response.json()
                final_message_content = response_data["choices"][0]["message"].get("content")
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
                yield format_sse("error", "<TASK>Unable to generate response</TASK>")
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
        await initialize_search_agents()
        user_query = "latest news from ai in india 2025"
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
        status = await agent_manager.get_agent_status()
        print(f"\nFinal Agent Status: {status}")
    asyncio.run(main())