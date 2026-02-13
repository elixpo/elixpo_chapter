import uuid
import threading
import asyncio
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import json
from loguru import logger
from knowledge_graph import KnowledgeGraph, build_knowledge_graph
from collections import defaultdict
import concurrent.futures


class SessionData:
    def __init__(self, session_id: str, query: str):
        self.session_id = session_id
        self.query = query
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
        self.local_kg = KnowledgeGraph()
        self.fetched_urls: List[str] = []
        self.web_search_urls: List[str] = []
        self.youtube_urls: List[str] = []
        self.processed_content: Dict[str, str] = {}
        self.rag_context_cache: Optional[str] = None
        self.top_entities_cache: List[Tuple[str, float]] = []
        self.images: List[str] = []
        self.videos: List[Dict] = []
        self.metadata: Dict = {}
        self.tool_calls_made: List[str] = []
        self.errors: List[str] = []
        self.conversation_history: List[Dict] = []
        self.search_context: str = ""
    
    def add_fetched_url(self, url: str, content: str):
        self.fetched_urls.append(url)
        self.processed_content[url] = content
        self.last_activity = datetime.now()
        self.rag_context_cache = None
    
    async def build_kg_async(self, url: str, content: str):
        try:
            loop = asyncio.get_event_loop()
            kg = await loop.run_in_executor(None, build_knowledge_graph, content, 15)
            for entity_key, entity_data in kg.entities.items():
                self.local_kg.add_entity(
                    entity_data["original"],
                    entity_data["type"],
                    entity_data["contexts"][0] if entity_data["contexts"] else ""
                )
            for subject, relation, obj in kg.relationships:
                self.local_kg.add_relationship(subject, relation, obj)
            self.rag_context_cache = None
            logger.debug(f"[SESSION {self.session_id}] KG built async for {url}: {len(kg.entities)} entities")
        except Exception as e:
            logger.debug(f"[SESSION {self.session_id}] Async KG build failed for {url}: {e}")
    
    def get_local_kg(self) -> KnowledgeGraph:
        return self.local_kg
    
    def get_rag_context(self, refresh: bool = False) -> str:
        if self.rag_context_cache and not refresh:
            return self.rag_context_cache
        self.local_kg.calculate_importance()
        top_entities = self.local_kg.get_top_entities(top_k=15)
        self.top_entities_cache = top_entities
        context_parts = [
            f"Query: {self.query}",
            f"Sources fetched: {len(self.fetched_urls)}",
            "\nKey Entities (ranked by importance):"
        ]
        for entity, score in top_entities:
            context_parts.append(f"  - {entity} (relevance: {score:.3f})")
            related = self.local_kg.entity_graph.get(entity, set())
            if related:
                context_parts.append(f"    Related: {', '.join(list(related)[:3])}")
        self.rag_context_cache = "\n".join(context_parts)
        return self.rag_context_cache
    
    def get_top_entities(self, k: int = 10) -> List[Tuple[str, float]]:
        if not self.top_entities_cache:
            self.local_kg.calculate_importance()
            return self.local_kg.get_top_entities(k)
        return self.top_entities_cache[:k]
    
    def log_tool_call(self, tool_name: str):
        self.tool_calls_made.append(f"{tool_name}@{datetime.now().isoformat()}")
        self.last_activity = datetime.now()
    
    def add_error(self, error: str):
        self.errors.append(f"{error}@{datetime.now().isoformat()}")
    
    def to_dict(self) -> Dict:
        return {
            "session_id": self.session_id,
            "query": self.query,
            "created_at": self.created_at.isoformat(),
            "fetched_urls": self.fetched_urls,
            "web_search_urls": self.web_search_urls,
            "youtube_urls": self.youtube_urls,
            "tool_calls": self.tool_calls_made,
            "errors": self.errors,
            "top_entities": self.top_entities_cache,
            "num_relationships": len(self.local_kg.relationships),
            "document_count": len(self.processed_content),
            "conversation_turns": len(self.conversation_history),
        }
    
    def add_message_to_history(self, role: str, content: str, metadata: Dict = None):
        msg = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        }
        if metadata:
            msg.update(metadata)
        self.conversation_history.append(msg)
        self.last_activity = datetime.now()
    
    def get_conversation_history(self) -> List[Dict]:
        return self.conversation_history
    
    def set_search_context(self, context: str):
        self.search_context = context
        self.last_activity = datetime.now()


