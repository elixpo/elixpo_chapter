import asyncio
import json
import logging
from typing import AsyncGenerator, Dict, List, Optional, Tuple
from datetime import datetime, timezone
import random
import time
import numpy as np
from multiprocessing.managers import BaseManager
from nltk.tokenize import sent_tokenize

from dotenv import load_dotenv
import os
import requests

from session_manager import SessionManager
from tools import tools
from rag_engine import RAGEngine

from utility import cleanQuery, webSearch, fetch_url_content_parallel, rank_results, extract_and_rank_sentences, build_final_response
from getImagePrompt import generate_prompt_from_image, replyFromImage
from getYoutubeDetails import transcribe_audio, youtubeMetadata
from getTimeZone import get_local_time
from utility import imageSearch
from config import POLLINATIONS_ENDPOINT

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("production-pipeline")

POLLINATIONS_TOKEN = os.getenv("TOKEN")
MODEL = "gemini=fast"

class IpcModelManager(BaseManager):
    pass

IpcModelManager.register("ipcService")
IpcModelManager.register("accessSearchAgents")

_ipc_manager = None
_ipc_service = None
_search_service = None

def _connect_ipc():
    global _ipc_manager, _ipc_service, _search_service
    if _ipc_manager is None:
        try:
            _ipc_manager = IpcModelManager(address=("localhost", 5010), authkey=b"ipcService")
            _ipc_manager.connect()
            _ipc_service = _ipc_manager.ipcService()
            _search_service = _ipc_manager.accessSearchAgents()
            logger.info("[IPC] Connected to model server")
        except Exception as e:
            logger.warning(f"[IPC] Connection failed: {e}")
            raise

def get_ipc_service():
    global _ipc_service
    if _ipc_service is None:
        _connect_ipc()
    return _ipc_service


