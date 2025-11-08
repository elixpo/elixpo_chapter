import asyncio
import os
import random
import shutil
import stat
import threading
from urllib.parse import quote
from playwright.async_api import async_playwright  #type: ignore
from config import MAX_LINKS_TO_TAKE, isHeadless
import json





class YahooSearchAgentText:
    def __init__(self, custom_port=None):
        self.playwright = None
        self.context = None
        self.tab_count = 0  
        
        if custom_port:
            self.custom_port = custom_port
            self.owns_port = False
        else:
            self.custom_port = port_manager.get_port()
            self.owns_port = True
            
        print(f"[INFO] YahooSearchAgentText ready on port {self.custom_port}.")

    async def start(self):
        try:
            self.playwright = await async_playwright().start()
            self.context = await self.playwright.chromium.launch_persistent_context(
                user_data_dir=f"/tmp/chrome-user-data-{self.custom_port}",
                headless=isHeadless,
                args=[
                    f"--remote-debugging-port={self.custom_port}",
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
                viewport={'width': random.choice([1280, 1366, 1440, 1920]), 'height': random.choice([720, 800, 900, 1080])},
            )
            await self.context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
                Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
                window.chrome = {runtime: {}};
            """)
            print(f"[INFO] YahooSearchAgentText started successfully on port {self.custom_port}")
        except Exception as e:
            print(f"[ERROR] Failed to start YahooSearchAgentText on port {self.custom_port}: {e}")
            if self.owns_port:
                port_manager.release_port(self.custom_port)
            raise

    async def search(self, query, max_links=MAX_LINKS_TO_TAKE, agent_idx=None):
        blacklist = [
            "yahoo.com/preferences",
            "yahoo.com/account",
            "login.yahoo.com",
            "yahoo.com/gdpr",
        ]
        results = []
        page = None
        try:
            self.tab_count += 1
            print(f"[SEARCH] Opening tab #{self.tab_count} on port {self.custom_port} for query: '{query[:50]}...'")
            
            # Open new tab for this search
            page = await self.context.new_page()
            search_url = f"https://search.yahoo.com/search?p={quote(query)}"
            await page.goto(search_url, timeout=50000)

            # Handle "Accept" popup
            await handle_accept_popup(page)

            # Simulate human behavior
            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            await page.wait_for_timeout(random.randint(1000, 2000))

            await page.wait_for_selector("div.compTitle > a", timeout=55000)

            link_elements = await page.query_selector_all("div.compTitle > a")
            for link in link_elements:
                if len(results) >= max_links:
                    break
                href = await link.get_attribute("href")
                if href and href.startswith("http") and not any(b in href for b in blacklist):
                    results.append(href)

            print(f"[SEARCH] Tab #{self.tab_count} returned {len(results)} results for '{query[:50]}...' on port {self.custom_port}")
            
            # Increment pool tab count
            if agent_idx is not None:
                agent_pool.increment_tab_count("text", agent_idx)
                
        except Exception as e:
            print(f"❌ Yahoo search failed on tab #{self.tab_count}, port {self.custom_port}: {e}")
        finally:
            # Always close the tab after search
            if page:
                try:
                    await page.close()
                    print(f"[SEARCH] Closed tab #{self.tab_count} on port {self.custom_port}")
                except Exception as e:
                    print(f"[WARN] Failed to close tab #{self.tab_count}: {e}")
        
        return results

    async def close(self):
        try:
            if self.context:
                await self.context.close()
            if self.playwright:
                await self.playwright.stop()
            
            # Clean up user data directory
            try:
                shutil.rmtree(f"/tmp/chrome-user-data-{self.custom_port}", ignore_errors=True)
            except Exception as e:
                print(f"[WARN] Failed to clean up user data for port {self.custom_port}: {e}")
            
            print(f"[INFO] YahooSearchAgentText on port {self.custom_port} closed after {self.tab_count} tabs.")
        except Exception as e:
            print(f"[ERROR] Error closing YahooSearchAgentText on port {self.custom_port}: {e}")
        finally:
            if self.owns_port:
                port_manager.release_port(self.custom_port)

class YahooSearchAgentImage:
    def __init__(self, custom_port=None):
        self.playwright = None
        self.context = None
        self.save_dir = "downloaded_images"
        self.tab_count = 0
        
        if custom_port:
            self.custom_port = custom_port
            self.owns_port = False
        else:
            self.custom_port = port_manager.get_port()
            self.owns_port = True
            
        print(f"[INFO] YahooSearchAgentImage ready on port {self.custom_port}.")

    async def start(self):
        try:
            self.playwright = await async_playwright().start()
            self.context = await self.playwright.chromium.launch_persistent_context(
                user_data_dir=f"/tmp/chrome-user-data-{self.custom_port}",
                headless=isHeadless,
                args=[
                    f"--remote-debugging-port={self.custom_port}",
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
                viewport={'width': random.choice([1280, 1366, 1440, 1920]), 'height': random.choice([720, 800, 900, 1080])},
            )
            await self.context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
                Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
                window.chrome = {runtime: {}};
            """)
            print(f"[INFO] YahooSearchAgentImage started successfully on port {self.custom_port}")
        except Exception as e:
            print(f"[ERROR] Failed to start YahooSearchAgentImage on port {self.custom_port}: {e}")
            if self.owns_port:
                port_manager.release_port(self.custom_port)
            raise

    async def search_images(self, query, max_images=10, agent_idx=None):
        results = []
        os.makedirs(self.save_dir, exist_ok=True)
        page = None
        try:
            self.tab_count += 1
            print(f"[IMAGE SEARCH] Opening tab #{self.tab_count} on port {self.custom_port} for query: '{query[:50]}...'")
            
            # Open new tab for this search
            page = await self.context.new_page()
            search_url = f"https://images.search.yahoo.com/search/images?p={quote(query)}"
            await page.goto(search_url, timeout=20000)

            # Handle "Accept" popup
            await handle_accept_popup(page)

            # Simulate human behavior
            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            await page.wait_for_timeout(random.randint(1000, 2000))

            await page.wait_for_selector("li > a.redesign-img > img", timeout=15000)

            img_elements = await page.query_selector_all("li > a.redesign-img > img")
            for img in img_elements[:max_images]:
                src = await img.get_attribute("data-src") or await img.get_attribute("src")
                if src and src.startswith("http"):
                    results.append(src)

            print(f"[IMAGE SEARCH] Tab #{self.tab_count} returned {len(results)} image results for '{query[:50]}...' on port {self.custom_port}")
            
            # Increment pool tab count
            if agent_idx is not None:
                agent_pool.increment_tab_count("image", agent_idx)
                
        except Exception as e:
            print(f"[ERROR] Yahoo image search failed on tab #{self.tab_count}, port {self.custom_port}: {e}")
        finally:
            # Always close the tab after search
            if page:
                try:
                    await page.close()
                    print(f"[IMAGE SEARCH] Closed tab #{self.tab_count} on port {self.custom_port}")
                except Exception as e:
                    print(f"[WARN] Failed to close image search tab #{self.tab_count}: {e}")
        
        return results

    async def close(self):
        try:
            if self.context:
                await self.context.close()
            if self.playwright:
                await self.playwright.stop()
            
            try:
                shutil.rmtree(f"/tmp/chrome-user-data-{self.custom_port}", ignore_errors=True)
            except Exception as e:
                print(f"[WARN] Failed to clean up user data for port {self.custom_port}: {e}")
            
            print(f"[INFO] YahooSearchAgentImage on port {self.custom_port} closed after {self.tab_count} tabs.")
        except Exception as e:
            print(f"[ERROR] Error closing YahooSearchAgentImage on port {self.custom_port}: {e}")
        finally:
            if self.owns_port:
                port_manager.release_port(self.custom_port)

