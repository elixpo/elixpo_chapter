import time
from playwright.async_api import async_playwright
from .utils import get_random_user_agent, handle_accept_popup, warmup_playwright
from urllib.parse import quote
from typing import List, Tuple
import random


async def playwright_web_search(query: str, max_links: int = 5, images: bool = False) -> Tuple[List[str], float]:
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

