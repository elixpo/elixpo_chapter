import requests
import json
import datetime
import re
import time
import sys
from urllib.parse import urljoin, urlparse, parse_qs
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
from pytube import YouTube, exceptions
# from pytube.request import default_range_size # Not needed for this fix
from duckduckgo_search import DDGS
from bs4 import BeautifulSoup
import math
import mimetypes
from tqdm import tqdm
import random
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import os
from dotenv import load_dotenv
import html
from concurrent.futures import ThreadPoolExecutor
import threading
import logging

MAX_SEARCH_RESULTS_PER_QUERY = 8
MAX_SCRAPE_WORD_COUNT = 2000
MAX_TOTAL_SCRAPE_WORD_COUNT = 8000
MIN_PAGES_TO_SCRAPE = 3
MAX_PAGES_TO_SCRAPE = 10
MAX_IMAGES_TO_INCLUDE = 3
MAX_TRANSCRIPT_WORD_COUNT = 6000
DUCKDUCKGO_REQUEST_DELAY = 3
REQUEST_RETRY_DELAY = 5
MAX_REQUEST_RETRIES = 3
MAX_DUCKDUCKGO_RETRIES = 5
CLASSIFICATION_MODEL = "OpenAI GPT-4.1-nano"
SYNTHESIS_MODEL = "openai-large"
MAX_CONCURRENT_REQUESTS = 5
load_dotenv()

class DummyContextManager:
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_value, traceback):
        pass
    def set_postfix_str(self, *args, **kwargs): pass
    def update(self, *args, **kwargs): pass
    def close(self): pass

def conditional_tqdm(iterable, show_logs, *args, **kwargs):
    if show_logs:
        return tqdm(iterable, *args, **kwargs)
    else:
        return iterable

def conditional_print(message, show_logs):
    if show_logs:
        print(message)

def exponential_backoff(attempt, base_delay=REQUEST_RETRY_DELAY, max_delay=60):
    delay = min(max_delay, base_delay * (2 ** attempt))
    return delay + random.uniform(0, base_delay * 0.5)

def retry_operation(func, *args, retries=MAX_REQUEST_RETRIES, show_logs=True, **kwargs):
    for attempt in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if attempt < retries - 1:
                conditional_print(f"Attempt {attempt + 1} failed for {func.__name__}: {type(e).__name__}: {e}. Retrying in {exponential_backoff(attempt):.2f}s.", show_logs)
                time.sleep(exponential_backoff(attempt))
            else:
                conditional_print(f"Attempt {attempt + 1} failed for {func.__name__}: {type(e).__name__}: {e}. Max retries reached.", show_logs)
                raise

    # Should not be reached if retries > 0 and exception is always raised on last attempt
    raise RuntimeError(f"Operation {func.__name__} failed after {retries} attempts without raising a final exception.")

def query_pollinations_ai(messages, model=SYNTHESIS_MODEL, retries=MAX_REQUEST_RETRIES, show_logs=True):
    def _query():
        payload = {
            "model": model,
            "messages": messages,
            "seed": random.randint(0, 2**31 - 1),
            "token" : os.getenv("POLLINATIONS_TOKEN"),
            "referrer" : os.getenv("POLLINATIONS_REFERRER")
        }
        url = "https://text.pollinations.ai/openai"
        headers = {
            "Content-Type": "application/json"
        }
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=60)
        response.raise_for_status()
        return response.json()

    try:
        return retry_operation(_query, retries=retries, show_logs=show_logs)
    except requests.exceptions.HTTPError as e:
        if e.response.status_code in [401, 403, 404]:
            conditional_print(f"Client error {e.response.status_code} querying Pollinations AI ({model}). Not retrying.", show_logs)
            return None
        conditional_print(f"HTTP error {e.response.status_code} querying Pollinations AI ({model}): {e}. Failed after retries.", show_logs)
        return None
    except Exception as e:
        conditional_print(f"Error querying Pollinations AI ({model}): {type(e).__name__}: {e}. Failed after retries.", show_logs)
        return None


def extract_urls_from_query(query):
    urls = re.findall(r'(https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+(?:[-\w.!~*\'()@;:$+,?&/=#%]*))', query)
    cleaned_query = re.sub(r'(https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+(?:[-\w.!~*\'()@;:$+,?&/=#%]*))', '', query).strip()

    website_urls = []
    youtube_urls = []

    for url in urls:
        url = url.rstrip('...')
        parsed_url = urlparse(url)
        if "youtube.com" in parsed_url.netloc or "youtu.be" in parsed_url.netloc:
            youtube_urls.append(url)
        else:
            website_urls.append(url)

    return website_urls, youtube_urls, cleaned_query

def get_youtube_video_id(url):
    parsed_url = urlparse(url)
    if "youtube.com" in parsed_url.netloc:
        video_id = parse_qs(parsed_url.query).get('v')
        if video_id:
            return video_id[0]
    elif "youtu.be" in parsed_url.netloc:
        if parsed_url.path and len(parsed_url.path) > 1:
            return parsed_url.path[1:]
    return None

def get_youtube_transcript(video_id, show_logs=True):
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        try:
            transcript = transcript_list.find_transcript(['en', 'a.en'])
        except NoTranscriptFound:
            conditional_print(f"No English transcript found for video ID: {video_id}", show_logs)
            return None

        entries = transcript.fetch()
        full_text = " ".join(entry['text'] for entry in entries)

        words = full_text.split()
        if len(words) > MAX_TRANSCRIPT_WORD_COUNT:
            return " ".join(words[:MAX_TRANSCRIPT_WORD_COUNT]) + "..."
        
        return full_text

    except NoTranscriptFound:
        conditional_print(f"No transcript available at all for video ID: {video_id}", show_logs)
    except TranscriptsDisabled:
        conditional_print(f"Transcripts are disabled for video ID: {video_id}", show_logs)
    except Exception as e:
        conditional_print(f"Unexpected error while fetching transcript for {video_id}: {type(e).__name__} - {e}", show_logs)

    return None


