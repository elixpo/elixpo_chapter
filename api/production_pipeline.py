"""
Production Pipeline - Main orchestration for the ElixpoSearch system.

Architecture:
1. Initialize model server (hot-load all models at startup)
2. Per request: Create session with sessionID
3. Execute tools to gather information
4. Build local KG for session
5. Use RAG to enhance LLM prompts
6. Return comprehensive response
"""

import asyncio
import json
import logging
from typing import AsyncGenerator, Dict, List, Optional, Tuple
from datetime import datetime, timezone
import random
import time

from dotenv import load_dotenv
import os
import requests

from session_manager import SessionManager, get_session_manager
from rag_engine import RAGEngine, get_rag_engine
from model_server_manager import initialize_model_server, get_model_server
from knowledge_graph import build_knowledge_graph
from tools import tools

# Tool imports
from utility import cleanQuery, webSearch, fetch_url_content_parallel
from getImagePrompt import generate_prompt_from_image, replyFromImage
from getYoutubeDetails import transcribe_audio, youtubeMetadata
from getTimeZone import get_local_time
from utility import imageSearch

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("production-pipeline")

POLLINATIONS_ENDPOINT = os.getenv("POLLINATIONS_ENDPOINT", "https://enter.pollinations.ai/api/generate/v1/chat/completions")
POLLINATIONS_TOKEN = os.getenv("TOKEN")
MODEL = os.getenv("MODEL", "claude-3.5-sonnet")


