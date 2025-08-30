import random
from collections import deque
import asyncio 
from loguru import logger
import json
from getYoutubeDetails import get_youtube_metadata, get_youtube_transcript
from scrape import fetch_full_text
import concurrent 
import os

_deepsearch_store = {}

# Remove the entire SearchAgentManager class since we have agent_pool in yahooSearch.py

# Simple wrapper functions that use the agent pool from yahooSearch
async def web_search(query, agent=None):
    from yahooSearch import web_search as yahoo_web_search
    return await yahoo_web_search(query)

async def image_search(query, agent=None, max_images=10):
    from yahooSearch import image_search as yahoo_image_search
    return await yahoo_image_search(query, max_images)

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

# Keep agent_manager for backward compatibility but make it use the agent pool
class DummyAgentManager:
    async def get_agent_status(self):
            from yahooSearch import get_agent_pool_status
            try:
                return await get_agent_pool_status()
            except Exception as e:
                return {"error": str(e), "agent_pool_status": "error"}

agent_manager = DummyAgentManager()

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