def get_youtube_video_metadata(video_id, show_logs=True):
    url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        yt = YouTube(url)
        _ = yt.title  

        metadata = {
            "title": yt.title,
            "author": yt.author,
            "publish_date": yt.publish_date.strftime("%Y-%m-%d %H:%M:%S") if yt.publish_date else "Unknown",
            "length": f"{yt.length // 60}m {yt.length % 60}s" if yt.length else "Unknown",
            "views": f"{yt.views:,}" if yt.views else "Unknown",
            "description": (
                yt.description[:250] + "..." if yt.description and len(yt.description) > 500
                else yt.description or "No description available"
            ),
            "thumbnail_url": yt.thumbnail_url
        }
        return metadata

    except exceptions.VideoUnavailable:
        conditional_print(f"[Pytube] VideoUnavailable: {url}", show_logs)
    except exceptions.LiveStreamError:
        conditional_print(f"[Pytube] LiveStreamError (likely a live stream): {url}", show_logs)
    except exceptions.RegexMatchError:
        conditional_print(f"[Pytube] RegexMatchError: Invalid or malformed URL - {url}", show_logs)
    except Exception as e:
        conditional_print(f"[Pytube] Unexpected error: {type(e).__name__} - {e}", show_logs)

    return None


def is_likely_search_result_url(url):
    if not url:
        return False
    parsed_url = urlparse(url)
    if any(domain in parsed_url.netloc for domain in ['google.com', 'duckduckgo.com', 'bing.com', 'yahoo.com']):
        if parsed_url.path.startswith('/search') or parsed_url.path.startswith('/html') or parsed_url.path.startswith('/res') or parsed_url.path == '/':
             return True
        if parsed_url.query:
            query_params = parse_qs(parsed_url.query)
            if any(param in query_params for param in ['q', 'query', 'p', 'wd']):
                 return True
    return False

def is_likely_image(url):
    if not url:
        return False

    if not url.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg')):
        return False

    if any(keyword in url.lower() for keyword in ['icon', 'logo', 'loader', 'sprite', 'thumbnail', 'small', 'avatar', 'advert', 'ad_']):
        return False

    if re.search(r'/\d+x\d+/', url) or re.search(r'-\d+x\d+\.', url):
        return False

    return True

def scrape_website(url, scrape_images=True, total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT, show_logs=True):
    def _scrape():
        text_content = ""
        image_urls = []
        headers = {'User-Agent': 'Mozilla/5.0 (compatible; AcmeInc/1.0)'}

        response = requests.get(url, timeout=15, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')

        for script_or_style in soup(['script', 'style', 'nav', 'footer', 'header']):
            script_or_style.extract()

        temp_text = ''
        main_content = soup.find('main') or soup.find('article') or soup.find('body') or soup
        for tag in main_content.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'div']):
             text = tag.get_text()
             text = re.sub(r'\s+', ' ', text).strip()
             if text:
                 temp_text += text + '\n\n'

        words = temp_text.split()
        page_word_limit = min(MAX_SCRAPE_WORD_COUNT, total_word_count_limit)
        if page_word_limit <= 0:
            text_content = ""
        elif len(words) > page_word_limit:
            text_content = ' '.join(words[:page_word_limit]) + '...'
        else:
            text_content = temp_text.strip()

        if scrape_images:
            img_tags = main_content.find_all('img')
            for img in img_tags:
                img_url = img.get('src') or img.get('data-src')
                if img_url:
                    img_url = urljoin(url, img_url)
                    parsed_img_url = urlparse(img_url)
                    if parsed_img_url.scheme in ['http', 'https'] and parsed_img_url.path.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg')):
                         if is_likely_image(img_url):
                             image_urls.append(img_url)
                             if len(image_urls) >= MAX_IMAGES_TO_INCLUDE:
                                 break

        return text_content, image_urls

    try:
        return retry_operation(_scrape, retries=MAX_REQUEST_RETRIES, show_logs=show_logs)
    except requests.exceptions.HTTPError as e:
        if e.response.status_code in [403, 404]:
            conditional_print(f"Received {e.response.status_code} for URL: {url}. Skipping after retries.", show_logs)
            return "", []
        else:
            conditional_print(f"HTTP error {e.response.status_code} for URL: {url}. Failed after retries.", show_logs)
            return "", []
    except Exception as e:
        conditional_print(f"Error scraping {url} after retries: {type(e).__name__}: {e}", show_logs)
        return "", []


