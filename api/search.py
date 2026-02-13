import time
from playwright.async_api import async_playwright
import random
import asyncio
from typing import List, Tuple, Dict, Optional
from urllib.parse import quote
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import re
import logging
from config import MAX_TOTAL_SCRAPE_WORD_COUNT
from knowledge_graph import build_knowledge_graph, clean_text_nltk, chunk_and_graph

logger = logging.getLogger(__name__)

__all__ = ['fetch_full_text', 'playwright_web_search', 'warmup_playwright']


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
    """Warmup playwright engine - time not counted in actual search"""
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
        
        # Quick page load to warm up
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
    """
    Search using playwright and return URLs/images + timing
    Time includes playwright startup and search execution
    
    Args:
        query: Search query string
        max_links: Maximum number of results to return
        images: If True, search for images; if False, search for URLs
    """
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
            # Image search
            search_url = f"https://images.search.yahoo.com/search/images?p={quote(query)}"
            print(f"[IMAGE SEARCH] Navigating to: {search_url}")
            await page.goto(search_url, timeout=50000)
            
            # Handle popup
            await handle_accept_popup(page)
            
            # Simulate human behavior
            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            await page.wait_for_timeout(random.randint(1000, 2000))
            
            # Wait for thumbnail images to load
            await page.wait_for_selector("img[src*='s.yimg.com']", timeout=55000)
            
            # Get all thumbnail images
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
                    
                    # Set up listener BEFORE clicking
                    page.on("response", handle_response)
                    
                    # Click the image element
                    await img.click()
                    
                    # Wait for network response with timeout
                    wait_start = time.perf_counter()
                    while captured_image_url is None and (time.perf_counter() - wait_start) < 3:
                        await page.wait_for_timeout(100)
                    
                    # Remove the response listener
                    page.remove_listener("response", handle_response)
                    
                    if captured_image_url:
                        results.append(captured_image_url)
                        print(f"[IMAGE] Added: {captured_image_url} (Count: {len(results)}/{max_links})")
                    else:
                        print(f"[WARN] No JPEG URL captured for thumbnail {idx + 1}")
                    
                    # Go back to search results
                    await page.go_back()
                    await page.wait_for_timeout(500)
                    
                    # Continue if we haven't reached max_links yet
                    if len(results) >= max_links:
                        break
                except Exception as e:
                    print(f"[WARN] Failed to extract image URL at index {idx}: {e}")
            
            print(results)
            print(f"[IMAGE SEARCH] Found {len(results)} images")
        else:
            # URL search
            search_url = f"https://search.yahoo.com/search?p={quote(query)}&fr=yfp-t&fr2=p%3Afp%2Cm%3Asb&fp=1"
            print(f"[SEARCH] Navigating to: {search_url}")
            await page.goto(search_url, timeout=50000)
            
            # Handle popup
            await handle_accept_popup(page)
            
            # Simulate human behavior
            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            await page.wait_for_timeout(random.randint(1000, 2000))
            
            # Wait for results
            await page.wait_for_selector("div.compTitle > a", timeout=55000)
            
            # Extract links
            link_elements = await page.query_selector_all("div.compTitle > a")
            blacklist = ["yahoo.com/preferences", "yahoo.com/account", "login.yahoo.com", "yahoo.com/gdpr"]
            
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



def fetch_full_text(
    url,
    total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT,
    build_kg: bool = True,
    request_id: Optional[str] = None,
) -> Tuple[str, Dict]:
    """
    Fetch and clean text from URL with optional knowledge graph building and request tracking

    Args:
        url: URL to fetch
        total_word_count_limit: Max words to extract
        build_kg: Whether to build knowledge graph
        request_id: Optional request ID for tracking KG in manager

    Returns:
        Tuple of (cleaned_text, knowledge_graph_dict or empty dict)
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    kg_result = {}

    try:
        response = requests.get(url, timeout=20, headers=headers)
        if response.status_code != 200:
            logger.error(f"[FETCH] Error fetching {url}: Status {response.status_code}")
            return "", kg_result
        response.raise_for_status()

        content_type = response.headers.get('Content-Type', '').lower()
        if 'text/html' not in content_type:
            logger.warning(f"[FETCH] Skipping non-HTML content from {url} (Content-Type: {content_type})")
            return "", kg_result

        soup = BeautifulSoup(response.content, 'html.parser')

        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form', 'button', 'noscript', 'iframe', 'svg']):
            element.extract()

        main_content_elements = soup.find_all(['main', 'article', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p', 'article'], class_=[
            'main', 'content', 'article', 'post', 'body', 'main-content', 'entry-content', 'blog-post'
        ])
        if not main_content_elements:
            main_content_elements = [soup.find('body')] if soup.find('body') else [soup]

        # Extract text
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

        # Build knowledge graph with semantic chunking for better contextualization
        if build_kg and cleaned_text:
            try:
                # Build main knowledge graph
                kg = build_knowledge_graph(cleaned_text)
                
                # Build chunked knowledge graphs for semantic enrichment
                chunked_graphs = chunk_and_graph(cleaned_text, chunk_size=500, overlap=50)
                
                # Merge chunk-level insights into main KG
                for chunk_data in chunked_graphs:
                    chunk_kg_dict = chunk_data.get("knowledge_graph", {})
                    if chunk_kg_dict and "entities" in chunk_kg_dict:
                        # Add chunk entities to main KG
                        for entity_key, entity_info in chunk_kg_dict.get("entities", {}).items():
                            if entity_key not in kg.entities:
                                kg.add_entity(
                                    entity_info.get("original", entity_key),
                                    entity_info.get("type", "UNKNOWN")
                                )
                
                # Rebuild importance scores after merging
                kg.calculate_importance()
                
                kg_result = {
                    "entities": kg.entities,
                    "entity_count": len(kg.entities),
                    "top_entities": kg.get_top_entities(top_k=10),
                    "relationships": kg.relationships[:20],
                    "relationship_count": len(kg.relationships),
                    "importance_scores": kg.importance_scores,
                    "chunks_analyzed": len(chunked_graphs),
                    "semantic_enrichment": True
                }

                logger.info(
                    f"[KG] Built comprehensive KG from {url}: "
                    f"{len(kg.entities)} entities, {len(kg.relationships)} relationships, "
                    f"enhanced with {len(chunked_graphs)} semantic chunks"
                )

            except Exception as e:
                logger.warning(f"[KG] Knowledge graph building failed for {url}: {e}", exc_info=True)

        return cleaned_text, kg_result

    except requests.exceptions.Timeout:
        logger.error(f"[FETCH] Timeout scraping URL: {url}")
        return "", kg_result
    except requests.exceptions.RequestException as e:
        logger.error(f"[FETCH] Request error scraping URL: {url}: {type(e).__name__}: {e}")
        return "", kg_result
    except Exception as e:
        logger.error(f"[FETCH] Error processing URL: {url}: {type(e).__name__}: {e}")
        return "", kg_result




if __name__ == "__main__":
    async def main():
        query = "quote"
        urls, search_time = await playwright_web_search(query, max_links=4, images=False)
        print(f"Search completed in {search_time:.3f} seconds")
        print("URLs found:")
        for url in urls:
            print(f" - {url}")
    
    asyncio.run(main())
    # test_url = "https://www.financialexpress.com/india-news/six-others-have-claimed-as-father-ec-summons-bengal-voters-for-sir-hearing-over-logical-discrepancy/4106668/"
    # text = fetch_full_text(test_url)
    # print("\n--- Extracted Text ---\n")
    # print(text)