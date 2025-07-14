import requests
import json
from clean_query import cleanQuery
from search import web_search
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


def fetch_url_content_parallel(urls, max_workers=5):
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
        return results


def fetch_youtube_parallel(urls, mode='metadata', max_workers=5):
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

def run_elixposearch_pipeline(user_query: str, event_id: str = None):
    if event_id: 
        yield format_sse("INFO", " Initiating Pipeline ")

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
        # ElixpoSearch - Your Advanced AI Web Research Assistant

        🎯 **Mission:** Fully answer the user's query with reliable, well-researched, and thoroughly explained information.  

        Your responses should always prioritize being:
        - **Detailed and Comprehensive:** Aim for depth, not just surface-level answers.
        - **Clear and Understandable:** Write explanations that any educated reader can follow.
        - **Well-Structured:** Organize your answers logically, with clarity.
        - **Long where necessary:** Never rush to brief or overly short answers when more detail would help understanding.
        - **Polished:** Avoid incomplete thoughts, vague summaries, or fragmented outputs.

        ---
        🛠️ **Available Tools You Can Use Freely:**
        - `cleanQuery(query: str)`: Extracts URLs (websites, YouTube) and a cleaned text query from a raw input string.
        - `web_search(query: str)`: Performs a web search and returns a list of top URLs with short snippets (dictionaries with 'url' and 'snippet'). **Crucially, this tool does NOT fetch full text.** You must decide to call `fetch_full_text` on specific URLs from its results if you need the content.
        - `get_youtube_metadata(url: str)`: Fetches metadata (title, description, duration, etc.) for a given YouTube video URL.
        - `get_youtube_transcript(url: str)`: Fetches the full transcript of a given YouTube video URL. **Always present transcripts as clean, clear, fully readable text. Never output messy JSON or fragmented phrases.**
        - `fetch_full_text(url: str)`: Scrapes and extracts the main readable text content and all image URLs from a given webpage. **Use this AFTER `web_search` if you need detailed information from a promising URL.**
        - `get_timezone_and_offset(location_name: str)`: Gets the IANA timezone string and the current UTC offset in hours for a specified location (e.g., "Kolkata"). This tool also directly returns the current local date and time for that location based on the current UTC time.
        - `convert_utc_to_local(utc_datetime: str, utc_offset_hours: float)`: Converts a given UTC datetime string to a local datetime using a provided UTC offset. Use this if you need to convert a *specific historical or future* UTC time. For current local time, `get_timezone_and_offset` is usually sufficient.

        ---
        📅 **Current UTC Date:** {current_utc_date}
        ⏰ **Current UTC Time:** {current_utc_time}

        ---
        🧠 **Reasoning & Workflow - This is an ITERATIVE Process:**

        1️. **Understand & Deconstruct:** Carefully analyze the user's query.
            - If complex or ambiguous, break it into smaller, clear sub-questions.
            - Identify implicit needs. Example: "umbrella today in Kolkata" implies "What is Kolkata's current weather?" and "What is the local time?"

        2️. **Iterative Tool Calling Cycle:**
            - You will respond with tool calls; I will execute them and return results.
            - After each result, reason step-by-step:
                - **A) Call more tools if needed.**
                - **B) Provide a Final Answer when fully ready.**
            - Do NOT rush to answer until sufficient information is gathered.

        3️. **Strategic Tool Chaining:**
            - **Time/Location Sensitive Queries (weather, local events):**
                - FIRST: Use `get_timezone_and_offset(location_name)` to determine local time.
                - THEN: Use `web_search` with specific queries (e.g., "Kolkata weather forecast today").
                - FINALLY: Use `fetch_full_text` for details from authoritative URLs (e.g., weather.com).
            - **General Info Queries:**
                - Generate 1-5 well-refined `web_search` queries.
                - Evaluate snippets, then fetch details with `fetch_full_text` from reliable URLs.
            - **URL-Based Queries:**
                - Always start with `cleanQuery`.
                - Websites: `fetch_full_text`
                - YouTube: `get_youtube_metadata` + `get_youtube_transcript` (present cleanly and fully readable)

        4️. **Evidence Gathering:**
            - Collect from multiple trusted sources (aim for 2-5 quality sources).
            - Prioritize official, authoritative sites.
            - Confirm consistency of information across sources.

        ---
        📄 **Final Response Guidelines:**
        - Be **detailed and as long as needed** to ensure full understanding.
        - Summarize clearly, cite sources (URLs) explicitly.
        - Always mention if information is time-sensitive relative to **{current_utc_date} at {current_utc_time} UTC** or the *determined local time*.
        - **For YouTube transcripts:** Provide a **clear, clean, well-formatted transcript** that is easy for the user to read and understand. Give detailed long response, No technical or raw JSON formatting.
        - If reliable answers cannot be found, state this honestly and suggest practical next steps for the user.

        ---
        🎙️ **Tone & Style:**
        - Professional, clear, confident.
        - Friendly and engaging with occasional light wit where appropriate.
        - Never expose your internal tools or reasoning explicitly to the user.

        ---
        Begin solving the user's query thoughtfully.  
        First, determine whether you need tools. If so, call them. If not, answer in detail.
        """
        },
        {
            "role": "user",
            "content": f"This is the raw query from the user: {user_query}"
        }
    ]

    max_iterations = 7
    current_iteration = 0
    collected_sources = []
    collected_images = []
    final_message_content = None

    while current_iteration < max_iterations:
        current_iteration += 1
        if event_id:
            yield format_sse("INFO", f" Research Iteration Continued ")
        payload = {
            "model": MODEL,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "token": POLLINATIONS_TOKEN,
            "referrer": REFRRER,
            "temperature": 0.7,
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
                    if event_id:
                        yield format_sse("INFO", f" Surfing Internet ")
                    search_query = function_args.get("query")
                    search_results_raw = web_search(search_query)
                    summaries = ""
                    parallel_results = fetch_url_content_parallel(search_results_raw)
                    for url, (text_content, image_urls) in parallel_results.items():
                        summaries += f"\nURL: {url}\nSummary: {text_content[:500]}\nImages: {image_urls}\n"
                        collected_sources.append(url)
                        collected_images.extend(image_urls)
                    tool_result = summaries

                elif function_name == "get_youtube_metadata":
                    urls = [function_args.get("url")]
                    results = fetch_youtube_parallel(urls, mode='metadata')
                    for url, metadata in results.items():
                        tool_result = json.dumps(metadata)
                        memoized_results["youtube_metadata"][url] = tool_result
                        collected_sources.append(url)

                elif function_name == "get_youtube_transcript":
                    if event_id:
                        yield format_sse("INFO", f" Watching Youtube ")
                    urls = [function_args.get("url")]
                    results = fetch_youtube_parallel(urls, mode='transcript')
                    for url, transcript in results.items():
                        tool_result = f"YouTube Transcript for {url}:\n{transcript[:2000] if transcript else '[No transcript available]'}..."
                        memoized_results["youtube_transcripts"][url] = tool_result
                        collected_sources.append(url)

                elif function_name == "fetch_full_text":
                    if event_id:
                        yield format_sse("INFO", f" Writing Script ")
                    urls = [function_args.get("url")]
                    parallel_results = fetch_url_content_parallel(urls)
                    for url, (text_content, image_urls) in parallel_results.items():
                        tool_result = f"URL: {url}\nText Preview: {text_content[:2000]}...\nImages Found: {len(image_urls)}"
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

    if final_message_content:
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
        if event_id:
            yield format_sse("INFO", " SUCCESS ")
            chunk_size = 5000 
            for i in range(0, len(response_with_sources), chunk_size):
                chunk = response_with_sources[i:i+chunk_size]
                # Use the same event name for all chunks except the last
                event_name = "final" if i + chunk_size >= len(response_with_sources) else "final-part"
                yield format_sse(event_name, chunk)
        else:
            print("\n--- ElixpoSearch Final Answer ---\n")
            # print(response_with_sources)
        return response_with_sources
    else:
        if event_id:
            yield format_sse("error", f"[ERROR] ElixpoSearch failed after {max_iterations} iterations.")
            return None
        else:
            print(f"[ERROR] ElixpoSearch failed after {max_iterations} iterations.")

