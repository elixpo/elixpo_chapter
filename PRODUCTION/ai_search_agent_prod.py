import requests
import json
import datetime
import re
import time
import sys
from urllib.parse import urljoin, urlparse, parse_qs
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
from pytube import YouTube, exceptions
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
import concurrent.futures

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
MAX_CONCURRENT_REQUESTS = 8
CLASSIFICATION_MODEL = os.getenv("CLASSIFICATION_MODEL", "OpenAI GPT-4.1-nano")
SYNTHESIS_MODEL = os.getenv("SYNTHESIS_MODEL", "openai-large")

query_pollinations_ai_show_log = True
get_youtube_transcript_show_log = True
get_youtube_video_metadata_show_log = True
scrape_website_show_log = True
plan_execution_llm_show_log = True
perform_duckduckgo_text_search_show_log = True

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
        return tqdm(iterable, *args, file=sys.stdout, **kwargs)
    else:
        return DummyContextManager()

def conditional_print(message, show_logs):
    if show_logs:
        print(message, file=sys.stdout)

def exponential_backoff(attempt, base_delay=REQUEST_RETRY_DELAY, max_delay=60):
    delay = min(max_delay, base_delay * (2 ** attempt))
    return delay + random.uniform(0, base_delay * 0.5)

def retry_operation(func, *args, retries=MAX_REQUEST_RETRIES, show_logs=True, **kwargs):
    for attempt in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if attempt < retries - 1:
                conditional_print(f"Attempt {attempt + 1}/{retries} failed for {func.__name__}: {type(e).__name__}: {e}. Retrying in {exponential_backoff(attempt):.2f}s.", show_logs)
                time.sleep(exponential_backoff(attempt))
            else:
                conditional_print(f"Attempt {attempt + 1}/{retries} failed for {func.__name__}: {type(e).__name__}: {e}. Max retries reached.", show_logs)
                raise

    raise RuntimeError(f"Operation {func.__name__} failed after {retries} attempts.")

def query_pollinations_ai(messages, model=SYNTHESIS_MODEL, retries=MAX_REQUEST_RETRIES, show_logs=query_pollinations_ai_show_log):
    def _query():
        if not isinstance(messages, list) or not all(isinstance(m, dict) and 'role' in m and 'content' in m for m in messages):
             raise ValueError("Messages must be a list of dictionaries with 'role' and 'content' keys.")

        payload = {
            "model": model,
            "messages": messages,
            "seed": random.randint(0, 2**31 - 1),
            "token" : os.getenv("POLLINATIONS_TOKEN"),
            "referrer" : os.getenv("POLLINATIONS_REFERRER"),
        }
        url = "https://text.pollinations.ai/openai"
        headers = {
            "Content-Type": "application/json"
        }
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=120)
        response.raise_for_status()
        return response.json()

    try:
        return retry_operation(_query, retries=retries, show_logs=show_logs)
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else 'N/A'
        conditional_print(f"HTTP error {status_code} querying Pollinations AI ({model}): {e}. Failed after retries.", show_logs)
        return None
    except Exception as e:
        conditional_print(f"Error querying Pollinations AI ({model}): {type(e).__name__}: {e}. Failed after retries.", show_logs)
        return None

def extract_urls_from_query(query):
    urls = re.findall(r'(https?://[^\s]+)', query)
    cleaned_query = query
    website_urls = []
    youtube_urls = []

    for url in urls:
        cleaned_query = cleaned_query.replace(url, '').strip()
        url_cleaned = url.rstrip('.,;!?"\'')

        parsed_url = urlparse(url_cleaned)
        if "youtube.com" in parsed_url.netloc or "youtu.be" in parsed_url.netloc:
            youtube_urls.append(url_cleaned)
        elif parsed_url.scheme in ['http', 'https']:
            website_urls.append(url_cleaned)
        cleaned_query = re.sub(r'\s+', ' ', cleaned_query).strip()

    return website_urls, youtube_urls, cleaned_query

def get_youtube_video_id(url):
    parsed_url = urlparse(url)
    if "youtube.com" in parsed_url.netloc:
        video_id = parse_qs(parsed_url.query).get('v')
        if video_id:
            return video_id[0]
        if parsed_url.path:
            match = re.search(r'/(?:embed|v)/([^/?#&]+)', parsed_url.path)
            if match:
                return match.group(1)
    elif "youtu.be" in parsed_url.netloc:
        if parsed_url.path and len(parsed_url.path) > 1:
            return parsed_url.path[1:].split('/')[0].split('?')[0].split('#')[0]
    return None

def get_youtube_transcript(video_id, show_logs=get_youtube_transcript_show_log):
    if not video_id:
        conditional_print("Attempted to get transcript with no video ID.", show_logs)
        return None

    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        transcript = None
        try:
            transcript = transcript_list.find_transcript(['en'])
            conditional_print(f"Found 'en' transcript for video ID: {video_id}", show_logs)
        except NoTranscriptFound:
             conditional_print(f"No 'en' transcript found, trying 'a.en' for video ID: {video_id}", show_logs)
             try:
                transcript = transcript_list.find_transcript(['a.en'])
                conditional_print(f"Found 'a.en' transcript for video ID: {video_id}", show_logs)
             except NoTranscriptFound:
                conditional_print(f"No 'a.en' transcript found for video ID: {video_id}", show_logs)
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

def get_youtube_video_metadata(url, show_logs=get_youtube_video_metadata_show_log):
    video_id = get_youtube_video_id(url)
    if not video_id:
        conditional_print(f"[Pytube] Invalid URL provided for metadata: {url}", show_logs)
        return None

    try:
        yt = YouTube(url)
        metadata = {
            "title": yt.title if hasattr(yt, 'title') else "Unknown",
            "author": yt.author if hasattr(yt, 'author') else "Unknown",
            "publish_date": yt.publish_date.strftime("%Y-%m-%d %H:%M:%S") if hasattr(yt, 'publish_date') and yt.publish_date else "Unknown",
            "length": f"{yt.length // 60}m {yt.length % 60}s" if hasattr(yt, 'length') and yt.length is not None else "Unknown",
            "views": f"{yt.views:,}" if hasattr(yt, 'views') and yt.views is not None else "Unknown",
            "description": (
                yt.description[:500] + "..." if hasattr(yt, 'description') and yt.description and len(yt.description) > 500
                else getattr(yt, 'description', "No description available") or "No description available"
            ),
            "thumbnail_url": yt.thumbnail_url if hasattr(yt, 'thumbnail_url') else None,
            "url": url
        }
        conditional_print(f"[Pytube] Fetched metadata for {url}", show_logs)
        return metadata

    except exceptions.VideoUnavailable:
        conditional_print(f"[Pytube] VideoUnavailable: {url}", show_logs)
    except exceptions.LiveStreamError:
        conditional_print(f"[Pytube] LiveStreamError (likely a live stream or not fully processed yet): {url}", show_logs)
    except exceptions.RegexMatchError:
        conditional_print(f"[Pytube] RegexMatchError: Invalid or malformed URL - {url}", show_logs)
    except exceptions.ExtractError:
        conditional_print(f"[Pytube] ExtractError: Could not extract data for - {url}", show_logs)
    except Exception as e:
        conditional_print(f"[Pytube] Unexpected error for {url}: {type(e).__name__} - {e}", show_logs)

    return None

