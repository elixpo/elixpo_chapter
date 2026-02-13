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

from session_manager import SessionManager, get_session_manager
from rag_engine import RAGEngine, get_rag_engine
from knowledge_graph import build_knowledge_graph
from tools import tools

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
    
    async def _rank_results(self, query: str, results: List[str], ipc_service) -> List[Tuple[str, float]]:
        if not results:
            return []
        
        try:
            query_emb = ipc_service.embed_model.encode(
                query,
                convert_to_numpy=True,
                normalize_embeddings=True
            )
            
            results_emb = ipc_service.embed_model.encode(
                results,
                convert_to_numpy=True,
                normalize_embeddings=True,
                batch_size=32
            )
            
            if len(results_emb.shape) == 1:
                results_emb = results_emb.reshape(1, -1)
            
            scores = np.dot(results_emb, query_emb)
            
            ranked = sorted(zip(results, scores), key=lambda x: x[1], reverse=True)
            return ranked
        except Exception as e:
            logger.warning(f"[Pipeline] Ranking failed: {e}")
            return [(r, 1.0) for r in results]
    
    async def _extract_and_rank_sentences(self, url: str, content: str, query: str, ipc_service) -> List[str]:
        try:
            sentences = sent_tokenize(content)
            if not sentences:
                return []
            
            sentences = [s for s in sentences if len(s.split()) > 3][:100]
            
            ranked = await self._rank_results(query, sentences, ipc_service)
            
            top_sentences = [s for s, score in ranked[:10] if score > 0.3]
            return top_sentences
        except Exception as e:
            logger.warning(f"[Pipeline] Sentence extraction failed for {url}: {e}")
            return []
    
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
        
        logger.info(f"[{session_id}] Processing: {query[:50]}...")
        
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
            
            image_prompt = None
            if image_url:
                yield self._format_sse("info", "<TASK>Processing image...</TASK>")
                self.session_manager.log_tool_execution(session_id, "image")
                try:
                    image_prompt = await generate_prompt_from_image(image_url)
                    combined_query = f"{cleaned_query} {image_prompt}" if cleaned_query else image_prompt
                except Exception as e:
                    logger.warning(f"[{session_id}] Image error: {e}")
                    combined_query = cleaned_query
            else:
                combined_query = cleaned_query
            
            yield self._format_sse("info", "<TASK>Searching...</TASK>")
            self.session_manager.log_tool_execution(session_id, "web_search")
            
            search_results = webSearch(combined_query)
            if isinstance(search_results, list):
                session.web_search_urls.extend(search_results)
                ranked_urls = await self._rank_results(combined_query, search_results[:15], ipc_service)
                fetch_urls = [url for url, _ in ranked_urls[:8]]
            else:
                fetch_urls = [search_results] if search_results else []
            
            if fetch_urls:
                yield self._format_sse("info", "<TASK>Fetching content...</TASK>")
                self.session_manager.log_tool_execution(session_id, "fetch")
                
                try:
                    from search import fetch_full_text
                    for url in fetch_urls:
                        try:
                            content = await asyncio.to_thread(fetch_full_text, url)
                            if content:
                                top_sents = await self._extract_and_rank_sentences(
                                    url, content, combined_query, ipc_service
                                )
                                filtered_content = " ".join(top_sents) if top_sents else content[:2000]
                                self.session_manager.add_content_to_session(session_id, url, filtered_content)
                                yield self._format_sse("info", f"<TASK>Processed {len(session.fetched_urls)} sources</TASK>")
                        except Exception as e:
                            logger.warning(f"[{session_id}] Fetch error for {url}: {e}")
                            session.add_error(f"Fetch failed: {str(e)[:100]}")
                except Exception as e:
                    logger.warning(f"[{session_id}] Content fetching error: {e}")
            
            if session.youtube_urls:
                yield self._format_sse("info", "<TASK>Processing videos...</TASK>")
                for yt_url in session.youtube_urls[:2]:
                    try:
                        self.session_manager.log_tool_execution(session_id, "youtube")
                        transcript = await transcribe_audio(yt_url, full_transcript=False, query=combined_query)
                        if transcript:
                            top_sents = await self._extract_and_rank_sentences(
                                yt_url, transcript, combined_query, ipc_service
                            )
                            filtered_transcript = " ".join(top_sents) if top_sents else transcript[:2000]
                            self.session_manager.add_content_to_session(session_id, yt_url, filtered_transcript)
                    except Exception as e:
                        logger.warning(f"[{session_id}] YouTube error for {yt_url}: {e}")
                        session.add_error(f"YouTube failed: {str(e)[:100]}")
            
            if not image_url and (image_prompt or combined_query):
                yield self._format_sse("info", "<TASK>Finding images...</TASK>")
                try:
                    self.session_manager.log_tool_execution(session_id, "image_search")
                    image_results = await imageSearch(combined_query, max_images=5)
                    if image_results:
                        session.images.extend(image_results if isinstance(image_results, list) else [image_results])
                except Exception as e:
                    logger.warning(f"[{session_id}] Image search error: {e}")
            
            yield self._format_sse("info", "<TASK>Building KG...</TASK>")
            rag_context = self.rag_engine.build_rag_prompt_enhancement(session_id)
            rag_stats = self.rag_engine.get_summary_stats(session_id)
            logger.info(f"[{session_id}] KG built: {rag_stats}")
            
            yield self._format_sse("info", "<TASK>Generating response...</TASK>")
            
            response_content = await self._generate_llm_response(
                query=combined_query,
                rag_context=rag_context,
                session_id=session_id,
                image_url=image_url
            )
            
            yield self._format_sse("info", "<TASK>SUCCESS</TASK>")
            
            final_response = self._build_final_response(
                response_content,
                session,
                rag_stats
            )
            
            yield self._format_sse("final", final_response)
            
            logger.info(f"[{session_id}] Complete")
            
        except Exception as e:
            logger.error(f"[{session_id}] Error: {e}", exc_info=True)
            session.add_error(f"Pipeline error: {str(e)}")
            yield self._format_sse("error", "Request failed. Retry.")
    
    async def _generate_llm_response(
        self,
        query: str,
        rag_context: str,
        session_id: str,
        image_url: Optional[str] = None
    ) -> str:
        
        current_utc_time = datetime.now(timezone.utc)
        
        system_prompt = f"""You are ElixpoSearch, an expert research assistant. Provide comprehensive, detailed answers.

REQUIREMENTS:
- Detailed responses (500+ words for substantial topics)
- Synthesize all gathered information
- Include specific facts, data, statistics, examples
- Clear sections with proper markdown
- Cite sources
- 80% content, 20% sources

TIME: {current_utc_time.isoformat()}

{rag_context}

Ground responses in the knowledge graph context above."""
        
        user_message = f"""Based on research for this query, provide a comprehensive response:

Query: {query}
{"Image: Yes" if image_url else ""}

Provide detailed, well-structured markdown response using the researched information and KG context."""
        
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
            logger.error(f"[{session_id}] LLM error: {e}")
            return f"# Error\n\nFailed to generate: {str(e)[:200]}"
    
    def _build_final_response(
        self,
        response_content: str,
        session,
        rag_stats: Dict
    ) -> str:
        parts = [response_content]
        
        if session.images:
            parts.append("\n\n---\n## Images\n")
            for img_url in session.images[:5]:
                parts.append(f"![](external-image)")
        
        if session.fetched_urls:
            parts.append("\n\n---\n## Sources\n")
            for i, url in enumerate(session.fetched_urls, 1):
                parts.append(f"{i}. [{url}]({url})")
        
        parts.append("\n\n---\n## Summary\n")
        parts.append(f"- Documents: {rag_stats.get('documents_fetched', 0)}")
        parts.append(f"- Entities: {rag_stats.get('entities_extracted', 0)}")
        parts.append(f"- Relationships: {rag_stats.get('relationships_discovered', 0)}")
        
        return "\n".join(parts)
    
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
