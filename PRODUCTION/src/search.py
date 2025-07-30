import requests
from time import sleep
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from duckduckgo_search import DDGS
from config import MAX_LINKS_TO_TAKE
import asyncio
import stat
import shutil
import os
from urllib.parse import urlparse, parse_qs, unquote, quote


def extract_imgurl(href):
    if not href:
        return None
    parsed = urlparse(href)
    query = parse_qs(parsed.query)
    imgurl_encoded = query.get("imgurl", [None])[0]
    return unquote(imgurl_encoded) if imgurl_encoded else None

def remove_readonly(func, path, _):
    """Clear the readonly bit and reattempt deletion."""
    os.chmod(path, stat.S_IWRITE)
    try:
        func(path)
    except Exception as e:
        print(f"[!] Failed to delete: {path} → {e}")

class GoogleSearchAgent:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.query_count = 0
        self.user_data_dir = "playwright_user_data"
        self.save_dir = "downloaded_images"

        # Remove previous session folder if exists
        if os.path.exists(self.user_data_dir):
            try:
                shutil.rmtree(self.user_data_dir, onerror=remove_readonly)
                print(f"[INFO] Cleared existing user data at: {self.user_data_dir}")
            except Exception as e:
                print(f"[ERROR] Failed to delete old user data: {e}")

        print("[INFO] GoogleSearchAgent ready and warmed up.")

    async def start(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch_persistent_context(
            user_data_dir=self.user_data_dir,
            headless=True,
            args=["--remote-debugging-port=9222", "--disable-blink-features=AutomationControlled"],
            viewport={'width': 1280, 'height': 800},
            locale="en-US",
        )

    async def _new_context(self):
        context = await self.browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/114.0.0.0 Safari/537.36",
            viewport={'width': 1280, 'height': 800},
            java_script_enabled=True,
            locale="en-US"
        )
        await context.add_init_script(
            """Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"""
        )
        return context

    async def search(self, query, max_links=5):
        blacklist = [
            "maps.google.", "support.google.", "accounts.google.", "policies.google.",
            "images.google.", "google.com/preferences", "https://www.instagram.com/reel",
            "https://www.instagram.com/p", "youtube.com/shorts", "youtube.com/live",
            "https://www.facebook.com/", "https://www.facebook.com/p"
        ]
        try:
            # Every 50 queries, refresh context to prevent RAM leaks
            if self.query_count >= 50:
                print("[INFO] Resetting browser context to avoid leaks.")
                await self.context.close()
                self.context = await self._new_context()
                self.query_count = 0

            self.query_count += 1
            

            page = await self.context.new_page()
            await page.goto(f"https://www.google.com/search?q={query}", timeout=20000)
            await page.wait_for_selector('a[jsname]')
            links = page.locator('a[jsname]')
            results = []

            # Fix: await the count() method
            link_count = await links.count()
            for i in range(link_count):
                # Fix: await the get_attribute() method
                href = await links.nth(i).get_attribute("href")
                if href and href.startswith("http") and not any(bad in href for bad in blacklist):
                    results.append(href)

            await page.close()
            return results[:max_links]
        except Exception as e:
            print("❌ Google search failed:", e)
            return []
        
    async def search_images(self, query, max_images):
        cleaned_links = []
        cleaned_sources = []
        os.makedirs(self.save_dir, exist_ok=True)
        search_url = f"https://www.google.com/search?tbm=isch&q={quote(query)}"
        page = self.browser.pages[0] if self.browser.pages else await self.browser.new_page()

        await page.goto(search_url, timeout=60000)
        await page.wait_for_selector('.ob5Hkd', timeout=15000)
        await page.wait_for_timeout(2000)

        # Get all result blocks
        blocks = await page.query_selector_all('.ob5Hkd')
        for i, block in enumerate(blocks):
            if i >= max_images:
                break

            try:
                await block.scroll_into_view_if_needed()
                await block.click()
                await page.wait_for_timeout(1000)

                link_el = await block.query_selector('a')
                if link_el:
                    link_href = await link_el.get_attribute('href')
                    cleaned_href = extract_imgurl(link_href)
                    if cleaned_href and cleaned_href not in cleaned_links:
                        cleaned_links.append(cleaned_href)

            except Exception as e:
                print(f"[!] Error processing image {i}: {e}")
                continue

        extra_blocks = await page.query_selector_all('[jscontroller="N8Q1ib"]')
        for i, block in enumerate(extra_blocks):
            if i >= max_images:
                break
            try:
                anchor = await block.query_selector('a')
                if anchor:
                    href = await anchor.get_attribute('href')
                    img_source = extract_imgurl(href)
                    if img_source and img_source not in cleaned_sources:
                        cleaned_sources.append(img_source)
            except Exception as e:
                print(f"[!] Error extracting from jscontroller block: {e}")

        return cleaned_links, cleaned_sources

    async def close(self):
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

        # Delete user data after browser closes
        if os.path.exists(self.user_data_dir):
            try:
                shutil.rmtree(self.user_data_dir, onerror=remove_readonly)
                print(f"[INFO] Deleted user data folder: {self.user_data_dir}")
            except Exception as e:
                print(f"[ERROR] Could not remove user data folder: {e}")

        print("[INFO] GoogleSearchAgent closed.")

        
