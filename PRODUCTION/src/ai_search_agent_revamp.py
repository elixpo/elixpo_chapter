import requests
import json
from clean_query import cleanQuery
from search import web_search
from getYoutubeDetails import get_youtube_metadata, get_youtube_transcript
from scrape import fetch_full_text
from tools import tools
from datetime import datetime, timezone
from getTimeZone import get_timezone_and_offset, convert_utc_to_local


def run_elixposearch_pipeline(user_query: str):
    current_utc_datetime = datetime.now(timezone.utc)
    current_utc_time = current_utc_datetime.strftime("%H:%M UTC")
    current_utc_date = current_utc_datetime.strftime("%Y-%m-%d")

    POLLINATIONS_ENDPOINT = "https://text.pollinations.ai/openai"
    headers = {"Content-Type": "application/json"}
    messages = [
        {
            "role": "system",
            "content": f"""
                You are **ElixpoSearch**, a helpful and friendly AI assistant specialized in smart web research.
                Your job is to assist the user by using the following tools smartly:
                - cleanQuery
                - web_search (google_search, ddgs_search, mojeek_form_search)
                - get_youtube_metadata
                - get_youtube_transcript
                - fetch_full_text

                Today's UTC date is **{current_utc_date}** and the current UTC time is **{current_utc_time}**.

                Use this when referencing any time-sensitive information.
                Use the 'get_timezone_and_offset' tool to get the timezone and UTC offset if a location is mentioned in the query, or you need to provide time-related information.
                After obtaining the UTC offset, you MUST calculate the current time at that location by:
                1️⃣ Taking the current UTC datetime provided.
                2️⃣ Parsing the UTC offset (e.g., UTC+05:30 means +5 hours 30 minutes).
                3️⃣ Adding or subtracting the offset from UTC to get local time.
                4️⃣ Clearly stating the local time and date in your answer.
                Never assume or guess local times. Always calculate from the provided UTC datetime and offset.

                If unsure, ask the user to clarify the location.
                How you should operate:
                1️⃣ First, check the user's query:
                - If you can answer directly with your knowledge, respond right away.
                - If the query contains website URLs or YouTube links, call 'cleanQuery' first.

                2️⃣ If URLs are found:
                - For website URLs: Call 'fetch_full_text' to extract and summarize the webpage content.
                - For YouTube URLs: Call 'get_youtube_metadata' to get title/duration and 'get_youtube_transcript' for the transcript.

                3️⃣ If no URLs are found and the query looks like a general question:
                - Call 'web_search' using Google, DuckDuckGo, or Mojeek depending on the context.

                4️⃣ Complex Intent Handling:
                Examples:
                - "What's on this website <url>?" ➔ fetch_full_text
                - "Give me the transcript of this video <youtube-url>" ➔ get_youtube_transcript
                - "What's this YouTube video's purpose?" ➔ get transcript, analyze purpose, search for related research.

                5️⃣ After gathering everything:
                - Summarize all findings clearly.
                - Provide links to sources when applicable.
                - Keep the response well-structured and easy to understand.
                - Always mention if any information might be time-sensitive relative to **{current_utc_date} at {current_utc_time} UTC**.

                Guidelines:
                - If you know the answer, respond directly. Add a light touch of witty humor to make the user smile, but do not reveal or mention your internal process or tools.
                - If the query contains website or YouTube links, process them as needed.
                - For websites: summarize the content.
                - For YouTube: provide metadata and transcript if relevant.
                - For general questions: search the web if needed.
                - Summarize findings clearly, provide links when possible, and mention if info is time-sensitive.
                - Keep your response well-structured, easy to understand, and natural.
                - Add a light touch of witty humor to make the user smile, but do not reveal or mention your internal process or tools.

                🎯 Your tone is polite, efficient, and supportive. Your name is **ElixpoSearch**.
                """
        },
        {
            "role": "user",
            "content": f"This is the raw query from the user: {user_query}"
        }
    ]

    payload = {
        "model": "openai-fast",
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "token": "fEWo70t94146ZYgk",
        "temperature": 0.7,
        "frequency_penalty": 0.0,
        "private": True,
        "seed": 56
    }

    try:
        response = requests.post(POLLINATIONS_ENDPOINT, headers=headers, json=payload)
        response.raise_for_status()
        response_data = response.json()
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Initial ElixpoSearch API call failed: {e}")
        return
    assistant_message = response_data["choices"][0]["message"]
    messages.append(assistant_message)

    tool_calls = assistant_message.get("tool_calls", [])

    if tool_calls:
        for tool_call in tool_calls:
            function_name = tool_call["function"]["name"]
            function_args = json.loads(tool_call["function"]["arguments"])

            print(f"[INFO] Running tool: {function_name} with args: {function_args}")

            if function_name == "cleanQuery":
                tool_result = cleanQuery(function_args.get("query"))
            elif function_name == "get_timezone_and_offset":
                location_name = function_args.get("location_name")
                timezone_str, utc_offset = get_timezone_and_offset(location_name)
                local_time = convert_utc_to_local(current_utc_datetime, utc_offset)
                location_details = (
                    f"Location: {location_name}, "
                    f"Timezone: {timezone_str}, "
                    f"UTC Offset: {utc_offset}, "
                    f"Local Time: {local_time}"
                )
                tool_result = location_details
            elif function_name == "web_search":
                search_results = web_search(function_args.get("query"))
                summaries = ""
                for url in search_results:
                    try:
                        text_content, image_urls = fetch_full_text(url)
                        text_content = text_content[:500]
                        summaries += f"\nURL: {url}\nSummary: {text_content if text_content else '[Could not fetch or summarize this page.]'}\nImages: {image_urls}\n"
                    except Exception as e:
                        print(f"[WARN] Failed to fetch or summarize {url}: {e}")
                        continue
                tool_result = summaries
            elif function_name == "get_youtube_metadata":
                tool_result = get_youtube_metadata(function_args.get("url"))
            elif function_name == "get_youtube_transcript":
                tool_result = get_youtube_transcript(function_args.get("url"))
            elif function_name == "fetch_full_text":
                tool_result = fetch_full_text(function_args.get("url"))
            else:
                tool_result = {}

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call["id"],
                "name": function_name,
                "content": tool_result
            })

        collected_sources = []
        collected_images = []

        for tool_call in tool_calls:
            function_name = tool_call["function"]["name"]
            function_args = json.loads(tool_call["function"]["arguments"])
            if function_name == "web_search":
                search_results = web_search(function_args.get("query"))
                for url in search_results:
                    try:
                        text_content, image_urls = fetch_full_text(url)
                        if url not in collected_sources:
                            collected_sources.append(url)
                        for img in image_urls:
                            if img not in collected_images:
                                collected_images.append(img)
                    except Exception:
                        continue
            elif function_name == "fetch_full_text":
                url = function_args.get("url")
                try:
                    text_content, image_urls = fetch_full_text(url)
                    if url and url not in collected_sources:
                        collected_sources.append(url)
                    for img in image_urls:
                        if img not in collected_images:
                            collected_images.append(img)
                except Exception:
                    continue

        sources_md = ""
        if collected_sources:
            sources_md += "\n\n---\n**Sources:**\n"
            for src in collected_sources:
                sources_md += f"- [{src}]({src})\n"
        if collected_images:
            sources_md += "\n**Images:**\n"
            for img in collected_images:
                sources_md += f"![image]({img})\n"

        messages.append({
            "role": "user",
            "content": "Now that you have all the information, give me the final response in detail. "
                       "Summarize everything clearly and provide links to sources where applicable. "
                       "Remember to mention if any information might be time-sensitive relative to today's date and time."
                       f"{sources_md}"
        })

        final_payload = {
            "model": "openai-fast",
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "token": "fEWo70t94146ZYgk",
            "referrer": "elixpoart",
            "private": True,
            "seed": 56
        }

        try:
            final_response = requests.post(POLLINATIONS_ENDPOINT, headers=headers, json=final_payload)
            final_response.raise_for_status()
            final_message = final_response.json()['choices'][0]['message']['content']
            print("\n--- ElixpoSearch Final Answer ---\n")
            print(final_message)
        except requests.exceptions.RequestException as e:
            print(f"[ERROR] Final ElixpoSearch API call failed: {e}")
            print("[INFO] Some sources may be down or unavailable.")
    else:
        print("\n--- ElixpoSearch Answer ---\n")
        print(response_data['choices'][0]['message']['content'])


if __name__ == "__main__":
    user_query = "What's the time of Kolkata now? Shall i keep an umbrella with me?"
    run_elixposearch_pipeline(user_query)