class SessionManager:
    def __init__(self, max_sessions: int = 1000, ttl_minutes: int = 30):
        self.sessions: Dict[str, SessionData] = {}
        self.max_sessions = max_sessions
        self.ttl = timedelta(minutes=ttl_minutes)
        self.lock = threading.RLock()
        logger.info(f"[SessionManager] Initialized with max {max_sessions} sessions, TTL: {ttl_minutes}m")
    
    def create_session(self, query: str) -> str:
        with self.lock:
            if len(self.sessions) >= self.max_sessions:
                self._cleanup_expired()
            session_id = str(uuid.uuid4())[:12]
            self.sessions[session_id] = SessionData(session_id, query)
            logger.info(f"[SessionManager] Created session {session_id} for query: {query[:50]}")
            return session_id
    
    def get_session(self, session_id: str) -> Optional[SessionData]:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                session.last_activity = datetime.now()
            return session
    
    def add_content_to_session(self, session_id: str, url: str, content: str):
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                session.add_fetched_url(url, content)
                logger.info(f"[Session {session_id}] Added content from {url}")
            else:
                logger.warning(f"[SessionManager] Session {session_id} not found")
    
    def add_search_url(self, session_id: str, url: str, is_youtube: bool = False):
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                if is_youtube:
                    session.youtube_urls.append(url)
                else:
                    session.web_search_urls.append(url)
    
    def log_tool_execution(self, session_id: str, tool_name: str):
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                session.log_tool_call(tool_name)
    
    def get_rag_context(self, session_id: str, refresh: bool = False) -> str:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                return session.get_rag_context(refresh=refresh)
            return ""
    
    def get_session_summary(self, session_id: str) -> Dict:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                return session.to_dict()
            return {}
    
    def cleanup_session(self, session_id: str):
        with self.lock:
            if session_id in self.sessions:
                del self.sessions[session_id]
                logger.info(f"[SessionManager] Cleaned up session {session_id}")
    
    def _cleanup_expired(self):
        now = datetime.now()
        expired = [
            sid for sid, session in self.sessions.items()
            if now - session.last_activity > self.ttl
        ]
        for sid in expired:
            del self.sessions[sid]
            logger.info(f"[SessionManager] Expired session {sid}")
    
    def get_stats(self) -> Dict:
        with self.lock:
            return {
                "total_sessions": len(self.sessions),
                "max_sessions": self.max_sessions,
                "sessions": {
                    sid: {
                        "query": s.query[:50],
                        "urls_fetched": len(s.fetched_urls),
                        "tools_used": len(s.tool_calls_made),
                        "entities": len(s.local_kg.entities),
                    }
                    for sid, s in self.sessions.items()
                }
            }
    
    def add_message_to_history(self, session_id: str, role: str, content: str, metadata: Dict = None):
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                session.add_message_to_history(role, content, metadata)
    
    def get_conversation_history(self, session_id: str) -> List[Dict]:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                return session.get_conversation_history()
            return []
    
    def set_search_context(self, session_id: str, context: str):
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                session.set_search_context(context)


_session_manager: Optional[SessionManager] = None


def initialize_session_manager(max_sessions: int = 1000, ttl_minutes: int = 30):
    global _session_manager
    _session_manager = SessionManager(max_sessions, ttl_minutes)
    logger.info("[SessionManager] Global session manager initialized")
    return _session_manager


def get_session_manager() -> SessionManager:
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager
