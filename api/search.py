import time
from playwright.async_api import async_playwright  
import random
import asyncio
from typing import List, Tuple
from urllib.parse import quote

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

async def playwright_web_search(query: str, max_links: int = 5) -> Tuple[List[str], float]:
    """
    Search using playwright and return URLs + timing
    Time includes playwright startup and search execution
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

if __name__ == "__main__":
    async def main():
        setup_start = time.perf_counter()
        print("[SETUP] Warming up playwright engine...")
        playwright_warmup_time = await warmup_playwright()
        setup_end = time.perf_counter()
        print(f"[SETUP] Total setup time: {setup_end - setup_start:.3f} seconds\n")
        query = "What is the capital of France?"
        urls, search_time = await playwright_web_search(query, max_links=3)
        print(f"Search completed in {search_time:.3f} seconds")
        print("URLs found:")
        for url in urls:
            print(f" - {url}")
    
    asyncio.run(main())