def is_likely_search_result_url(url):
    if not url:
        return False
    parsed_url = urlparse(url)
    if any(domain in parsed_url.netloc for domain in ['google.com', 'duckduckgo.com', 'bing.com', 'yahoo.com', 'baidu.com', 'yandex.ru', 'ddg.gg']):
        if parsed_url.path.startswith(('/search', '/html', '/res', '/web', '/url', '/clank', '/lite/')) or parsed_url.path == '/':
             return True
        query_params = parse_qs(parsed_url.query)
        if any(param in query_params for param in ['q', 'query', 'p', 'wd', 'text', 'url', 'search', 's']):
             return True
        if 'duckduckgo.com' in parsed_url.netloc and parsed_url.path == '/' and 'q' in query_params:
             return True
    return False

def is_likely_image_url_heuristic(url):
    if not url:
        return False

    lower_url = url.lower()

    path_part = urlparse(url).path
    if not any(path_part.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg']):
        return False

    if any(keyword in lower_url for keyword in ['/icon/', '/logo/', '/loader/', '/sprite/', '/thumbnail/', '/small/', '/avatar/', '/advert', '/ad_/', 'pixel', '1x1', 'badge', 'button']):
        return False

    size_patterns = [
        r'/(\d+)x(\d+)/',
        r'-(\d+)x(\d+)\.',
        r'width=(\d+)&',
        r'height=(\d+)&',
        r'&w=(\d+)',
        r'&h=(\d+)'
    ]
    min_dim_threshold = 150

    for pattern in size_patterns:
        matches = re.findall(pattern, lower_url)
        for match in matches:
            dims = [int(d) for dim_group in match for d in (dim_group if isinstance(dim_group, tuple) else (dim_group,)) if d.isdigit()]
            if dims:
                if any(dim < min_dim_threshold for dim in dims):
                     return False

    return True

def scrape_website(url, scrape_images=True, total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT, show_logs=scrape_website_show_log):
    def _scrape():
        text_content = ""
        image_urls = []
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}

        try:
            response = requests.get(url, timeout=20, headers=headers)
            response.raise_for_status()

            content_type = response.headers.get('Content-Type', '').lower()
            if not 'text/html' in content_type:
                 conditional_print(f"Skipping non-HTML content from {url} (Content-Type: {content_type})", show_logs)
                 return "", []

            soup = BeautifulSoup(response.content, 'html.parser')

            for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form', 'button', 'noscript', 'iframe', 'svg']):
                if element:
                    element.extract()

            main_content_elements = soup.find_all(['main', 'article', 'div', 'section'], class_=['main', 'content', 'article', 'post', 'body', 'main-content', 'entry-content', 'blog-post'])
            if not main_content_elements:
                main_content_elements = [soup.find('body')] if soup.find('body') else [soup]

            temp_text = []
            word_count = 0
            for main_elem in main_content_elements:
                 if word_count >= total_word_count_limit:
                      break
                 for tag in main_elem.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'div']):
                      if word_count >= total_word_count_limit:
                           break
                      text = tag.get_text()
                      text = re.sub(r'\s+', ' ', text).strip()
                      if text:
                          words = text.split()
                          words_to_add = words[:total_word_count_limit - word_count]
                          if words_to_add:
                                temp_text.append(" ".join(words_to_add))
                                word_count += len(words_to_add)

            text_content = '\n\n'.join(temp_text)
            if word_count >= total_word_count_limit and len(text_content.split()) > total_word_count_limit:
                 text_content = ' '.join(text_content.split()[:total_word_count_limit]) + '...'

            if scrape_images and len(image_urls) < MAX_IMAGES_TO_INCLUDE:
                img_tags = []
                for main_elem in main_content_elements:
                     img_tags.extend(main_elem.find_all(['img', 'source']))
                if not main_content_elements:
                     img_tags.extend(soup.find_all(['img', 'source']))

                processed_img_srcs = set()
                for tag in img_tags:
                    if len(image_urls) >= MAX_IMAGES_TO_INCLUDE:
                        break

                    img_url = None
                    if tag.name == 'img':
                        img_src = tag.get('src')
                        img_data_src = tag.get('data-src')
                        img_url = img_data_src if img_data_src else img_src
                    elif tag.name == 'source':
                         srcset = tag.get('srcset')
                         if srcset:
                              img_url = srcset.strip().split(',')[0].split(' ')[0]

                    if img_url and img_url not in processed_img_srcs:
                        processed_img_srcs.add(img_url)

                        img_url_full = urljoin(url, img_url)
                        parsed_img_url = urlparse(img_url_full)

                        if parsed_img_url.scheme in ['http', 'https']:
                             if is_likely_image_url_heuristic(img_url_full):
                                  image_urls.append(img_url_full)
                                  conditional_print(f"Found image: {img_url_full[:100]}...", show_logs)

            return text_content, image_urls

        except requests.exceptions.Timeout:
            conditional_print(f"Timeout scraping URL: {url}", show_logs)
            return "", []
        except requests.exceptions.RequestException as e:
            conditional_print(f"Request error scraping URL: {url}: {type(e).__name__}: {e}", show_logs)
            return "", []
        except Exception as e:
            conditional_print(f"Error processing URL: {url}: {type(e).__name__}: {e}", show_logs)
            return "", []

    try:
        return retry_operation(_scrape, retries=MAX_REQUEST_RETRIES, show_logs=show_logs)
    except Exception as e:
        return "", []

