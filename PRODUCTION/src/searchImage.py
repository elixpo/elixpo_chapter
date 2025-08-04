from playwright.async_api import async_playwright
import asyncio

class GoogleSearchAgentImage:
    def __init__(self):
        self.browser = None

    async def _new_context(self):
        context = await self.browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/114.0.0.0 Safari/537.36",
            viewport={'width': 1280, 'height': 800},
            java_script_enabled=True,
            locale="en-US",
            geolocation={"longitude": -122.4194, "latitude": 37.7749},
            permissions=["geolocation"]
        )
        await context.add_init_script(
            """Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"""
        )
        return context

    async def bypass_consent(self, page):
        try:
            await page.wait_for_selector('form[action*="consent"] button', timeout=5000)
            await page.click('form[action*="consent"] button')
            print("[INFO] Clicked consent form button.")
            await page.wait_for_timeout(1000)
        except:
            try:
                print("[INFO] Trying to dismiss modal overlay...")
                await page.wait_for_selector('#xe7COe [role="button"]', timeout=5000)
                buttons = await page.query_selector_all('#xe7COe [role="button"]')
                for b in buttons:
                    text = await b.inner_text()
                    if any(t in text.lower() for t in ["accept", "agree", "j'accepte", "accepter"]):
                        await b.click()
                        print(f"[INFO] Clicked overlay consent button: {text}")
                        await page.wait_for_timeout(1000)
                        break
            except Exception as e:
                print(f"[WARN] Consent overlay not dismissed: {e}")

    async def search_images(self, query: str):
        async with async_playwright() as p:
            self.browser = await p.chromium.launch(headless=False)
            context = await self._new_context()
            page = await context.new_page()

            search_url = f"https://www.google.com/search?q={query}&tbm=isch&hl=en&gl=us"
            print(f"[INFO] Navigating to: {search_url}")
            await page.goto(search_url)

            await self.bypass_consent(page)

            await page.wait_for_selector('img', timeout=10000)
            images = await page.query_selector_all('img')

            print(f"[INFO] Found {len(images)} image elements.")
            urls = []
            for img in images:
                src = await img.get_attribute('src')
                if src and src.startswith('http'):
                    urls.append(src)

            print("[RESULT] Top 5 Image URLs:")
            for i, url in enumerate(urls[:5]):
                print(f"[{i+1}] {url}")

            await context.close()
            await self.browser.close()


if __name__ == "__main__":
    query = "sunset beach wallpaper"
    asyncio.run(GoogleSearchAgentImage().search_images(query))
