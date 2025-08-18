import requests
import json
from clean_query import cleanQuery
from yahooSearch import YahooSearchAgentText, YahooSearchAgentImage, ddgs_search, mojeek_form_search, ddgs_search_module_search
from getYoutubeDetails import get_youtube_metadata, get_youtube_transcript
from scrape import fetch_full_text
from getImagePrompt import generate_prompt_from_image, replyFromImage
from tools import tools
from datetime import datetime, timezone
from getTimeZone import get_local_time
import random
import concurrent.futures
import logging
import dotenv
import os
import asyncio
import threading
from collections import deque

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("elixpo")
dotenv.load_dotenv()
POLLINATIONS_TOKEN=os.getenv("TOKEN")
MODEL=os.getenv("MODEL")
REFRRER=os.getenv("REFERRER")
POLLINATIONS_ENDPOINT = "https://text.pollinations.ai/openai"
print(MODEL, POLLINATIONS_TOKEN)

# Agent Management with Queue System
class SearchAgentManager:
    def __init__(self, max_concurrent_agents=10):
        self.max_concurrent_agents = max_concurrent_agents
        self.active_text_agents = 0
        self.active_image_agents = 0
        self.text_queue = deque()
        self.image_queue = deque()
        self.text_lock = asyncio.Lock()
        self.image_lock = asyncio.Lock()
        self.port_range_start = 9000
        self.port_range_end = 9999
        self.used_ports = set()
        
    def _get_random_port(self):
        while True:
            port = random.randint(self.port_range_start, self.port_range_end)
            if port not in self.used_ports:
                self.used_ports.add(port)
                return port
    
    def _release_port(self, port):
        self.used_ports.discard(port)
    
    async def get_text_search_result(self, query, max_links=10):
        async with self.text_lock:
            # Try Yahoo first
            if self.active_text_agents < self.max_concurrent_agents:
                self.active_text_agents += 1
                port = self._get_random_port()
                try:
                    logger.info(f"Creating new Yahoo text agent on port {port} for query: {query}")
                    agent = YahooSearchAgentText(custom_port=port)
                    await agent.start()
                    await asyncio.sleep(random.uniform(1, 3))
                    results = await agent.search(query, max_links)
                    if results:
                        logger.info(f"Yahoo search completed for '{query}' with {len(results)} results")
                        return results
                    else:
                        logger.warning(f"Yahoo search returned no results for '{query}'. Trying DDGS fallback.")
                except Exception as e:
                    logger.error(f"Yahoo search failed for '{query}': {e}. Trying DDGS fallback.")
                finally:
                    try:
                        await agent.close()
                    except:
                        pass
                    self.active_text_agents -= 1
                    self._release_port(port)
                    logger.info(f"Text agent on port {port} closed. Active agents: {self.active_text_agents}")
            else:
                logger.warning(f"Max concurrent text agents reached ({self.max_concurrent_agents}). Queueing request for: {query}")
                await asyncio.sleep(random.uniform(2, 5))
                return await self.get_text_search_result(query, max_links)

        # Fallback 1: DDGS
        try:
            logger.info(f"Trying DDGS fallback for: {query}")
            ddgs_results = ddgs_search_module_search(query)
            if ddgs_results:
                logger.info(f"DDGS fallback returned {len(ddgs_results)} results for '{query}'")
                return ddgs_results[:max_links]
            else:
                logger.warning(f"DDGS fallback returned no results for '{query}'. Trying Mojeek fallback.")
        except Exception as e:
            logger.error(f"DDGS fallback failed for '{query}': {e}. Trying Mojeek fallback.")

        # Fallback 2: Mojeek
        try:
            logger.info(f"Trying Mojeek fallback for: {query}")
            mojeek_results = mojeek_form_search(query)
            if mojeek_results:
                logger.info(f"Mojeek fallback returned {len(mojeek_results)} results for '{query}'")
                return mojeek_results[:max_links]
            else:
                logger.warning(f"Mojeek fallback returned no results for '{query}'.")
        except Exception as e:
            logger.error(f"Mojeek fallback failed for '{query}': {e}")

        logger.error(f"All search engines failed for query: '{query}'")
        return []
                    
    
    async def get_image_search_result(self, query, max_images=10):
        """Get image search results with agent management and queueing"""
        async with self.image_lock:
            if self.active_image_agents < self.max_concurrent_agents:
                self.active_image_agents += 1
                port = self._get_random_port()
                
                try:
                    logger.info(f"Creating new image agent on port {port} for query: {query}")
                    agent = YahooSearchAgentImage(custom_port=port)
                    await agent.start()
                    await asyncio.sleep(random.uniform(1, 3))
                    
                    results = await agent.search_images(query, max_images)
                    logger.info(f"Image search completed for '{query}' with {len(results)} results")
                    if results:
                        result_dict = {f"yahoo_source_{i}": [url] for i, url in enumerate(results)}
                        return json.dumps(result_dict)
                    else:
                        return json.dumps({})
                    
                except Exception as e:
                    logger.error(f"Image search failed for '{query}': {e}")
                    return json.dumps({})
                    
                finally:
                    try:
                        await agent.close()
                    except:
                        pass
                    self.active_image_agents -= 1
                    self._release_port(port)
                    logger.info(f"Image agent on port {port} closed. Active agents: {self.active_image_agents}")
            
            else:
                logger.warning(f"Max concurrent image agents reached ({self.max_concurrent_agents}). Queueing request for: {query}")
                await asyncio.sleep(random.uniform(2, 5))
                return await self.get_image_search_result(query, max_images)
    
    async def get_agent_status(self):
        """Get current status of agents"""
        async with self.text_lock:
            text_count = self.active_text_agents
        async with self.image_lock:
            image_count = self.active_image_agents
        
        return {
            "active_text_agents": text_count,
            "active_image_agents": image_count,
            "total_active": text_count + image_count,
            "max_concurrent": self.max_concurrent_agents,
            "used_ports": len(self.used_ports)
        }