def plan_execution_llm(user_query, website_urls, youtube_urls, cleaned_query, current_time_utc, location, show_logs=True):
    effective_cleaned_query = cleaned_query if cleaned_query else user_query

    messages = [
        {"role": "system", "content": """You are an AI assistant designed to plan how to gather information to answer a user query. You have access to your native knowledge, the ability to process provided website and YouTube URLs, and the ability to perform web searches.

        Analyze the user's **original query**, the **provided URLs**, and the **cleaned query text** (without URLs). Determine the best strategy to find the answer.

        Consider these points:
        1.  **Primary Focus:** Is the query mainly about the content of the provided URLs, or is it a general question where URLs are supplementary, or unrelated?
        2.  **Native Knowledge:** What parts of the query can you answer using your own knowledge?
        3.  **Provided URLs:** Are the provided URLs relevant? Should they be processed (scraped for websites, transcript/metadata for YouTube)?
        4.  **Web Search:** Is a web search needed to find information *not* likely present in the provided URLs or your native knowledge? If so, formulate specific search queries. Avoid searching for information you expect to find in the provided URLs.
        5.  **Search Results:** If web searches are needed, how many pages from the search results should be scraped? Estimate between 3 and 10.

        Strictly respond in a structured, parseable JSON format:
        ```json
        {
          "native_parts": "String describing parts answerable natively, or 'None'",
          "search_queries": ["query 1", "query 2", ...],
          "scrape_provided_websites": true/false,
          "process_provided_youtube": true/false,
          "estimated_pages_to_scrape": 5, // Number between 3 and 10, only relevant if search_queries is not empty
          "query_focus": "URL Focused (Websites)" | "URL Focused (YouTube)" | "URL Focused (Both)" | "Mixed" | "Purely Native" | "Other Web Focused"
        }
        ```
        Ensure the JSON is valid and nothing outside the JSON block.
        Be concise in your descriptions and queries.

        Context:
        Current Time UTC: """ + current_time_utc + """
        Location (approximated): """ + location + """

        Original User Query: """ + user_query + """
        Provided Website URLs: """ + ", ".join(website_urls) if website_urls else "None" + """
        Provided YouTube URLs: """ + ", ".join(youtube_urls) if youtube_urls else "None" + """
        Cleaned Query Text (no URLs): """ + effective_cleaned_query
        },
        {"role": "user", "content": "Plan the execution strategy in the specified JSON format."}
    ]


    response = query_pollinations_ai(messages, model=CLASSIFICATION_MODEL, show_logs=show_logs)

    default_plan = {
        "native_parts": "None",
        "search_queries": [effective_cleaned_query] if effective_cleaned_query and not (website_urls or youtube_urls) else [],
        "scrape_provided_websites": len(website_urls) > 0,
        "process_provided_youtube": len(youtube_urls) > 0,
        "estimated_pages_to_scrape": MAX_PAGES_TO_SCRAPE,
        "query_focus": "Mixed" if (website_urls or youtube_urls) and effective_cleaned_query else ("URL Focused (Both)" if website_urls and youtube_urls else ("URL Focused (Websites)" if website_urls else ("URL Focused (YouTube)" if youtube_urls else "Purely Native" if not effective_cleaned_query else "Other Web Focused")))
    }


    if response and 'choices' in response and len(response['choices']) > 0:
        ai_output = response['choices'][0]['message']['content'].strip()
        json_match = re.search(r"```json\n(.*)\n```", ai_output, re.DOTALL)
        if json_match:
            try:
                plan = json.loads(json_match.group(1))
                plan["native_parts"] = str(plan.get("native_parts", "None"))
                plan["search_queries"] = [str(q).strip() for q in plan.get("search_queries", []) if isinstance(q, str) and q.strip()]
                plan["scrape_provided_websites"] = bool(plan.get("scrape_provided_websites", len(website_urls) > 0))
                plan["process_provided_youtube"] = bool(plan.get("process_provided_youtube", len(youtube_urls) > 0))
                estimated = int(plan.get("estimated_pages_to_scrape", MAX_PAGES_TO_SCRAPE))
                plan["estimated_pages_to_scrape"] = max(MIN_PAGES_TO_SCRAPE, min(MAX_PAGES_TO_SCRAPE, estimated)) if plan["search_queries"] else 0
                plan["query_focus"] = plan.get("query_focus", default_plan["query_focus"])

                conditional_print("\n--- AI Execution Plan ---", show_logs)
                conditional_print(json.dumps(plan, indent=2), show_logs)
                conditional_print("-------------------------", show_logs)
                return plan
            except (json.JSONDecodeError, ValueError, TypeError) as e:
                conditional_print(f"Error parsing AI plan JSON: {e}. Using default plan.", show_logs)
                conditional_print(f"AI output: {ai_output}", show_logs)
                return default_plan
        else:
            conditional_print("AI response did not contain valid JSON plan. Using default plan.", show_logs)
            conditional_print(f"AI output: {ai_output}", show_logs)
            return default_plan

    conditional_print("Could not get execution plan from AI. Using default plan.", show_logs)
    return default_plan

def perform_duckduckgo_text_search(query, max_results, retries=MAX_DUCKDUCKGO_RETRIES, show_logs=True):
    def _search():
        time.sleep(DUCKDUCKGO_REQUEST_DELAY)
        with DDGS() as ddgs:
            search_results = list(ddgs.text(query, max_results=max_results))
            if not search_results:
                 raise ValueError(f"DDGS returned empty results for query '{query}'.")
            return search_results

    try:
        return retry_operation(_search, retries=retries, show_logs=show_logs)
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 403:
            conditional_print(f"DDGS Received 403 Forbidden for query '{query}'. Not retrying.", show_logs)
            return []
        conditional_print(f"DDGS HTTP error {e.response.status_code} for query '{query}'. Failed after retries.", show_logs)
        return []
    except Exception as e:
        conditional_print(f"DDGS Error performing text search for query '{query}' after retries: {type(e).__name__}: {e}.", show_logs)
        return []

