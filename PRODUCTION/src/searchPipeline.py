import requests
import json
from clean_query import cleanQuery
from search import web_search, GoogleSearchAgent
from getYoutubeDetails import get_youtube_metadata, get_youtube_transcript
from scrape import fetch_full_text
from tools import tools
from datetime import datetime, timezone
from getTimeZone import get_timezone_and_offset, convert_utc_to_local
import random
import concurrent.futures
import logging
import dotenv
import os


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
                print(f"[ERROR] Failed fetching {url}: {e}")
                results[url] = ('[Failed]', [])
        print(f"[INFO] Fetched all URL information in parallel.")
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
                print(f"[ERROR] YouTube {mode} failed for {url}: {e}")
                results[url] = '[Failed]'
        return results

def format_sse(event: str, data: str) -> str:
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_str}\n\n"

async def run_elixposearch_pipeline(user_query: str, event_id: str = None):
    print(f"[INFO] Starting ElixpoSearch Pipeline for query: {user_query}")
    
    def emit_event(event_type, message):
        if event_id:
            return format_sse(event_type, message)
        return None
    
    # Send initial event if streaming
    initial_event = emit_event("INFO", " Initiating Pipeline ")
    if initial_event:
        yield initial_event
    
    google_agent = GoogleSearchAgent()

    try:
        await google_agent.start()
        google_req_count = 0  # Track number of Google searches

        current_utc_datetime = datetime.now(timezone.utc)
        current_utc_time = current_utc_datetime.strftime("%H:%M UTC")
        current_utc_date = current_utc_datetime.strftime("%Y-%m-%d")
        headers = {"Content-Type": "application/json"}

        memoized_results = {
            "timezone_info": {},
            "web_searches": {},
            "fetched_urls": {},
            "youtube_metadata": {},
            "youtube_transcripts": {}
        }

        
        messages = [
{
    "role": "system",
    "content": f"""
    Mission: Answer the user's query with reliable, well-researched, and well-explained information.
    
    **IMPORTANT: If you know the answer to a question (especially basic facts, math, general knowledge), answer it DIRECTLY without using any tools.**
    
    Only use tools when:
    - You need current/recent information (news, stock prices, weather, etc.)
    - **Current political positions or office holders (presidents, prime ministers, etc.)**
    - The query explicitly asks for web research or sources
    - You are genuinely uncertain about factual information
    - The query contains specific URLs to analyze
    - Time-sensitive information is requested
    - Queries asking "now", "current", "latest", "today", "recent"

    Your answers must prioritize:
    - Clarity and correctness
    - Concise explanations
    - Markdown formatting
    - Relevant citations if sources are used

    ---

    Available Tools (Use Only When Necessary):
    - cleanQuery(query: str): Extracts URLs (websites, YouTube) and a cleaned text query.
    - web_search(query: str): Returns websites and short summaries. Does not fetch full text.
    - get_youtube_metadata(url: str): Retrieves video metadata.
    - get_youtube_transcript(url: str): Retrieves readable transcripts.
    - fetch_full_text(url: str): Extracts main text and images from web pages.
    - get_timezone_and_offset(location_name: str): Retrieves timezone, UTC offset, and local time.
    - convert_utc_to_local(utc_datetime: str, utc_offset_hours: float): Converts UTC datetime to local.

    ---

    Context:
    Current UTC Date: {current_utc_date}  
    Current UTC Time: {current_utc_time}

    ---

    Decision Framework:
    1. **Basic Knowledge/Math/Facts**: Answer directly (e.g., "What is 1+1?", "What is the capital of France?", "How does photosynthesis work?")
    2. **Current Events/News/Politics**: Use web_search tool (e.g., "Who is the current president?", "Latest news", "Current prime minister")
    3. **Specific URLs provided**: Use appropriate tools to analyze them
    4. **Explicit research requests**: Use tools as needed
    5. **Time-sensitive data**: Use tools for current information
    6. **Keywords like "now", "current", "latest", "today"**: Use web_search tool

    **CRITICAL: For any query asking about current political positions, office holders, or using words like "now", "current", "latest" - ALWAYS use web_search first.**

    Final Response:
    - Answer clearly and concisely
    - Use markdown formatting
    - Provide reliable sources when external data is used
    - Mention date relevance if information is time-sensitive

    **Answer in english, unless mentioned explicitly to use another language.**

    Tone:
    Detailed response -- professional, clear, confident. No unnecessary tool usage for basic questions, but ALWAYS search for current/political information.
    """
},
{
    "role": "user", 
    "content": f"""Response in Detail - Query: {user_query}"""
}
]


        max_iterations = 7
        current_iteration = 0
        collected_sources = []
        collected_images = []
        final_message_content = None

        while current_iteration < max_iterations:
            current_iteration += 1
            
            # Send iteration event if streaming
            iteration_event = emit_event("INFO", f" Research Iteration Continued ")
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
                if event_id:
                    yield format_sse("error", f"[ERROR] Pollinations API call failed at iteration {current_iteration}: {e}")
                break

            assistant_message = response_data["choices"][0]["message"]
            messages.append(assistant_message)

            tool_calls = assistant_message.get("tool_calls")
            print(tool_calls)
            if not tool_calls:
                final_message_content = assistant_message.get("content")
                break

            for tool_call in tool_calls:
                function_name = tool_call["function"]["name"]
                function_args = json.loads(tool_call["function"]["arguments"])
                if event_id:
                    print(f"[INFO] Tool call detected: {function_name} with args: {function_args}")
                    yield format_sse("INFO", f" Execution In Progress ")
                
                tool_result = "[Tool execution failed or returned no data.]"

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
                        web_event = emit_event("INFO", f" Surfing Internet ")
                        if web_event:
                            yield web_event
                        print(f"[INFO] Performing web search")
                        search_query = function_args.get("query")

                        google_req_count += 1
                        if google_req_count > 50:
                            print("[INFO] Restarting GoogleSearchAgent after 50 requests.")
                            await google_agent.close()
                            google_agent = GoogleSearchAgent()
                            await google_agent.start()
                            google_req_count = 1  # Reset count for new agent

                        search_results_raw = await web_search(search_query, google_agent)
                        print(f"[INFO] Web search returned {len(search_results_raw)} results")
                        summaries = ""
                        parallel_results = fetch_url_content_parallel(search_results_raw)
                        for url, (text_content, image_urls) in parallel_results.items():
                            summaries += f"\nURL: {url}\nSummary: {text_content}\nImages: {image_urls}\n"
                            collected_sources.append(url)
                            collected_images.extend(image_urls)
                        tool_result = summaries

                    elif function_name == "get_youtube_metadata":
                        print(f"[INFO] Getting YouTube metadata for URLs")
                        urls = [function_args.get("url")]
                        results = fetch_youtube_parallel(urls, mode='metadata')
                        for url, metadata in results.items():
                            tool_result = json.dumps(metadata)
                            memoized_results["youtube_metadata"][url] = tool_result
                            collected_sources.append(url)

                    elif function_name == "get_youtube_transcript":
                        print(f"[INFO] Getting YouTube transcripts for URLs")
                        if event_id:
                            yield format_sse("INFO", f" Watching Youtube ")
                        urls = [function_args.get("url")]
                        results = fetch_youtube_parallel(urls, mode='transcript')
                        for url, transcript in results.items():
                            tool_result = f"YouTube Transcript for {url}:\n{transcript if transcript else '[No transcript available]'}..."
                            memoized_results["youtube_transcripts"][url] = tool_result
                            collected_sources.append(url)

                    elif function_name == "fetch_full_text":
                        print(f"[INFO] Fetching full text for URLs")
                        if event_id:
                            yield format_sse("INFO", f" Writing Script ")
                        urls = [function_args.get("url")]
                        parallel_results = fetch_url_content_parallel(urls)
                        for url, (text_content, image_urls) in parallel_results.items():
                            tool_result = f"URL: {url}\nText Preview: {text_content}...\nImages Found: {len(image_urls)}"
                            collected_sources.append(url)
                            collected_images.extend(image_urls)
                            memoized_results["fetched_urls"][url] = tool_result

                    else:
                        tool_result = f"Unknown tool: {function_name}"

                except Exception as e:
                    tool_result = f"[ERROR] Tool {function_name} failed: {type(e).__name__}: {e}"

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "name": function_name,
                    "content": tool_result
                })
                if event_id:
                    print(f"[INFO] Tool {function_name} executed successfully.")
                    yield format_sse("INFO", f" Execution Completed! ")

        # Handle final response
        if final_message_content:
            print(f"[INFO] Preparing final response")
            response_with_sources = final_message_content
            sources_md = ""
            if collected_sources:
                sources_md += "\n\n---\n**Sources:**\n"
                unique_sources = sorted(set(collected_sources))
                for i, src in enumerate(unique_sources):
                    sources_md += f"{i+1}. [{src}]({src})\n"
            if collected_images:
                sources_md += "\n**Images Found:**\n"
                unique_images = sorted(set(collected_images))
                for img in unique_images:
                    sources_md += f"![image]({img})\n"

            response_with_sources += sources_md
            print(f"[INFO] Preparing final response with sources and images")
            
            if event_id:
                yield format_sse("INFO", " SUCCESS ")
                chunk_size = 5000 
                for i in range(0, len(response_with_sources), chunk_size):
                    chunk = response_with_sources[i:i+chunk_size]
                    event_name = "final" if i + chunk_size >= len(response_with_sources) else "final-part"
                    yield format_sse(event_name, chunk)
                    
            else:
                # For non-SSE calls, yield the result as a simple event for the app to parse
                yield format_sse("final", response_with_sources)
                

            return  
        else:
            error_msg = f"[ERROR] ElixpoSearch failed after {max_iterations} iterations."
            if event_id:
                yield format_sse("error", error_msg)
                
                return  
            else:
                print(error_msg)
    finally:
        try:
            await google_agent.close()
        except Exception as e:
            print(f"[ERROR] Failed to close GoogleSearchAgent: {e}")


if __name__ == "__main__":
    import asyncio
    
    async def main():
        user_query = "what's the weather of kolkata india of this week, mention me the date and give me some local news of this week of kolkata"
        event_id = None
        
        # Handle async generator
        async_generator = run_elixposearch_pipeline(user_query, event_id=event_id)
        answer = None
        
        try:
            async for event in async_generator:
                if event and "event: final" in event:
                    # Extract the actual content from the SSE format
                    lines = event.split('\n')
                    for line in lines:
                        if line.startswith('data: '):
                            if answer is None:
                                answer = line[6:]  # Remove 'data: ' prefix
                            else:
                                answer += line[6:]  # Concatenate multiple data lines
                elif event and "event: final-part" in event:
                    # Handle chunked responses
                    lines = event.split('\n')
                    for line in lines:
                        if line.startswith('data: '):
                            if answer is None:
                                answer = line[6:]  # Remove 'data: ' prefix
                            else:
                                answer += line[6:]  # Concatenate chunks
        except Exception as e:
            print(f"Error: {e}")
            answer = "Failed to get answer"
        
        if answer:
            print(f"\n--- Final Answer ---\n{answer}")
        else:
            print("\n--- No answer received ---")
    
    asyncio.run(main())