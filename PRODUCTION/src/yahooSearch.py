import asyncio
import os
import random
import shutil
import stat
import threading
from urllib.parse import quote
from playwright.async_api import async_playwright
from config import MAX_LINKS_TO_TAKE, isHeadless


# Global port manager to handle port allocation across all instances
class PortManager:
    def __init__(self, start_port=9000, end_port=9999):
        self.start_port = start_port
        self.end_port = end_port
        self.used_ports = set()
        self.lock = threading.Lock()
    
    def get_port(self):
        """Get an available port"""
        with self.lock:
            # Try to find an unused port
            for _ in range(100):  # Max 100 attempts to find a port
                port = random.randint(self.start_port, self.end_port)
                if port not in self.used_ports:
                    self.used_ports.add(port)
                    print(f"[PORT] Allocated port {port}. Active ports: {len(self.used_ports)}")
                    return port
            
            # If random selection fails, try sequential search
            for port in range(self.start_port, self.end_port + 1):
                if port not in self.used_ports:
                    self.used_ports.add(port)
                    print(f"[PORT] Allocated port {port} (sequential). Active ports: {len(self.used_ports)}")
                    return port
            
            raise Exception(f"No available ports in range {self.start_port}-{self.end_port}")
    
    def release_port(self, port):
        """Release a port back to the pool"""
        with self.lock:
            if port in self.used_ports:
                self.used_ports.remove(port)
                print(f"[PORT] Released port {port}. Active ports: {len(self.used_ports)}")
            else:
                print(f"[PORT] Warning: Attempted to release port {port} that wasn't tracked")
    
    def get_status(self):
        """Get current port usage status"""
        with self.lock:
            return {
                "active_ports": len(self.used_ports),
                "used_ports": list(self.used_ports),
                "available_range": f"{self.start_port}-{self.end_port}"
            }

# Global port manager instance
port_manager = PortManager(start_port=9000, end_port=9999)

# User agents for rotation
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
]

def get_random_user_agent():
    return random.choice(USER_AGENTS)

def remove_readonly(func, path, _):
    os.chmod(path, stat.S_IWRITE)
    try:
        func(path)
    except Exception as e:
        print(f"[!] Failed to delete: {path} → {e}")

async def handle_accept_popup(page):
    """Click 'Accept' button if it appears."""
    try:
        # Look for a submit button with text 'Accept'
        accept_button = await page.wait_for_selector("button[type='submit']:has-text('Accept')", timeout=5000)
        if accept_button:
            await accept_button.click()
            print("[INFO] Accepted cookie/privacy popup.")
            await asyncio.sleep(1)
    except:
        # No popup found
        pass

# --------------------------------------------
# Yahoo Search - Text
# --------------------------------------------
class YahooSearchAgentText:
    def __init__(self, custom_port=None):
        self.playwright = None
        self.context = None
        self.query_count = 0
        
        # Use port manager if no custom port specified
        if custom_port:
            self.custom_port = custom_port
            self.owns_port = False  # Don't manage port if externally provided
        else:
            self.custom_port = port_manager.get_port()
            self.owns_port = True  # We allocated this port, so we should release it
            
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
            # If we own the port and startup fails, release it
            if self.owns_port:
                port_manager.release_port(self.custom_port)
            raise

    async def search(self, query, max_links=MAX_LINKS_TO_TAKE):
        blacklist = [
            "yahoo.com/preferences",
            "yahoo.com/account",
            "login.yahoo.com",
            "yahoo.com/gdpr",
        ]
        results = []
        try:
            self.query_count += 1
            page = await self.context.new_page()
            search_url = f"https://search.yahoo.com/search?p={quote(query)}"
            await page.goto(search_url, timeout=50000)

            # Handle "Accept" popup
            await handle_accept_popup(page)

            # Simulate human behavior
            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            await page.wait_for_timeout(random.randint(1000, 2000))

            await page.wait_for_selector("h3.title a", timeout=55000)

            link_elements = await page.query_selector_all("h3.title a")
            for link in link_elements:
                if len(results) >= max_links:
                    break
                href = await link.get_attribute("href")
                if href and href.startswith("http") and not any(b in href for b in blacklist):
                    results.append(href)

            await page.close()
            print(f"[INFO] Yahoo search returned {len(results)} results for '{query}' on port {self.custom_port}")
        except Exception as e:
            print(f"❌ Yahoo search failed on port {self.custom_port}: {e}")
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
            
            print(f"[INFO] YahooSearchAgentText on port {self.custom_port} closed.")
        except Exception as e:
            print(f"[ERROR] Error closing YahooSearchAgentText on port {self.custom_port}: {e}")
        finally:
            # Always release the port if we own it
            if self.owns_port:
                port_manager.release_port(self.custom_port)

# --------------------------------------------
# Yahoo Search - Images
# --------------------------------------------
class YahooSearchAgentImage:
    def __init__(self, custom_port=None):
        self.playwright = None
        self.context = None
        self.save_dir = "downloaded_images"
        
        # Use port manager if no custom port specified
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

    async def search_images(self, query, max_images=10):
        results = []
        os.makedirs(self.save_dir, exist_ok=True)
        try:
            page = await self.context.new_page()
            search_url = f"https://images.search.yahoo.com/search/images?p={quote(query)}"
            await page.goto(search_url, timeout=20000)

            # Handle "Accept" popup
            await handle_accept_popup(page)

            # Simulate human behavior
            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            await page.wait_for_timeout(random.randint(1000, 2000))

            await page.wait_for_selector("li img", timeout=15000)

            img_elements = await page.query_selector_all("li img")
            for img in img_elements[:max_images]:
                src = await img.get_attribute("data-src") or await img.get_attribute("src")
                if src and src.startswith("http"):
                    results.append(src)

            await page.close()
            print(f"[INFO] Yahoo image search returned {len(results)} results for '{query}' on port {self.custom_port}")
            return results
        except Exception as e:
            print(f"[ERROR] Yahoo image search failed on port {self.custom_port}: {e}")
            return []

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
            
            print(f"[INFO] YahooSearchAgentImage on port {self.custom_port} closed.")
        except Exception as e:
            print(f"[ERROR] Error closing YahooSearchAgentImage on port {self.custom_port}: {e}")
        finally:
            if self.owns_port:
                port_manager.release_port(self.custom_port)

# --------------------------------------------
# Main search functions
# --------------------------------------------
async def web_search(query):
    yahoo_agent = YahooSearchAgentText()  # Let it auto-allocate port
    try:
        await yahoo_agent.start()
        await asyncio.sleep(random.uniform(1, 3))
        results = await yahoo_agent.search(query, max_links=MAX_LINKS_TO_TAKE)
        return results
    finally:
        await yahoo_agent.close()

async def image_search(query, max_images=10):
    yahoo_agent = YahooSearchAgentImage()  # Let it auto-allocate port
    try:
        await yahoo_agent.start()
        await asyncio.sleep(random.uniform(1, 3))
        results = await yahoo_agent.search_images(query, max_images)
        return results
    finally:
        await yahoo_agent.close()

def get_port_status():
    """Get current port manager status"""
    return port_manager.get_status()

# --------------------------------------------
# Run Example
# --------------------------------------------
if __name__ == "__main__":
    async def main():
        queries = ["ballet dancer"]
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

    asyncio.run(main())