# Global instance
agent_manager = SearchAgentManager(max_concurrent_agents=10)

# Standalone search functions for backward compatibility
async def web_search(query, agent=None):
    return await agent_manager.get_text_search_result(query, max_links=10)

async def image_search(query, agent=None, max_images=10):
    return await agent_manager.get_image_search_result(query, max_images)

def fetch_url_content_parallel(urls, max_workers=10):
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_full_text, url): url for url in urls}
        results = ""
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                text_content = future.result()
                clean_text = str(text_content).encode('unicode_escape').decode('utf-8')
                clean_text = clean_text.replace('\\n', ' ').replace('\\r', ' ').replace('\\t', ' ')
                clean_text = ''.join(c for c in clean_text if c.isprintable())
                results += f"\nURL: {url}\nText Preview: {clean_text.strip()}"
            except Exception as e:
                logger.error(f"Failed fetching {url}: {e}")
                results += f"\nURL: {url}\n Failed to fetch content of this URL"
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
        Mission: Answer the user's query with reliable, well-researched, and well-explained information.
        CRITICAL: Answer directly if you know the answer (basic facts, math, general knowledge) — no tools needed.
        Use tools only when:
        - Query needs recent info (news, stocks, weather, etc.)
        - Don't query more than 3 times in case of a web_search type on the same topic!
        - Current political leaders or officeholders are mentioned
        - Explicit web research or sources are requested
        - User provides an image
        - Info is time-sensitive or implied to be current
        - Queries imply trends, context, or freshness, even without trigger words
        Always infer user intent — don't wait for "now" or "current".
        ---
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
        - When asked, give accurate local time in a clear format 
        - Never expose UTC or internal data.
        {current_utc_time}
        - Use local_time() to get the context of time for the queries related to web_search
        ---
        IMAGE HANDLING RULES:
        1. Text Query ONLY (No Image):
        - Answer directly or use web_search
        - NEVER call image_search() unless user explicitly asks for images 
        2. Image ONLY:
        - Use generate_prompt_from_image() to understand it
        - Use image_search(max_images=10)
        - Provide analysis + show all 10 similar images
        3. Image + Text Query:
        - If web search needed: use generate_prompt_from_image() + web_search() + fetch_full_text()
        - If not: use replyFromImage()
        - ALWAYS call image_search(max_images=5)
        - Provide full analysis and show 5 images
        ---
        Multi-Part Query Handling:
        If the query has multiple parts:
        - Parse each one individually
        - Run separate tool calls if needed
        - Respond to each clearly, within the same message
        ---
        Decision Framework:
        1. Basic facts/math → Direct Answer
        2. News/events → web_search
        3. URLs → fetch_full_text()
        4. Explicit research → Use tools
        5. Time-sensitive → Use tools
        6. Current relevance implied → Use tools
        7. Image present → Follow image rules
        8. Text asks for images → Use image_search
        ---
        Final Response Format:
        1. Answer — detailed and insightful
        2. Related Images — when applicable
        3. Sources — when tools used
        4. Signoff — clever, light, and relevant
        ---
        Tone & Style:
        - Clear, confident, professional
        - Prioritize correctness and readability
        - Markdown formatting where helpful
        - Always in English, unless asked otherwise
        - Don't show system logic or UTC
        - Sound like a helpful, smart friend
        - Make it useful, rich in info, yet friendly in tone
        Add a jolly punchline without making a different section, just weave it in.
        """
        },
    {
        "role": "user", 
        "content": f"""Query: {user_query} {"Image: " + user_image if user_image else ''}"""
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
                "private": True,
                "seed": random.randint(1000, 9999)
            }

            try:
                response = requests.post(POLLINATIONS_ENDPOINT, headers=headers, json=payload)
                response.raise_for_status()
                response_data = response.json()
            except requests.exceptions.RequestException as e:
                error_text = ""
                if hasattr(e, "response") and e.response is not None:
                    try:
                        error_text = e.response.text
                    except Exception:
                        error_text = "[Could not read error response text]"
                logger.error(f"Pollinations API call failed at iteration {current_iteration}: {e}\nResponse: {error_text}")
                
                if event_id:
                    yield format_sse("error", f"[ERROR] Pollinations API call failed at iteration {current_iteration}: {e}\nResponse: {error_text}")
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

                    elif function_name == "get_local_time":
                        location_name = function_args.get("location_name")
                        if location_name in memoized_results["timezone_info"]:
                            tool_result = memoized_results["timezone_info"][location_name]
                        else:
                            localTime = get_local_time(location_name)
                            tool_result = f"Location: {location_name}\n {localTime}"
                            memoized_results["timezone_info"][location_name] = tool_result

                    elif function_name == "web_search":
                        web_event = emit_event("INFO", f" Surfing Internet \n")
                        if web_event:
                            yield web_event
                        logger.info(f"Performing web search for: {function_args.get('query')}")
                        search_query = function_args.get("query")

                        search_results_raw = await web_search(search_query)
                        logger.info(f"Web search returned {len(search_results_raw)} results")
                        if search_results_raw:
                            parallel_results = fetch_url_content_parallel(search_results_raw)
                        tool_result = parallel_results if parallel_results else "[No relevant web search results found.]"

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
                        
                        search_results_raw = await image_search(image_query, max_images=max_images)
                        logger.info(f"Image search for '{image_query[:50]}...' returned results.")

                        image_urls = []
                        url_context = ""
                        try:
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

                            if user_image and user_query.strip():
                                collected_images_from_web.extend(image_urls[:5])
                            elif user_image and not user_query.strip():
                                collected_similar_images.extend(image_urls[:10])
                            elif not user_image and user_query.strip():
                                collected_images_from_web.extend(image_urls[:10])
                                
                        except Exception as e:
                            logger.error(f"Failed to process image search results: {e}", exc_info=True)
                            image_urls = []
                            url_context = ""
                        
                        tool_result = f"The relevant image URLs are {url_context}\n\n"

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
                        tool_result = parallel_results if parallel_results else "[No content fetched from URL]"

                    else:
                        tool_result = f"Unknown tool: {function_name}"
                        logger.warning(f"Unknown tool called: {function_name}")

                except Exception as e:
                    tool_result = f"[ERROR] Oppsie!! {type(e).__name__}: {e}"
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

            if user_image and not user_query.strip() and collected_similar_images:
                response_parts.append("\n\n**Similar Images:**\n")
                images_to_show = [img for img in collected_similar_images if img and img.startswith("http")][:10]
                for img in images_to_show:
                    response_parts.append(f"![Similar Image]({img})\n")

            elif user_image and user_query.strip() and collected_images_from_web:
                response_parts.append("\n\n**Related Images:**\n")
                images_to_show = [img for img in collected_images_from_web if img and img.startswith("http")][:5]
                for img in images_to_show:
                    response_parts.append(f"![Related Image]({img})\n")

            elif not user_image and user_query.strip() and collected_images_from_web:
                response_parts.append("\n\n**Requested Images:**\n")
                images_to_show = [img for img in collected_images_from_web if img and img.startswith("http")][:10]
                for img in images_to_show:
                    response_parts.append(f"![Image]({img})\n")

            if collected_sources:
                response_parts.append("\n\n---\n**Sources & References:**\n")
                unique_sources = sorted(list(set(collected_sources)))
                for i, src in enumerate(unique_sources):
                    response_parts.append(f"{i+1}. [{src}]({src})\n")

            response_with_sources = "".join(response_parts)

            logger.info(f"Final response prepared. Total length: {len(response_with_sources)}")
            
            # Log final agent status
            status = await agent_manager.get_agent_status()
            logger.info(f"Final agent status: {status}")
            
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
    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
    finally:
        logger.info("Search Completed")

if __name__ == "__main__":
    import asyncio
    
    async def main():
        user_query = "who built this?"
        user_image = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg/500px-Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg"
        
        event_id = None 

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
        
        if answer:
            print(f"\n--- Final Answer Received ---\n{answer}")
        else:
            print("\n--- No answer received ---")
        
        # Show final agent status
        status = await agent_manager.get_agent_status()
        print(f"\nFinal Agent Status: {status}")
    
    asyncio.run(main())