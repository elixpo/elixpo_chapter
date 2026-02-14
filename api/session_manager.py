import uuid
import threading
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from loguru import logger
import numpy as np
import faiss
import torch
from config import EMBEDDING_DIMENSION


class SessionData:
    def __init__(self, session_id: str, query: str, embedding_dim: int = None):
        if embedding_dim is None:
            embedding_dim = EMBEDDING_DIMENSION
        self.session_id = session_id
        self.query = query
        self.embedding_dim = embedding_dim
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
        self.fetched_urls: List[str] = []
        self.web_search_urls: List[str] = []
        self.youtube_urls: List[str] = []
        self.processed_content: Dict[str, str] = {}
        self.content_embeddings: Dict[str, np.ndarray] = {}
        self.rag_context_cache: Optional[str] = None
        self.top_content_cache: List[Tuple[str, float]] = []
        self.images: List[str] = []
        self.videos: List[Dict] = []
        self.metadata: Dict = {}
        self.tool_calls_made: List[str] = []
        self.errors: List[str] = []
        self.conversation_history: List[Dict] = []
        self.search_context: str = ""
        
        # Initialize FAISS index with GPU acceleration if available
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        if self.device == "cuda":
            try:
                # Use GPU-accelerated FAISS with GpuIndexFlatIP (inner product) for better performance
                res = faiss.StandardGpuResources()
                self.faiss_index = faiss.GpuIndexFlatIP(res, embedding_dim)
                logger.info(f"[SessionData] {session_id}: FAISS index on GPU (GpuIndexFlatIP)")
            except Exception as e:
                logger.warning(f"[SessionData] {session_id}: Failed to create GPU index, falling back to CPU: {e}")
                self.faiss_index = faiss.IndexFlatIP(embedding_dim)
                self.device = "cpu"
        else:
            self.faiss_index = faiss.IndexFlatL2(embedding_dim)
            logger.info(f"[SessionData] {session_id}: FAISS index on CPU (IndexFlatL2)")
        
        self.content_order: List[str] = []
        self.lock = threading.RLock()
    
    def add_fetched_url(self, url: str, content: str, embedding: Optional[np.ndarray] = None):
        with self.lock:
            self.fetched_urls.append(url)
            self.processed_content[url] = content
            if embedding is not None:
                if isinstance(embedding, np.ndarray):
                    if len(embedding.shape) == 1:
                        embedding = embedding.reshape(1, -1)
                    embedding = embedding.astype(np.float32)
                    self.content_embeddings[url] = embedding
                    self.faiss_index.add(embedding)
                    self.content_order.append(url)
            self.last_activity = datetime.now()
            self.rag_context_cache = None

    def get_rag_context(self, refresh: bool = False, query_embedding: Optional[np.ndarray] = None) -> str:
        with self.lock:
            if self.rag_context_cache and not refresh:
                return self.rag_context_cache

            context_parts = [
                f"Query: {self.query}",
                f"Sources fetched: {len(self.fetched_urls)}",
            ]
            
            if query_embedding is not None and self.faiss_index.ntotal > 0:
                try:
                    if isinstance(query_embedding, np.ndarray):
                        if len(query_embedding.shape) == 1:
                            query_embedding = query_embedding.reshape(1, -1)
                        query_embedding = query_embedding.astype(np.float32)
                    
                    k = min(10, self.faiss_index.ntotal)
                    distances, indices = self.faiss_index.search(query_embedding, k)
                    
                    context_parts.append("\nMost Relevant Content:")
                    for idx, distance in zip(indices[0], distances[0]):
                        if idx < len(self.content_order):
                            url = self.content_order[idx]
                            relevance_score = 1.0 / (1.0 + distance)
                            content_preview = self.processed_content[url][:100]
                            context_parts.append(f"  - {url} (relevance: {relevance_score:.3f})")
                            context_parts.append(f"    Preview: {content_preview}...")
                except Exception as e:
                    logger.warning(f"[SessionData] FAISS search failed: {e}")
                    context_parts.append("\nFetched Content:")
                    for url in self.fetched_urls[-5:]:
                        context_parts.append(f"  - {url}")
            else:
                context_parts.append("\nFetched Content:")
                for url in self.fetched_urls[-5:]:
                    context_parts.append(f"  - {url}")
            
            self.rag_context_cache = "\n".join(context_parts)
            return self.rag_context_cache
    
    def get_top_content(self, k: int = 10, query_embedding: Optional[np.ndarray] = None) -> List[Tuple[str, float]]:
        with self.lock:
            if self.faiss_index.ntotal == 0:
                return []
            
            if query_embedding is None:
                return [(url, 1.0 / (i + 1)) for i, url in enumerate(self.content_order[:k])]
            
            try:
                if isinstance(query_embedding, np.ndarray):
                    if len(query_embedding.shape) == 1:
                        query_embedding = query_embedding.reshape(1, -1)
                    query_embedding = query_embedding.astype(np.float32)
                
                k = min(k, self.faiss_index.ntotal)
                distances, indices = self.faiss_index.search(query_embedding, k)
                
                results = []
                for idx, distance in zip(indices[0], distances[0]):
                    if idx < len(self.content_order):
                        url = self.content_order[idx]
                        relevance_score = 1.0 / (1.0 + distance)
                        results.append((url, relevance_score))
                
                return results
            except Exception as e:
                logger.warning(f"[SessionData] FAISS top content search failed: {e}")
                return [(url, 1.0 / (i + 1)) for i, url in enumerate(self.content_order[:k])]
    
    def log_tool_call(self, tool_name: str):
        self.tool_calls_made.append(f"{tool_name}@{datetime.now().isoformat()}")
        self.last_activity = datetime.now()
    
    def add_error(self, error: str):
        self.errors.append(f"{error}@{datetime.now().isoformat()}")
    
    def to_dict(self) -> Dict:
        with self.lock:
            return {
                "session_id": self.session_id,
                "query": self.query,
                "created_at": self.created_at.isoformat(),
                "fetched_urls": self.fetched_urls,
                "web_search_urls": self.web_search_urls,
                "youtube_urls": self.youtube_urls,
                "tool_calls": self.tool_calls_made,
                "errors": self.errors,
                "top_content": self.top_content_cache,
                "faiss_index_size": self.faiss_index.ntotal,
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

class SessionMemory:
    def __init__(self, session_id: str, summary_threshold: int = 6):
        self.session_id = session_id
        self.summary_threshold = summary_threshold
        self.conversation_history: List[Dict] = []
        self.rolling_summary: str = ""
        self.entity_memory: set = set()
        self.lock = threading.RLock()
        self.turn_count = 0
    
    def add_turn(self, user_query: str, assistant_response: str, entities: List[str] = None) -> None:
        with self.lock:
            self.conversation_history.append({
                "turn": self.turn_count,
                "user": user_query,
                "assistant": assistant_response,
                "timestamp": datetime.now().isoformat()
            })
            
            if entities:
                self.entity_memory.update(entities)
            
            self.turn_count += 1
            
            if self.turn_count % self.summary_threshold == 0:
                self._compress_history()
    
    def _compress_history(self) -> None:
        if len(self.conversation_history) <= 2:
            return
        
        recent_turns = self.conversation_history[-2:]
        
        summary_parts = []
        summary_parts.append(f"Previous Discussion Summary (turns 1-{self.turn_count - 2}):")
        
        for turn in self.conversation_history[:-2]:
            summary_parts.append(f"  Q: {turn['user'][:100]}...")
            summary_parts.append(f"  A: {turn['assistant'][:100]}...")
        
        self.rolling_summary = "\n".join(summary_parts)
        
        self.conversation_history = [
            {"type": "summary", "content": self.rolling_summary},
            *recent_turns
        ]
        
        logger.debug(f"[SessionMemory] Compressed history for session {self.session_id}")
    
    def get_context(self) -> Dict:
        with self.lock:
            return {
                "summary": self.rolling_summary,
                "recent_history": self.conversation_history[-2:] if self.conversation_history else [],
                "entities": list(self.entity_memory),
                "turn_count": self.turn_count
            }
    
    def get_minimal_context(self) -> str:
        with self.lock:
            parts = []
            
            if self.rolling_summary:
                parts.append(self.rolling_summary)
            
            if self.conversation_history[-2:]:
                parts.append("Recent exchanges:")
                for turn in self.conversation_history[-2:]:
                    if "user" in turn:
                        parts.append(f"  User: {turn['user']}")
                        parts.append(f"  Assistant: {turn['assistant']}")
            
            return "\n".join(parts) if parts else ""
    
    def clear(self) -> None:
        with self.lock:
            self.conversation_history.clear()
            self.rolling_summary = ""
            self.entity_memory.clear()
            self.turn_count = 0


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
