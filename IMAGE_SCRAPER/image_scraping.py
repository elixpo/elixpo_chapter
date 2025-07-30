import asyncio
import os
import base64
import shutil
from urllib.parse import quote
from playwright.async_api import async_playwright
import stat

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

    def save_base64_image(self, base64_str, filename):
        try:
            if base64_str.startswith("data:image"):
                _, encoded = base64_str.split(",", 1)
                img_data = base64.b64decode(encoded)
                with open(filename, "wb") as f:
                    f.write(img_data)
                print(f"[✓] Saved image: {filename}")
            else:
                print("[!] Skipped non-base64 image.")
        except Exception as e:
            print("❌ Error saving image:", e)

    async def search_and_save_images(self, query, max_images=10):
        os.makedirs(self.save_dir, exist_ok=True)
        search_url = f"https://www.google.com/search?tbm=isch&q={quote(query)}"
        page = self.browser.pages[0] if self.browser.pages else await self.browser.new_page()

        await page.goto(search_url, timeout=60000)
        await page.wait_for_selector('.ob5Hkd', timeout=15000)

        await page.mouse.wheel(0, 2000)
        await page.wait_for_timeout(2000)

        elements = await page.query_selector_all('.ob5Hkd > a > div > div > div > g-img > img')

        print(f"[INFO] Found {len(elements)} matching <img> nodes.")
        count = 0

        for i, el in enumerate(elements):
            data_id = await el.get_attribute("data-id")
            src = await el.get_attribute("src")

            print(f"{i+1}. data-id: {data_id}, src: {'[base64]' if src and src.startswith('data:image') else src}")

            if src and src.startswith("data:image"):
                filename = os.path.join(self.save_dir, f"{query.replace(' ', '_')}_{i+1}.jpg")
                self.save_base64_image(src, filename)
                count += 1
                if count >= max_images:
                    break

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

    await agent.search_and_save_images("wooden trail in forest", max_images=5)

    await agent.close()
    def remove_readonly(func, path, excinfo):
        os.chmod(path, stat.S_IWRITE)
        func(path)

    if os.path.exists(agent.user_data_dir):
        shutil.rmtree(agent.user_data_dir, onerror=remove_readonly)
if __name__ == "__main__":
    asyncio.run(run())