def search_and_synthesize(user_input_query, show_sources=True, scrape_images=True, show_logs=True):
    if not user_input_query:
        return "Error: No query provided.", 400

    current_time_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    location = ""
    try:
        response = requests.get("https://ipinfo.io/json", timeout=5)
        response.raise_for_status()
        location_data = response.json()
        location = location_data.get("city", "")
    except requests.exceptions.RequestException:
        location = ""

    # --- Special Handling for SUMMARIZE/SUMMARIZEW ---
    summarize_match = re.match(r'^(SUMMARIZE|SUMMARIZEW)\s+(https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+(?:[-\w.!~*\'()@;:$+,?&/=#%]*))(?:\s+(.*))?$', user_input_query.strip(), re.IGNORECASE)

    if summarize_match:
        keyword = summarize_match.group(1).upper()
        youtube_url_for_summary = summarize_match.group(2)
        extra_query_text = summarize_match.group(3) if summarize_match.group(3) else ""

        video_id = get_youtube_video_id(youtube_url_for_summary)

        if not video_id:
            return f"Error: The provided URL '{youtube_url_for_summary}' is not a valid YouTube video URL.", 400

        conditional_print(f"\n--- Special Handling: {keyword} ---", show_logs)
        conditional_print(f"Target YouTube URL: {youtube_url_for_summary}", show_logs)
        if extra_query_text:
            conditional_print(f"Additional Query: '{extra_query_text}'", show_logs)
        else:
            conditional_print("No additional query text.", show_logs)


        youtube_transcripts_content = None
        youtube_metadata = None
        processed_youtube_urls = []
        failed_youtube_urls = []

        conditional_print("Fetching YouTube data...", show_logs)

        # Fetch transcript and metadata, retries are handled inside the functions
        youtube_transcripts_content = get_youtube_transcript(video_id, show_logs=show_logs)
        youtube_metadata = get_youtube_video_metadata(youtube_url_for_summary, show_logs=show_logs)

        if youtube_transcripts_content or youtube_metadata:
             processed_youtube_urls.append(youtube_url_for_summary)
        else:
             failed_youtube_urls.append(youtube_url_for_summary)
             conditional_print(f"Could not get transcript or metadata for {youtube_url_for_summary} after attempts.", show_logs)


        scraped_text_content = ""
        total_scraped_words = 0
        scraped_website_urls = []
        found_image_urls = []
        search_urls = []

        if keyword == "SUMMARIZEW" and extra_query_text:
             conditional_print("\nPerforming Web Search for additional query...", show_logs)
             search_results = perform_duckduckgo_text_search(extra_query_text, max_results=MAX_SEARCH_RESULTS_PER_QUERY, show_logs=show_logs)
             search_urls.extend([result.get('href') for result in search_results if result and result.get('href')])

             unique_search_urls = []
             for url in search_urls:
                 if url and urlparse(url).scheme in ['http', 'https'] and not is_likely_search_result_url(url) and url not in unique_search_urls:
                     unique_search_urls.append(url)

             pages_to_scrape_count = min(MAX_PAGES_TO_SCRAPE, len(unique_search_urls))

             if unique_search_urls and pages_to_scrape_count > 0 and total_scraped_words < MAX_TOTAL_SCRAPE_WORD_COUNT:
                 conditional_print(f"Scraping up to {pages_to_scrape_count} pages from search results...", show_logs)
                 if show_logs:
                    pbar = tqdm(total=pages_to_scrape_count, desc="Scraping Search Results", unit="page")
                 else:
                    pbar = DummyContextManager()

                 with pbar as pb:
                     urls_for_scraping_search = unique_search_urls[:pages_to_scrape_count]
                     for url in urls_for_scraping_search:
                         if total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                             pb.set_postfix_str("Total word limit reached")
                             break

                         pb.set_postfix_str(f"Scraping {urlparse(url).hostname}")
                         # Scrape function handles retries internally
                         content, images = scrape_website(url, scrape_images=scrape_images, total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT - total_scraped_words, show_logs=show_logs)

                         if content:
                             scraped_text_content += f"\n\n--- Content from {url} ---\n{content}"
                             total_scraped_words += len(content.split())
                             scraped_website_urls.append(url)

                             if scrape_images:
                                  for img_url in images:
                                     if len(found_image_urls) < MAX_IMAGES_TO_INCLUDE and img_url not in found_image_urls:
                                         found_image_urls.append(img_url)
                                     elif len(found_image_urls) >= MAX_IMAGES_TO_INCLUDE:
                                          break
                             pb.set_postfix_str(f"Scraped {len(content.split())} words from {urlparse(url).hostname}")
                         else:
                             pb.set_postfix_str(f"Failed to scrape {urlparse(url).hostname}")

                         pb.update(1)

                     if total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                          conditional_print("Reached total scraped word limit.", show_logs)
             elif not unique_search_urls:
                 conditional_print("No unique search result URLs found for scraping.", show_logs)
             else:
                 conditional_print("Scraping skipped (0 pages estimated or total word limit already met).", show_logs)


        synthesis_prompt_special = """You are a helpful assistant. Synthesize an answer to the user's query based *only* on the provided information from the YouTube transcript and potentially scraped web pages.

        Present the answer in Markdown format.

        Incorporate the information logically and provide the required answer contextually.
        Include dates, times, and specific details from the provided content where relevant. Pay close attention to time zones when dealing with time-related queries and convert times to be relative to the provided Current Time UTC if necessary based on the scraped data.

        **Important:** When citing information derived directly from a source, include a brief inline citation or reference to the source URL where appropriate within the synthesized answer. For example: "According to [Source URL], ..." or "The video at [YouTube URL] explains that...". Aim for a natural flow, not excessive citations.

        If the provided information from all sources is insufficient to answer *any* part of the query, state that you could not find a definitive answer based on the available data. If a *specific* provided URL could not be processed or yielded no information, mention that you were unable to get information from that source.

        Avoid mentioning the web search, scraping, or transcript fetching process explicitly in the final answer (except for the inline citations and mentioning inability to process specific sources if applicable).

        User Query: """ + user_input_query + """

        Current Time UTC: """ + current_time_utc + """

        Provided Information:
        """
        if youtube_transcripts_content:
             synthesis_prompt_special += f"--- YouTube Transcript Content from {youtube_url_for_summary} ---\n"
             if youtube_metadata:
                synthesis_prompt_special += f"Title: {youtube_metadata.get('title', 'N/A')}\n"
                synthesis_prompt_special += f"Author: {youtube_metadata.get('author', 'N/A')}\n"
                synthesis_prompt_special += f"Published: {youtube_metadata.get('publish_date', 'N/A')}\n"
                synthesis_prompt_special += f"Length: {youtube_metadata.get('length', 'N/A')}\n"
                synthesis_prompt_special += f"Views: {youtube_metadata.get('views', 'N/A')}\n"
                synthesis_prompt_special += f"Description: {youtube_metadata.get('description', 'N/A')}\n\n"
             synthesis_prompt_special += youtube_transcripts_content + "\n\n"
        elif youtube_url_for_summary in failed_youtube_urls:
             synthesis_prompt_special += f"--- YouTube Transcript Content from {youtube_url_for_summary} ---\nCould not retrieve transcript or metadata for this video after multiple attempts.\n\n"
        else:
             synthesis_prompt_special += f"--- YouTube Transcript Content from {youtube_url_for_summary} ---\nNo transcript or metadata available.\n\n"


        if scraped_text_content:
             synthesis_prompt_special += f"--- Scraped Web Page Content (for additional query) ---\n{scraped_text_content}\n"
        elif keyword == "SUMMARIZEW" and extra_query_text:
             synthesis_prompt_special += f"--- Scraped Web Page Content (for additional query) ---\nAttempted to scrape web content for '{extra_query_text}' but could not retrieve information.\n\n"
        else:
             synthesis_prompt_special += "--- Scraped Web Page Content (for additional query) ---\nNone available or processed.\n\n"

        if keyword == "SUMMARIZE":
            if youtube_transcripts_content:
                synthesis_prompt_special += "Please summarize the provided YouTube transcript in detail."
            else:
                 synthesis_prompt_special += "No YouTube transcript was provided or could be retrieved after multiple attempts. Therefore, I cannot summarize it."
        elif keyword == "SUMMARIZEW":
            if youtube_transcripts_content and scraped_text_content:
                 synthesis_prompt_special += f"Synthesize information from the YouTube transcript and the scraped web content to answer '{extra_query_text}'. Focus primarily on the video content but include relevant details from the web results."
            elif youtube_transcripts_content:
                 synthesis_prompt_special += f"Synthesize information from the YouTube transcript to answer '{extra_query_text}'. No relevant web content was found or retrieved after multiple attempts."
            elif scraped_text_content:
                 synthesis_prompt_special += f"No YouTube transcript was provided or could be retrieved after multiple attempts. Synthesize information from the scraped web content to answer '{extra_query_text}'."
            else:
                 synthesis_prompt_special += f"No YouTube transcript or web content was provided or could be retrieved after multiple attempts. I cannot answer '{extra_query_text}'."

        final_answer_messages_special = [
            {"role": "system", "content": synthesis_prompt_special},
            {"role": "user", "content": "Synthesize the final answer in Markdown based on the provided information."}
        ]

        final_markdown_output = ""
        status_code = 200

        if show_logs:
            pbar = tqdm(total=1, desc="Synthesizing Answer (Special)", unit="step")
        else:
            pbar = DummyContextManager()

        with pbar as pb:
            final_answer_response = query_pollinations_ai(final_answer_messages_special, model=SYNTHESIS_MODEL, show_logs=show_logs)
            if final_answer_response and 'choices' in final_answer_response and len(final_answer_response['choices']) > 0:
                final_markdown_output += final_answer_response['choices'][0]['message']['content']
                pb.set_postfix_str("Success")
            else:
                pb.set_postfix_str("Failed")
                status_code = 500
                if youtube_transcripts_content or scraped_text_content:
                     final_markdown_output = "--- Synthesis Failed ---\nAn error occurred during the synthesis process, but some information was gathered:\n\n"
                     if youtube_transcripts_content: final_markdown_output += "**YouTube Content:** Available\n"
                     if scraped_text_content: final_markdown_output += "**Scraped Web Content:** Available\n"
                     if failed_youtube_urls: final_markdown_output += f"**Failed to process YouTube:** {', '.join(failed_youtube_urls)}\n"
                     final_markdown_output += "\nConsider retrying the query."
                elif youtube_url_for_summary in failed_youtube_urls and not (keyword == "SUMMARIZEW" and extra_query_text and scraped_text_content):
                     final_markdown_output = f"--- No Information Found ---\nCould not retrieve transcript or metadata for {youtube_url_for_summary} after multiple attempts. Cannot answer the query based on this source.\n---------------------------"
                     status_code = 404
                else:
                    final_markdown_output = "--- No Information Found ---\nCould not retrieve transcript or metadata for the YouTube video after multiple attempts, and no other relevant information was found or requested.\n---------------------------"
                    status_code = 404

            pb.update(1)

        if show_sources and (processed_youtube_urls or scraped_website_urls or failed_youtube_urls or found_image_urls):
             final_markdown_output += "\n\n## Sources\n"
             if processed_youtube_urls:
                  final_markdown_output += "### Transcript Source (Processed YouTube Video)\n"
                  for url in processed_youtube_urls:
                      final_markdown_output += f"- {url}\n"
             if failed_youtube_urls:
                  final_markdown_output += "### Failed YouTube Source\n"
                  final_markdown_output += f"Could not retrieve content for: {', '.join(failed_youtube_urls)}\n"
             if scraped_website_urls:
                 final_markdown_output += "### Text Sources (Scraped Websites)\n"
                 for url in scraped_website_urls:
                     final_markdown_output += f"- {url}\n"
             if scrape_images and found_image_urls:
                 final_markdown_output += "### Images Found on Scraped Pages\n"
                 for url in found_image_urls:
                     final_markdown_output += f"- {url}\n"
             elif scrape_images and scraped_website_urls:
                  final_markdown_output += "### Images Found on Scraped Pages\n"
                  final_markdown_output += "No relevant images found on scraped pages within limits.\n"

             final_markdown_output += "---\n"

        return final_markdown_output, status_code

    # --- End Special Handling ---

    # --- Standard Handling ---
    website_urls, youtube_urls, cleaned_query = extract_urls_from_query(user_input_query)

    plan = plan_execution_llm(user_input_query, website_urls, youtube_urls, cleaned_query, current_time_utc, location, show_logs=show_logs)
    native_answer_content = ""
    if plan.get("native_parts") and plan["native_parts"] != "None":
        if show_logs:
             pbar = tqdm(total=1, desc="Getting Native Answer", unit="step")
        else:
             pbar = DummyContextManager()

        with pbar as pb:
            native_answer_messages = [
                {"role": "system", "content": f"Answer the following question in detail with proper description based on your knowledge: {plan['native_parts']}"},
                {"role": "user", "content": cleaned_query}
            ]
            native_answer_response = query_pollinations_ai(native_answer_messages, model=SYNTHESIS_MODEL, show_logs=show_logs)
            if native_answer_response and 'choices' in native_answer_response and len(native_answer_response['choices']) > 0:
                native_answer_content = native_answer_response['choices'][0]['message']['content']
                pb.set_postfix_str("Success")
            else:
                pb.set_postfix_str("Failed")
                conditional_print("Warning: Could not get native answer.", show_logs)
            pb.update(1)


    youtube_transcripts_content = ""
    processed_youtube_urls = []
    failed_youtube_urls = []
    if plan.get("process_provided_youtube") and youtube_urls:
        conditional_print("\nProcessing YouTube URLs...", show_logs)
        if show_logs:
            pbar = tqdm(total=len(youtube_urls), desc="Processing YouTube URLs", unit="video")
        else:
            pbar = DummyContextManager()

        with pbar as pb:
            for url in youtube_urls:
                video_id = get_youtube_video_id(url)
                if video_id:
                    pb.set_postfix_str(f"Fetching data for {video_id}")
                    # These functions now use retry_operation internally
                    transcript = get_youtube_transcript(video_id, show_logs=show_logs)
                    metadata = get_youtube_video_metadata(url, show_logs=show_logs)

                    if transcript or metadata:
                        youtube_transcripts_content += f"\n\n--- Content from YouTube: {url} ---\n"
                        if metadata:
                            youtube_transcripts_content += f"Title: {metadata.get('title', 'N/A')}\n"
                            youtube_transcripts_content += f"Author: {metadata.get('author', 'N/A')}\n"
                            youtube_transcripts_content += f"Published: {metadata.get('publish_date', 'N/A')}\n"
                            youtube_transcripts_content += f"Length: {metadata.get('length', 'N/A')}\n"
                            youtube_transcripts_content += f"Views: {metadata.get('views', 'N/A')}\n"
                            youtube_transcripts_content += f"Description: {metadata.get('description', 'N/A')}\n\n"
                        if transcript:
                            youtube_transcripts_content += transcript
                            pb.set_postfix_str(f"Processed data for {video_id}")
                        else:
                            youtube_transcripts_content += "Transcript not available.\n"
                            pb.set_postfix_str(f"Processed metadata (no transcript) for {video_id}")

                        processed_youtube_urls.append(url)
                    else:
                         pb.set_postfix_str(f"Failed for {video_id} after attempts")
                         failed_youtube_urls.append(url)

                else:
                    pb.set_postfix_str(f"Invalid URL: {url}")
                    failed_youtube_urls.append(url)
                pb.update(1)


    scraped_text_content = ""
    total_scraped_words = 0
    scraped_website_urls = []
    found_image_urls = []
    urls_to_scrape = []

    if plan.get("scrape_provided_websites") and website_urls:
         urls_to_scrape.extend(website_urls)

    search_urls = []
    if plan.get("search_queries"):
         conditional_print("\nPerforming Web Search...", show_logs)
         for query in conditional_tqdm(plan["search_queries"], show_logs, desc="Performing Web Searches", unit="query"):
              # Search function handles retries internally
              search_results = perform_duckduckgo_text_search(query, max_results=MAX_SEARCH_RESULTS_PER_QUERY, show_logs=show_logs)
              search_urls.extend([result.get('href') for result in search_results if result and result.get('href')])

         urls_to_scrape.extend(search_urls)

    unique_urls_to_scrape = []
    for url in urls_to_scrape:
        if url and urlparse(url).scheme in ['http', 'https'] and not is_likely_search_result_url(url) and url not in unique_urls_to_scrape:
            unique_urls_to_scrape.append(url)

    estimated_pages_from_search = plan.get("estimated_pages_to_scrape", 0) if plan.get("search_queries") else 0

    # Prioritize provided URLs, then take from search results up to the estimated limit
    urls_for_scraping = []
    if plan.get("scrape_provided_websites"):
        urls_for_scraping.extend([url for url in unique_urls_to_scrape if url in website_urls])

    search_result_urls_to_add = [url for url in unique_urls_to_scrape if url not in website_urls]
    urls_for_scraping.extend(search_result_urls_to_add[:estimated_pages_from_search])


    if urls_for_scraping and total_scraped_words < MAX_TOTAL_SCRAPE_WORD_COUNT:
        conditional_print("\nScraping Web Content...", show_logs)
        if show_logs:
            pbar = tqdm(total=len(urls_for_scraping), desc="Scraping Websites", unit="page")
        else:
            pbar = DummyContextManager()

        with pbar as pb:
            for url in urls_for_scraping:
                if total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                    pb.set_postfix_str("Total word limit reached")
                    break

                pb.set_postfix_str(f"Scraping {urlparse(url).hostname}")
                # Scrape function handles retries internally
                content, images = scrape_website(url, scrape_images=scrape_images, total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT - total_scraped_words, show_logs=show_logs)

                if content:
                    scraped_text_content += f"\n\n--- Content from {url} ---\n{content}"
                    total_scraped_words += len(content.split())
                    scraped_website_urls.append(url)

                    if scrape_images:
                         for img_url in images:
                            if len(found_image_urls) < MAX_IMAGES_TO_INCLUDE and img_url not in found_image_urls:
                                found_image_urls.append(img_url)
                            elif len(found_image_urls) >= MAX_IMAGES_TO_INCLUDE:
                                 break

                    pb.set_postfix_str(f"Scraped {len(content.split())} words from {urlparse(url).hostname}")
                else:
                    pb.set_postfix_str(f"Failed to scrape {urlparse(url).hostname}")

                pb.update(1)

            if total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                 conditional_print("Reached total scraped word limit.", show_logs)
    elif not urls_for_scraping:
         conditional_print("\nNo unique URLs found for scraping or plan specified no scraping.", show_logs)


    conditional_print("\nSending Information to AI for Synthesis...", show_logs)

    synthesis_prompt = """You are a helpful assistant. Synthesize a comprehensive, detailed, and confident answer to the user's original query based *only* on the provided information from native knowledge, scraped web pages, and YouTube transcripts.

    Present the answer in Markdown format.

    Incorporate the information logically and provide the required answer contextually.
    Include dates, times, and specific details from the provided content where relevant to make the information more lively and grounded in the sources. Pay close attention to time zones when dealing with time-related queries and convert times to be relative to the provided Current Time UTC if necessary based on the scraped data.

    **Important:** When citing information derived directly from a source (scraped website or YouTube content), include a brief inline citation or reference to the source URL where appropriate within the synthesized answer. For example: "According to [Source URL], ..." or "The video at [YouTube URL] explains that...". Aim for a natural flow, not excessive citations.

    If the provided information from all sources is insufficient to answer *any* part of the query, state that you could not find a definitive answer based on the available data. If a *specific* provided URL could not be processed or yielded no information, mention that you were unable to get information from that source.

    Avoid mentioning the web search, scraping, or transcript fetching process explicitly in the final answer (except for the inline citations and mentioning inability to process specific sources if applicable).

    User Query: """ + user_input_query + """

    Current Time UTC: """ + current_time_utc + """

    Provided Information:
    """

    if native_answer_content:
        synthesis_prompt += f"--- Native Knowledge ---\n{native_answer_content}\n\n"
    else:
        synthesis_prompt += "--- Native Knowledge ---\nNone available or requested.\n\n"


    if youtube_transcripts_content:
         synthesis_prompt += f"--- YouTube Transcript and Metadata Content ---\n{youtube_transcripts_content}\n\n"
    elif plan.get("process_provided_youtube") and youtube_urls:
        synthesis_prompt += "--- YouTube Transcript and Metadata Content ---\nAttempted to process provided YouTube URLs but could not retrieve content or metadata after multiple attempts.\n\n"
    else:
         synthesis_prompt += "--- YouTube Transcript and Metadata Content ---\nNone available or processed.\n\n"

    if scraped_text_content:
        synthesis_prompt += f"--- Scraped Web Page Content ---\n{scraped_text_content}\n"
    elif (plan.get("scrape_provided_websites") and website_urls) or (plan.get("search_queries") and search_urls):
         synthesis_prompt += "--- Scraped Web Page Content ---\nAttempted to scrape web content but could not retrieve information.\n\n"
    else:
         synthesis_prompt += "--- Scraped Web Page Content ---\nNone available or processed.\n\n"


    final_answer_messages = [
        {"role": "system", "content": synthesis_prompt},
        {"role": "user", "content": "Synthesize the final answer in Markdown based on the provided information, including inline citations."}
    ]

    final_markdown_output = ""
    status_code = 200

    if show_logs:
        pbar = tqdm(total=1, desc="Synthesizing Answer", unit="step")
    else:
        pbar = DummyContextManager()

    with pbar as pb:
        final_answer_response = query_pollinations_ai(final_answer_messages, model=SYNTHESIS_MODEL, show_logs=show_logs)
        if final_answer_response and 'choices' in final_answer_response and len(final_answer_response['choices']) > 0:
            final_markdown_output += final_answer_response['choices'][0]['message']['content']
            pb.set_postfix_str("Success")
        else:
            pb.set_postfix_str("Failed")
            status_code = 500
            if not native_answer_content and not scraped_text_content and not youtube_transcripts_content:
                final_markdown_output = "--- No Information Found ---\nCould not find enough information (either natively, from web searches/provided URLs, or YouTube transcripts) to answer the query after multiple attempts.\n---------------------------"
                status_code = 404
            else:
                final_markdown_output = "--- Synthesis Failed ---\nAn error occurred during the synthesis process, but some information was gathered:\n\n"
                if native_answer_content: final_markdown_output += "**Native Knowledge:** Available\n"
                if youtube_transcripts_content: final_markdown_output += "**YouTube Content:** Available\n"
                if scraped_text_content: final_markdown_output += "**Scraped Web Content:** Available\n"
                if failed_youtube_urls: final_markdown_output += f"**Failed to process YouTube:** {', '.join(failed_youtube_urls)}\n"
                final_markdown_output += "\nConsider retrying the query."
        pb.update(1)


    if show_sources and (scraped_website_urls or processed_youtube_urls or failed_youtube_urls or found_image_urls or (native_answer_content and plan.get("native_parts") != "None")):
        final_markdown_output += "\n\n## Sources\n"
        if native_answer_content and plan.get("native_parts") != "None":
             final_markdown_output += "### Answered Natively\n"
             final_markdown_output += f"Parts of the query related to: {plan.get('native_parts', 'Native knowledge')}\n"
        if scraped_website_urls:
            final_markdown_output += "### Text Sources (Scraped Websites)\n"
            for url in scraped_website_urls:
                final_markdown_output += f"- {url}\n"
        if processed_youtube_urls:
             final_markdown_output += "### Transcript Sources (Processed YouTube Videos)\n"
             for url in processed_youtube_urls:
                 final_markdown_output += f"- {url}\n"
        if failed_youtube_urls:
             final_markdown_output += "### Failed YouTube Sources\n"
             final_markdown_output += f"Could not retrieve content for: {', '.join(failed_youtube_urls)}\n"

        if scrape_images and found_image_urls:
            final_markdown_output += "### Images Found on Scraped Pages\n"
            for url in found_image_urls:
                final_markdown_output += f"- {url}\n"
        elif scrape_images and (scraped_website_urls or processed_youtube_urls):
             final_markdown_output += "### Images Found on Scraped Pages\n"
             final_markdown_output += "No relevant images found on scraped pages within limits.\n"

        final_markdown_output += "---\n"

    return final_markdown_output, status_code

