from datetime import datetime
from typing import Dict, List, Optional, Tuple
import threading
import numpy as np
from loguru import logger
from pipeline.config import EMBEDDING_DIMENSION


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
        
        
        self.content_order: List[str] = []
        self.lock = threading.RLock()
    
    def add_fetched_url(self, url: str, content: str, embedding: Optional[np.ndarray] = None):
        with self.lock:
            self.fetched_urls.append(url)
            self.processed_content[url] = content
            # Note: Embeddings are now stored globally in the shared Chroma HTTP server
            # via VectorStore.add_chunks(). Session only maintains local content reference.
            if embedding is not None:
                self.content_embeddings[url] = embedding
            # Still add to content_order for fallback access
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

            context_parts.append("\nFetched Content:")
            for url in self.fetched_urls[-5:]:
                context_parts.append(f"  - {url}")

            self.rag_context_cache = "\n".join(context_parts)
            return self.rag_context_cache
    
    def get_top_content(self, k: int = 10, query_embedding: Optional[np.ndarray] = None) -> List[Tuple[str, float]]:
        with self.lock:
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
    
    def check_cache_relevance(self, query_text: str, query_embedding: Optional[np.ndarray] = None, similarity_threshold: float = 0.80) -> Tuple[bool, Optional[Dict]]:

        return False, None
    
    def get_mixed_results(self, cached_results: List[Dict], new_results: List[Dict], max_results: int = 10) -> List[Dict]:

        combined = []
        seen_urls = set()
        
        # Add cached results first (higher priority)
        for cached in cached_results:
            url = cached.get('url') or cached.get('metadata', {}).get('url')
            if url and url not in seen_urls:
                combined.append(cached)
                seen_urls.add(url)
        
        # Add new results (up to max_results)
        for new in new_results:
            if len(combined) >= max_results:
                break
            url = new.get('url') or new.get('metadata', {}).get('url')
            if url and url not in seen_urls:
                combined.append(new)
                seen_urls.add(url)
        
        logger.info(f"[SessionData] Mixed results: {len(cached_results)} cached + {len(new_results)} new = {len(combined)} total")
        return combined[:max_results]