def plan_execution_llm(user_query, provided_website_urls, provided_youtube_urls, cleaned_query, current_time_utc, location, show_logs=plan_execution_llm_show_log):
    effective_cleaned_query = cleaned_query if cleaned_query else user_query

    messages = [
        {"role": "system", "content": """You are an AI assistant designed to plan how to gather information to answer a user query. You have access to your native knowledge, the ability to process provided website and YouTube URLs, and the ability to perform web searches.

        Analyze the user's **original query**, the **provided URLs**, and the **cleaned query text** (without URLs). Determine the best strategy to find the answer.

        Consider these points:
        1.  **Primary Focus:** Is the query mainly about the content of the provided URLs, or is it a general question where URLs are supplementary, or unrelated?
        2.  **Native Knowledge:** What parts of the query can you answer using your own knowledge? Be specific about the *topic* or *aspect* you think you can answer natively. If none, state 'None'.
        3.  **Provided URLs:** Are the provided URLs relevant? Should they be processed (scraped for websites, transcript/metadata for YouTube)?
        4.  **Web Search:** Is a web search needed to find information *not* likely present in the provided URLs or your native knowledge? If so, formulate specific search queries. Avoid searching for information you expect to find in the provided URLs or your native knowledge.
        5.  **Search Results:** If web searches are needed, how many unique pages from the search results should be considered for scraping? Estimate between """ + str(MIN_PAGES_TO_SCRAPE) + """ and """ + str(MAX_PAGES_TO_SCRAPE) + """ (inclusive). If web search is not needed, estimate 0.
        6.  **Output Formatting:** Does the user's original query indicate a desire for images or source URLs to be included in the final output? Look for phrases like "show images", "include pictures", "with images", "show sources", "include references", "cite sources", "with sources".

        Strictly respond in a structured, parseable JSON format:
        ```json
        {
          "native_parts": "String describing the topic/aspect answerable natively, or 'None'",
          "search_queries": ["query 1", "query 2", ...], // List of string queries, can be empty
          "scrape_provided_websites": true/false,
          "process_provided_youtube": true/false,
          "estimated_pages_to_scrape_from_search": 5, // Number between """ + str(MIN_PAGES_TO_SCRAPE) + """ and """ + str(MAX_PAGES_TO_SCRAPE) + """, or 0 if no search is needed
          "include_images": true/false, // Based on point 6
          "include_sources": true/false, // Based on point 6
          "query_focus": "URL Focused (Websites)" | "URL Focused (YouTube)" | "URL Focused (Both)" | "Mixed" | "Purely Native" | "Other Web Focused" | "Unclear" // Categorize the primary nature of the query
        }
        ```
        Ensure the JSON is valid and nothing outside the JSON block.
        Be concise in your descriptions and queries.

        Context:
        Current Time UTC: """ + current_time_utc + """
        Location (approximated): """ + location + """

        Original User Query: """ + user_query + """
        Provided Website URLs: """ + ", ".join(provided_website_urls) if provided_website_urls else "None" + """
        Provided YouTube URLs: """ + ", ".join(provided_youtube_urls) if provided_youtube_urls else "None" + """
        Cleaned Query Text (no URLs or API instructions): """ + effective_cleaned_query
        },
        {"role": "user", "content": "Plan the execution strategy in the specified JSON format."}
    ]

    default_plan = {
        "native_parts": "None",
        "search_queries": [effective_cleaned_query] if effective_cleaned_query else [],
        "scrape_provided_websites": len(provided_website_urls) > 0,
        "process_provided_youtube": len(provided_youtube_urls) > 0,
        "estimated_pages_to_scrape_from_search": MAX_PAGES_TO_SCRAPE if effective_cleaned_query or provided_website_urls else 0,
        "include_images": False,
        "include_sources": False,
        "query_focus": "Mixed" if (provided_website_urls or provided_youtube_urls) and effective_cleaned_query else ("URL Focused (Both)" if provided_website_urls and provided_youtube_urls else ("URL Focused (Websites)" if provided_website_urls else ("URL Focused (YouTube)" if provided_youtube_urls else "Purely Native" if not effective_cleaned_query and not (provided_website_urls or provided_youtube_urls) else "Other Web Focused")))
    }

    response = query_pollinations_ai(messages, model=CLASSIFICATION_MODEL, show_logs=show_logs)

    plan = default_plan.copy() # Start with default

    if response and 'choices' in response and len(response['choices']) > 0:
        ai_output = response['choices'][0]['message']['content'].strip()
        json_match = re.search(r"```json\n(.*)\n```", ai_output, re.DOTALL)
        if json_match:
            try:
                parsed_plan = json.loads(json_match.group(1))

                plan["native_parts"] = str(parsed_plan.get("native_parts", default_plan["native_parts"]))
                plan["search_queries"] = [str(q).strip() for q in parsed_plan.get("search_queries", []) if isinstance(q, str) and q.strip()]

                plan["scrape_provided_websites"] = bool(parsed_plan.get("scrape_provided_websites", default_plan["scrape_provided_websites"]))
                plan["process_provided_youtube"] = bool(parsed_plan.get("process_provided_youtube", default_plan["process_provided_youtube"]))

                estimated = 0
                if "estimated_pages_to_scrape_from_search" in parsed_plan:
                     try:
                         estimated = int(parsed_plan["estimated_pages_to_scrape_from_search"])
                     except (ValueError, TypeError):
                         conditional_print("AI returned invalid value for estimated_pages_to_scrape_from_search. Using default.", show_logs)
                         estimated = default_plan["estimated_pages_to_scrape_from_search"]
                else:
                     estimated = default_plan["estimated_pages_to_scrape_from_search"]

                if plan["search_queries"]:
                     plan["estimated_pages_to_scrape_from_search"] = max(MIN_PAGES_TO_SCRAPE, min(MAX_PAGES_TO_SCRAPE, estimated))
                else:
                     plan["estimated_pages_to_scrape_from_search"] = 0

                # Extract and validate new flags, defaulting to False
                plan["include_images"] = bool(parsed_plan.get("include_images", False))
                plan["include_sources"] = bool(parsed_plan.get("include_sources", False))


                plan["query_focus"] = str(parsed_plan.get("query_focus", default_plan["query_focus"]))

                conditional_print("\n--- AI Execution Plan ---", show_logs)
                conditional_print(json.dumps(plan, indent=2), show_logs)
                conditional_print("-------------------------", show_logs)
                return plan, plan["include_sources"], plan["include_images"]
            except (json.JSONDecodeError, ValueError, TypeError) as e:
                conditional_print(f"Error parsing AI plan JSON: {e}. AI output: {ai_output}. Using default plan.", show_logs)
                return default_plan, default_plan["include_sources"], default_plan["include_images"]
        else:
            conditional_print("AI response did not contain valid JSON plan. AI output: {ai_output}. Using default plan.", show_logs)
            return default_plan, default_plan["include_sources"], default_plan["include_images"]

    conditional_print("Could not get execution plan from AI. Using default plan.", show_logs)
    return default_plan, default_plan["include_sources"], default_plan["include_images"]

def perform_duckduckgo_text_search(query, max_results, retries=MAX_DUCKDUCKGO_RETRIES, show_logs=perform_duckduckgo_text_search_show_log):
    if not query or not isinstance(query, str) or query.strip() == "":
        conditional_print("Received empty or invalid query for DDGS. Skipping search.", show_logs)
        return []

    def _search():
        time.sleep(DUCKDUCKGO_REQUEST_DELAY)
        try:
            with DDGS() as ddgs:
                search_results = [{k: result.get(k) for k in ['title', 'href', 'body']}
                                  for result in ddgs.text(query, max_results=max_results)]

            valid_results = [r for r in search_results if r and isinstance(r.get('href'), str) and r['href'].strip()]

            if not valid_results:
                 conditional_print(f"DDGS returned no valid results (empty or missing href) for query '{query}'.", show_logs)
                 return []

            conditional_print(f"DDGS search successful for query '{query}'. Found {len(valid_results)} results.", show_logs)
            return valid_results

        except Exception as e:
             conditional_print(f"DDGS search error during _search for '{query}': {type(e).__name__}: {e}", show_logs)
             raise

    try:
        return retry_operation(_search, retries=retries, show_logs=show_logs)
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else 'N/A'
        if status_code in [403, 429]:
             conditional_print(f"DDGS Received {status_code} for query '{query}'. Skipping after retries.", show_logs)
        else:
            conditional_print(f"DDGS HTTP error {status_code} for query '{query}'. Failed after retries.", show_logs)
        return []
    except Exception as e:
        conditional_print(f"DDGS Error performing text search for query '{query}' after retries: {type(e).__name__}: {e}.", show_logs)
        return []

