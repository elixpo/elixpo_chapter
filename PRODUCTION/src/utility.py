
import random
from collections import deque
import asyncio 
from loguru import logger
import json
from yahooSearch import YahooSearchAgentText, YahooSearchAgentImage, ddgs_search, mojeek_form_search, ddgs_search_module_search
from getYoutubeDetails import get_youtube_metadata, get_youtube_transcript
from scrape import fetch_full_text
import concurrent 
import os

_deepsearch_store = {}

class SearchAgentManager:
    def __init__(self, max_concurrent_agents=10):
        self.max_concurrent_agents = max_concurrent_agents
        self.active_text_agents = 0
        self.active_image_agents = 0
        self.text_queue = deque()
        self.image_queue = deque()
        self.text_lock = asyncio.Lock()
        self.image_lock = asyncio.Lock()
        self.port_range_start = 9000
        self.port_range_end = 9999
        self.used_ports = set()
        
    def _get_random_port(self):
        while True:
            port = random.randint(self.port_range_start, self.port_range_end)
            if port not in self.used_ports:
                self.used_ports.add(port)
                return port
    
    def _release_port(self, port):
        self.used_ports.discard(port)
    
    async def get_text_search_result(self, query, max_links=10):
        async with self.text_lock:
            # Try Yahoo first
            if self.active_text_agents < self.max_concurrent_agents:
                self.active_text_agents += 1
                port = self._get_random_port()
                try:
                    logger.info(f"Creating new Yahoo text agent on port {port} for query: {query}")
                    agent = YahooSearchAgentText(custom_port=port)
                    await agent.start()
                    await asyncio.sleep(random.uniform(1, 3))
                    results = await agent.search(query, max_links)
                    if results:
                        logger.info(f"Yahoo search completed for '{query}' with {len(results)} results")
                        return results
                    else:
                        logger.warning(f"Yahoo search returned no results for '{query}'. Trying DDGS fallback.")
                except Exception as e:
                    logger.error(f"Yahoo search failed for '{query}': {e}. Trying DDGS fallback.")
                finally:
                    try:
                        await agent.close()
                    except:
                        pass
                    self.active_text_agents -= 1
                    self._release_port(port)
                    logger.info(f"Text agent on port {port} closed. Active agents: {self.active_text_agents}")
            else:
                logger.warning(f"Max concurrent text agents reached ({self.max_concurrent_agents}). Queueing request for: {query}")
                await asyncio.sleep(random.uniform(2, 5))
                return await self.get_text_search_result(query, max_links)

        # Fallback 1: DDGS
        try:
            logger.info(f"Trying DDGS fallback for: {query}")
            ddgs_results = ddgs_search_module_search(query)
            if ddgs_results:
                logger.info(f"DDGS fallback returned {len(ddgs_results)} results for '{query}'")
                return ddgs_results[:max_links]
            else:
                logger.warning(f"DDGS fallback returned no results for '{query}'. Trying Mojeek fallback.")
        except Exception as e:
            logger.error(f"DDGS fallback failed for '{query}': {e}. Trying Mojeek fallback.")

        # Fallback 2: Mojeek
        try:
            logger.info(f"Trying Mojeek fallback for: {query}")
            mojeek_results = mojeek_form_search(query)
            if mojeek_results:
                logger.info(f"Mojeek fallback returned {len(mojeek_results)} results for '{query}'")
                return mojeek_results[:max_links]
            else:
                logger.warning(f"Mojeek fallback returned no results for '{query}'.")
        except Exception as e:
            logger.error(f"Mojeek fallback failed for '{query}': {e}")

        logger.error(f"All search engines failed for query: '{query}'")
        return []
                    
    
    async def get_image_search_result(self, query, max_images=10):
        """Get image search results with agent management and queueing"""
        async with self.image_lock:
            if self.active_image_agents < self.max_concurrent_agents:
                self.active_image_agents += 1
                port = self._get_random_port()
                
                try:
                    logger.info(f"Creating new image agent on port {port} for query: {query}")
                    agent = YahooSearchAgentImage(custom_port=port)
                    await agent.start()
                    await asyncio.sleep(random.uniform(1, 3))
                    
                    results = await agent.search_images(query, max_images)
                    logger.info(f"Image search completed for '{query}' with {len(results)} results")
                    if results:
                        result_dict = {f"yahoo_source_{i}": [url] for i, url in enumerate(results)}
                        return json.dumps(result_dict)
                    else:
                        return json.dumps({})
                    
                except Exception as e:
                    logger.error(f"Image search failed for '{query}': {e}")
                    return json.dumps({})
                    
                finally:
                    try:
                        await agent.close()
                    except:
                        pass
                    self.active_image_agents -= 1
                    self._release_port(port)
                    logger.info(f"Image agent on port {port} closed. Active agents: {self.active_image_agents}")
            
            else:
                logger.warning(f"Max concurrent image agents reached ({self.max_concurrent_agents}). Queueing request for: {query}")
                await asyncio.sleep(random.uniform(2, 5))
                return await self.get_image_search_result(query, max_images)
    
    async def get_agent_status(self):
        """Get current status of agents"""
        async with self.text_lock:
            text_count = self.active_text_agents
        async with self.image_lock:
            image_count = self.active_image_agents
        
        return {
            "active_text_agents": text_count,
            "active_image_agents": image_count,
            "total_active": text_count + image_count,
            "max_concurrent": self.max_concurrent_agents,
            "used_ports": len(self.used_ports)
        }

agent_manager = SearchAgentManager(max_concurrent_agents=10)

async def web_search(query, agent=None):
    return await agent_manager.get_text_search_result(query, max_links=5)

async def image_search(query, agent=None, max_images=10):
    return await agent_manager.get_image_search_result(query, max_images)

def fetch_url_content_parallel(urls, max_workers=10):
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_full_text, url): url for url in urls}
        results = ""
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                text_content = future.result()
                clean_text = str(text_content).encode('unicode_escape').decode('utf-8')
                clean_text = clean_text.replace('\\n', ' ').replace('\\r', ' ').replace('\\t', ' ')
                clean_text = ''.join(c for c in clean_text if c.isprintable())
                results += f"\nURL: {url}\nText Preview: {clean_text.strip()}"
            except Exception as e:
                logger.error(f"Failed fetching {url}: {e}")
                results += f"\nURL: {url}\n Failed to fetch content of this URL"
        logger.info(f"Fetched all URL information in parallel.")
        return results

def fetch_youtube_parallel(urls, mode='metadata', max_workers=10):
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        if mode == 'metadata':
            futures = {executor.submit(get_youtube_metadata, url): url for url in urls}
        else:
            futures = {executor.submit(get_youtube_transcript, url): url for url in urls}

        results = {}
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                results[url] = future.result()
            except Exception as e:
                logger.error(f"YouTube {mode} failed for {url}: {e}")
                results[url] = '[Failed]'
        return results





def storeDeepSearchQuery(query: list, sessionID: str):
    """Store deep search queries in RAM (in-memory dictionary)."""
    _deepsearch_store[sessionID] = query

def getDeepSearchQuery(sessionID: str):
    """Retrieve deep search query for a session from memory."""
    return _deepsearch_store.get(sessionID)
def cleanDeepSearchQuery(sessionID: str):
    """Clean up deep search query for a session from memory."""
    if sessionID in _deepsearch_store:
        del _deepsearch_store[sessionID]