app = Flask(__name__)
CORS(app)
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    storage_uri="memory://",
    strategy="moving-window"
)

executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_REQUESTS)
semaphore = threading.Semaphore(MAX_CONCURRENT_REQUESTS)
@limiter.limit("10 per minute")
@app.route('/search', methods=['GET', 'POST'])
def handle_search():
    user_input_query = None
    show_logs_param = None
    show_image_param = None
    show_sources_param = None

    if request.method == 'POST':
        data = request.get_json()
        if data:
            user_input_query = data.get('query')
            show_logs_param = data.get('show_logs', None)
            show_image_param = data.get('show_images', None)
            show_sources_param = data.get('show_sources', None)
    elif request.method == 'GET':
        user_input_query = request.args.get('query')
        show_logs_param = request.args.get('show_logs', None)
        show_image_param = request.args.get('show_images', None)
        show_sources_param = request.args.get('show_sources', None)

    if not user_input_query or not isinstance(user_input_query, str):
        return jsonify({"error": "Query parameter 'query' is required and must be a string."}), 400

    user_input_query = user_input_query.strip()
    if len(user_input_query) == 0:
        return jsonify({"error": "Query parameter 'query' cannot be empty."}), 400
    if len(user_input_query) > 1000:
        return jsonify({"error": "Query parameter 'query' is too long (max 1000 characters)."}), 400

    if user_input_query.strip().lower() == "pollinations_test":
        try:
             test_messages = [{"role": "user", "content": "Respond with 'Service is reachable and responding (test mode).'"}]
             response = query_pollinations_ai(test_messages, model="OpenAI GPT-3.5 Turbo", retries=1, show_logs=False)
             if response and 'choices' in response and len(response['choices']) > 0:
                  if "service is reachable" in response['choices'][0]['message']['content'].lower():
                       return Response(response['choices'][0]['message']['content'], mimetype='text/markdown', status=200)
                  else:
                       return Response(f"Pollinations AI test: AI responded unexpectedly. Output:\n\n{response['choices'][0]['message']['content']}", mimetype='text/markdown', status=500)
             else:
                  return Response("Pollinations AI test: AI call failed or returned empty response.", mimetype='text/markdown', status=500)
        except Exception as e:
             return Response(f"Pollinations AI test: An error occurred during the test AI call: {type(e).__name__}: {e}", mimetype='text/markdown', status=500)


    show_logs = str(show_logs_param).lower() == 'true' if show_logs_param is not None else True
    def process_request():
        with semaphore:
            markdown_output, status_code = search_and_synthesize(
                user_input_query,
                show_sources=show_sources_param,
                scrape_images=show_image_param,
                show_logs=show_logs
            )
            return markdown_output, status_code

    future = executor.submit(process_request)
    # Wait for the result from the thread
    markdown_output, status_code = future.result()
    return Response(markdown_output, mimetype='text/markdown', status=status_code)


# if __name__ == "__main__":
#     # Running in __main__ with debug=False is standard for production-like deployment
#     # Using 127.0.0.1 binds to localhost only
#     app.run(host="127.0.0.1", port=5000, debug=False)