async def web_search(query):
    if not agent_pool.initialized:
        await agent_pool.initialize_pool()
    
    agent, agent_idx = await agent_pool.get_text_agent()
    results = await agent.search(query, max_links=MAX_LINKS_TO_TAKE, agent_idx=agent_idx)
    return results

async def image_search(query, max_images=10):
    if not agent_pool.initialized:
        await agent_pool.initialize_pool()
    
    agent, agent_idx = await agent_pool.get_image_agent()
    results = await agent.search_images(query, max_images, agent_idx=agent_idx)
    
    # Format results to match expected JSON format
    if results:
        result_dict = {f"yahoo_source_{i}": [url] for i, url in enumerate(results)}
        return json.dumps(result_dict)
    else:
        return json.dumps({})

async def get_agent_pool_status():
    """Get current agent pool status"""
    return await agent_pool.get_status()

    
def get_port_status():
    """Get current port manager status"""
    return port_manager.get_status()


# --------------------------------------------
# Run Example
# --------------------------------------------
if __name__ == "__main__":
    async def main():
        queries = ["Eiffel Tower Paris wide shot daytime clear blue sky lush green Champ de Mars tourism architecture landmark"]
        for q in queries:
            print(f"\n{'='*50}")
            print(f"Searching Yahoo for: {q}")
            print('='*50)
            
            # Show port status before search
            status = get_port_status()
            print(f"Port status before search: {status}")
            
            text_results = await web_search(q)
            print("Text results:", text_results[:3])  # Show first 3 results
            
            # Show port status after search
            status = get_port_status()
            print(f"Port status after search: {status}")
            
            # Add delay between searches
            await asyncio.sleep(2)

            print(f"\n{'-'*50}")
            print(f"Searching Yahoo Images for: {q}")
            print('-'*50)
            image_results = await image_search(q, max_images=5)
            print("Image results:", image_results)  # Show all image URLs

            # Show port status after image search
            status = get_port_status()
            print(f"Port status after image search: {status}")

    asyncio.run(main())