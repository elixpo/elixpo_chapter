from typing import Dict, Optional
import threading
from session_manager import SessionMemory
from .sessionData import SessionData
from loguru import logger
import uuid
from datetime import datetime, timedelta
import numpy as np
from typing import List, Tuple



class SessionManager:
    def __init__(self, max_sessions: int = 1000, ttl_minutes: int = 30, embedding_dim: int = None):
        if embedding_dim is None:
            embedding_dim = EMBEDDING_DIMENSION
        self.sessions: Dict[str, SessionData] = {}
        self.max_sessions = max_sessions
        self.ttl = timedelta(minutes=ttl_minutes)
        self.embedding_dim = embedding_dim
        self.lock = threading.RLock()
        logger.info(f"[SessionManager] Initialized with max {max_sessions} sessions, TTL: {ttl_minutes}m, embedding_dim: {embedding_dim}")
    
    def create_session(self, query: str) -> str:
        with self.lock:
            if len(self.sessions) >= self.max_sessions:
                self._cleanup_expired()
            session_id = str(uuid.uuid4())[:12]
            self.sessions[session_id] = SessionData(session_id, query, embedding_dim=self.embedding_dim)
            logger.info(f"[SessionManager] Created session {session_id} for query: {query[:50]}")
            return session_id
    
    def get_session(self, session_id: str) -> Optional[SessionData]:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                session.last_activity = datetime.now()
            return session
    
    def add_content_to_session(self, session_id: str, url: str, content: str, embedding: Optional[np.ndarray] = None):
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                session.add_fetched_url(url, content, embedding)
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
    
    def get_rag_context(self, session_id: str, refresh: bool = False, query_embedding: Optional[np.ndarray] = None) -> str:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                return session.get_rag_context(refresh=refresh, query_embedding=query_embedding)
            return ""
    
    def get_top_content(self, session_id: str, k: int = 10, query_embedding: Optional[np.ndarray] = None) -> List[Tuple[str, float]]:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                return session.get_top_content(k=k, query_embedding=query_embedding)
            return []
    
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
                        "faiss_index_size": s.faiss_index.ntotal,
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



