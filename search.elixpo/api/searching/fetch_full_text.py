from pipeline.config import MAX_TOTAL_SCRAPE_WORD_COUNT
from loguru import logger
from typing import Optional
from searching.utils import validate_url_for_fetch
import requests
from bs4 import BeautifulSoup
import re


def fetch_full_text(
    url,
    total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT,
    request_id: Optional[str] = None,
) -> str:
    if not validate_url_for_fetch(url):
        logger.error(f"[Fetch] URL validation failed: {url}")
        return ""
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    try:
        response = requests.get(url, timeout=20, headers=headers)
        if response.status_code != 200:
            logger.error(f"[FETCH] Error fetching {url}: Status {response.status_code}")
            return ""
        response.raise_for_status()

        content_type = response.headers.get('Content-Type', '').lower()
        if 'text/html' not in content_type:
            logger.warning(f"[FETCH] Skipping non-HTML content from {url} (Content-Type: {content_type})")
            return ""

        soup = BeautifulSoup(response.content, 'html.parser')

        for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form', 'button', 'noscript', 'iframe', 'svg']):
            element.extract()

        main_content_elements = soup.find_all(['main', 'article', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p', 'article'], class_=[
            'main', 'content', 'article', 'post', 'body', 'main-content', 'entry-content', 'blog-post'
        ])
        if not main_content_elements:
            main_content_elements = [soup.find('body')] if soup.find('body') else [soup]

        temp_text = []
        word_count = 0
        for main_elem in main_content_elements:
            if word_count >= total_word_count_limit:
                break
            for tag in main_elem.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'div']):
                text = re.sub(r'\s+', ' ', tag.get_text()).strip()
                if text:
                    words = text.split()
                    words_to_add = words[:total_word_count_limit - word_count]
                    if words_to_add:
                        temp_text.append(" ".join(words_to_add))
                        word_count += len(words_to_add)

        text_content = '\n\n'.join(temp_text)
        if word_count >= total_word_count_limit:
            text_content = ' '.join(text_content.split()[:total_word_count_limit]) + '...'

        cleaned_text = text_content.strip()
        return cleaned_text

    except requests.exceptions.Timeout:
        logger.error(f"[Fetch] Timeout scraping URL: {url}")
        return ""
    except requests.exceptions.RequestException as e:
        logger.error(f"[Fetch] Request error scraping URL: {url}: {type(e).__name__}: {e}")
        return ""
    except Exception as e:
        logger.error(f"[Fetch] Error processing URL: {url}: {type(e).__name__}: {e}")
        return ""