def search_and_synthesize(original_query, provided_website_urls, provided_youtube_urls, cleaned_query_text, show_sources=True, scrape_images=True, show_logs=True, output_format='markdown'):
    collected_data = {
        "native_knowledge_part": None,
        "scraped_website_urls": [],
        "processed_youtube_urls": [],
        "failed_youtube_urls": [],
        "found_image_urls": []
    }
    final_markdown_output = ""
    status_code = 200

    if not original_query:
        collected_data["error"] = "No query provided."
        return "Error: No query provided.", 400, collected_data

    current_time_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    location = ""
    try:
        location_response = retry_operation(requests.get, "https://ipinfo.io/json", timeout=5, retries=1, show_logs=False)
        if location_response and location_response.status_code == 200:
            location_data = location_response.json()
            location = location_data.get("city", "") or location_data.get("region", "") or location_data.get("country", "")
    except Exception:
        location = ""

    is_summarize_request = (len(provided_youtube_urls) == 1 and len(provided_website_urls) == 0 and original_query.strip().upper().startswith("SUMMARIZE"))
    is_summarizew_request = (len(provided_youtube_urls) == 1 and original_query.strip().upper().startswith("SUMMARIZEW"))

    if is_summarize_request or is_summarizew_request:
        keyword = "SUMMARIZEW" if is_summarizew_request else "SUMMARIZE"
        youtube_url_for_summary = provided_youtube_urls[0]
        extra_query_text = cleaned_query_text

        video_id = get_youtube_video_id(youtube_url_for_summary)

        if not video_id:
            error_msg = f"Error: The provided URL '{youtube_url_for_summary}' is not a valid YouTube video URL for {keyword}."
            collected_data["error"] = error_msg
            collected_data["failed_youtube_urls"].append(youtube_url_for_summary)
            return error_msg, 400, collected_data

        conditional_print(f"\n--- Special Handling: {keyword} ---", show_logs)
        conditional_print(f"Target YouTube URL: {youtube_url_for_summary}", show_logs)
        if is_summarizew_request and extra_query_text:
            conditional_print(f"Additional Query: '{extra_query_text}'", show_logs)
        elif is_summarizew_request:
            conditional_print("SUMMARIZEW requested, but no additional query text provided after URL.", show_logs)
        else:
            conditional_print("No additional query text for SUMMARIZE.", show_logs)

        youtube_content_for_synthesis = None

        conditional_print("Fetching YouTube data...", show_logs)

        transcript_future = process_executor.submit(get_youtube_transcript, video_id, show_logs=show_logs)
        metadata_future = process_executor.submit(get_youtube_video_metadata, youtube_url_for_summary, show_logs=show_logs)

        transcript = transcript_future.result()
        metadata = metadata_future.result()

        if transcript or metadata:
             content_string = f"\n\n--- Content from YouTube: {youtube_url_for_summary} ---\n"
             if metadata:
                  content_string += f"Title: {metadata.get('title', 'N/A')}\n"
                  content_string += f"Author: {metadata.get('author', 'N/A')}\n"
                  content_string += f"Published: {metadata.get('publish_date', 'N/A')}\n"
                  content_string += f"Length: {metadata.get('length', 'N/A')}\n"
                  content_string += f"Views: {metadata.get('views', 'N/A')}\n"
                  content_string += f"Description: {metadata.get('description', 'N/A')}\n\n"
             if transcript:
                  content_string += transcript
             else:
                  content_string += "Transcript not available.\n"

             youtube_content_for_synthesis = content_string
             collected_data["processed_youtube_urls"].append(youtube_url_for_summary)
        else:
             collected_data["failed_youtube_urls"].append(youtube_url_for_summary)
             conditional_print(f"Could not get transcript or metadata for {youtube_url_for_summary} after attempts.", show_logs)

        scraped_text_content = ""
        total_scraped_words = 0
        search_urls = []

        if is_summarizew_request and extra_query_text:
             conditional_print("\nPerforming Web Search for additional query...", show_logs)
             search_results = perform_duckduckgo_text_search(extra_query_text, max_results=MAX_SEARCH_RESULTS_PER_QUERY, show_logs=show_logs)
             search_urls = [result.get('href') for result in search_results if result and result.get('href')]

             unique_search_urls = []
             for url in search_urls:
                 if url and urlparse(url).scheme in ['http', 'https'] and not is_likely_search_result_url(url) and url not in unique_search_urls:
                     unique_search_urls.append(url)

             pages_to_scrape_count = min(MAX_PAGES_TO_SCRAPE // 2, len(unique_search_urls))
             pages_to_scrape_count = max(pages_to_scrape_count, 1) if unique_search_urls else 0


             if unique_search_urls and pages_to_scrape_count > 0 and total_scraped_words < MAX_TOTAL_SCRAPE_WORD_COUNT:
                 conditional_print(f"Scraping up to {pages_to_scrape_count} pages from search results for additional query...", show_logs)
                 urls_for_scraping_search = unique_search_urls[:pages_to_scrape_count]

                 with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT_REQUESTS, pages_to_scrape_count)) as executor:
                     future_to_url = {executor.submit(scrape_website, url, scrape_images, MAX_TOTAL_SCRAPE_WORD_COUNT - total_scraped_words, show_logs): url for url in urls_for_scraping_search}

                     if show_logs:
                          scrape_pbar = tqdm(total=len(future_to_url), desc="Scraping Search Results (SUMMARIZEW)", unit="page", file=sys.stdout)
                     else:
                          scrape_pbar = DummyContextManager()

                     with scrape_pbar as pb:
                         for future in concurrent.futures.as_completed(future_to_url):
                              if total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                                 for pending_future in future_to_url.keys():
                                     if not pending_future.done():
                                         pending_future.cancel()
                                 if pb.n < pb.total:
                                      pb.update(pb.total - pb.n)
                                      pb.set_postfix_str("Total word limit reached, scraping stopped")
                                 break

                              url = future_to_url[future]
                              try:
                                  content, images = future.result()

                                  if content:
                                      content_words = len(content.split())
                                      if total_scraped_words + content_words > MAX_TOTAL_SCRAPE_WORD_COUNT:
                                           remaining_words = MAX_TOTAL_SCRAPE_WORD_COUNT - total_scraped_words
                                           if remaining_words <= 0:
                                                content = ""
                                                content_words = 0
                                           else:
                                               content = ' '.join(content.split()[:remaining_words]) + '...'
                                               content_words = len(content.split())

                                      if content_words > 0:
                                           scraped_text_content += f"\n\n--- Content from {url} ---\n{content}"
                                           total_scraped_words += content_words
                                           collected_data["scraped_website_urls"].append(url)

                                           if scrape_images:
                                                for img_url in images:
                                                    if len(collected_data["found_image_urls"]) < MAX_IMAGES_TO_INCLUDE and img_url not in collected_data["found_image_urls"]:
                                                        collected_data["found_image_urls"].append(img_url)
                                                    elif len(collected_data["found_image_urls"]) >= MAX_IMAGES_TO_INCLUDE:
                                                         break

                                           pb.set_postfix_str(f"Scraped {content_words} words from {urlparse(url).hostname}")
                                      else:
                                          pb.set_postfix_str(f"Scraped 0 words from {urlparse(url).hostname}")
                                  else:
                                      pb.set_postfix_str(f"Failed to scrape {urlparse(url).hostname}")

                              except Exception as exc:
                                  conditional_print(f"Scraping {url} generated an exception: {exc}", show_logs)
                                  pb.set_postfix_str(f"Error scraping {urlparse(url).hostname}")

                              pb.update(1)

                     if total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                          conditional_print("Reached total scraped word limit.", show_logs)
             elif not unique_search_urls:
                 conditional_print("No unique search result URLs found for scraping.", show_logs)
             else:
                 conditional_print("Scraping skipped (0 pages estimated or total word limit already met).", show_logs)

        synthesis_prompt_special = """You are a helpful assistant. Synthesize an answer based *only* on the provided information from the YouTube transcript and potentially scraped web pages.

        Present the answer in Markdown format.

        Incorporate the information logically and provide the required answer contextually.
        Include dates, times, and specific details from the provided content where relevant. Pay close attention to time zones when dealing with time-related queries and convert times to be relative to the provided Current Time UTC if necessary based on the scraped data.

        **Important:** When citing information derived directly from a source, include a brief inline citation or reference to the source URL where appropriate within the synthesized answer. For example: "According to [Source URL], ..." or "The video at [YouTube URL] explains that...". Aim for a natural flow, not excessive citations.

        If the provided information from all sources is insufficient to answer *any* part of the query, state that you could not find a definitive answer based on the available data. If a *specific* provided URL could not be processed or yielded no information, mention that you were unable to get information from that source.

        Avoid mentioning the web search, scraping, or transcript fetching process explicitly in the final answer (except for the inline citations and mentioning inability to process specific sources if applicable).

        User Query: """ + original_query + """

        Current Time UTC: """ + current_time_utc + """

        Provided Information:
        """
        if youtube_content_for_synthesis:
             synthesis_prompt_special += youtube_content_for_synthesis
        elif youtube_url_for_summary in collected_data["failed_youtube_urls"]:
             synthesis_prompt_special += f"--- YouTube Content from {youtube_url_for_summary} ---\nCould not retrieve transcript or metadata for this video after multiple attempts.\n\n"
        else:
             synthesis_prompt_special += f"--- YouTube Content from {youtube_url_for_summary} ---\nNo content available (unexpected error).\n\n"

        if scraped_text_content:
             synthesis_prompt_special += f"--- Scraped Web Page Content (for additional query) ---\n{scraped_text_content}\n"
        elif is_summarizew_request and extra_query_text:
             synthesis_prompt_special += f"--- Scraped Web Page Content (for additional query) ---\nAttempted to scrape web content for '{extra_query_text}' but could not retrieve information.\n\n"
        else:
             synthesis_prompt_special += "--- Scraped Web Page Content (for additional query) ---\nNone available or processed.\n\n"

        if keyword == "SUMMARIZE":
            if youtube_content_for_synthesis and transcript:
                synthesis_prompt_special += "Please summarize the provided YouTube transcript in detail."
            elif youtube_content_for_synthesis and metadata:
                 synthesis_prompt_special += "No full transcript was retrieved. Please summarize the provided YouTube video metadata."
            else:
                 synthesis_prompt_special += "No YouTube transcript or metadata was provided or could be retrieved after multiple attempts. Therefore, I cannot summarize it."
        elif keyword == "SUMMARIZEW":
            if youtube_content_for_synthesis and scraped_text_content:
                 synthesis_prompt_special += f"Synthesize information from the YouTube transcript/metadata and the scraped web content to answer '{extra_query_text}'. Focus primarily on the video content but include relevant details from the web results."
            elif youtube_content_for_synthesis:
                 synthesis_prompt_special += f"Synthesize information from the YouTube transcript/metadata to answer '{extra_query_text}'. No relevant web content was found or retrieved after multiple attempts."
            elif scraped_text_content:
                 synthesis_prompt_special += f"No YouTube transcript or metadata was provided or could be retrieved after multiple attempts. Synthesize information from the scraped web content to answer '{extra_query_text}'."
            else:
                 synthesis_prompt_special += f"No YouTube transcript or web content was provided or could be retrieved after multiple attempts. I cannot answer '{extra_query_text}'."

        final_answer_messages_special = [
            {"role": "system", "content": synthesis_prompt_special},
            {"role": "user", "content": "Synthesize the final answer in Markdown based on the provided information."}
        ]

        if not youtube_content_for_synthesis and not scraped_text_content:
             status_code = 404
             final_markdown_output = "--- No Information Found ---\nCould not retrieve transcript or metadata for the YouTube video after multiple attempts, and no other relevant information was found or requested.\n---------------------------"
        else:
            if show_logs:
                pbar = tqdm(total=1, desc="Synthesizing Answer (Special)", unit="step", file=sys.stdout)
            else:
                pbar = DummyContextManager()

            with pbar as pb:
                final_answer_response = query_pollinations_ai(final_answer_messages_special, model=SYNTHESIS_MODEL, show_logs=show_logs)
                if final_answer_response and 'choices' in final_answer_response and len(final_answer_response['choices']) > 0:
                    final_markdown_output = final_answer_response['choices'][0]['message']['content']
                    pb.set_postfix_str("Success")
                else:
                    pb.set_postfix_str("Failed")
                    status_code = 500
                    final_markdown_output = "--- Synthesis Failed ---\nAn error occurred during the synthesis process, but some information was gathered:\n\n"
                    if youtube_content_for_synthesis: final_markdown_output += "**YouTube Content:** Available\n"
                    if scraped_text_content: final_markdown_output += "**Scraped Web Content:** Available\n"
                    if collected_data["failed_youtube_urls"]: final_markdown_output += f"**Failed to process YouTube:** {', '.join(collected_data['failed_youtube_urls'])}\n"
                    final_markdown_output += "\nConsider retrying the query."

                pb.update(1)

        if output_format == 'markdown' and show_sources and (collected_data["processed_youtube_urls"] or collected_data["scraped_website_urls"] or collected_data["failed_youtube_urls"]):
             final_markdown_output += "\n\n## Sources\n"
             if collected_data["processed_youtube_urls"]:
                  final_markdown_output += "### Transcript/Metadata Source (Processed YouTube Video)\n"
                  for url in collected_data["processed_youtube_urls"]:
                      final_markdown_output += f"- {url}\n"
             if collected_data["failed_youtube_urls"]:
                  final_markdown_output += "### Failed YouTube Source\n"
                  final_markdown_output += f"Could not retrieve content for: {', '.join(collected_data['failed_youtube_urls'])}\n"
             if collected_data["scraped_website_urls"]:
                 final_markdown_output += "### Text Sources (Scraped Websites)\n"
                 for url in collected_data["scraped_website_urls"]:
                     final_markdown_output += f"- {url}\n"

             final_markdown_output += "---\n"

        if output_format == 'markdown' and scrape_images and collected_data["found_image_urls"]:
             if not show_sources:
                 final_markdown_output += "\n\n## Images\n"
             else:
                  final_markdown_output += "### Images Found on Scraped Pages\n"
             for url in collected_data["found_image_urls"]:
                  final_markdown_output += f"- {url[:200]}{'...' if len(url) > 200 else ''}\n"
             if not show_sources:
                  final_markdown_output += "---\n"
        elif output_format == 'markdown' and scrape_images and (collected_data["scraped_website_urls"] or collected_data["processed_youtube_urls"]):
              if collected_data["scraped_website_urls"] or collected_data["processed_youtube_urls"]:
                   if not show_sources:
                       final_markdown_output += "\n\n## Images\n"
                       final_markdown_output += "No relevant images found on processed sources within limits.\n---\n"
                   else:
                       final_markdown_output += "### Images Found on Scraped Pages\n"
                       final_markdown_output += "No relevant images found on processed sources within limits.\n"

        return final_markdown_output, status_code, collected_data

    plan, show_sources_flag, scrape_images_flag = plan_execution_llm(original_query, provided_website_urls, provided_youtube_urls, cleaned_query_text, current_time_utc, location, show_logs=show_logs)

    native_answer_content = ""
    if plan.get("native_parts") and plan["native_parts"] != "None":
        collected_data["native_knowledge_part"] = plan["native_parts"]
        conditional_print(f"\nGetting Native Answer for: {plan['native_parts']}", show_logs)
        if show_logs:
             pbar = tqdm(total=1, desc="Getting Native Answer", unit="step", file=sys.stdout)
        else:
             pbar = DummyContextManager()

        with pbar as pb:
            native_answer_messages = [
                {"role": "system", "content": f"Answer the following question in detail with proper description based on your knowledge. Focus on the topic: {plan['native_parts']}. Be concise but informative."},
                {"role": "user", "content": cleaned_query_text}
            ]
            native_answer_response = query_pollinations_ai(native_answer_messages, model=SYNTHESIS_MODEL, show_logs=show_logs)
            if native_answer_response and 'choices' in native_answer_response and len(native_answer_response['choices']) > 0:
                native_answer_content = native_answer_response['choices'][0]['message']['content']
                pb.set_postfix_str("Success")
            else:
                pb.set_postfix_str("Failed")
                conditional_print("Warning: Could not get native answer.", show_logs)
            pb.update(1)

    youtube_content_strings = []
    processed_youtube_urls = []
    youtube_transcripts_content = ""

    if plan.get("process_provided_youtube") and provided_youtube_urls:
        conditional_print("\nProcessing Provided YouTube URLs...", show_logs)
        transcript_futures = {}
        metadata_futures = {}

        with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT_REQUESTS, len(provided_youtube_urls) * 2)) as executor:
            for url in provided_youtube_urls:
                video_id = get_youtube_video_id(url)
                if video_id:
                    transcript_futures[executor.submit(get_youtube_transcript, video_id, show_logs)] = url
                    metadata_futures[executor.submit(get_youtube_video_metadata, url, show_logs)] = url
                else:
                    collected_data["failed_youtube_urls"].append(url)
                    conditional_print(f"Skipped invalid YouTube URL: {url}", show_logs)

            all_futures = list(transcript_futures.keys()) + list(metadata_futures.keys())

            if show_logs:
                 processing_pbar = tqdm(total=len(all_futures), desc="Fetching YouTube Data", unit="item", file=sys.stdout)
            else:
                 processing_pbar = DummyContextManager()

            with processing_pbar as pb:
                 completed_transcripts = {}
                 completed_metadata = {}
                 for future in concurrent.futures.as_completed(all_futures):
                     url = next((u for f, u in transcript_futures.items() if f is future), None)
                     if url is None:
                          url = next((u for f, u in metadata_futures.items() if f is future), None)

                     if url:
                         video_id = get_youtube_video_id(url)
                         task_type = "Transcript" if future in transcript_futures else "Metadata"

                         try:
                             result = future.result()
                             if task_type == "Transcript":
                                 completed_transcripts[url] = result
                                 pb.set_postfix_str(f"Fetched Transcript for {video_id or urlparse(url).hostname}")
                             else:
                                 completed_metadata[url] = result
                                 pb.set_postfix_str(f"Fetched Metadata for {video_id or urlparse(url).hostname}")

                         except Exception as exc:
                             conditional_print(f"{task_type} fetch for {url} generated exception: {exc}", show_logs)
                             pb.set_postfix_str(f"Error fetching {task_type} for {video_id or urlparse(url).hostname}")
                         finally:
                            pb.update(1)
                     else:
                         conditional_print("Completed future not found in tracking maps.", show_logs)
                         pb.update(1)

        youtube_content_strings = []
        processed_youtube_urls = []

        for url in provided_youtube_urls:
             video_id = get_youtube_video_id(url)
             if not video_id:
                 continue

             transcript = completed_transcripts.get(url)
             metadata = completed_metadata.get(url)

             if transcript or metadata:
                 content_string = f"\n\n--- Content from YouTube: {url} ---\n"
                 if metadata:
                     content_string += f"Title: {metadata.get('title', 'N/A')}\n"
                     content_string += f"Author: {metadata.get('author', 'N/A')}\n"
                     content_string += f"Published: {metadata.get('publish_date', 'N/A')}\n"
                     content_string += f"Length: {metadata.get('length', 'N/A')}\n"
                     content_string += f"Views: {metadata.get('views', 'N/A')}\n"
                     content_string += f"Description: {metadata.get('description', 'N/A')}\n\n"
                 if transcript:
                     content_string += transcript
                 else:
                     content_string += "Transcript not available.\n"

                 youtube_content_strings.append(content_string)
                 processed_youtube_urls.append(url)
             else:
                 if url not in collected_data["failed_youtube_urls"]:
                    collected_data["failed_youtube_urls"].append(url)
                    conditional_print(f"Could not get transcript or metadata for {url} after attempts.", show_logs)

        youtube_transcripts_content = "".join(youtube_content_strings)
        collected_data["processed_youtube_urls"] = processed_youtube_urls

    scraped_text_content = ""
    total_scraped_words = 0
    urls_to_scrape = []

    if plan.get("scrape_provided_websites") and provided_website_urls:
         urls_to_scrape.extend([url for url in provided_website_urls if urlparse(url).scheme in ['http', 'https']])

    search_urls = []
    if plan.get("search_queries"):
         conditional_print("\nPerforming Web Search...", show_logs)
         all_search_results = []
         with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT_REQUESTS, len(plan["search_queries"]))) as executor:
             search_futures = {executor.submit(perform_duckduckgo_text_search, query, MAX_SEARCH_RESULTS_PER_QUERY, MAX_DUCKDUCKGO_RETRIES, show_logs): query for query in plan["search_queries"]}

             if show_logs:
                  search_pbar = tqdm(total=len(search_futures), desc="Performing Search Queries", unit="query", file=sys.stdout)
             else:
                  search_pbar = DummyContextManager()

             with search_pbar as pb:
                  for future in concurrent.futures.as_completed(search_futures):
                     query = search_futures[future]
                     try:
                         results = future.result()
                         all_search_results.extend(results)
                         pb.set_postfix_str(f"Query '{query[:30]}...' successful")
                     except Exception as exc:
                         conditional_print(f"Search for '{query}' generated an exception: {exc}", show_logs)
                         pb.set_postfix_str(f"Error for '{query[:30]}...'")
                     pb.update(1)

         search_urls = [result.get('href') for result in all_search_results if result and isinstance(result.get('href'), str) and result['href'].strip()]

    unique_search_urls = []
    for url in search_urls:
        if url and urlparse(url).scheme in ['http', 'https'] and not is_likely_search_result_url(url) and url not in urls_to_scrape:
            unique_search_urls.append(url)

    estimated_pages_from_search = plan.get("estimated_pages_to_scrape_from_search", 0)

    search_result_urls_to_add = [url for url in unique_search_urls]
    urls_to_scrape.extend(search_result_urls_to_add[:estimated_pages_from_search])

    urls_for_scraping = list(dict.fromkeys(urls_to_scrape))

    if urls_for_scraping and total_scraped_words < MAX_TOTAL_SCRAPE_WORD_COUNT:
        conditional_print(f"\nScraping {len(urls_for_scraping)} Web Pages...", show_logs)
        if show_logs:
            pbar = tqdm(total=len(urls_for_scraping), desc="Scraping Websites", unit="page", file=sys.stdout)
        else:
            pbar = DummyContextManager()

        with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT_REQUESTS, len(urls_for_scraping))) as executor, pbar as pb:
            future_to_url = {executor.submit(scrape_website, url, scrape_images, MAX_TOTAL_SCRAPE_WORD_COUNT - total_scraped_words, show_logs): url for url in urls_for_scraping}

            for future in concurrent.futures.as_completed(future_to_url):
                if total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                    for pending_future in future_to_url.keys():
                         if not pending_future.done():
                             pending_future.cancel()
                    if pb.n < pb.total:
                         pb.update(pb.total - pb.n)
                         pb.set_postfix_str("Total word limit reached, scraping stopped")
                    break

                url = future_to_url[future]
                try:
                    content, images = future.result()

                    if content:
                        content_words = len(content.split())
                        if total_scraped_words + content_words > MAX_TOTAL_SCRAPE_WORD_COUNT:
                             remaining_words = MAX_TOTAL_SCRAPE_WORD_COUNT - total_scraped_words
                             if remaining_words <= 0:
                                  content = ""
                                  content_words = 0
                             else:
                                 content = ' '.join(content.split()[:remaining_words]) + '...'
                                 content_words = len(content.split())

                        if content_words > 0:
                             scraped_text_content += f"\n\n--- Content from {url} ---\n{content}"
                             total_scraped_words += content_words
                             collected_data["scraped_website_urls"].append(url)

                             if scrape_images:
                                  for img_url in images:
                                     if len(collected_data["found_image_urls"]) < MAX_IMAGES_TO_INCLUDE and img_url not in collected_data["found_image_urls"]:
                                         collected_data["found_image_urls"].append(img_url)
                                     elif len(collected_data["found_image_urls"]) >= MAX_IMAGES_TO_INCLUDE:
                                          break

                             pb.set_postfix_str(f"Scraped {content_words} words from {urlparse(url).hostname}")
                        else:
                             pb.set_postfix_str(f"Scraped 0 words from {urlparse(url).hostname}")

                    else:
                         pb.set_postfix_str(f"Failed to scrape {urlparse(url).hostname}")

                except Exception as exc:
                    conditional_print(f"Scraping {url} generated an exception: {exc}", show_logs)
                    pb.set_postfix_str(f"Error scraping {urlparse(url).hostname}")

                pb.update(1)

            if total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                 conditional_print("Reached total scraped word limit.", show_logs)
    elif not urls_for_scraping:
         conditional_print("\nNo unique URLs found for scraping or plan specified no scraping.", show_logs)
    else:
         conditional_print("\nScraping skipped (total word limit already met before starting).", show_logs)

    conditional_print("\nSending Information to AI for Synthesis...", show_logs)

    if not native_answer_content and not scraped_text_content and not youtube_transcripts_content:
         status_code = 404
         final_markdown_output = "--- No Information Found ---\nCould not find enough information (either natively, from web searches/provided URLs, or YouTube transcripts) to answer the query after multiple attempts.\n---------------------------"
    else:
        synthesis_prompt = """You are a helpful assistant. Synthesize a comprehensive, detailed, and confident answer to the user's original query based *only* on the provided information from native knowledge, scraped web pages, and YouTube transcripts.

        Present the answer in Markdown format.

        Incorporate the information logically and provide the required answer contextually.
        Include dates, times, and specific details from the provided content where relevant to make the information more lively and grounded in the sources. Pay close attention to time zones when dealing with time-related queries and convert times to be relative to the provided Current Time UTC if necessary based on the scraped data.

        **Important:** When citing information derived directly from a source (scraped website or YouTube content), include a brief inline citation or reference to the source URL where appropriate within the synthesized answer. For example: "According to [Source URL], ..." or "The video at [YouTube URL] explains that...". Aim for a natural flow, not excessive citations.

        If the provided information from all sources is insufficient to answer *any* part of the query, state that you could not find a definitive answer based on the available data. If a *specific* provided URL could not be processed or yielded no information, mention that you were unable to get information from that source.

        Avoid mentioning the web search, scraping, or transcript fetching process explicitly in the final answer (except for the inline citations and mentioning inability to process specific sources if applicable).

        User Query: """ + original_query + """

        Current Time UTC: """ + current_time_utc + """

        Provided Information:
        """

        if native_answer_content:
            synthesis_prompt += f"--- Native Knowledge ({collected_data.get('native_knowledge_part', 'Topic')}) ---\n{native_answer_content}\n\n"
        else:
            synthesis_prompt += "--- Native Knowledge ---\nNone available or requested.\n\n"

        if youtube_transcripts_content:
             synthesis_prompt += f"--- YouTube Transcript and Metadata Content ---\n{youtube_transcripts_content}\n\n"
        elif plan.get("process_provided_youtube") and provided_youtube_urls:
            synthesis_prompt += "--- YouTube Transcript and Metadata Content ---\nAttempted to process provided YouTube URLs but could not retrieve content or metadata after multiple attempts.\n\n"
        else:
             synthesis_prompt += "--- YouTube Transcript and Metadata Content ---\nNone available or processed.\n\n"

        if scraped_text_content:
            synthesis_prompt += f"--- Scraped Web Page Content ---\n{scraped_text_content}\n"
        elif (plan.get("scrape_provided_websites") and provided_website_urls) or (plan.get("search_queries") and search_urls):
             synthesis_prompt += "--- Scraped Web Page Content ---\nAttempted to scrape web content but could not retrieve information.\n\n"
        else:
             synthesis_prompt += "--- Scraped Web Page Content ---\nNone available or processed.\n\n"


        final_answer_messages = [
            {"role": "system", "content": synthesis_prompt},
            {"role": "user", "content": "Synthesize the final answer in Markdown based on the provided information, including inline citations."}
        ]

        if show_logs:
            pbar = tqdm(total=1, desc="Synthesizing Answer", unit="step", file=sys.stdout)
        else:
            pbar = DummyContextManager()

        with pbar as pb:
            final_answer_response = query_pollinations_ai(final_answer_messages, model=SYNTHESIS_MODEL, show_logs=show_logs)
            if final_answer_response and 'choices' in final_answer_response and len(final_answer_response['choices']) > 0:
                final_markdown_output = final_answer_response['choices'][0]['message']['content']
                pb.set_postfix_str("Success")
            else:
                pb.set_postfix_str("Failed")
                status_code = 500
                final_markdown_output = "--- Synthesis Failed ---\nAn error occurred during the synthesis process, but some information was gathered:\n\n"
                if native_answer_content: final_markdown_output += "**Native Knowledge:** Available\n"
                if youtube_transcripts_content: final_markdown_output += "**YouTube Content:** Available\n"
                if scraped_text_content: final_markdown_output += "**Scraped Web Content:** Available\n"
                if collected_data["failed_youtube_urls"]: final_markdown_output += f"**Failed to process YouTube:** {', '.join(collected_data['failed_youtube_urls'])}\n"
                final_markdown_output += "\nConsider retrying the query."

            pb.update(1)

    if output_format == 'markdown':
         added_sources_section = False
         if show_sources and (collected_data["native_knowledge_part"] != "None" or collected_data["scraped_website_urls"] or collected_data["processed_youtube_urls"] or collected_data["failed_youtube_urls"]):
              final_markdown_output += "\n\n## Sources\n"
              added_sources_section = True
              if collected_data["native_knowledge_part"] != "None":
                   final_markdown_output += "### Answered Natively\n"
                   final_markdown_output += f"Parts of the query related to: {collected_data['native_knowledge_part']}\n"
              if collected_data["scraped_website_urls"]:
                  final_markdown_output += "### Text Sources (Scraped Websites)\n"
                  for url in collected_data["scraped_website_urls"]:
                      final_markdown_output += f"- {url}\n"
              if collected_data["processed_youtube_urls"]:
                   final_markdown_output += "### Transcript/Metadata Sources (Processed YouTube Videos)\n"
                   for url in collected_data["processed_youtube_urls"]:
                       final_markdown_output += f"- {url}\n"
              if collected_data["failed_youtube_urls"]:
                   final_markdown_output += "### Failed YouTube Sources\n"
                   final_markdown_output += f"Could not retrieve content for: {', '.join(collected_data['failed_youtube_urls'])}\n"

         if scrape_images and collected_data["found_image_urls"]:
              if not added_sources_section:
                  final_markdown_output += "\n\n## Images\n"
              else:
                  final_markdown_output += "### Images Found on Scraped Pages\n"
              for url in collected_data["found_image_urls"]:
                   final_markdown_output += f"- {url[:200]}{'...' if len(url) > 200 else ''}\n"
         elif scrape_images and (collected_data["scraped_website_urls"] or collected_data["processed_youtube_urls"]):
               if collected_data["scraped_website_urls"] or collected_data["processed_youtube_urls"]:
                    if not added_sources_section:
                         final_markdown_output += "\n\n## Images\n"
                         final_markdown_output += "No relevant images found on processed sources within limits.\n"
                    else:
                         final_markdown_output += "### Images Found on Scraped Pages\n"
                         final_markdown_output += "No relevant images found on processed sources within limits.\n"

         if added_sources_section or (scrape_images and (collected_data["found_image_urls"] or collected_data["scraped_website_urls"] or collected_data["processed_youtube_urls"])):
              final_markdown_output += "---\n"

    return final_markdown_output, status_code, collected_data