class ProductionPipeline:
    """Main search and response pipeline with model pre-loading, sessions, and RAG"""
    
    def __init__(self, model_server=None):
        """
        Initialize production pipeline
        
        Args:
            model_server: Optional pre-initialized model server
        """
        self.model_server = model_server
        self.session_manager: Optional[SessionManager] = None
        self.rag_engine: Optional[RAGEngine] = None
        self.initialized = False
        logger.info("[ProductionPipeline] Initialized")
    
    async def initialize(self):
        """Initialize all components (called at server startup)"""
        if self.initialized:
            return
        
        logger.info("[ProductionPipeline] Starting initialization...")
        
        # Initialize model server (hot-load all models)
        logger.info("[ProductionPipeline] Initializing model server...")
        try:
            self.model_server = await initialize_model_server(pool_size=1, max_tabs=20)
            logger.info("[ProductionPipeline] Model server initialized")
        except Exception as e:
            logger.error(f"[ProductionPipeline] Model server initialization failed: {e}")
            raise
        
        # Initialize session manager
        self.session_manager = SessionManager(max_sessions=1000, ttl_minutes=30)
        
        # Initialize RAG engine
        self.rag_engine = RAGEngine(self.session_manager, top_k_entities=15)
        
        self.initialized = True
        logger.info("[ProductionPipeline] Initialization complete. Ready to process requests.")
    
    async def process_request(
        self,
        query: str,
        image_url: Optional[str] = None,
        session_id: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Main request processing pipeline
        
        Args:
            query: User search query
            image_url: Optional image URL
            session_id: Session ID (created if not provided)
            request_id: Request tracking ID
            
        Yields:
            SSE formatted event strings
        """
        # Ensure initialization
        if not self.initialized:
            await self.initialize()
        
        # Create or validate session
        if not session_id:
            session_id = self.session_manager.create_session(query)
        
        logger.info(f"[Pipeline {session_id}] Processing query: {query[:50]}... with image: {bool(image_url)}")
        
        session = self.session_manager.get_session(session_id)
        if not session:
            yield self._format_sse("error", "Failed to create session")
            return
        
        try:
            # Step 1: Clean and analyze query
            yield self._format_sse("info", "<TASK>Analyzing query...</TASK>")
            websites, youtube_urls, cleaned_query = cleanQuery(query)
            session.web_search_urls.extend(websites)
            session.youtube_urls.extend(youtube_urls)
            
            # Step 2: Initial image processing if provided
            image_prompt = None
            if image_url:
                yield self._format_sse("info", "<TASK>Processing image...</TASK>")
                self.session_manager.log_tool_execution(session_id, "generate_prompt_from_image")
                try:
                    image_prompt = await generate_prompt_from_image(image_url)
                    combined_query = f"{cleaned_query} {image_prompt}" if cleaned_query else image_prompt
                except Exception as e:
                    logger.warning(f"[Pipeline {session_id}] Image processing failed: {e}")
                    combined_query = cleaned_query
            else:
                combined_query = cleaned_query
            
            # Step 3: Web search and content fetching
            yield self._format_sse("info", "<TASK>Searching the web...</TASK>")
            self.session_manager.log_tool_execution(session_id, "web_search")
            
            search_results = webSearch(combined_query)
            if isinstance(search_results, list):
                session.web_search_urls.extend(search_results)
                fetch_urls = search_results[:8]  # Limit to top 8
            else:
                fetch_urls = [search_results] if search_results else []
            
            # Step 4: Fetch and process content
            if fetch_urls:
                yield self._format_sse("info", "<TASK>Fetching content from sources...</TASK>")
                self.session_manager.log_tool_execution(session_id, "fetch_full_text")
                
                try:
                    # Fetch in parallel
                    for url in fetch_urls:
                        try:
                            from search import fetch_full_text
                            content = await asyncio.to_thread(fetch_full_text, url)
                            if content:
                                self.session_manager.add_content_to_session(session_id, url, content)
                                yield self._format_sse("info", f"<TASK>Processed {len(session.fetched_urls)} sources</TASK>")
                        except Exception as e:
                            logger.warning(f"[Pipeline {session_id}] Failed to fetch {url}: {e}")
                            session.add_error(f"Failed to fetch {url}: {str(e)[:100]}")
                except Exception as e:
                    logger.warning(f"[Pipeline {session_id}] Content fetching failed: {e}")
            
            # Step 5: Process YouTube URLs
            if session.youtube_urls:
                yield self._format_sse("info", "<TASK>Processing video content...</TASK>")
                for yt_url in session.youtube_urls[:2]:  # Limit to 2 videos
                    try:
                        self.session_manager.log_tool_execution(session_id, "transcribe_audio")
                        transcript = await transcribe_audio(yt_url, full_transcript=False, query=combined_query)
                        if transcript:
                            self.session_manager.add_content_to_session(session_id, yt_url, transcript)
                    except Exception as e:
                        logger.warning(f"[Pipeline {session_id}] YouTube processing failed for {yt_url}: {e}")
                        session.add_error(f"YouTube transcription failed: {str(e)[:100]}")
            
            # Step 6: Image search if applicable
            if not image_url and (image_prompt or combined_query):
                yield self._format_sse("info", "<TASK>Finding relevant images...</TASK>")
                try:
                    self.session_manager.log_tool_execution(session_id, "image_search")
                    image_results = await imageSearch(combined_query, max_images=5)
                    if image_results:
                        session.images.extend(image_results if isinstance(image_results, list) else [image_results])
                except Exception as e:
                    logger.warning(f"[Pipeline {session_id}] Image search failed: {e}")
            
            # Step 7: Build RAG context
            yield self._format_sse("info", "<TASK>Building knowledge context...</TASK>")
            rag_context = self.rag_engine.build_rag_prompt_enhancement(session_id)
            rag_stats = self.rag_engine.get_summary_stats(session_id)
            logger.info(f"[Pipeline {session_id}] RAG Context Built: {rag_stats}")
            
            # Step 8: Generate response using LLM with RAG context
            yield self._format_sse("info", "<TASK>Generating response...</TASK>")
            
            response_content = await self._generate_llm_response(
                query=combined_query,
                rag_context=rag_context,
                session_id=session_id,
                image_url=image_url
            )
            
            # Step 9: Format and return final response
            yield self._format_sse("info", "<TASK>SUCCESS</TASK>")
            
            # Return final response with sources
            final_response = self._build_final_response(
                response_content,
                session,
                rag_stats
            )
            
            yield self._format_sse("final", final_response)
            
            logger.info(f"[Pipeline {session_id}] Request completed successfully")
            
        except Exception as e:
            logger.error(f"[Pipeline {session_id}] Pipeline error: {e}", exc_info=True)
            session.add_error(f"Pipeline error: {str(e)}")
            yield self._format_sse("error", "An error occurred processing your request. Please try again.")
    
    async def _generate_llm_response(
        self,
        query: str,
        rag_context: str,
        session_id: str,
        image_url: Optional[str] = None
    ) -> str:
        """Generate LLM response with RAG enhancement"""
        
        current_utc_time = datetime.now(timezone.utc)
        
        system_prompt = f"""You are ElixpoSearch, an expert research assistant. Your task is to provide comprehensive, detailed, and well-researched answers.

RESPONSE REQUIREMENTS:
- Write detailed, substantive responses (minimum 500 words for substantial topics)
- Synthesize information from all gathered sources
- Include specific facts, data, statistics, and examples
- Structure responses with clear sections and headings
- Use proper markdown formatting
- Cite sources when referencing specific information
- Main content should be 80% of response, sources 20%

TIME CONTEXT: {current_utc_time.isoformat()}

{rag_context}

IMPORTANT: Ground your response in the knowledge graph context above. Reference the key entities and relationships discovered during research.
"""
        
        user_message = f"""Based on your research gathered for the query, provide a comprehensive response:

Query: {query}
{"Image provided: Yes" if image_url else "Image provided: No"}

Please provide a detailed, well-structured markdown response that thoroughly answers the query using the researched information and knowledge graph context."""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        payload = {
            "model": MODEL,
            "messages": messages,
            "temperature": 0.7,
            "top_p": 1,
            "max_tokens": 3000,
            "seed": random.randint(1000, 9999),
            "stream": False,
        }
        
        try:
            response = await asyncio.to_thread(
                requests.post,
                POLLINATIONS_ENDPOINT,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {POLLINATIONS_TOKEN}"
                },
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            content = data["choices"][0]["message"]["content"]
            return content
        
        except Exception as e:
            logger.error(f"[Pipeline {session_id}] LLM generation failed: {e}")
            return f"# Error Generating Response\n\nFailed to generate response: {str(e)[:200]}"
    
    def _build_final_response(
        self,
        response_content: str,
        session,
        rag_stats: Dict
    ) -> str:
        """Build final formatted response"""
        parts = [response_content]
        
        # Add images if found
        if session.images:
            parts.append("\n\n---\n## Related Images\n")
            for img_url in session.images[:5]:
                parts.append(f"![](external-image)")
        
        # Add sources
        if session.fetched_urls:
            parts.append("\n\n---\n## Sources\n")
            for i, url in enumerate(session.fetched_urls, 1):
                parts.append(f"{i}. [{url}]({url})")
        
        # Add metadata
        parts.append("\n\n---\n## Research Summary\n")
        parts.append(f"- Documents analyzed: {rag_stats.get('documents_fetched', 0)}")
        parts.append(f"- Entities extracted: {rag_stats.get('entities_extracted', 0)}")
        parts.append(f"- Relationships found: {rag_stats.get('relationships_discovered', 0)}")
        
        return "\n".join(parts)
    
    @staticmethod
    def _format_sse(event: str, data: str) -> str:
        """Format as Server-Sent Event"""
        lines = data.splitlines()
        data_str = ''.join(f"data: {line}\n" for line in lines)
        return f"event: {event}\n{data_str}\n\n"


# Global pipeline instance
_production_pipeline: Optional[ProductionPipeline] = None


async def initialize_production_pipeline(model_server=None) -> ProductionPipeline:
    """Initialize the global production pipeline"""
    global _production_pipeline
    _production_pipeline = ProductionPipeline(model_server)
    await _production_pipeline.initialize()
    logger.info("[ProductionPipeline] Global production pipeline initialized")
    return _production_pipeline


def get_production_pipeline() -> Optional[ProductionPipeline]:
    """Get the global production pipeline"""
    global _production_pipeline
    return _production_pipeline
