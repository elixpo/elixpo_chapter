import time
from playwright.async_api import async_playwright
import random
import asyncio
from typing import List, Tuple, Dict, Optional
from urllib.parse import quote, urlparse
import requests
from bs4 import BeautifulSoup
import re
import logging
import ipaddress
from config import MAX_TOTAL_SCRAPE_WORD_COUNT, RETRIEVAL_TOP_K
from loguru import logger

__all__ = ['fetch_full_text', 'playwright_web_search', 'warmup_playwright', 'ingest_url_to_vector_store', 'retrieve_from_vector_store']


USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
]

def get_random_user_agent():
    return random.choice(USER_AGENTS)

async def handle_accept_popup(page):
    try:
        accept_button = await page.query_selector("button:has-text('Accept')")
        if not accept_button:
            accept_button = await page.query_selector("button:has-text('Aceptar todo')")
        if not accept_button:
            accept_button = await page.query_selector("button:has-text('Aceptar')")

        if accept_button:
            await accept_button.click()
            print("[INFO] Accepted cookie/privacy popup.")
            await asyncio.sleep(1)
    except Exception as e:
        print(f"[WARN] No accept popup found: {e}")

async def warmup_playwright():
    print("[WARMUP] Starting playwright warmup...")
    warmup_start = time.perf_counter()
    try:
        playwright = await async_playwright().start()
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir="/tmp/chrome-warmup-temp",
            headless=True,
            args=[
                "--remote-debugging-port=10000",
                "--disable-blink-features=AutomationControlled",
                "--disable-web-security",
                "--no-first-run",
                "--disable-default-apps",
                "--disable-sync",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
            user_agent=get_random_user_agent(),
            viewport={'width': 1280, 'height': 720},
        )
        
        page = await context.new_page()
        await page.goto("about:blank", timeout=5000)
        await page.close()
        
        await context.close()
        await playwright.stop()
        
        warmup_end = time.perf_counter()
        print(f"[WARMUP] Playwright warmup completed in {warmup_end - warmup_start:.3f} seconds")
        return warmup_end - warmup_start
    except Exception as e:
        print(f"[WARN] Playwright warmup failed: {e}")
        return 0.0