app = Flask(__name__)
CORS(app)
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    storage_uri="memory://",
    strategy="moving-window"
)

process_executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_REQUESTS)

# Enable verbose logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s', stream=sys.stdout)

# Set Flask app logger to DEBUG level
app.logger.setLevel(logging.DEBUG)

# Also enable Werkzeug logger (Flask's underlying WSGI library) for request/response logs
logging.getLogger('werkzeug').setLevel(logging.DEBUG)


@limiter.limit("10 per minute")
@app.route('/search', methods=['GET', 'POST'])
@app.route('/search/', methods=['GET', 'POST'])
@app.route('/search/<path:anything>', methods=['GET', 'POST'])
def handle_search(anything=None):
    # Log the incoming request details
    app.logger.debug(f"Request received: {request.method} {request.path}")
    app.logger.debug(f"Request headers: {dict(request.headers)}")
    if anything:
        app.logger.debug(f"Path parameter 'anything': {anything}")
    
    user_input_query = None
    output_format = 'markdown'

    if request.method == 'POST':
        try:
            data = request.get_json()
            app.logger.debug(f"POST data received: {data}")
            if not isinstance(data, dict):
                 return jsonify({"error": "Invalid JSON payload."}), 400

            if 'messages' in data and isinstance(data['messages'], list):
                output_format = 'json'
                messages = data['messages']
                user_message_content = None
                for message in reversed(messages):
                    if isinstance(message, dict) and message.get('role') == 'user':
                        content = message.get('content')
                        if isinstance(content, str):
                             user_input_query = content.strip()
                             break
                if user_input_query is None:
                    return jsonify({"error": "No user message found in the 'messages' array."}), 400

                show_logs_param = data.get('show_logs', None)

            elif 'query' in data and isinstance(data['query'], str):
                output_format = 'markdown'
                user_input_query = data.get('query').strip()
                show_logs_param = data.get('show_logs', None)

            else:
                return jsonify({"error": "Invalid POST body. Expected {'query': '...'} or {'messages': [...]}."}), 400

        except Exception as e:
             return jsonify({"error": f"Failed to parse POST body: {type(e).__name__}: {e}"}), 400

    elif request.method == 'GET':
        output_format = 'markdown'
        user_input_query = request.args.get('query')
        show_logs_param = request.args.get('show_logs', None)

    if not user_input_query or not isinstance(user_input_query, str) or user_input_query.strip() == "":
        return jsonify({"error": "Query parameter 'query' is required and cannot be empty."}), 400
    if len(user_input_query) > 1000:
        return jsonify({"error": "Query parameter 'query' is too long (max 1000 characters)."}), 400

    show_logs = str(show_logs_param).lower() == 'true' if show_logs_param is not None else True

    global query_pollinations_ai_show_log, get_youtube_transcript_show_log, get_youtube_video_metadata_show_log, scrape_website_show_log, plan_execution_llm_show_log, perform_duckduckgo_text_search_show_log
    query_pollinations_ai_show_log = show_logs
    get_youtube_transcript_show_log = show_logs
    get_youtube_video_metadata_show_log = show_logs
    scrape_website_show_log = show_logs
    plan_execution_llm_show_log = show_logs
    perform_duckduckgo_text_search_show_log = show_logs
    logging.getLogger().setLevel(logging.INFO if show_logs else logging.WARNING)

    if user_input_query.strip().lower() == "pollinations_test":
        fallback_content = "Pollinations AI test fallback: The API is reachable and responding (no AI call made)."
        if output_format == 'json':
            return jsonify({
                "choices": [
                    {"message": {"role": "assistant", "content": fallback_content}}
                ],
                "test_status": "success",
                "model_used": "fallback"
            }), 200
        else:
            return Response(fallback_content, mimetype='text/markdown', status=200)

    # Extract URLs and get cleaned text for the planner
    provided_website_urls, provided_youtube_urls, cleaned_query_text_for_planner = extract_urls_from_query(user_input_query)

    conditional_print(f"Processing query. Original: '{user_input_query}'", show_logs)
    conditional_print(f"Cleaned for Planner: '{cleaned_query_text_for_planner}'", show_logs)
    conditional_print(f"Provided Websites: {provided_website_urls}", show_logs)
    conditional_print(f"Provided YouTube: {provided_youtube_urls}", show_logs)

    # Get the plan and flags from the AI planner
    plan, ai_show_sources, ai_scrape_images = plan_execution_llm(
        user_input_query,
        provided_website_urls,
        provided_youtube_urls,
        cleaned_query_text_for_planner,
        datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "", # Location fetching now happens inside search_and_synthesize if needed for prompt
        show_logs=show_logs
    )

    # Use the flags determined by the AI
    final_show_sources = ai_show_sources
    final_scrape_images = ai_scrape_images

    conditional_print(f"AI Determined Flags: show_sources={final_show_sources}, scrape_images={final_scrape_images}", show_logs)

    future = process_executor.submit(
        search_and_synthesize,
        user_input_query,
        provided_website_urls,
        provided_youtube_urls,
        cleaned_query_text_for_planner,
        show_sources=final_show_sources,
        scrape_images=final_scrape_images,
        show_logs=show_logs,
        output_format=output_format
    )

    collected_data = {}
    try:
        markdown_output, status_code, collected_data = future.result(timeout=300)

        if output_format == 'json':
            response_body = {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": html.unescape(markdown_output)
                        }
                    }
                ]
            }
            if final_show_sources:
                 source_info = {}
                 if collected_data.get("native_knowledge_part") and collected_data["native_knowledge_part"] != "None":
                      source_info["native_knowledge"] = collected_data["native_knowledge_part"]
                 if collected_data.get("scraped_website_urls"):
                      source_info["scraped_websites"] = collected_data["scraped_website_urls"]
                 if collected_data.get("processed_youtube_urls"):
                      source_info["processed_youtube"] = collected_data["processed_youtube_urls"]
                 if collected_data.get("failed_youtube_urls"):
                      source_info["failed_youtube"] = collected_data["failed_youtube_urls"]
                 if source_info:
                     response_body["sources"] = source_info

            if final_scrape_images:
                 response_body["images"] = collected_data.get("found_image_urls", [])

            if collected_data.get("error"):
                 response_body["error"] = collected_data["error"]

            return jsonify(response_body), status_code
        else:
            return Response(html.unescape(markdown_output), mimetype='text/markdown', status=status_code)

    except concurrent.futures.TimeoutError:
        logging.error("Search and synthesis process timed out.")
        error_msg = "The request timed out."
        status_code = 504
        if output_format == 'json':
             return jsonify({"error": error_msg}), status_code
        else:
             return Response(f"Error: {error_msg}\n---\nA timeout occurred while processing your request.", mimetype='text/markdown', status=status_code)

    except Exception as e:
        logging.exception("An unhandled error occurred during search and synthesis.")
        error_msg = f"An unexpected error occurred: {type(e).__name__}: {e}"
        status_code = 500
        if output_format == 'json':
             response_body = {"error": error_msg}
             if collected_data:
                  partial_data = {}
                  if collected_data.get("native_knowledge_part"): partial_data["native_knowledge_part"] = collected_data["native_knowledge_part"]
                  if collected_data.get("scraped_website_urls"): partial_data["scraped_website_urls"] = collected_data["scraped_website_urls"]
                  if collected_data.get("processed_youtube_urls"): partial_data["processed_youtube_urls"] = collected_data["processed_youtube_urls"]
                  if collected_data.get("failed_youtube_urls"): partial_data["failed_youtube_urls"] = collected_data["failed_youtube_urls"]
                  if collected_data.get("found_image_urls"): partial_data["found_image_urls"] = collected_data["found_image_urls"]
                  if partial_data:
                       response_body["partial_data"] = partial_data

             return jsonify(response_body), status_code
        else:
             return Response(f"Error: {error_msg}\n---\nAn internal error prevented the request from completing.", mimetype='text/markdown', status=status_code)

@app.route('/', methods=['GET'])
def index():
    return "Pollinations Search API is running.", 200

# if __name__ == "__main__":
#     app.run(host="0.0.0.0", port=5000, debug=False)