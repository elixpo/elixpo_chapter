import requests
import json
from clean_query import cleanQuery
from search import web_search, GoogleSearchAgentText, GoogleSearchAgentImage, image_search
from getYoutubeDetails import get_youtube_metadata, get_youtube_transcript
from scrape import fetch_full_text
from getImagePrompt import generate_prompt_from_image, replyFromImage
from tools import tools
from datetime import datetime, timezone
from getTimeZone import get_timezone_and_offset, convert_utc_to_local
import random
import concurrent.futures
import logging
import dotenv
import os
import asyncio


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("elixpo")
dotenv.load_dotenv()

POLLINATIONS_TOKEN=os.getenv("TOKEN")
MODEL=os.getenv("MODEL")
REFRRER=os.getenv("REFERRER")
POLLINATIONS_ENDPOINT = "https://text.pollinations.ai/openai"
print(MODEL, POLLINATIONS_TOKEN)

def fetch_url_content_parallel(urls, max_workers=10):
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_full_text, url): url for url in urls}
        results = {}
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                text_content, image_urls = future.result()
                results[url] = (text_content, image_urls)
            except Exception as e:
                logger.error(f"Failed fetching {url}: {e}")
                results[url] = ('[Failed]', [])
        logger.info(f"Fetched all URL information in parallel.")
        return results


def fetch_youtube_parallel(urls, mode='metadata', max_workers=10):
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        if mode == 'metadata':
            futures = {executor.submit(get_youtube_metadata, url): url for url in urls}
        else:
            futures = {executor.submit(get_youtube_transcript, url): url for url in urls}

        results = {}
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                results[url] = future.result()
            except Exception as e:
                logger.error(f"YouTube {mode} failed for {url}: {e}")
                results[url] = '[Failed]'
        return results

def format_sse(event: str, data: str) -> str:
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_str}\n\n"

