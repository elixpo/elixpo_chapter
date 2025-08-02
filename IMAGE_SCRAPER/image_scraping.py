import asyncio
import os
import base64
import shutil
from urllib.parse import urlparse, parse_qs, unquote, quote
from playwright.async_api import async_playwright
import stat



def extract_imgurl(href):
    if not href:
        return None
    parsed = urlparse(href)
    query = parse_qs(parsed.query)
    imgurl_encoded = query.get("imgurl", [None])[0]
    return unquote(imgurl_encoded) if imgurl_encoded else None


class GoogleImageSearchAgent:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.user_data_dir = "playwright_user_data"
        self.save_dir = "downloaded_images"
        print("[INFO] GoogleImageSearchAgent initialized.")

    def clear_user_data(self):
        if os.path.exists(self.user_data_dir):
            os.remove(self.user_data_dir)
            print(f"[INFO] Removed existing user data directory: {self.user_data_dir}")
            print(f"[INFO] Cleared existing user data at: {self.user_data_dir}")

    async def start(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch_persistent_context(
            user_data_dir=self.user_data_dir,
            headless=True,
            args=[
                "--remote-debugging-port=9222",
                "--disable-blink-features=AutomationControlled"
            ],
            viewport={'width': 1280, 'height': 800},
            locale="en-US",
        )


    async def search_images(self, query, max_images):
        cleaned_links = []
        os.makedirs(self.save_dir, exist_ok=True)
        search_url = f"https://www.google.com/search?tbm=isch&q={quote(query)}"
        page = self.browser.pages[0] if self.browser.pages else await self.browser.new_page()

        await page.goto(search_url, timeout=60000)
        await page.wait_for_selector('.ob5Hkd', timeout=15000)
        await page.wait_for_timeout(2000)

        elements = await page.query_selector_all('.ob5Hkd > a > div > div > div > g-img > img')

        for i, el in enumerate(elements):
            if i >= max_images:
                break

            try:
                await el.scroll_into_view_if_needed()
                await el.click()
                await page.wait_for_timeout(1000)

                link_el = await page.query_selector('.ob5Hkd a')
                if link_el:
                    link_href = await link_el.get_attribute('href')
                    cleaned_href = extract_imgurl(link_href)
                    if cleaned_href:
                        cleaned_links.append(cleaned_href)
            except Exception as e:
                print(f"[!] Error processing image {i}: {e}")
                continue

        return cleaned_links
    

    

    async def close(self):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        print("[INFO] GoogleImageSearchAgent closed.")

# ---------------------------------------------

async def run():
    agent = GoogleImageSearchAgent()
    agent.clear_user_data()  # Remove old session
    await agent.start()

    base64_list = await agent.search_images("wooden trail in forest", max_images=1)
    print(base64_list)

    await agent.close()
    def remove_readonly(func, path, excinfo):
        os.chmod(path, stat.S_IWRITE)
        func(path)

    if os.path.exists(agent.user_data_dir):
        shutil.rmtree(agent.user_data_dir, onerror=remove_readonly)
if __name__ == "__main__":
    asyncio.run(run())
