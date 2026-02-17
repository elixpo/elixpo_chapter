from loguru import logger
from typing import List, Dict, Optional, AsyncGenerator
import asyncio
import requests
import random
from pipeline.config import POLLINATIONS_ENDPOINT, LOG_MESSAGE_PREVIEW_TRUNCATE
from dotenv import load_dotenv
import os
load_dotenv()

POLLINATIONS_TOKEN = os.getenv("TOKEN")
MODEL = os.getenv("MODEL")
class ChatEngine:
    
    def __init__(self, session_manager, retrieval_system):
        self.session_manager = session_manager
        self.retrieval_system = retrieval_system
        logger.info("[ChatEngine] Initialized")
    
    async def generate_contextual_response(
        self,
        session_id: str,
        user_message: str,
        use_rag: bool = True,
        stream: bool = False
    ) -> AsyncGenerator[str, None]:
        
        session = self.session_manager.get_session(session_id)
        if not session:
            yield self._format_sse("error", "Session not found")
            return
        
        self.session_manager.add_message_to_history(session_id, "user", user_message)
        
        conversation_history = self.session_manager.get_conversation_history(session_id)
        
        messages = self._build_messages(
            conversation_history,
            session_id if use_rag else None
        )
        
        try:
            yield self._format_sse("info", "<TASK>Generating contextual response...</TASK>")
            
            payload = {
                "model": MODEL,
                "messages": messages,
                "temperature": 0.7,
                "top_p": 1,
                "max_tokens": 2000,
                "seed": random.randint(1000, 9999),
                "stream": False,
            }
            
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
            
            assistant_response = data["choices"][0]["message"]["content"]
            
            rag_engine = self.retrieval_system.get_rag_engine(session_id)
            self.session_manager.add_message_to_history(
                session_id,
                "assistant",
                assistant_response,
                {"sources": rag_engine.get_stats()}
            )
            
            yield self._format_sse("info", "<TASK>SUCCESS</TASK>")
            yield self._format_sse("final", assistant_response)
            
            logger.info(f"[Chat {session_id}] Response generated")
        
        except Exception as e:
            logger.error(f"[Chat {session_id}] Error: {e}", exc_info=True)
            yield self._format_sse("error", f"Error generating response: {str(e)[:LOG_MESSAGE_PREVIEW_TRUNCATE]}")
    
    async def chat_with_search(
        self,
        session_id: str,
        user_message: str,
        search_query: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        
        session = self.session_manager.get_session(session_id)
        if not session:
            yield self._format_sse("error", "Session not found")
            return
        
        yield self._format_sse("info", "<TASK>Processing query...</TASK>")
        
        final_search_query = search_query or user_message
        
        yield self._format_sse("info", "<TASK>Searching for relevant information...</TASK>")
        
        try:
            from commons.searching_based import webSearch
            from searching.fetch_full_text import fetch_full_text
            
            search_results = webSearch(final_search_query)
            if isinstance(search_results, list):
                fetch_urls = search_results[:5]
            else:
                fetch_urls = [search_results] if search_results else []
            
            yield self._format_sse("info", f"<TASK>Found {len(fetch_urls)} sources</TASK>")
            
            if fetch_urls:
                yield self._format_sse("info", "<TASK>Fetching content...</TASK>")
                
                processed_count = 0
                for url in fetch_urls:
                    try:
                        content = await asyncio.to_thread(fetch_full_text, url)
                        if content:
                            self.session_manager.add_content_to_session(session_id, url, content)
                            processed_count += 1
                            yield self._format_sse("info", f"<TASK>Processed source {processed_count}/{len(fetch_urls)}</TASK>")
                    except Exception as e:
                        logger.warning(f"[Chat {session_id}] Failed to fetch {url}: {e}")
            
            yield self._format_sse("info", "<TASK>Building knowledge context...</TASK>")
            
        except Exception as e:
            logger.warning(f"[Chat {session_id}] Search phase error: {e}")
        
        async for chunk in self.generate_contextual_response(session_id, user_message, use_rag=True):
            yield chunk
    
    def _build_messages(self, conversation_history: List[Dict], session_id: Optional[str] = None) -> List[Dict]:
        
        system_content = "You are a helpful research assistant. Provide detailed, accurate responses based on the conversation history and available knowledge."
        
        if session_id:
            try:
                rag_engine = self.retrieval_system.get_rag_engine(session_id)
                rag_context = rag_engine.build_rag_prompt_enhancement(session_id)
                if rag_context:
                    system_content += f"\n\n{rag_context}"
            except Exception as e:
                logger.debug(f"[ChatEngine] Could not build RAG context for session {session_id}: {e}")
        
        messages = [{"role": "system", "content": system_content}]
        
        for msg in conversation_history[-20:]:
            messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })
        
        return messages
    
    @staticmethod
    def _format_sse(event: str, data: str) -> str:
        lines = data.splitlines()
        data_str = ''.join(f"data: {line}\n" for line in lines)
        return f"event: {event}\n{data_str}\n\n"

