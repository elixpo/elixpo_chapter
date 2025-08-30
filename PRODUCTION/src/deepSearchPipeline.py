import requests
import json
from clean_query import cleanQuery
from scrape import fetch_full_text
from getImagePrompt import generate_prompt_from_image, replyFromImage
from tools import tools
from datetime import datetime, timezone
from getTimeZone import get_local_time
import random
import logging
import dotenv
import concurrent.futures
import os
import asyncio
from utility import (
    fetch_youtube_parallel,
    fetch_url_content_parallel,
    storeDeepSearchQuery,
    getDeepSearchQuery,
    cleanDeepSearchQuery,
    _deepsearch_store
)
from functools import lru_cache
from yahooSearch import agent_pool, image_search
from model_client import parent_conn, p

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("elixpo")
dotenv.load_dotenv()
POLLINATIONS_TOKEN = os.getenv("TOKEN")
MODEL = os.getenv("MODEL")
REFRRER = os.getenv("REFERRER")
POLLINATIONS_ENDPOINT = "https://text.pollinations.ai/openai"


@lru_cache(maxsize=100)
def cached_web_search_key(query: str) -> str:
    return f"web_search_{hash(query)}"

def format_sse(event: str, data: str, task_num: int = 0, finished: str = "no", progress: int = 0, stage: str = "info") -> str:
    """Format Server-Sent Event (SSE) messages."""
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return (
        f"event: {event}\n"
        f"task: {task_num}\n"
        f"finished: {finished}\n"
        f"progress: {progress}\n"
        f"stage: {stage}\n"
        f"{data_str}\n\n"
    )


