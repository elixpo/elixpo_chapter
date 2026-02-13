from multiprocessing.managers import BaseManager
from sentence_transformers import SentenceTransformer, util
import torch, threading
from concurrent.futures import ThreadPoolExecutor
from loguru import logger
from playwright.async_api import async_playwright  #type: ignore
import random
import asyncio
import os
import random
import shutil
import stat
import threading
from urllib.parse import quote
from config import MAX_LINKS_TO_TAKE, isHeadless
import json
import atexit
import whisper
import time
import numpy as np
from config import BASE_CACHE_DIR, AUDIO_TRANSCRIBE_SIZE
import schedule
import uuid

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

class ipcModules:
    _instance_id = None
    def __init__(self):
        ipcModules._instance_id = str(uuid.uuid4())[:8]
        logger.info(f"[INSTANCE {ipcModules._instance_id}] Loading embedding model...")
        self.embed_model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-mpnet-base-v2")
        self.transcribe_model = whisper.load_model(AUDIO_TRANSCRIBE_SIZE)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.embed_model = self.embed_model.to(self.device)
        logger.info(f"[INSTANCE {ipcModules._instance_id}] embedding model loaded on device: {self.device}")
        self.executor = ThreadPoolExecutor(max_workers=2)
        self._gpu_lock = threading.Lock()
        self._operation_semaphore = threading.Semaphore(2)

    def transcribeAudio(self, audio_path: str):
        with self._gpu_lock:
            result = self.transcribe_model.transcribe(audio_path, language="en")
            final_text = result["text"]
        return final_text
    
    def extract_relevant(self, text, query, batch_size=64, diversity=0.4):
        logger.info(f"[INSTANCE {ipcModules._instance_id}] extract_relevant called")
        
        try:
            from nltk.tokenize import sent_tokenize
            sentences = [s.strip() for s in sent_tokenize(text) if len(s.strip().split()) > 3]
        except:
            sentences = text.split('.')
            sentences = [s.strip() for s in sentences if len(s.strip().split()) > 3]
        
        if not sentences:
            logger.warning(f"[INSTANCE {ipcModules._instance_id}] No sentences to extract from")
            return []
        
        try:
            # Handle single query string or list of queries
            if isinstance(query, list):
                query_text = " ".join(query) if query else ""
            else:
                query_text = str(query) if query else ""
            
            if not query_text.strip():
                logger.warning(f"[INSTANCE {ipcModules._instance_id}] Empty query provided")
                return sentences[:min(5, len(sentences))]
            
            query_emb = self.embed_model.encode(
                query_text,
                convert_to_numpy=True,
                normalize_embeddings=True
            )
            
            # Ensure query embedding is 1D
            if len(query_emb.shape) > 1:
                query_emb = query_emb.squeeze()
            
            sent_emb = self.embed_model.encode(
                sentences,
                convert_to_numpy=True,
                normalize_embeddings=True,
                batch_size=batch_size,
                show_progress_bar=False
            )
            
            # Ensure sent_emb is 2D
            if len(sent_emb.shape) == 1:
                sent_emb = sent_emb.reshape(1, -1)
            
            # Validate shapes before dot product
            if sent_emb.shape[1] != query_emb.shape[0]:
                logger.warning(
                    f"[INSTANCE {ipcModules._instance_id}] Embedding dimension mismatch: "
                    f"sent_emb shape={sent_emb.shape}, query_emb shape={query_emb.shape}. "
                    f"Returning top sentences by length"
                )
                # Fallback: return sentences by word count
                ranked = sorted(
                    zip(sentences, [len(s.split()) for s in sentences]),
                    key=lambda x: x[1],
                    reverse=True
                )
                return [s for s, _ in ranked[:min(10, len(ranked))]]
            
            scores = np.dot(sent_emb, query_emb)
            
            ranked = sorted(zip(sentences, scores), key=lambda x: x[1], reverse=True)
            top_k = min(len(ranked) // 2 + 1, len(ranked))
            
            result = ranked[:top_k]
            logger.info(f"[INSTANCE {ipcModules._instance_id}] Extracted {len(result)} relevant sentences")
            return result
        except Exception as e:
            logger.error(f"[INSTANCE {ipcModules._instance_id}] extract_relevant error: {e}", exc_info=True)
            # Fallback: return first few sentences
            return sentences[:min(5, len(sentences))]



    


class searchPortManager:
    def __init__(self, start_port=10000, end_port=19999):
        self.start_port = start_port
        self.end_port = end_port
        self.used_ports = set()
        self.lock = threading.Lock()
    def get_port(self):
        with self.lock:
            for _ in range(100):  
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
        with self.lock:
            if port in self.used_ports:
                self.used_ports.remove(port)
                print(f"[PORT] Released port {port}. Active ports: {len(self.used_ports)}")
            else:
                print(f"[PORT] Warning: Attempted to release port {port} that wasn't tracked")

    def get_status(self):
        with self.lock:
            return {
                "active_ports": len(self.used_ports),
                "used_ports": list(self.used_ports),
                "available_range": f"{self.start_port}-{self.end_port}"
            }
class SearchAgentPool:
    def __init__(self, pool_size=1, max_tabs_per_agent=20):  
        self.pool_size = pool_size
        self.max_tabs_per_agent = max_tabs_per_agent
        self.text_agents = []
        self.image_agents = []
        self.text_agent_tabs = []  
        self.image_agent_tabs = []
        self.lock = asyncio.Lock()
        self.initialized = False
    
    async def initialize_pool(self):
        if self.initialized:
            return
            
        print(f"[POOL] Cold-starting {self.pool_size} text and image agents...")

        for i in range(self.pool_size):
            agent = YahooSearchAgentText()
            await agent.start()
            self.text_agents.append(agent)
            self.text_agent_tabs.append(0)  
            print(f"[POOL] Text agent {i} ready for cold start (max {self.max_tabs_per_agent} tabs)")
            
        for i in range(self.pool_size):
            agent = YahooSearchAgentImage()
            await agent.start()
            self.image_agents.append(agent)
            self.image_agent_tabs.append(0)
            print(f"[POOL] Image agent {i} ready for cold start (max {self.max_tabs_per_agent} tabs)")
            
        self.initialized = True
        print(f"[POOL] Cold start complete - agents ready for immediate use")
    
    async def get_text_agent(self):
        async with self.lock:
            min_tabs = min(self.text_agent_tabs)
            agent_idx = self.text_agent_tabs.index(min_tabs)
            
            if self.text_agent_tabs[agent_idx] >= self.max_tabs_per_agent:
                print(f"[POOL] Restarting text agent {agent_idx} after {self.text_agent_tabs[agent_idx]} tabs")
                try:
                    await self.text_agents[agent_idx].close()
                except Exception as e:
                    print(f"[POOL] Error closing old text agent: {e}")
                
                new_agent = YahooSearchAgentText()
                await new_agent.start()
                self.text_agents[agent_idx] = new_agent
                self.text_agent_tabs[agent_idx] = 0
                print(f"[POOL] Text agent {agent_idx} restarted and ready")

            print(f"[POOL] Using text agent {agent_idx} (will open tab #{self.text_agent_tabs[agent_idx] + 1})")
            return self.text_agents[agent_idx], agent_idx
    
    async def get_image_agent(self):
        async with self.lock:
            min_tabs = min(self.image_agent_tabs)
            agent_idx = self.image_agent_tabs.index(min_tabs)
            
            # Check if agent needs restart after 20 tabs
            if self.image_agent_tabs[agent_idx] >= self.max_tabs_per_agent:
                print(f"[POOL] Restarting image agent {agent_idx} after {self.image_agent_tabs[agent_idx]} tabs")
                try:
                    await self.image_agents[agent_idx].close()
                except Exception as e:
                    print(f"[POOL] Error closing old image agent: {e}")
                
                # Create and start new agent
                new_agent = YahooSearchAgentImage()
                await new_agent.start()
                self.image_agents[agent_idx] = new_agent
                self.image_agent_tabs[agent_idx] = 0
                print(f"[POOL] Image agent {agent_idx} restarted and ready")
            
            print(f"[POOL] Using image agent {agent_idx} (will open tab #{self.image_agent_tabs[agent_idx] + 1})")
            return self.image_agents[agent_idx], agent_idx
    
    def increment_tab_count(self, agent_type: str, agent_idx: int):
        """Increment tab count after successful tab creation"""
        if agent_type == "text":
            self.text_agent_tabs[agent_idx] += 1
            print(f"[POOL] Text agent {agent_idx} now has {self.text_agent_tabs[agent_idx]} tabs")
        elif agent_type == "image":
            self.image_agent_tabs[agent_idx] += 1
            print(f"[POOL] Image agent {agent_idx} now has {self.image_agent_tabs[agent_idx]} tabs")
    
    async def get_status(self):
        
        async with self.lock:
            return {
                "initialized": self.initialized,
                "pool_size": self.pool_size,
                "max_tabs_per_agent": self.max_tabs_per_agent,
                "text_agents": {
                    "count": len(self.text_agents),
                    "tabs": self.text_agent_tabs.copy()
                },
                "image_agents": {
                    "count": len(self.image_agents), 
                    "tabs": self.image_agent_tabs.copy()
                }
            }
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
            search_url = f"https://search.yahoo.com/search?p={quote(query)}&fr=yfp-t&fr2=p%3Afp%2Cm%3Asb&fp=1"
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
        print(results)
        return results

    async def youtube_transcript_url(self, url, agent_idx=None):
        page = None
        try:
            self.tab_count += 1
            print(f"[SEARCH] Opening tab #{self.tab_count} on port {self.custom_port} for url: '{url}'")
            
            transcript_url = None
            page = await self.context.new_page()
            search_url = f"{url}"
            await page.goto(search_url, timeout=50000)
            await handle_accept_popup(page)
            page.on("request", lambda req: capture_url(req, lambda url: set_transcript(url)))

            def capture_url(req, callback):
                url = req.url
                if (
                    "timedtext" in url or
                    "texttrack" in url or
                    "caption" in url
                ):
                    callback(url)

            def set_transcript(url):
                nonlocal transcript_url
                transcript_url = url

            await page.goto(url, wait_until="networkidle")
            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            await page.wait_for_timeout(random.randint(1000, 2000))

            await page.wait_for_selector("button.ytp-subtitles-button.ytp-button", timeout=55000)
            await page.click('button.ytp-subtitles-button.ytp-button')
            await page.wait_for_timeout(6000)
            print(f"[SEARCH] Tab #{self.tab_count} has found transcript fetch url of  the video url {url}  on port {self.custom_port}")
            
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
        
        return transcript_url

    async def youtube_metadata(self, url, agent_idx=None):
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
            print(f"[SEARCH] Opening tab #{self.tab_count} on port {self.custom_port} for url: '{url}'")
            
            # Open new tab for this search
            page = await self.context.new_page()
            search_url = f"{url}"
            await page.goto(search_url, timeout=50000)

            # Handle "Accept" popup
            await handle_accept_popup(page)

            # Simulate human behavior
            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            await page.wait_for_timeout(random.randint(1000, 2000))

            await page.wait_for_selector("div#title > h1 > yt-formatted-string.ytd-watch-metadata", timeout=55000)

            meta_title_elements = await page.query_selector_all("div#title > h1 > yt-formatted-string.ytd-watch-metadata")
            meta_title = None
            if meta_title_elements:
                meta_title = await meta_title_elements[0].text_content()
            else:
                meta_title = ""

            print(f"[SEARCH] Tab #{self.tab_count} has found video with the url {url}  on port {self.custom_port}")
            
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
        
        return meta_title
    

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

            await page.wait_for_selector("div.sres-cntr > ul#sres > li.ld > a.redesign-img > img", timeout=5000)

            img_elements = await page.query_selector_all("div.sres-cntr > ul#sres > li.ld > a.redesign-img > img")
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


class accessSearchAgents:
    def __init__(self):
        pass
    
    async def _async_web_search(self, query):
        if not agent_pool.initialized:
            await agent_pool.initialize_pool()
        
        agent, agent_idx = await agent_pool.get_text_agent()
        results = await agent.search(query, max_links=MAX_LINKS_TO_TAKE, agent_idx=agent_idx)
        return results
    
    async def _async_get_youtube_metadata(self, url):
        if not agent_pool.initialized:
            await agent_pool.initialize_pool()
        
        agent, agent_idx = await agent_pool.get_text_agent()
        results = await agent.youtube_metadata(url, agent_idx=agent_idx)
        return results
    
    async def _async_get_youtube_transcript_url(self, url):
        if not agent_pool.initialized:
            await agent_pool.initialize_pool()
        
        agent, agent_idx = await agent_pool.get_text_agent()
        results = await agent.youtube_transcript_url(url, agent_idx=agent_idx)
        return results
    
    async def _async_image_search(self, query, max_images=10):
        if not agent_pool.initialized:
            await agent_pool.initialize_pool()
        
        agent, agent_idx = await agent_pool.get_image_agent()
        results = await agent.search_images(query, max_images, agent_idx=agent_idx)
        if results:
            return json.dumps({f"yahoo_source_{i}": [url] for i, url in enumerate(results)})
        else:
            return json.dumps({})
    
    async def _async_get_agent_pool_status(self):
        return await agent_pool.get_status()

    def web_search(self, query):
        return run_async_on_bg_loop(self._async_web_search(query))
    
    def get_youtube_metadata(self, url):
        return run_async_on_bg_loop(self._async_get_youtube_metadata(url))
    
    def image_search(self, query, max_images=10):
        return run_async_on_bg_loop(self._async_image_search(query, max_images))
    
    def get_transcript_url(self, url):
        return run_async_on_bg_loop(self._async_get_youtube_transcript_url(url))
    
    def get_agent_pool_status(self):
        return run_async_on_bg_loop(self._async_get_agent_pool_status())

    
def get_port_status():
    return port_manager.get_status()


port_manager = searchPortManager(start_port=10000, end_port=19999)
agent_pool = SearchAgentPool(pool_size=1, max_tabs_per_agent=20)
_event_loop = None
_event_loop_thread = None
_event_loop_lock = threading.Lock()

def _ensure_background_loop():
    global _event_loop, _event_loop_thread
    with _event_loop_lock:
        if _event_loop is None:
            _event_loop = asyncio.new_event_loop()
            def _run_loop(loop):
                asyncio.set_event_loop(loop)
                loop.run_forever()
            _event_loop_thread = threading.Thread(target=_run_loop, args=(_event_loop,), daemon=True)
            _event_loop_thread.start()
            timeout = 0.5
            t0 = time.time()
            while not _event_loop.is_running() and time.time() - t0 < timeout:
                time.sleep(0.01)
    return _event_loop

def run_async_on_bg_loop(coro):
    loop = _ensure_background_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result()

async def _close_all_agents():
    text_agents = list(agent_pool.text_agents)
    image_agents = list(agent_pool.image_agents)
    for a in text_agents:
        try:
            await a.close()
        except Exception as e:
            print(f"[WARN] Error closing text agent: {e}")
    for a in image_agents:
        try:
            await a.close()
        except Exception as e:
            print(f"[WARN] Error closing at image agent: {e}")
    agent_pool.text_agents.clear()
    agent_pool.image_agents.clear()
    agent_pool.text_agent_tabs.clear()
    agent_pool.image_agent_tabs.clear()
    agent_pool.initialized = False

def shutdown_graceful(timeout=5):
    global _event_loop, _event_loop_thread
    try:  
        if _event_loop is None:
            return
        try:
            run_async_on_bg_loop(_close_all_agents())
        except Exception as e:
            print(f"[WARN] Error during agent close: {e}")
        loop = _event_loop
        def _stop_loop():
            for task in asyncio.all_tasks(loop):
                try:
                    task.cancel()
                except Exception:
                    pass
            loop.stop()
        loop.call_soon_threadsafe(_stop_loop)
        if _event_loop_thread is not None:
            _event_loop_thread.join(timeout)
    except Exception as e:
        print(f"[ERROR] shutdown_graceful failed: {e}")
    finally:
        _event_loop = None
        _event_loop_thread = None
        
atexit.register(shutdown_graceful)

class CacheCleanupJob:
    def __init__(self, cache_dir=BASE_CACHE_DIR, max_age_minutes=10, check_interval_minutes=5):
        self.cache_dir = cache_dir
        self.max_age_seconds = max_age_minutes * 60
        self.check_interval_minutes = check_interval_minutes
        self.scheduler_thread = None
        self.running = False
    
    def cleanup_old_cache(self):
        if not os.path.exists(self.cache_dir):
            return
        
        current_time = time.time()
        try:
            for folder in os.listdir(self.cache_dir):
                folder_path = os.path.join(self.cache_dir, folder)
                if os.path.isdir(folder_path):
                    folder_age = current_time - os.path.getmtime(folder_path)
                    if folder_age > self.max_age_seconds:
                        try:
                            # Handle permission issues on Linux
                            for root, dirs, files in os.walk(folder_path, topdown=False):
                                for file in files:
                                    file_path = os.path.join(root, file)
                                    os.chmod(file_path, stat.S_IWUSR | stat.S_IRUSR)
                                    os.remove(file_path)
                                for dir in dirs:
                                    dir_path = os.path.join(root, dir)
                                    os.chmod(dir_path, stat.S_IWUSR | stat.S_IRUSR | stat.S_IXUSR)
                                    os.rmdir(dir_path)
                            os.rmdir(folder_path)
                            print(f"[CACHE] Deleted old cache folder: {folder_path}")
                        except Exception as e:
                            print(f"[CACHE] Error deleting {folder_path}: {e}")
        except Exception as e:
            print(f"[CACHE] Error during cleanup: {e}")
    
    def _run_scheduler(self):
        schedule.every(self.check_interval_minutes).minutes.do(self.cleanup_old_cache)
        while self.running:
            schedule.run_pending()
            time.sleep(1)
    
    def start(self):
        if not self.running:
            self.running = True
            self.scheduler_thread = threading.Thread(target=self._run_scheduler, daemon=True)
            self.scheduler_thread.start()
            print(f"[CACHE] Cleanup job started - checking every {self.check_interval_minutes} minutes for folders older than {self.max_age_seconds // 60} minutes")
    
    def stop(self):
        self.running = False
        self.cleanup_old_cache()
        print("[CACHE] Cleanup job stopped and final cache cleared")


if __name__ == "__main__":
    class modelManager(BaseManager): pass
    modelManager.register("ipcService", ipcModules)
    modelManager.register("accessSearchAgents", accessSearchAgents)
    agent_pool = SearchAgentPool(pool_size=1, max_tabs_per_agent=20)
    manager = modelManager(address=("localhost", 5010), authkey=b"ipcService")
    server = manager.get_server()
    logger.info("Ipc started on port 5010...")

    try:
        _ensure_background_loop()
        run_async_on_bg_loop(agent_pool.initialize_pool())
    except Exception as e:
        print(f"[ERROR] Failed to initialize agent pool: {e}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[INFO] KeyboardInterrupt received - shutting down gracefully...")
    except Exception as e:
        print(f"[ERROR] Server error: {e}")
    finally:
        shutdown_graceful()
        print("[INFO] Shutdown completed.")