class ProductionPipeline:
    
    def __init__(self):
        self.session_manager: Optional[SessionManager] = None
        self.rag_engine: Optional[RAGEngine] = None
        self.initialized = False
        logger.info("[Pipeline] Initialized")
    
    async def initialize(self):
        if self.initialized:
            return
        
        logger.info("[Pipeline] Starting initialization...")
        
        try:
            _connect_ipc()
            logger.info("[Pipeline] IPC connected")
        except Exception as e:
            logger.warning(f"[Pipeline] IPC connection warning: {e}")
        
        self.session_manager = SessionManager(max_sessions=1000, ttl_minutes=30)
        self.rag_engine = RAGEngine(self.session_manager, top_k_entities=15)
        
        self.initialized = True
        logger.info("[Pipeline] Ready")
    
    async def process_request(
        self,
        query: str,
        image_url: Optional[str] = None,
        session_id: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        
        if not self.initialized:
            await self.initialize()
        
        if not session_id:
            session_id = self.session_manager.create_session(query)
        
        log_prefix = f"[{request_id or session_id}]" if request_id else f"[{session_id}]"
        logger.info(f"{log_prefix} Processing: {query[:50]}...")
        
        session = self.session_manager.get_session(session_id)
        if not session:
            yield self._format_sse("error", "Session failed")
            return
        
        try:
            ipc_service = get_ipc_service()
            
            yield self._format_sse("info", "<TASK>Analyzing query...</TASK>")
            websites, youtube_urls, cleaned_query = cleanQuery(query)
            session.web_search_urls.extend(websites)
            session.youtube_urls.extend(youtube_urls)
            
            # Check if query contains location (for timezone queries)
            location_detected = False
            if any(word in cleaned_query.lower() for word in ['time', 'timezone', 'location', 'when']):
                location_detected = True
            
            image_prompt = None
            if image_url:
                yield self._format_sse("info", "<TASK>Processing image...</TASK>")
                self.session_manager.log_tool_execution(session_id, "image")
                try:
                    image_prompt = await asyncio.to_thread(generate_prompt_from_image, image_url)
                    
                    # Also get direct reply from image for the query
                    image_reply = await asyncio.to_thread(replyFromImage, image_url, cleaned_query)
                    if image_reply:
                        filtered_reply = image_reply[:1000] if len(image_reply) > 1000 else image_reply
                        self.session_manager.add_content_to_session(session_id, f"[Image Analysis]", filtered_reply)
                    
                    combined_query = f"{cleaned_query} {image_prompt}" if cleaned_query else image_prompt
                except Exception as e:
                    logger.warning(f"{log_prefix} Image error: {e}")
                    combined_query = cleaned_query
            else:
                combined_query = cleaned_query
            
            # Handle timezone/location queries
            if location_detected:
                yield self._format_sse("info", "<TASK>Getting location info...</TASK>")
                try:
                    self.session_manager.log_tool_execution(session_id, "get_local_time")
                    # Extract potential location from query
                    location_words = [word for word in cleaned_query.split() if len(word) > 2]
                    if location_words:
                        local_time = await asyncio.to_thread(get_local_time, location_words[-1])
                        if local_time:
                            self.session_manager.add_content_to_session(session_id, f"[Location Info]", str(local_time)[:500])
                except Exception as e:
                    logger.warning(f"{log_prefix} Location error: {e}")
            
            yield self._format_sse("info", "<TASK>Searching...</TASK>")
            self.session_manager.log_tool_execution(session_id, "web_search")
            
            search_results = webSearch(combined_query)
            if isinstance(search_results, list):
                session.web_search_urls.extend(search_results)
                ranked_urls = await rank_results(combined_query, search_results[:15], ipc_service)
                fetch_urls = [url for url, _ in ranked_urls[:8]]
            else:
                fetch_urls = [search_results] if search_results else []
            
            if fetch_urls:
                yield self._format_sse("info", "<TASK>Fetching content in parallel...</TASK>")
                self.session_manager.log_tool_execution(session_id, "fetch_url_content_parallel")
                
                try:
                    # Use parallel fetching for better performance
                    aggregated_results, kg_data_list = await asyncio.to_thread(
                        fetch_url_content_parallel,
                        [combined_query],
                        fetch_urls,
                        max_workers=8,
                        use_kg=True,
                        request_id=request_id
                    )
                    
                    # Add aggregated content to session
                    if aggregated_results:
                        aggregated_content = aggregated_results[:3000]
                        self.session_manager.add_content_to_session(session_id, "[Parallel Fetch Results]", aggregated_content)
                        logger.debug(f"{log_prefix} Added aggregated content: {len(aggregated_content)} chars")
                    
                    # Track KG data from parallel fetch
                    if kg_data_list:
                        logger.info(f"{log_prefix} Extracted KG data from {len(kg_data_list)} sources")
                        # Add each source's KG data separately for better session tracking
                        for idx, kg_data in enumerate(kg_data_list[:5]):  # Top 5 sources
                            if kg_data and "entities" in kg_data:
                                try:
                                    # Reconstruct a simple JSON representation for session
                                    source_label = f"[KG Source {idx+1}]"
                                    entity_text = json.dumps(kg_data.get("entities", {}))[:500]
                                    self.session_manager.add_content_to_session(session_id, source_label, entity_text)
                                except Exception as kg_e:
                                    logger.debug(f"{log_prefix} Could not add KG data: {kg_e}")
                    
                    for url in fetch_urls:
                        session.fetched_urls.append(url)
                    
                    yield self._format_sse("info", f"<TASK>Processed {len(fetch_urls)} sources</TASK>")
                    logger.info(f"{log_prefix} Parallel fetch completed for {len(fetch_urls)} URLs")
                    
                except Exception as e:
                    logger.warning(f"{log_prefix} Parallel fetch error: {e}")
                    logger.debug(f"{log_prefix} Falling back to sequential fetching...")
                    # Fallback to sequential fetching
                    from search import fetch_full_text
                    for url in fetch_urls:
                        try:
                            content = await asyncio.to_thread(fetch_full_text, url, request_id=request_id)
                            if content:
                                top_sents = await extract_and_rank_sentences(
                                    url, content, combined_query, ipc_service
                                )
                                filtered_content = " ".join(top_sents) if top_sents else content[:2000]
                                self.session_manager.add_content_to_session(session_id, url, filtered_content)
                                yield self._format_sse("info", f"<TASK>Processed {len(session.fetched_urls)} sources</TASK>")
                        except Exception as url_e:
                            logger.warning(f"{log_prefix} Fetch error for {url}: {url_e}")
                            session.add_error(f"Fetch failed: {str(url_e)[:100]}")
            
            if session.youtube_urls:
                yield self._format_sse("info", "<TASK>Processing videos...</TASK>")
                for yt_url in session.youtube_urls[:2]:
                    try:
                        self.session_manager.log_tool_execution(session_id, "youtube")
                        
                        # Get metadata first
                        try:
                            yt_metadata = await asyncio.to_thread(youtubeMetadata, yt_url)
                            if yt_metadata:
                                self.session_manager.add_content_to_session(session_id, f"[YT Metadata: {yt_url}]", str(yt_metadata)[:500])
                        except Exception as meta_e:
                            logger.warning(f"{log_prefix} YouTube metadata error: {meta_e}")
                        
                        # Then transcribe
                        transcript = await asyncio.to_thread(
                            transcribe_audio, 
                            yt_url, 
                            full_transcript=False, 
                            query=combined_query
                        )
                        if transcript:
                            top_sents = await extract_and_rank_sentences(
                                yt_url, transcript, combined_query, ipc_service
                            )
                            filtered_transcript = " ".join(top_sents) if top_sents else transcript[:2000]
                            self.session_manager.add_content_to_session(session_id, yt_url, filtered_transcript)
                    except Exception as e:
                        logger.warning(f"{log_prefix} YouTube error for {yt_url}: {e}")
                        session.add_error(f"YouTube failed: {str(e)[:100]}")
            
            if not image_url and (image_prompt or combined_query):
                yield self._format_sse("info", "<TASK>Finding images...</TASK>")
                try:
                    self.session_manager.log_tool_execution(session_id, "image_search")
                    image_results = await asyncio.to_thread(imageSearch, combined_query, max_images=5)
                    if image_results:
                        session.images.extend(image_results if isinstance(image_results, list) else [image_results])
                except Exception as e:
                    logger.warning(f"{log_prefix} Image search error: {e}")
            
            yield self._format_sse("info", "<TASK>Building KG...</TASK>")
            logger.info(f"{log_prefix} Building RAG context from {len(session.fetched_urls)} fetched URLs")
            logger.debug(f"{log_prefix} Session has {len(session.processed_content)} processed documents")
            
            rag_context = self.rag_engine.build_rag_prompt_enhancement(session_id)
            rag_stats = self.rag_engine.get_summary_stats(session_id)
            logger.info(f"{log_prefix} KG built - Stats: {rag_stats}")
            logger.debug(f"{log_prefix} RAG context length: {len(rag_context)} characters")
            
            yield self._format_sse("info", "<TASK>Generating response...</TASK>")
            logger.info(f"{log_prefix} Starting LLM response generation...")
            
            response_content = await self._generate_llm_response(
                query=combined_query,
                rag_context=rag_context,
                session_id=session_id,
                image_url=image_url,
                request_id=request_id
            )
            
            logger.info(f"{log_prefix} Response generated: {len(response_content)} characters")
            yield self._format_sse("info", "<TASK>SUCCESS</TASK>")
            
            final_response = build_final_response(
                response_content,
                session,
                rag_stats
            )
            
            yield self._format_sse("final", final_response)
            
            logger.info(f"{log_prefix} Complete")
            
        except Exception as e:
            logger.error(f"{log_prefix} Error: {e}", exc_info=True)
            session.add_error(f"Pipeline error: {str(e)}")
            yield self._format_sse("error", "Request failed. Retry.")
    
    async def _generate_llm_response(
        self,
        query: str,
        rag_context: str,
        session_id: str,
        image_url: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> str:
        
        current_utc_time = datetime.now(timezone.utc)
        
        system_prompt = f"""
Mission: Provide comprehensive, detailed, and well-researched answers that synthesize ALL gathered information into rich content.

CRITICAL CONTENT REQUIREMENTS:
- Write detailed, substantive responses (minimum 800 words for substantial topics)
- SYNTHESIZE information from all tools into the main answer content
- Include specific facts, data, statistics, examples from your research
- Structure responses with clear sections and detailed explanations
- The main content should be 80% of your response, sources only 20%
- Time Context if needed use this information to resolve any time related queries: {current_utc_time}
- Mention time of the respective location if user query is time related.

RESPONSE PRIORITY ORDER:
1. **Comprehensive Main Answer** (most important - detailed analysis)
2. **Supporting Details & Context** (from research findings)
3. **Images** (when applicable)
4. **Sources** (minimal, at the end)

KNOWLEDGE GRAPH CONTEXT (Primary Source of Truth):
{rag_context}

USE TOOLS STRATEGICALLY:
Answer directly if you know the answer (basic facts, math, general knowledge) — no tools needed.
Use tools when:
- Query needs recent info (weather, news, stocks, etc.)
- Current events or time-sensitive information
- User provides an image
- Explicit research requested
- Unknown names or new names not in your training data
- In-depth explanations requiring up-to-date data

**MANDATORY WEB SEARCH RULE**: If you encounter ANY person's name, company, product, location, event, or concept that you are NOT 100% certain about or that might be new/recent, you MUST use web_search. When in doubt about ANY information, always search first. This includes:
- People's names (celebrities, politicians, professionals, etc.)
- Company names or brands
- Recent products or services
- Locations you're unsure about
- Events, incidents, or news
- Technical terms or concepts you're not completely familiar with
- Any proper nouns that could be recent or unfamiliar

When you use tools, INTEGRATE the results into your main response content, don't just list sources.

AVAILABLE TOOLS:
1. cleanQuery(query: str)
   - Clean and extract URLs from a search query
   - Returns: cleaned query, websites, youtube URLs

2. web_search(query: str)
   - Search the web for information
   - Optimized for speed, limit to 3-4 searches
   - Returns: list of relevant URLs and snippets

3. fetch_full_text(url: str)
   - Fetch full text content from a URL
   - Use to get detailed content from specific sources
   - Returns: full page content

4. transcribe_audio(url: str, full_transcript: bool, query: str)
   - Transcribe audio from a YouTube URL
   - Parameters: url (required), full_transcript (optional, boolean), query (optional)
   - Returns: transcript or query-relevant portions

5. get_local_time(location_name: str)
   - Get local time for a specific location
   - Use for time-zone specific queries
   - Returns: current local time and timezone info

6. generate_prompt_from_image(imageURL: str)
   - Generate a search prompt from an image URL
   - Analyzes image and creates a search query
   - Returns: generated search query string

7. replyFromImage(imageURL: str, query: str)
   - Reply to a query based on an image
   - Analyzes image content in context of query
   - Returns: detailed response based on image analysis

8. image_search(image_query: str, max_images: int)
   - Search for images based on a query
   - Default max_images: 10
   - Returns: list of image URLs

IMAGE HANDLING:
1. Text Only → Answer directly or web_search (NO image_search unless requested)
2. Image Only → generate_prompt + image_search(10) + detailed analysis
3. Image + Text → replyFromImage + image_search(5) + comprehensive response

WRITING STYLE:
- Rich, informative content with specific details
- Professional yet conversational tone
- Well-structured with clear sections
- Include ALL relevant information from research
- Make it comprehensive and thoroughly informative
- Sources should supplement, not dominate the response
"""
        
        user_message = f"""Based on research for this query, provide a comprehensive response:

Query: {query}
{"Image provided" if image_url else ""}

RETRIEVED SOURCES CONTENT:
"""
        
        # Add actual fetched content to the user message
        session = self.session_manager.get_session(session_id)
        if session and session.processed_content:
            source_content = []
            for url, content in list(session.processed_content.items())[:5]:  # Top 5 sources
                if content and len(content.strip()) > 20:
                    source_content.append(f"\n--- From {url} ---\n{content[:1000]}")
            
            if source_content:
                user_message += "\n".join(source_content)
            else:
                user_message += "(Processing content from sources...)"
        else:
            user_message += "(Processing content from sources...)"
        
        user_message += f"""

Requirements:
- Use the KG context provided above as primary source
- Integrate all researched information seamlessly
- Provide detailed, fact-rich response (minimum 800 words for substantial topics)
- Structure with clear sections and proper markdown
- Include specific facts, data, statistics, and examples
- 80% substantive content, 20% sources
- Make it comprehensive and thoroughly informative"""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        payload = {
            "model": MODEL,
            "messages": messages,
            "temperature": 0.7,
            "top_p": 1,
            "tools": tools,
            "tool_choice": "auto",
            "max_tokens": 3000,
            "seed": random.randint(1000, 9999),
            "stream": False,
        }
        
        log_prefix = f"[{request_id or session_id}]" if request_id else f"[{session_id}]"
        
        try:
            logger.info(f"{log_prefix} Calling LLM with timeout=60s, payload size: {len(str(payload))} bytes")
            
            response = await asyncio.to_thread(
                requests.post,
                POLLINATIONS_ENDPOINT,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {POLLINATIONS_TOKEN}"
                },
                timeout=60
            )
            
            logger.info(f"{log_prefix} LLM response status: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            
            if "choices" not in data or len(data["choices"]) == 0:
                logger.warning(f"{log_prefix} Unexpected LLM response format: {data}")
                return f"# Response\n\nThe system generated a response but in an unexpected format."
            
            content = data["choices"][0]["message"].get("content", "")
            if not content:
                logger.warning(f"{log_prefix} Empty content from LLM")
                return f"# Response\n\nUnable to generate detailed response. Please try again."
            
            logger.info(f"{log_prefix} LLM response received: {len(content)} characters")
            return content
        
        except asyncio.TimeoutError:
            logger.error(f"{log_prefix} LLM call timeout after 60s")
            return f"# Timeout\n\nThe response generation took too long. Please try a simpler query."
        except requests.exceptions.Timeout:
            logger.error(f"{log_prefix} LLM request timeout")
            return f"# Timeout\n\nThe response generation took too long. Please try a simpler query."
        except requests.exceptions.ConnectionError as e:
            logger.error(f"{log_prefix} LLM connection error: {e}")
            return f"# Connection Error\n\nCould not connect to the LLM service. Please try again."
        except Exception as e:
            logger.error(f"{log_prefix} LLM error: {type(e).__name__}: {e}")
            return f"# Error\n\nFailed to generate response: {str(e)[:200]}"
    
    @staticmethod
    def _format_sse(event: str, data: str) -> str:
        lines = data.splitlines()
        data_str = ''.join(f"data: {line}\n" for line in lines)
        return f"event: {event}\n{data_str}\n\n"


_production_pipeline: Optional[ProductionPipeline] = None


async def initialize_production_pipeline() -> ProductionPipeline:
    global _production_pipeline
    _production_pipeline = ProductionPipeline()
    await _production_pipeline.initialize()
    logger.info("[Pipeline] Global production pipeline initialized")
    return _production_pipeline


def get_production_pipeline() -> Optional[ProductionPipeline]:
    global _production_pipeline
    return _production_pipeline


if __name__ == "__main__":
   
    async def test_query():
        pipeline = await initialize_production_pipeline()
        
        # Simple weather query
        query = "What is the weather today in Kolkata"
        request_id = "test-weather-001"
        chunk_count = 0
        try:
            async for chunk in pipeline.process_request(
                query=query,
                image_url=None,
                session_id=None,
                request_id=request_id
            ):
                chunk_count += 1
                if chunk:
                    print(f"[Chunk {chunk_count}] {chunk[:100]}..." if len(chunk) > 100 else f"[Chunk {chunk_count}] {chunk}")
            
            print(f"\n{'='*60}")
            print(f"Pipeline Test Complete!")
            print(f"Total chunks received: {chunk_count}")
            print(f"{'='*60}\n")
            
        except Exception as e:
            print(f"Error during pipeline test: {e}")
            import traceback
            traceback.print_exc()
    
    # Run the async test
    try:
        asyncio.run(test_query())
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
    except Exception as e:
        print(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()


