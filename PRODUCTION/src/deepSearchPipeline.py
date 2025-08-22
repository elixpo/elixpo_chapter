import requests
import json
from clean_query import cleanQuery
from getYoutubeDetails import get_youtube_metadata, get_youtube_transcript
from scrape import fetch_full_text
from getImagePrompt import generate_prompt_from_image, replyFromImage
from tools import tools
from datetime import datetime, timezone
from getTimeZone import get_local_time
import random
import logging
import dotenv
import os
import asyncio
from textEmbedModel import retrieve_top_k
from utility import fetch_youtube_parallel, agent_manager, fetch_url_content_parallel, image_search, web_search

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("elixpo")
dotenv.load_dotenv()
POLLINATIONS_TOKEN = os.getenv("TOKEN")
MODEL = os.getenv("MODEL")
REFRRER = os.getenv("REFERRER")
POLLINATIONS_ENDPOINT = "https://text.pollinations.ai/openai"

def format_sse(event: str, data: str, task_num: int = 0, finished: str = "no", progress: int = 0, stage: str = "info") -> str:
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
            return format_sse(event_type, message, task_num, finished, progress, stage)
        return None

    initial_event = emit_event("INFO", "Initiating Deep Research Pipeline", 0, "no", 0, "info")
    if initial_event:
        yield initial_event

    try:
        current_utc_time = datetime.now(timezone.utc)
        headers = {"Content-Type": "application/json"}

        collected_sources = []
        collected_images_from_web = []
        collected_similar_images = []
        
        memoized_results = {
            "timezone_info": {},
            "web_searches": {},
            "fetched_urls": {},
            "youtube_metadata": {},
            "youtube_transcripts": {},
            "base64_cache": {}
        }

        system_prompt = f"""
Mission: Perform deep research on the user's query by decomposing it into 3-5 sub-tasks using available tools.
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
- generate_prompt_from_image(imageURL: str)
- replyFromImage(imageURL: str, query: str)
- image_search(image_query: str, max_images=10)

Context:
- Current UTC time: {current_utc_time}
- Use tools strategically to gather comprehensive information
- Always cite sources and provide evidence
- Maintain research depth and quality

IMAGE HANDLING RULES:
1. Text Query ONLY (No Image): Use web_search and other tools as needed
2. Image ONLY: Use generate_prompt_from_image() + image_search(max_images=10)
3. Image + Text Query: Use generate_prompt_from_image() + web_search() + image_search(max_images=5)

Final Response Format:
1. Comprehensive Answer with deep analysis
2. Related Images when applicable
3. All Sources and References
4. Research summary and insights

All output must be detailed, well-researched, and properly cited.
"""

        if user_image and not user_query.strip():
            prompt = await generate_prompt_from_image(user_image)
            image_results = await image_search(prompt, max_images=10)
            collected_similar_images.extend(image_results[:10])
            answer = f"**Image Analysis:**\n{prompt}"
            final_event = emit_event("FINAL_ANSWER", answer, 1, "yes", 100, "finish")
            if final_event:
                yield final_event
            return

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Query: {user_query} {'Image: ' + user_image if user_image else ''}"}
        ]

        planning_payload = {
            "model": MODEL,
            "messages": messages + [
                {"role": "user", "content": "Break down this query into 3-5 detailed research sub-tasks. For each task, specify what tools should be used and what information to gather."}
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
        planning_tasks = planning_resp.json()["choices"][0]["message"]["content"]
        
        tasks = [line.strip(" .") for line in planning_tasks.split("\n") if line.strip() and line[0].isdigit()]
        if not tasks:
            tasks = [planning_tasks.strip()]
        logger.info(f"Decomposed into {len(tasks)} tasks: {tasks}")

        for task_num, task in enumerate(tasks, 1):
            progress = int((task_num - 1) / len(tasks) * 100)
            
            task_start_event = emit_event("INFO", f"Starting Task {task_num}: {task}", task_num, "no", progress, "event")
            if task_start_event:
                yield task_start_event

            task_payload = {
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Research sub-task: {task}\nOriginal query: {user_query}"}
                ],
                "tools": tools,
                "tool_choice": "auto",
                "token": POLLINATIONS_TOKEN,
                "referrer": REFRRER,
                "private": True,
                "seed": random.randint(1000, 9999)
            }

            max_tool_iterations = 5
            current_iteration = 0
            task_messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Research sub-task: {task}\nOriginal query: {user_query}"}
            ]

            while current_iteration < max_tool_iterations:
                current_iteration += 1
                
                iteration_event = emit_event("INFO", f"Task {task_num} - Research Iteration {current_iteration}", task_num, "no", progress, "event")
                if iteration_event:
                    yield iteration_event

                try:
                    response = requests.post(POLLINATIONS_ENDPOINT, headers=headers, json={
                        "model": MODEL,
                        "messages": task_messages,
                        "tools": tools,
                        "tool_choice": "auto",
                        "token": POLLINATIONS_TOKEN,
                        "referrer": REFRRER,
                        "private": True,
                        "seed": random.randint(1000, 9999)
                    })
                    response.raise_for_status()
                    response_data = response.json()
                except Exception as e:
                    logger.error(f"API call failed for task {task_num}: {e}")
                    break

                assistant_message = response_data["choices"][0]["message"]
                task_messages.append(assistant_message)
                tool_calls = assistant_message.get("tool_calls")

                if not tool_calls:
                    break

                tool_outputs = []
                for tool_call in tool_calls:
                    function_name = tool_call["function"]["name"]
                    function_args = json.loads(tool_call["function"]["arguments"])
                    
                    logger.info(f"Task {task_num}: Executing tool {function_name}")
                    tool_event = emit_event("INFO", f"Task {task_num}: Using {function_name}", task_num, "no", progress, "event")
                    if tool_event:
                        yield tool_event

                    try:
                        if function_name == "cleanQuery":
                            websites, youtube, cleaned_query = cleanQuery(function_args.get("query"))
                            tool_result = f"Cleaned Query: {cleaned_query}\nWebsites: {websites}\nYouTube URLs: {youtube}"

                        elif function_name == "get_local_time":
                            location_name = function_args.get("location_name")
                            if location_name in memoized_results["timezone_info"]:
                                tool_result = memoized_results["timezone_info"][location_name]
                            else:
                                localTime = get_local_time(location_name)
                                tool_result = f"Location: {location_name}\n{localTime}"
                                memoized_results["timezone_info"][location_name] = tool_result

                        elif function_name == "web_search":
                            search_query = function_args.get("query")
                            search_results_raw = await web_search(search_query)
                            urls = [url for url in search_results_raw if url and url.startswith("http")]
                            collected_sources.extend(urls)
                            
                            surfing_event = emit_event("SURFING_WEB", f"Task {task_num}: Found {len(urls)} URLs", task_num, "no", progress, "event")
                            if surfing_event:
                                yield surfing_event
                                
                            if urls:
                                parallel_results = fetch_url_content_parallel(urls)
                                url_texts = [(url, parallel_results) for url in urls if parallel_results]
                                
                                if url_texts:
                                    doc_texts = [t[1] for t in url_texts]
                                    try:
                                        top_chunks = retrieve_top_k(doc_texts, search_query, k=min(3, len(doc_texts)))
                                        context = "\n\n".join(top_chunks)
                                        tool_result = f"Web search results for '{search_query}':\n{context}"
                                    except Exception as e:
                                        tool_result = f"Web search results: {parallel_results}"
                                else:
                                    tool_result = "No relevant web results found."
                            else:
                                tool_result = "No URLs found in search results."

                        elif function_name == "generate_prompt_from_image":
                            image_url = function_args.get("imageURL")
                            get_prompt = await generate_prompt_from_image(image_url)
                            tool_result = f"Image Analysis: {get_prompt}"

                        elif function_name == "replyFromImage":
                            image_url = function_args.get("imageURL")
                            query = function_args.get("query")
                            reply = await replyFromImage(image_url, query)
                            tool_result = f"Image Response: {reply}"

                        elif function_name == "image_search":
                            image_query = function_args.get("image_query")
                            max_images = function_args.get("max_images", 10)
                            search_results_raw = await image_search(image_query, max_images=max_images)
                            
                            image_urls = []
                            if isinstance(search_results_raw, str):
                                try:
                                    image_dict = json.loads(search_results_raw)
                                    if isinstance(image_dict, dict):
                                        for src_url, imgs in image_dict.items():
                                            if imgs:
                                                for img_url in imgs:
                                                    if img_url and img_url.startswith("http"):
                                                        image_urls.append(img_url)
                                except json.JSONDecodeError:
                                    pass
                            
                            if user_image and user_query.strip():
                                collected_images_from_web.extend(image_urls[:5])
                            elif user_image and not user_query.strip():
                                collected_similar_images.extend(image_urls[:10])
                            elif not user_image and user_query.strip():
                                collected_images_from_web.extend(image_urls[:10])
                            
                            tool_result = f"Found {len(image_urls)} relevant images for '{image_query}'"

                        elif function_name == "get_youtube_metadata":
                            urls = [function_args.get("url")]
                            results = fetch_youtube_parallel(urls, mode='metadata')
                            for url, metadata in results.items():
                                tool_result = json.dumps(metadata)
                                collected_sources.append(url)

                        elif function_name == "get_youtube_transcript":
                            urls = [function_args.get("url")]
                            results = fetch_youtube_parallel(urls, mode='transcript')
                            for url, transcript in results.items():
                                tool_result = f"YouTube Transcript: {transcript if transcript else 'No transcript available'}"
                                collected_sources.append(url)

                        elif function_name == "fetch_full_text":
                            urls = [function_args.get("url")]
                            parallel_results = fetch_url_content_parallel(urls)
                            tool_result = parallel_results if parallel_results else "No content fetched"

                        else:
                            tool_result = f"Unknown tool: {function_name}"

                    except Exception as e:
                        tool_result = f"Tool execution error: {e}"
                        logger.error(f"Error in tool {function_name}: {e}")

                    tool_outputs.append({
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "name": function_name,
                        "content": tool_result
                    })

                task_messages.extend(tool_outputs)

            progress = int(task_num / len(tasks) * 100)
            stage = "summary" if task_num < len(tasks) else "finish"
            
            final_task_message = task_messages[-2] if len(task_messages) > 1 else {"content": "Research completed"}
            task_summary = final_task_message.get("content", "Task completed")
            
            summary_event = emit_event(
                "TASK_SUMMARY",
                f"### Task {task_num} Complete: {task}\n\n{task_summary}",
                task_num,
                "intermediate" if task_num < len(tasks) else "yes",
                progress,
                stage
            )
            if summary_event:
                yield summary_event

        final_payload = {
            "model": MODEL,
            "messages": messages + [
                {"role": "user", "content": "Based on all the research above, provide a comprehensive final answer with proper citations and insights."}
            ],
            "token": POLLINATIONS_TOKEN,
            "referrer": REFRRER,
            "private": True,
            "seed": random.randint(1000, 9999)
        }
        
        try:
            loop = asyncio.get_event_loop()
            final_resp = await loop.run_in_executor(None, lambda: requests.post(POLLINATIONS_ENDPOINT, headers=headers, json=final_payload))
            final_resp.raise_for_status()
            final_answer = final_resp.json()["choices"][0]["message"]["content"]

            response_parts = [final_answer]

            if user_image and not user_query.strip() and collected_similar_images:
                response_parts.append("\n\n**Similar Images:**\n")
                for img in collected_similar_images[:10]:
                    if img and img.startswith("http"):
                        response_parts.append(f"![Similar Image]({img})\n")

            elif user_image and user_query.strip() and collected_images_from_web:
                response_parts.append("\n\n**Related Images:**\n")
                for img in collected_images_from_web[:5]:
                    if img and img.startswith("http"):
                        response_parts.append(f"![Related Image]({img})\n")

            elif not user_image and user_query.strip() and collected_images_from_web:
                response_parts.append("\n\n**Research Images:**\n")
                for img in collected_images_from_web[:10]:
                    if img and img.startswith("http"):
                        response_parts.append(f"![Research Image]({img})\n")

            if collected_sources:
                response_parts.append("\n\n---\n**Research Sources:**\n")
                unique_sources = sorted(list(set(collected_sources)))
                for i, src in enumerate(unique_sources):
                    response_parts.append(f"{i+1}. [{src}]({src})\n")

            final_response = "".join(response_parts)
            final_event = emit_event("FINAL_ANSWER", final_response, len(tasks), "yes", 100, "finish")
            if final_event:
                yield final_event
                
        except Exception as e:
            logger.error(f"Final synthesis failed: {e}")
            error_event = emit_event("ERROR", f"Final synthesis failed: {e}", len(tasks), "yes", 100, "error")
            if error_event:
                yield error_event

    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        if event_id:
            yield format_sse("error", f"DeepResearch failed: {e}", 0, "yes", 0, "error")
    finally:
        logger.info("Deep Research Completed")

if __name__ == "__main__":
    async def main():
        user_query = "The eiffel tower"
        user_image = None
        event_id = "cli"
        async_generator = run_deep_research_pipeline(user_query, user_image, event_id=event_id)
        try:
            async for event_chunk in async_generator:
                print(event_chunk)
        except Exception as e:
            print(f"Error: {e}")