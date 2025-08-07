import requests
import json
from clean_query import cleanQuery
from search import web_search, GoogleSearchAgentText, GoogleSearchAgentImage, image_search
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

# Global Agent Manager
class GoogleAgentManager:
    def __init__(self):
        self.text_agent = None
        self.image_agent = None
        self.text_request_count = 0
        self.image_request_count = 0
        self.text_buffer = deque()
        self.image_buffer = deque()
        self.text_lock = asyncio.Lock()
        self.image_lock = asyncio.Lock()
        self.is_restarting_text = False
        self.is_restarting_image = False
        self._initialized = False
        
    async def initialize(self):
        """Initialize both agents and warm them up"""
        if self._initialized:
            return
            
        logger.info("Initializing and warming up Google agents...")
        try:
            self.text_agent = GoogleSearchAgentText()
            self.image_agent = GoogleSearchAgentImage()
            
            await self.text_agent.start()
            await self.image_agent.start()
            
            self._initialized = True
            logger.info("Google agents warmed up and ready!")
        except Exception as e:
            logger.error(f"Failed to initialize Google agents: {e}")
            raise
    
    async def get_text_agent(self):
        """Get text agent, handling restarts and buffering"""
        async with self.text_lock:
            if not self._initialized:
                await self.initialize()
                
            # Check if we need to restart
            if self.text_request_count >= 100 and not self.is_restarting_text:
                logger.info("Text agent hit 100 requests, restarting...")
                self.is_restarting_text = True
                
                try:
                    await self.text_agent.close()
                    self.text_agent = GoogleSearchAgentText()
                    await self.text_agent.start()
                    self.text_request_count = 0
                    logger.info("Text agent restarted successfully")
                except Exception as e:
                    logger.error(f"Failed to restart text agent: {e}")
                finally:
                    self.is_restarting_text = False
                    
            return self.text_agent
    
    async def get_image_agent(self):
        """Get image agent, handling restarts and buffering"""
        async with self.image_lock:
            if not self._initialized:
                await self.initialize()
                
            # Check if we need to restart
            if self.image_request_count >= 100 and not self.is_restarting_image:
                logger.info("Image agent hit 100 requests, restarting...")
                self.is_restarting_image = True
                
                try:
                    await self.image_agent.close()
                    self.image_agent = GoogleSearchAgentImage()
                    await self.image_agent.start()
                    self.image_request_count = 0
                    logger.info("Image agent restarted successfully")
                except Exception as e:
                    logger.error(f"Failed to restart image agent: {e}")
                finally:
                    self.is_restarting_image = False
                    
            return self.image_agent
    
    async def increment_text_count(self):
        """Increment text request counter"""
        async with self.text_lock:
            self.text_request_count += 1
            
    async def increment_image_count(self):
        """Increment image request counter"""
        async with self.image_lock:
            self.image_request_count += 1
    
    async def close_all(self):
        """Close all agents (only call on app shutdown)"""
        if self.text_agent:
            try:
                await self.text_agent.close()
            except Exception as e:
                logger.error(f"Error closing text agent: {e}")
                
        if self.image_agent:
            try:
                await self.image_agent.close()
            except Exception as e:
                logger.error(f"Error closing image agent: {e}")
                
        self._initialized = False
        logger.info("All Google agents closed")

# Global instance
agent_manager = GoogleAgentManager()

def fetch_url_content_parallel(urls, max_workers=10):
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_full_text, url): url for url in urls}
        results = ""
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                text_content = future.result()
                # Remove all escape sequences and newlines from text_content
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
    
    # Use global agent manager instead of creating new agents
    try:
        # Ensure agents are initialized
        await agent_manager.initialize()
        
        # Get current UTC time for internal context (not exposed to user)
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
        - Current political leaders or officeholders are mentioned
        - Explicit web research or sources are requested
        - User provides an image
        - Info is time-sensitive or implied to be current
        - Queries imply trends, context, or freshness, even without trigger words
        Always infer user intent — don’t wait for "now" or "current".
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
        - Don’t show system logic or UTC
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

                        
                        google_agent_text = await agent_manager.get_text_agent()
                        await agent_manager.increment_text_count()

                        search_results_raw = await web_search(search_query, google_agent_text)
                        logger.info(f"Web search returned {len(search_results_raw)} results")
                        summaries = ""
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
                        
                        # Use global agent manager
                        google_agent_image = await agent_manager.get_image_agent()
                        await agent_manager.increment_image_count()

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
                    tool_result = f"[ERROR] Tool {function_name} failed: {type(e).__name__}: {e}"
                    logger.error(f"Error executing tool {function_name}: {e}", exc_info=True)
                
                tool_outputs.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "name": function_name,
                    "content": tool_result
                })
            
            messages.extend(tool_outputs)
            print(messages)
            logger.info(f"Completed tool execution for iteration {current_iteration}. Number of messages: {len(messages)}")
            if event_id:
                yield format_sse("INFO", f" All tools executed for iteration {current_iteration}. Waiting for next model response...\n")


        if final_message_content:
            logger.info(f"Preparing final response.")
            response_parts = []
            
            response_parts.append(final_message_content)

            # Handle image display based on scenarios
            if user_image and not user_query.strip() and collected_similar_images:
                # Scenario 2: Image Only -> Show 10 similar images
                response_parts.append("\n\n**Similar Images:**\n")
                images_to_show = [img for img in collected_similar_images if img and img.startswith("http")][:10]
                for img in images_to_show:
                    response_parts.append(f"![Similar Image]({img})\n")

            elif user_image and user_query.strip() and collected_images_from_web:
                # Scenario 3: Image + Text Query -> Show 5 relevant images
                response_parts.append("\n\n**Related Images:**\n")
                images_to_show = [img for img in collected_images_from_web if img and img.startswith("http")][:5]
                for img in images_to_show:
                    response_parts.append(f"![Related Image]({img})\n")

            elif not user_image and user_query.strip() and collected_images_from_web:
                # Scenario 1: Text asking for images -> Show requested images
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
        # Don't close agents on individual request errors
    finally:
        logger.info("Search Completed")

# Function to initialize agents on app startup
async def initialize_google_agents():
    """Call this when your app starts"""
    await agent_manager.initialize()
    logger.info("Google agents pre-warmed for the application")

# Function to close agents on app shutdown
async def shutdown_google_agents():
    """Call this when your app shuts down"""
    await agent_manager.close_all()
    logger.info("Google agents closed on application shutdown")

if __name__ == "__main__":
    import asyncio
    
    async def main():
        # Test Cases
        # 1. Image only
        # user_query = ""
        # user_image = "https://media.istockphoto.com/id/1421310827/photo/young-graceful-ballerina-is-performing-classic-dance-beauty-and-elegance-of-classic-ballet.jpg?s=612x612&w=0&k=20&c=GQ1DVEarW4Y-lGD6y8jCb3YPIgap7gj-6ReS3C7Qi3Y=" 
        
        # 2. Image + Text Query (Your problematic case)
        user_query = "hi"
        user_image = None

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
    # content = fetch_url_content_parallel(["https://www.geeksforgeeks.org/operating-systems/implementation-of-contiguous-memory-management-techniques/"])
    # print(content)

    try:
        asyncio.get_event_loop().close()
    except Exception:
        pass