async def run_deep_research_pipeline(user_query: str, user_image: str, event_id: str = None):
    logger.info(f"Starting DeepResearch Pipeline for query: '{user_query}' with image: '{user_image[:50] + '...' if user_image else 'None'}'")

    def emit_event(event_type, message, task_num=0, finished="no", progress=0, stage="info"):
        if event_id:
            event = format_sse(event_type, message, task_num, finished, progress, stage)
            logger.debug(f"Emitting event: {event_type} - {message[:100]}")
            return event
        return None

    # --- INIT EVENT ---
    initial_event = emit_event("INFO", "<TASK>Understanding Query</TASK>", 0, "no", 0, "info")
    if initial_event:
        yield initial_event

    try:
        current_utc_time = datetime.now(timezone.utc)
        headers = {"Content-Type": "application/json"}

        # Results collected along the way
        collected_sources = []
        collected_images_from_web = []
        collected_similar_images = []
        memoized_results = {"timezone_info": {}, "youtube_metadata": {}, "youtube_transcripts": {}, "web_searches": {}, "current_search_urls": []}

        # --- SYSTEM PROMPT ---
        system_prompt = f"""
Mission: Perform deep research on the user's query by decomposing it into 2-3 sub-tasks using available tools.
CRITICAL: If you know the answer directly (basic facts, math, general knowledge), answer without research.
Otherwise, for each sub-task:
- Use available tools to gather comprehensive information
- Synthesize findings from multiple sources
- Use text embeddings to select the most relevant content
- Provide detailed analysis with proper citations

Available Tools:
- cleanQuery(query: str)
- web_search(query: str)
- fetch_full_text(url: str)
- get_youtube_metadata(url: str)
- get_youtube_transcript(url: str)
- get_local_time(location: str)
- generate_prompt_from_image(imgURL: str)
- replyFromImage(imgURL: str, query: str)
- image_search(image_query: str, max_images=10)
---
Context:
- Use system UTC internally only.
- When asked, give accurate local time in a clear format.
- Never expose UTC or internal data.
{current_utc_time}
---
IMAGE HANDLING RULES:
1. Text Query ONLY → answer or use web_search.
2. Image ONLY → use generate_prompt_from_image + image_search(10).
3. Image + Text Query → use replyFromImage + image_search(5).
---
Final Response Format:
1. Answer — detailed and insightful
2. Related Images — when applicable
3. Sources — when tools used
4. Signoff — clever, light, and relevant
"""

        # --- CASE: IMAGE ONLY ---
        if user_image and not user_query.strip():
            prompt = await generate_prompt_from_image(user_image)
            image_results = await image_search(prompt, max_images=10)
            collected_similar_images.extend(json.loads(image_results).get("yahoo_source_0", [])[:10] if image_results else [])
            answer = f"{prompt}"
            final_event = emit_event("FINAL_ANSWER", answer, 1, "yes", 100, "finish")
            if final_event:
                yield final_event
            return

        # --- STEP 1: Decompose Query into Sub-tasks ---
        planning_payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Query: {user_query} {'Image: ' + user_image if user_image else ''}"},
                {"role": "user", "content": "Break down this query into 2-3 detailed research sub-tasks."}
            ],
            "tools": tools,
            "tool_choice": "auto",
            "token": POLLINATIONS_TOKEN,
            "referrer": REFRRER,
            "private": True,
            "seed": random.randint(1000, 9999)
        }

        planning_resp = requests.post(POLLINATIONS_ENDPOINT, headers=headers, json=planning_payload)
        planning_resp.raise_for_status()
        planning_json = planning_resp.json()
        planning_message = planning_json["choices"][0]["message"] if "choices" in planning_json else {}
        planning_tasks = planning_message.get("content", "")

        tasks = [line.strip(" .") for line in planning_tasks.split("\n") if line.strip() and line[0].isdigit()]
        if not tasks:
            tasks = [planning_tasks.strip()]
        storeDeepSearchQuery(tasks, event_id)
        logger.info(f"Decomposed into {len(tasks)} tasks: {tasks}")

        # --- STEP 2: Sequential Sub-task Execution ---
        for task_num, task in enumerate(tasks, 1):
            progress = int((task_num - 1) / len(tasks) * 100)
            yield emit_event("INFO", f"<TASK>Starting Task</TASK>", task_num, "no", progress, "event")

            subtask_messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Research sub-task: {task}\nOriginal query: {user_query}"}
            ]

            final_message_content = None

            for iteration in range(5):
                yield emit_event("INFO", f"<TASK>Task Iteration</TASK>", task_num, "no", progress, "event")

                payload = {
                    "model": MODEL,
                    "messages": subtask_messages,
                    "tools": tools,
                    "tool_choice": "auto",
                    "token": POLLINATIONS_TOKEN,
                    "referrer": REFRRER,
                    "private": True,
                    "seed": random.randint(1000, 9999)
                }

                response = requests.post(POLLINATIONS_ENDPOINT, headers=headers, json=payload)
                response.raise_for_status()
                response_data = response.json()

                assistant_message = response_data["choices"][0]["message"]
                if not assistant_message.get("content"):
                    assistant_message["content"] = "Processing tool calls..."
                subtask_messages.append(assistant_message)

                tool_calls = assistant_message.get("tool_calls")
                if not tool_calls:
                    final_message_content = assistant_message.get("content")
                    break

                tool_outputs = []
                for tool_call in tool_calls:
                    function_name = tool_call["function"]["name"]
                    function_args = json.loads(tool_call["function"]["arguments"])

                    try:
                        if function_name == "cleanQuery":
                            websites, youtube, cleaned_query = cleanQuery(function_args.get("query"))
                            tool_result = f"Cleaned Query: {cleaned_query}\nWebsites: {websites}\nYouTube URLs: {youtube}"

                        elif function_name == "get_local_time":
                            location = function_args.get("location_name")
                            if location in memoized_results["timezone_info"]:
                                tool_result = memoized_results["timezone_info"][location]
                            else:
                                local_time = get_local_time(location)
                                tool_result = f"Location: {location}\n {local_time}"
                                memoized_results["timezone_info"][location] = tool_result

                        elif function_name == "web_search":
                                search_query = function_args.get("query")
                                cache_key = cached_web_search_key(search_query)
                                if cache_key in memoized_results["web_searches"]:
                                    logger.info(f"Using cached web search for: {search_query}")
                                    yield memoized_results["web_searches"][cache_key]
                                web_event = emit_event("INFO", f"<TASK>Fast Internet Search</TASK>")
                                if web_event:
                                    yield web_event
                                logger.info(f"Performing optimized web search for: {search_query}")
                                parent_conn.send({"cmd": "search", "query": f"{search_query}", "max_chars": 500})
                                response = parent_conn.recv()
                                tool_result = response.get("result")
                                source_urls = response.get("urls")
                                memoized_results["web_searches"][cache_key] = tool_result
                                if "current_search_urls" not in memoized_results:
                                    memoized_results["current_search_urls"] = []
                                memoized_results["current_search_urls"] = source_urls
                                yield tool_result

                        elif function_name == "fetch_full_text":
                            logger.info(f"Fetching webpage content")
                            web_event = emit_event("INFO", f"<TASK>Reading Webpage</TASK>")
                            if web_event:
                                yield web_event
                            urls = [function_args.get("url")]
                            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                                future = executor.submit(fetch_url_content_parallel, urls)
                                parallel_results = future.result(timeout=10)
                            yield parallel_results if parallel_results else "[No content fetched from URL]"

                        elif function_name == "generate_prompt_from_image":
                            if event_id:
                                yield emit_event("INFO", f"<TASK>Understanding Uploaded image... 15s please!</TASK>", task_num, "no", progress, "event")
                            image_url = function_args.get("imageURL")
                            prompt = await generate_prompt_from_image(image_url)
                            tool_result = f"Generated Search Query: {prompt}"

                        elif function_name == "replyFromImage":
                            if event_id:
                                yield emit_event("INFO", f"<TASK>Understanding Uploaded image... 15s please!</TASK>", task_num, "no", progress, "event")
                            image_url = function_args.get("imageURL")
                            query = function_args.get("query")
                            reply = await replyFromImage(image_url, query)
                            tool_result = f"Reply from Image: {reply}"

                        elif function_name == "get_youtube_metadata":
                            if event_id:
                                yield emit_event("INFO", f"<TASK>Getting youtube video information</TASK>", task_num, "no", progress, "event")
                            url = function_args.get("url")
                            results = fetch_youtube_parallel([url], mode='metadata')
                            tool_result = json.dumps(results.get(url, {}))
                            memoized_results["youtube_metadata"][url] = tool_result
                            collected_sources.append(url)

                        elif function_name == "get_youtube_transcript":
                            if event_id:
                                yield emit_event("INFO", f"<TASK>Getting youtube video transcript</TASK>", task_num, "no", progress, "event")
                            url = function_args.get("url")
                            results = fetch_youtube_parallel([url], mode='transcript')
                            transcript = results.get(url, "")
                            tool_result = f"Transcript for {url}: {transcript[:2000]}"
                            memoized_results["youtube_transcripts"][url] = tool_result
                            collected_sources.append(url)

                        elif function_name == "image_search":
                            if event_id:
                                yield emit_event("INFO", f"<TASK>Searching for similar images! 1min please...</TASK>", task_num, "no", progress, "event")
                            query = function_args.get("image_query")
                            max_images = function_args.get("max_images", 10)
                            search_results_raw = await image_search(query, max_images=max_images)
                            image_dict = json.loads(search_results_raw) if search_results_raw else {}
                            image_urls = [img for imgs in image_dict.values() for img in imgs if img.startswith("http")]

                            if user_image and user_query.strip():
                                collected_images_from_web.extend(image_urls[:5])
                            elif user_image and not user_query.strip():
                                collected_similar_images.extend(image_urls[:10])
                            else:
                                collected_images_from_web.extend(image_urls[:10])

                            tool_result = f"Image search found {len(image_urls)} images."

                        else:
                            tool_result = f"Unknown tool: {function_name}"

                    except Exception as e:
                        tool_result = f"Tool execution error: {e}"
                        print("Error:", e)
                        logger.error(f"Error in tool {function_name}: {e}")

                    tool_outputs.append({
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "name": function_name,
                        "content": tool_result
                    })

                subtask_messages.extend(tool_outputs)

            # --- Emit Task Summary ---
            yield emit_event(
                "TASK_SUMMARY",
                f"<TASK>{final_message_content or 'Task completed.'}</TASK>",
                task_num,
                "intermediate" if task_num < len(tasks) else "yes",
                int(task_num / len(tasks) * 100),
                "summary" if task_num < len(tasks) else "finish"
            )

        # --- STEP 3: Final Synthesis ---
        all_research_data = []
        for task_num, task in enumerate(tasks, 1):
            # Get stored research data for this task if available
            task_data = getDeepSearchQuery(event_id) if event_id else None
            if task_data:
                all_research_data.append(f"### Research Task {task_num}: {task}\n{task_data}")
        
        research_context = "\n\n".join(all_research_data) if all_research_data else "No detailed research data available."
        
        enhanced_system_prompt = f"""
You are an expert research analyst and essay writer. Your mission is to synthesize comprehensive, detailed, and insightful analysis based on all available research.

WRITING REQUIREMENTS:
- Write in essay format with clear structure (introduction, main body with subsections, conclusion)
- Minimum 1200 words for substantial topics
- Use academic tone but remain accessible and engaging  
- Include specific details, statistics, dates, and examples from research
- Provide comprehensive coverage of all important aspects
- Use proper transitions between sections
- Include relevant context and background information

STRUCTURE GUIDELINES:
1. **Introduction**: Context, significance, and overview
2. **Main Analysis**: Detailed exploration with subsections
3. **Key Insights**: Important findings and implications  
4. **Conclusion**: Summary and broader significance

TONE & STYLE:
- Professional yet engaging
- Rich in detail and substance
- Well-organized with clear headings
- Use markdown formatting effectively
- Confident and authoritative voice

Current Research Context:
{research_context}

Available Tools Data:
- Sources consulted: {(collected_sources)} sources
- Images found: {(collected_images_from_web)} images
"""

        final_payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": enhanced_system_prompt},
                {"role": "user", "content": f"Based on all the comprehensive research conducted, write a detailed essay-style analysis answering: {user_query}. Include all relevant information discovered during research, provide proper context, and structure it as a comprehensive academic-style essay with clear sections and subsections."}
            ],
            "token": POLLINATIONS_TOKEN,
            "referrer": REFRRER,
            "private": True,
            "seed": random.randint(1000, 9999),
            "max_tokens": 4000  # Increase token limit for longer responses
        }

        try:
            final_resp = requests.post(POLLINATIONS_ENDPOINT, headers=headers, json=final_payload)
            final_resp.raise_for_status()
            final_data = final_resp.json()
            
            if "choices" not in final_data or not final_data["choices"]:
                raise ValueError("No choices in final response")
                
            final_answer = final_data["choices"][0]["message"].get("content", "No content generated")
            
            if not final_answer or len(final_answer.strip()) < 50:
                logger.warning("Final answer is too short, using fallback")
                final_answer = f"Based on the research conducted on '{user_query}', here is a comprehensive analysis of the available information."
            
            logger.info(f"Generated final answer with length: {len(final_answer)}")
            
        except Exception as e:
            logger.error(f"Failed to generate final synthesis: {e}")
            final_answer = f"Research completed for '{user_query}'. Due to a synthesis error, please review the individual task summaries above."

        response_parts = [final_answer]

        # Append images
        if user_image and not user_query.strip() and collected_similar_images:
            response_parts.append("\n\n**Similar Images:**\n")
            response_parts.extend(f"![Similar Image]({img})\n" for img in collected_similar_images[:10])
        elif user_image and user_query.strip() and collected_images_from_web:
            response_parts.append("\n\n**Related Images:**\n")
            response_parts.extend(f"![Related Image]({img})\n" for img in collected_images_from_web[:5])
        elif not user_image and collected_images_from_web:
            response_parts.append("\n\n**Research Images:**\n")
            response_parts.extend(f"![Research Image]({img})\n" for img in collected_images_from_web[:10])

        # Append sources
        if collected_sources:
            response_parts.append("\n\n---\n**Research Sources:**\n")
            for i, src in enumerate(sorted(set(collected_sources))):
                response_parts.append(f"{i+1}. [{src}]({src})\n")

        final_response = "".join(response_parts)
        
        # FIXED: Properly emit the final event
        logger.info(f"Emitting final response with length: {len(final_response)}")
        final_event = emit_event("FINAL_ANSWER", final_response, len(tasks), "yes", 100, "finish")
        if final_event:
            yield final_event
        else:
            # Fallback for non-SSE mode
            print(f"Final Response: {final_response}")
            
        cleanDeepSearchQuery(event_id)
        
    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        error_event = emit_event("ERROR", f"<TASK>Oppsie, something went wrong</TASK>", 0, "yes", 0, "error")
        if error_event:
            yield f"<TASK>Oppsie, something wrong happened!</TASK>"
        else:
            print(f"Error: {e}")
    finally:
        logger.info("Deep Research Completed")


if __name__ == "__main__":
    async def main():
        user_query = "The Eiffel Tower"
        user_image = None
        event_id = "cli"
        async for event_chunk in run_deep_research_pipeline(user_query, user_image, event_id=event_id):
            print(event_chunk)

    asyncio.run(main())