def mojeek_form_search(query):
    url = "https://www.mojeek.com/search"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
        "Referer": "https://www.mojeek.com/",
        "Accept": "text/html"
    }
    params = {"q": query}

    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        results = soup.select("ul.results-standard li")
        links = []

        for r in results[:MAX_LINKS_TO_TAKE]:
            title_tag = r.select_one("a.title")
            if title_tag and title_tag.has_attr("href"):
                links.append(title_tag["href"])

        return links

    except requests.exceptions.RequestException as e:
        print("❌ Mojeek request failed:", e)
        return []

def ddgs_search(query):
    url = "https://html.duckduckgo.com/html/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    }
    data = {"q": query}

    try:
        response = requests.post(url, data=data, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        links = []
        for h2 in soup.select("h2.result__title a[href^='http']"):
            href = h2.get("href")
            if (
                href
                and href.startswith("http")
                and not href.startswith("https://duckduckgo.com/y.js?")
            ):
                links.append(href)

        print(f"[INFO] DDG search completed with {len(links)} results.")
        return links[:MAX_LINKS_TO_TAKE]

    except Exception as e:
        print("❌ DDG search failed:", e)
        return []


def ddgs_search_module_search(query):
    results = []
    try:
        with DDGS() as ddgs:
            for entry in ddgs.text(query, max_results=MAX_LINKS_TO_TAKE):
                url = entry.get("href") or entry.get("link")
                if url and url.startswith("http"):
                    results.append(url)
        print(f"[INFO] DDG search returned {len(results)} links")
    except Exception as e:
        print("❌ DDG search failed:", e)
    return results


async def web_search(query, google_agent):
    print(f"[INFO] Running web search for: {query}")

    # First Priority: Google via Playwright (warm)
    try:
        google_results = await google_agent.search(query, max_links=MAX_LINKS_TO_TAKE)
        if google_results:
            print(f"[INFO] Using Google with {len(google_results)} results.")
            return google_results
        else:
            print("[INFO] Google returned no results. Falling back to DDGS module.")
    except Exception as e:
        print(f"[WARN] Google search failed with error: {e}. Falling back to DDGS module.")

    # Second Priority: DuckDuckGo via DDGS
    try:
        ddg_module_results = ddgs_search_module_search(query)
        if ddg_module_results:
            print(f"[INFO] Using DuckDuckGo module with {len(ddg_module_results)} results.")
            return ddg_module_results
        else:
            print("[INFO] DuckDuckGo module returned no results. Falling back to DDG HTML.")
    except Exception as e:
        print(f"[WARN] DuckDuckGo module search failed with error: {e}. Falling back to DDG HTML.")

    # Third Priority: DuckDuckGo via HTML scraping
    try:
        ddg_results = ddgs_search(query)
        if ddg_results:
            print(f"[INFO] Using DuckDuckGo HTML with {len(ddg_results)} results.")
            return ddg_results
        else:
            print("[INFO] DuckDuckGo HTML returned no results. Falling back to Mojeek.")
    except Exception as e:
        print(f"[WARN] DuckDuckGo HTML search failed with error: {e}. Falling back to Mojeek.")

    # Final Priority: Mojeek
    try:
        mojeek_results = mojeek_form_search(query)
        if mojeek_results:
            print(f"[INFO] Using Mojeek with {len(mojeek_results)} results.")
            return mojeek_results
        else:
            print("[INFO] Mojeek returned no results.")
    except Exception as e:
        print(f"[WARN] Mojeek search failed with error: {e}.")

    print("[INFO] All search engines failed to return results.")
    return []



async def image_search(query, google_agent):
    print(f"[INFO] Running image search for: {query}")
    try:
        results, sources = await google_agent.search_images(query, max_images=10)
        if results:
            print(f"[INFO] Image search returned {len(results)} images.")
            return results, sources
        else:
            print("[INFO] No images found.")
            return []
    except Exception as e:
        print(f"[ERROR] Image search failed with error: {e}")
        return []
    finally:
        await google_agent.close()



if __name__ == "__main__":
    # print("\nDDGS:")
    # for url in ddgs_search("the best sign language detection using cnn"):
    #     print(url)
    # print("\nGoogle no playwright:")
    # for url in google_search_without_playwright("who is elixpo"):
    #     print(url)  
    # print("\nMOJEEK:")
    # for urls in mojeek_form_search("sign language detection using cnn"):
    #     print(urls)

    async def main():
        agent = GoogleSearchAgent()
        await agent.start()
        print("\nGoogle Search with Playwright:")
        queries = ["ballet dancer"]
        for query in queries:
            print(f"\nResults for: {query}")
            results, sources = await agent.search_images(query, 10)
            for link in results:
                print(link)
            for link in sources:
                print(sources)
        await agent.close()
    
    asyncio.run(main())
    
    # print("\nWeb Search")
    # query = "Tell me something about quantum computing"
    # results = web_search(query)
    # print("Search results:")
    # for link in results:
    #     print(link)