async def playwright_web_search(query: str, max_links: int = 20, images: bool = False) -> Tuple[List[str], float]:
    search_start = time.perf_counter()
    results = []
    
    try:
        playwright = await async_playwright().start()
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir="/tmp/chrome-search-temp",
            headless=True,
            args=[
                "--remote-debugging-port=10001",
                "--disable-blink-features=AutomationControlled",
                "--disable-web-security",
                "--no-first-run",
                "--disable-default-apps",
                "--disable-sync",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-gpu-compositing",
                "--disable-software-rasterizer",
                "--disable-dev-shm-usage",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-infobars",
                "--window-position=0,0",
                "--ignore-certificate-errors",
                "--ignore-certificate-errors-spki-list",
                "--disable-blink-features=AutomationControlled",
                "--window-position=400,0",
                "--disable-renderer-backgrounding",
                "--disable-ipc-flooding-protection",
                "--force-color-profile=srgb",
                "--mute-audio",
                "--disable-background-timer-throttling",
            ],
            user_agent=get_random_user_agent(),
            viewport={'width': 1280, 'height': 720},
        )
        
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
            window.chrome = {runtime: {}};
        """)
        
        page = await context.new_page()
        
        if images:
            search_url = f"https://images.search.yahoo.com/search/images?p={quote(query)}"
            print(f"[IMAGE SEARCH] Navigating to: {search_url}")
            await page.goto(search_url, timeout=50000)
            
            await handle_accept_popup(page)
            
            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            await page.wait_for_timeout(random.randint(1000, 2000))
            
            await page.wait_for_selector("img[src*='s.yimg.com']", timeout=55000)
            
            image_elements = await page.query_selector_all("li[data-bns='API']")
            print(f"[IMAGE SEARCH] Found {len(image_elements)} thumbnails")
            
            for idx, img in enumerate(image_elements):
                if len(results) >= max_links:
                    break
                try:
                    captured_image_url = None
                    print(f"[IMAGE] Processing thumbnail {idx + 1}")
                    
                    async def handle_response(response):
                        nonlocal captured_image_url
                        try:
                            content_type = response.headers.get("content-type", "")
                            if ("image/jpeg" in content_type or "image/jpg" in content_type or response.url.endswith(".jpg") or response.url.endswith(".jpeg")):
                                url = response.url
                                if "maxresdefault" not in url and not url.startswith("https://s.yimg.com"):
                                    captured_image_url = url
                                    print(f"[IMAGE] Captured JPEG from network: {url}")
                        except Exception as e:
                            pass
                    
                    page.on("response", handle_response)
                    
                    await img.click()
                    
                    wait_start = time.perf_counter()
                    while captured_image_url is None and (time.perf_counter() - wait_start) < 3:
                        await page.wait_for_timeout(100)
                    
                    page.remove_listener("response", handle_response)
                    
                    if captured_image_url:
                        results.append(captured_image_url)
                        print(f"[IMAGE] Added: {captured_image_url} (Count: {len(results)}/{max_links})")
                    else:
                        print(f"[WARN] No JPEG URL captured for thumbnail {idx + 1}")
                    
                    await page.go_back()
                    await page.wait_for_timeout(500)
                    
                    if len(results) >= max_links:
                        break
                except Exception as e:
                    print(f"[WARN] Failed to extract image URL at index {idx}: {e}")
            
            print(results)
            print(f"[IMAGE SEARCH] Found {len(results)} images")
        else:
            search_url = f"https://search.yahoo.com/search?p={quote(query)}&fr=yfp-t&fr2=p%3Afp%2Cm%3Asb&fp=1"
            print(f"[SEARCH] Navigating to: {search_url}")
            await page.goto(search_url, timeout=50000)
            
            await handle_accept_popup(page)
            
            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            await page.wait_for_timeout(random.randint(1000, 2000))
            
            await page.wait_for_selector("div.compTitle > a", timeout=55000)
            
            link_elements = await page.query_selector_all("div.compTitle > a")
            blacklist = ["yahoo.com/preferences", "yahoo.com/account", "login.yahoo.com", "yahoo.com/gdpr", "https://ad.doubleclick.net"]
            
            for link in link_elements:
                if len(results) >= max_links:
                    break
                href = await link.get_attribute("href")
                if href and href.startswith("http") and not any(b in href for b in blacklist):
                    results.append(href)
            
            print(results)
            print(f"[SEARCH] Found {len(results)} URLs")
        
        await page.close()
        await context.close()
        await playwright.stop()
        
    except Exception as e:
        print(f"[ERROR] Playwright search failed: {e}")
    
    search_end = time.perf_counter()
    search_time = search_end - search_start
    
    return results, search_time



def _validate_url_for_fetch(url: str) -> bool:
    try:
        parsed = urlparse(url)
        
        if not parsed.scheme or parsed.scheme not in ['http', 'https']:
            logger.warning(f"[Fetch] Invalid URL scheme: {parsed.scheme}")
            return False
        
        if not parsed.netloc:
            logger.warning(f"[Fetch] No network location in URL")
            return False
        
        hostname = parsed.hostname
        if not hostname:
            logger.warning(f"[Fetch] No hostname in URL")
            return False
        
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                logger.warning(f"[Fetch] URL targets private/loopback IP: {hostname}")
                return False
        except ValueError:
            pass
        
        if hostname in ['localhost', '127.0.0.1', '0.0.0.0']:
            logger.warning(f"[Fetch] URL targets localhost: {hostname}")
            return False
        
        port = parsed.port
        if port and port in [22, 23, 25, 135, 139, 445, 1433, 3306, 5432, 5010]:
            logger.warning(f"[Fetch] URL targets restricted port: {port}")
            return False
        
        return True
    except Exception as e:
        logger.error(f"[Fetch] URL validation error: {e}")
        return False


def fetch_full_text(
    url,
    total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT,
    request_id: Optional[str] = None,
) -> str:
    if not _validate_url_for_fetch(url):
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




if __name__ == "__main__":
    async def main():
        query = "an evening in paris"
        urls, search_time = await playwright_web_search(query, max_links=4, images=True)
        print(f"Search completed in {search_time:.3f} seconds")
        print("URLs found:")
        for url in urls:
            print(f" - {url}")
    
    asyncio.run(main())


_global_embedding_service = None
_global_vector_store = None
_global_retrieval_pipeline = None


def _ensure_retrieval_services():
    global _global_embedding_service, _global_vector_store, _global_retrieval_pipeline
    
    if _global_embedding_service is None:
        try:
            from embedding_service import EmbeddingService
            from embedding_service import VectorStore
            from rag_engine import RetrievalPipeline
            from config import EMBEDDING_MODEL, EMBEDDINGS_DIR
            
            logger.info("[SEARCH] Initializing retrieval services...")
            _global_embedding_service = EmbeddingService(model_name=EMBEDDING_MODEL)
            _global_vector_store = VectorStore(embeddings_dir=EMBEDDINGS_DIR)
            _global_retrieval_pipeline = RetrievalPipeline(
                _global_embedding_service,
                _global_vector_store
            )
            logger.info("[SEARCH] Retrieval services initialized")
        except Exception as e:
            logger.error(f"[SEARCH] Failed to initialize retrieval services: {e}")
            raise


def ingest_url_to_vector_store(url: str) -> Dict:
    _ensure_retrieval_services()
    try:
        chunk_count = _global_retrieval_pipeline.ingest_url(url, max_words=3000)
        return {
            "success": True,
            "url": url,
            "chunks_ingested": chunk_count
        }
    except Exception as e:
        logger.error(f"[SEARCH] Failed to ingest URL {url}: {e}")
        return {
            "success": False,
            "url": url,
            "error": str(e)
        }


def retrieve_from_vector_store(query: str, top_k: int = RETRIEVAL_TOP_K) -> List[Dict]:
    _ensure_retrieval_services()
    try:
        return _global_retrieval_pipeline.retrieve(query, top_k=top_k)
    except Exception as e:
        logger.error(f"[SEARCH] Retrieval failed: {e}")
        return []


def get_vector_store_stats() -> Dict:
    _ensure_retrieval_services()
    return _global_vector_store.get_stats()


def persist_vector_store() -> None:
    _ensure_retrieval_services()
    _global_vector_store.persist_to_disk()