async def run_elixposearch_pipeline(user_query: str, user_image: str, event_id: str = None):
    logger.info(f"Starting ElixpoSearch Pipeline for query: '{user_query}' with image: '{user_image[:50] + '...' if user_image else 'None'}'")
    
    def emit_event(event_type, message):
        if event_id:
            return format_sse(event_type, message)
        return None
    
    initial_event = emit_event("INFO", " Initiating Pipeline ")
    if initial_event:
        yield initial_event
    
    google_agent_text = GoogleSearchAgentText()
    google_agent_image = GoogleSearchAgentImage()

    try:
        await google_agent_text.start()
        await google_agent_image.start()
        google_req_count = 0  

        current_utc_datetime = datetime.now(timezone.utc)
        current_utc_time = current_utc_datetime.strftime("%H:%M UTC")
        current_utc_date = current_utc_datetime.strftime("%Y-%m-%d")
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
        Mission: Answer the user's query with reliable, well-researched, and well-explained information.

        **CRITICAL: Answer directly if you know the answer to a question (basic facts, math, general knowledge) without using tools.**

        Use tools only when:
        - You need current/recent information (news, stock prices, weather, etc.)
        - Current political positions or office holders (presidents, prime ministers, etc.)
        - The query explicitly asks for web research or sources
        - User provides an image
        - Time-sensitive information is requested
        - Queries asking "now", "current", "latest", "today", "recent"

        Your answers must prioritize:
        - Clarity and correctness
        - Concise explanations
        - Markdown formatting
        - Relevant citations if sources are used

        ---
        
        Available Tools:
        - cleanQuery(query: str)
        - web_search(query: str)
        - fetch_full_text(url: str)
        - get_youtube_metadata(url: str)
        - get_youtube_transcript(url: str)
        - get_timezone_and_offset(location: str)
        - convert_utc_to_local(utc_time, offset)
        - generate_prompt_from_image(imgURL: str)
        - replyFromImage(imgURL: str, query: str)
        - image_search(image_query: str, max_images=10)

        ---
        
        Context:
        Current UTC Date: {current_utc_date}  
        Current UTC Time: {current_utc_time}

        ---

        IMAGE-RELATED BEHAVIOR:

        **Crucial Sequence for Image Analysis:**

        1. User Provides Image ONLY (No Text Query):
        - Step 1: Call `generate_prompt_from_image()`.
        - Step 2: Perform an `image_search()` with the generated prompt to find **10 relevant images**.
        - Final Response: Say "Here are some images similar to the one you provided." Then show the images. Avoid explaining the image content unless asked.

        2. User Provides Image AND Text Query:
        - If web search is necessary:  
        - Call `generate_prompt_from_image()` for image context.  
        - Combine that context with the user query to perform a `web_search()` and fetch with `fetch_full_text()`.  
        - Use those to inform a complete response.  
        - If web search is **not** needed:  
        - Call `replyFromImage()` for combined insight.  
        - In both cases:  
        - Also perform `image_search()` using a query that mixes visual + text query intent to return **10 matching images**.

        3. User Provides Text Query ONLY (No Image):
        - Follow standard logic:
        - Answer directly if native knowledge suffices.
        - Otherwise, use `web_search()` for reliable info.
        - Additionally:
        - Perform `image_search()` with a search-friendly variant of the text query.
        - Return 10 matching images.

        ---
        
        Understanding & Multi-Query Handling:

        For any **user query containing multiple distinct sub-questions or requests**, process and answer **each part independently**:
        - Parse and understand the **true intent** behind every segment.
        - Perform individual **searches and tool calls** if needed for each.
        - Respond **clearly and separately** to each, even within one message.

        For every `image_search()`:
        - Always include the **10 relevant images** clearly under **"Visually Similar Images"** or **"Images from Related Web Results"**.
        - Never skip image rendering when applicable.

        If multiple image searches are done:
        - **Label results appropriately** so the user knows which query or subquery they belong to.

        End every response with a brief, clever **punchline or signoff** — light, witty, or memorable (but still relevant).

        ---

        General Decision Framework:
        1. Basic Knowledge/Math/Facts → Direct Answer
        2. Current Events/News → Use `web_search`
        3. Specific URLs → Use tools
        4. Explicit Research → Use tools
        5. Time-Sensitive → Use tools
        6. Keywords like "now", "latest", "recent" → Use `web_search`
        7. Image Present → Follow IMAGE-RELATED BEHAVIOR

        ---
        
        Final Response Structure:
        1. **Answer**
        2. **Visually Similar Images** (only if input had image)
        3. **Images from Related Web Results** (if web search or text-based image search was done)
        4. **Sources & References**
        5. **Summary**
        6. Write the punchline, just casually like a part of the response don't make a different heading for that

        Tone:
        - Professional, clear, and confident.
        - Balance detail and brevity.
        - **Answer in English**, unless told otherwise.
        - Don't reveal any internal working and don't mention anything which is not relevant
        """
    },
    {
        "role": "user", 
        "content": f"""Query: {user_query} -- Image: {user_image if user_image else 'No image provided'}"""
    }
    ]



        max_iterations = 7
        current_iteration = 0
        collected_sources = []
        collected_images_from_web = []
        collected_similar_images = []
        final_message_content = None

        while current_iteration < max_iterations:
            current_iteration += 1
            
            iteration_event = emit_event("INFO", f" Research Iteration {current_iteration} \n")
            if iteration_event:
                yield iteration_event
                
            payload = {
                "model": MODEL,
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
                "token": POLLINATIONS_TOKEN,
                "referrer": REFRRER,
                "temperature": 0.2,
                "private": True,
                "seed": random.randint(1000, 9999)
            }

            try:
                response = requests.post(POLLINATIONS_ENDPOINT, headers=headers, json=payload)
                response.raise_for_status()
                response_data = response.json()
            except requests.exceptions.RequestException as e:
                logger.error(f"Pollinations API call failed at iteration {current_iteration}: {e}")
                if event_id:
                    yield format_sse("error", f"[ERROR] Pollinations API call failed at iteration {current_iteration}: {e}")
                break

            assistant_message = response_data["choices"][0]["message"]
            messages.append(assistant_message)

            tool_calls = assistant_message.get("tool_calls")
            logger.info(f"Tool calls suggested by model: {tool_calls}")
            
            if not tool_calls:
                final_message_content = assistant_message.get("content")
                break

            tool_outputs = []
            for tool_call in tool_calls:
                function_name = tool_call["function"]["name"]
                function_args = json.loads(tool_call["function"]["arguments"])
                
                logger.info(f"Executing tool: {function_name} with args: {function_args}")
                if event_id:
                    yield format_sse("INFO", f" Execution In Progress ({function_name}) \n")
                

                try:                    
                    if function_name == "cleanQuery":
                        websites, youtube, cleaned_query = cleanQuery(function_args.get("query"))
                        tool_result = f"Cleaned Query: {cleaned_query}\nWebsites: {websites}\nYouTube URLs: {youtube}"

                    elif function_name == "get_timezone_and_offset":
                        location_name = function_args.get("location_name")
                        if location_name in memoized_results["timezone_info"]:
                            tool_result = memoized_results["timezone_info"][location_name]
                        else:
                            offset_str = get_timezone_and_offset(location_name)
                            local_datetime_str = convert_utc_to_local(current_utc_datetime, offset_str)
                            tool_result = f"Location: {location_name}\nUTC Offset: {offset_str}\nLocal Date & Time: {local_datetime_str}"
                            memoized_results["timezone_info"][location_name] = tool_result

                    elif function_name == "convert_utc_to_local":
                        utc_dt_str = function_args.get("utc_datetime")
                        utc_offset = function_args.get("utc_offset_hours")
                        utc_dt_obj = datetime.fromisoformat(utc_dt_str.replace('Z', '+00:00'))
                        tool_result = convert_utc_to_local(utc_dt_obj, utc_offset).strftime('%Y-%m-%d %H:%M:%S')

                    elif function_name == "web_search":
                        web_event = emit_event("INFO", f" Surfing Internet \n")
                        if web_event:
                            yield web_event
                        logger.info(f"Performing web search for: {function_args.get('query')}")
                        search_query = function_args.get("query")

                        google_req_count += 1
                        if google_req_count > 50:
                            logger.info("[INFO] Restarting GoogleSearchAgent after 50 requests.")
                            await google_agent_text.close()
                            google_agent_text = GoogleSearchAgentText()
                            await google_agent_text.start()
                            google_req_count = 1 

                        search_results_raw = await web_search(search_query, google_agent_text)
                        logger.info(f"Web search returned {len(search_results_raw)} results")
                        summaries = ""
                        if search_results_raw:
                            parallel_results = fetch_url_content_parallel(search_results_raw)
                            for url, (text_content, image_urls) in parallel_results.items():
                                summaries += f"\nURL: {url}\nSummary: {text_content}\nImages: {image_urls}\n"
                                collected_sources.append(url)
                                collected_images_from_web.extend(image_urls)
                        tool_result = summaries if summaries else "[No relevant web search results found.]"

                    elif function_name == "generate_prompt_from_image":
                        web_event = emit_event("INFO", f" Watching Images! \n")
                        if web_event:
                            yield web_event
                        image_url = function_args.get("imageURL")  
                        get_prompt = await generate_prompt_from_image(image_url)
                        tool_result = f"Generated Search Query: {get_prompt}"
                        logger.info(f"Generated prompt: {get_prompt}")

                    elif function_name == "replyFromImage":
                        web_event = emit_event("INFO", f" Understanding Images \n")
                        if web_event:
                            yield web_event
                        image_url = function_args.get("imageURL") 
                        query = function_args.get("query")
                        reply = await replyFromImage(image_url, query)
                        tool_result = f"Reply from Image: {reply}"
                        logger.info(f"Reply from image for query '{query}': {reply[:100]}...")

                    elif function_name == "image_search":
                        web_event = emit_event("INFO", f" Surfing Images \n")
                        if web_event:
                            yield web_event
                        image_query = function_args.get("image_query")
                        max_images = function_args.get("max_images", 10)
                        google_req_count += 1
                        if google_req_count > 50:
                            logger.info("[INFO] Restarting GoogleSearchAgent after 50 requests.")
                            await google_agent_image.close()
                            google_agent_image = GoogleSearchAgentImage()
                            await google_agent_image.start()
                            google_req_count = 1  

                        # Use the correct image_search signature and result handling
                        search_results_raw = await image_search(image_query, google_agent_image, max_images)
                        logger.info(f"Image search for '{image_query[:50]}...' returned results.")

                        image_urls = []
                        url_context = ""
                        try:
                            # search_results_raw is a JSON string mapping source_url -> [img_url, ...]
                            if isinstance(search_results_raw, str):
                                try:
                                    image_dict = json.loads(search_results_raw)
                                    if isinstance(image_dict, dict):
                                        for src_url, imgs in image_dict.items():
                                            if not imgs:
                                                continue
                                            for img_url in imgs:
                                                if img_url and img_url.startswith("http"):
                                                    image_urls.append(img_url)
                                                    url_context += f"\t{img_url}"
                                    else:
                                        logger.error("Image search result is not a dict.")
                                except json.JSONDecodeError:
                                    logger.error(f"Image search raw result is not valid JSON: {search_results_raw[:100]}...")
                            else:
                                logger.error("Image search result is not a string.")

                            if not isinstance(image_urls, list):
                                image_urls = []

                            if user_image: 
                                collected_similar_images.extend(image_urls)
                            elif not user_image and user_query: 
                                collected_images_from_web.extend(image_urls)
                        except Exception as e:
                            logger.error(f"Failed to process image search results: {e}", exc_info=True)
                            image_urls = []
                            url_context = ""
                        print(url_context)
                        tool_result = f"{url_context if url_context else ''}"

                    elif function_name == "get_youtube_metadata":
                        logger.info(f"Getting YouTube metadata for URLs")
                        urls = [function_args.get("url")]
                        results = fetch_youtube_parallel(urls, mode='metadata')
                        for url, metadata in results.items():
                            tool_result = json.dumps(metadata)
                            memoized_results["youtube_metadata"][url] = tool_result
                            collected_sources.append(url)

                    elif function_name == "get_youtube_transcript":
                        logger.info(f"Getting YouTube transcripts for URLs")
                        if event_id:
                            yield format_sse("INFO", f" Watching Youtube \n")
                        urls = [function_args.get("url")]
                        results = fetch_youtube_parallel(urls, mode='transcript')
                        for url, transcript in results.items():
                            tool_result = f"YouTube Transcript for {url}:\n{transcript if transcript else '[No transcript available]'}..."
                            memoized_results["youtube_transcripts"][url] = tool_result
                            collected_sources.append(url)

                    elif function_name == "fetch_full_text":
                        logger.info(f"Fetching full text for URLs")
                        if event_id:
                            yield format_sse("INFO", f" Writing Script \n")
                        urls = [function_args.get("url")]
                        parallel_results = fetch_url_content_parallel(urls)
                        for url, (text_content, image_urls) in parallel_results.items():
                            tool_result = f"URL: {url}\nText Preview: {text_content}...\nImages Found: {len(image_urls)}"
                            collected_sources.append(url)
                            collected_images_from_web.extend(image_urls)
                            memoized_results["fetched_urls"][url] = tool_result

                    else:
                        tool_result = f"Unknown tool: {function_name}"
                        logger.warning(f"Unknown tool called: {function_name}")

                except Exception as e:
                    tool_result = f"[ERROR] Tool {function_name} failed: {type(e).__name__}: {e}"
                    logger.error(f"Error executing tool {function_name}: {e}", exc_info=True)
                
                tool_outputs.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "name": function_name,
                    "content": tool_result
                })
            
            messages.extend(tool_outputs)
            logger.info(f"Completed tool execution for iteration {current_iteration}. Number of messages: {len(messages)}")
            if event_id:
                yield format_sse("INFO", f" All tools executed for iteration {current_iteration}. Waiting for next model response...\n")


        if final_message_content:
            logger.info(f"Preparing final response.")
            response_parts = []
            
            response_parts.append(final_message_content)

            if user_image and collected_similar_images:
                images_to_show = [img for img in collected_similar_images if img and img.startswith("http")][:10]
                if images_to_show:
                    response_parts.append("\n\n---\n**Visually Similar Images:**\n")
                    for img in images_to_show:
                        response_parts.append(f"![Similar Image]({img})\n")

            if collected_images_from_web:
                web_images = [img for img in collected_images_from_web if img and img.startswith("http")][:10]
                if web_images:
                    response_parts.append("\n\n---\n**Images from Related Web Results:**\n")
                    for img in web_images:
                        response_parts.append(f"![Web Image]({img})\n")

            if collected_sources:
                response_parts.append("\n\n---\n**Sources & References:**\n")
                unique_sources = sorted(list(set(collected_sources)))
                for i, src in enumerate(unique_sources):
                    response_parts.append(f"{i+1}. [{src}]({src})\n")

            response_parts.append("\n\n---\n**Summary:**\n")
            response_parts.append("This answer includes information, relevant images, and sources for further reading. If you need more details or updates, please specify your interest.\n")

            response_with_sources = "".join(response_parts)

            logger.info(f"Final response prepared. Total length: {len(response_with_sources)}")
            
            if event_id:
                yield format_sse("INFO", " SUCCESS")
                chunk_size = 5000 
                for i in range(0, len(response_with_sources), chunk_size):
                    chunk = response_with_sources[i:i+chunk_size]
                    event_name = "final" if i + chunk_size >= len(response_with_sources) else "final-part"
                    yield format_sse(event_name, chunk)
            else:
                yield format_sse("final", response_with_sources)
            return  
        else:
            error_msg = f"[ERROR] ElixpoSearch failed after {max_iterations} iterations. No final content generated. Model might be stuck in a tool loop or failed to generate a coherent response."
            logger.error(error_msg)
            if event_id:
                yield format_sse("error", error_msg)
                return  
            else:
                print(error_msg)
    finally:
        try:
            await google_agent_image.close()
            await google_agent_text.close()
            logger.info("GoogleSearchAgents closed successfully.")
        except Exception as e:
            logger.error(f"Failed to close GoogleSearchAgents: {e}")


if __name__ == "__main__":
    import asyncio
    
    async def main():
        # Test Cases
        # 1. Image only
        # user_query = ""
        # user_image = "https://media.istockphoto.com/id/1421310827/photo/young-graceful-ballerina-is-performing-classic-dance-beauty-and-elegance-of-classic-ballet.jpg?s=612x612&w=0&k=20&c=GQ1DVEarW4Y-lGD6y8jCb3YPIgap7gj-6ReS3C7Qi3Y=" 
        
        # 2. Image + Text Query (Your problematic case)
        user_query = "what's the current price of mango now in india? is it available now in india?"
        user_image = "https://media.istockphoto.com/id/1019835828/photo/mango-and-leaf-isolated-white-background.jpg?s=612x612&w=0&k=20&c=_nmOBzO9mGEitT2rUvO1xAX9jwL5mHYI8AFRbYeyy-A="

        # 3. Text only
        # user_query = "What is the capital of France and show me some images of it?"
        # user_image = ""
        
        event_id = None # Set to a string like "test_session_123" if you want SSE output

        async_generator = run_elixposearch_pipeline(user_query, user_image, event_id=event_id)
        answer = None
        
        try:
            async for event_chunk in async_generator:
                # print(event_chunk) # Keep this for detailed SSE debugging
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
        
        if answer:
            print(f"\n--- Final Answer Received ---\n{answer}")
        else:
            print("\n--- No answer received ---")
    
    asyncio.run(main())