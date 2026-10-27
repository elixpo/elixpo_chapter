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

            # Wait for the image results list, then find all tile items
            await page.wait_for_selector("ul.image-results__list li.tile", timeout=55000)
            tiles = await page.query_selector_all("ul.image-results__list li.tile")
            print(f"[IMAGE SEARCH] Found {len(tiles)} tiles")

            for idx, tile in enumerate(tiles):
                if len(results) >= max_links:
                    break
                try:
                    print(f"[IMAGE] Processing tile {idx + 1}")

                    # Click the anchor inside the tile to open the viewer
                    anchor = await tile.query_selector("a")
                    if not anchor:
                        print(f"[WARN] No anchor in tile {idx + 1}")
                        continue
                    await anchor.click()

                    # Wait for the viewer to appear with a full-res image
                    try:
                        viewer_img = await page.wait_for_selector(
                            "ul.image-results__list .viewer img",
                            timeout=5000
                        )
                    except Exception:
                        # Fallback: try data-origurl from the anchor
                        origurl = await anchor.get_attribute("data-origurl")
                        if origurl and origurl.startswith("http"):
                            results.append(origurl)
                            print(f"[IMAGE] Fallback data-origurl: {origurl}")
                        else:
                            print(f"[WARN] No viewer appeared for tile {idx + 1}")
                        continue

                    if viewer_img:
                        src = await viewer_img.get_attribute("src")
                        if src and src.startswith("http") and "s.yimg.com" not in src:
                            results.append(src)
                            print(f"[IMAGE] Captured: {src} ({len(results)}/{max_links})")
                        else:
                            # Try data-origurl as backup
                            origurl = await anchor.get_attribute("data-origurl")
                            if origurl and origurl.startswith("http"):
                                results.append(origurl)
                                print(f"[IMAGE] Fallback data-origurl: {origurl}")
                            else:
                                print(f"[WARN] Viewer img src unusable for tile {idx + 1}: {src}")

                    # Close the viewer by pressing Escape
                    await page.keyboard.press("Escape")
                    await page.wait_for_timeout(300)

                except Exception as e:
                    print(f"[WARN] Failed to extract image at tile {idx + 1}: {e}")
                    # Try to dismiss any open viewer
                    try:
                        await page.keyboard.press("Escape")
                    except Exception:
                        pass

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
            blacklist = [
                "yahoo.com/preferences", "yahoo.com/account", "login.yahoo.com", "yahoo.com/gdpr",
                "ad.doubleclick.net", "doubleclick.net", "googleadservices.com",
                "googlesyndication.com", "clickserve.dartsearch.net",
                "bing.com/aclick", "r.search.yahoo.com/cbclk",
            ]
            
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

