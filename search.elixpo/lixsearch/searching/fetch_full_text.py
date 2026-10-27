from pipeline.config import MAX_TOTAL_SCRAPE_WORD_COUNT
from loguru import logger
from typing import Optional
from searching.utils import validate_url_for_fetch
import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import urlparse

# Multiple realistic user agents for rotation
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
]

def get_realistic_headers(url: str, user_agent_index: int = 0) -> dict:

    parsed_url = urlparse(url)
    domain = parsed_url.netloc
    
    headers = {
        'User-Agent': USER_AGENTS[user_agent_index % len(USER_AGENTS)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
        'Referer': f'https://{domain}/',
    }
    return headers

def fetch_full_text(
    url,
    total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT,
    request_id: Optional[str] = None,
) -> str:
    if not validate_url_for_fetch(url):
        logger.error(f"[Fetch] URL validation failed: {url}")
        return ""
    
    # Try with multiple user agents and retry logic
    max_retries = 2
    for attempt in range(max_retries):
        try:
            headers = get_realistic_headers(url, attempt)
            response = requests.get(url, timeout=12, headers=headers, allow_redirects=True)
            if response.status_code != 200:
                logger.warning(f"[FETCH] Attempt {attempt + 1}/{max_retries} failed with status {response.status_code} for {url}")
                if attempt < max_retries - 1:
                    continue  # 4xx/5xx is definitive – no sleep, just rotate user-agent
                logger.error(f"[FETCH] All retries failed for {url}: Status {response.status_code}")
                return ""
            response.raise_for_status()

            content_type = response.headers.get('Content-Type', '').lower()
            if 'text/html' not in content_type:
                logger.warning(f"[FETCH] Skipping non-HTML content from {url} (Content-Type: {content_type})")
                return ""

            soup = BeautifulSoup(response.content, 'html.parser')

            for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form', 'button', 'noscript', 'iframe', 'svg']):
                element.extract()

            # Try semantic containers first, then fall back to body
            main_elem = (
                soup.find('article') or
                soup.find('main') or
                soup.find('div', role='main') or
                soup.find('div', class_=re.compile(r'(article|content|post|entry|story|body)', re.I)) or
                soup.find('body') or
                soup
            )

            temp_text = []
            word_count = 0
            seen = set()
            for tag in main_elem.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'td', 'span']):
                if word_count >= total_word_count_limit:
                    break
                text = re.sub(r'\s+', ' ', tag.get_text()).strip()
                if not text or len(text) < 20:
                    continue
                # Deduplicate (nested tags can repeat text)
                if text in seen:
                    continue
                seen.add(text)
                words = text.split()
                words_to_add = words[:total_word_count_limit - word_count]
                if words_to_add:
                    temp_text.append(" ".join(words_to_add))
                    word_count += len(words_to_add)

            text_content = '\n\n'.join(temp_text)
            if word_count >= total_word_count_limit:
                text_content = ' '.join(text_content.split()[:total_word_count_limit]) + '...'

            cleaned_text = text_content.strip()
            logger.info(f"[FETCH] Successfully extracted {len(cleaned_text)} chars from {url}")
            return cleaned_text

        except requests.exceptions.Timeout:
            logger.warning(f"[Fetch] Attempt {attempt + 1}/{max_retries} timeout for {url}")
        except requests.exceptions.RequestException as e:
            logger.warning(f"[Fetch] Attempt {attempt + 1}/{max_retries} request error for {url}: {type(e).__name__}")
    
    logger.error(f"[Fetch] Failed to fetch {url} after {max_retries} retries")
    return ""

