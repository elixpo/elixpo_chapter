from ragService.retrievalPipeline import RetrievalPipeline
from ragService.vectorStore import VectorStore
from ragService.cacheCoordinator import CacheCoordinator
from sessions.sessionData import SessionData
import numpy as np
from loguru import logger
from typing import Dict, Optional, Union
from datetime import datetime
from pipeline.config import (
    LOG_MESSAGE_PREVIEW_TRUNCATE,
    SEMANTIC_CACHE_REDIS_HOST,
    SEMANTIC_CACHE_REDIS_PORT,
    SESSION_CONTEXT_WINDOW_SIZE,
    SESSION_CONTEXT_WINDOW_TTL_SECONDS,
    RETRIEVAL_TOP_K,
)


class RAGEngine:

    
    def __init__(
        self,
        embedding_service,
        vector_store: VectorStore,
        session_data: SessionData,
        session_id: str,
        redis_host: str = SEMANTIC_CACHE_REDIS_HOST,
        redis_port: int = SEMANTIC_CACHE_REDIS_PORT,
    ):

        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.session_data = session_data
        self.session_id = session_id
        
        # Initialize cache coordinator with config values
        self.cache_coordinator = CacheCoordinator(
            session_id=session_id,
            redis_host=redis_host,
            redis_port=redis_port,
        )
        
        self.retrieval_pipeline = RetrievalPipeline(
            embedding_service,
            vector_store
        )
        
        logger.info(
            f"[RAGEngine] session={session_id} initialized with 3-layer Redis caching: "
            f"URLEmbedding(24h), SemanticCache(5m), ContextWindow({SESSION_CONTEXT_WINDOW_SIZE}msgs, {SESSION_CONTEXT_WINDOW_TTL_SECONDS}s)"
        )
    
    def retrieve_context(
        self,
        query: str,
        url: Optional[str] = None,
        top_k: int = RETRIEVAL_TOP_K
    ) -> Dict:

        try:
            query_embedding = self.embedding_service.embed_single(query)
            
            # Layer 1: Check semantic cache (URL-specific + query, session-scoped)
            if url:
                cached_response = self.cache_coordinator.get_semantic_response(
                    url=url,
                    query_embedding=query_embedding
                )
                if cached_response:
                    logger.info(f"[RAGEngine] session={self.session_id} Semantic cache HIT for {url}")
                    return {
                        "source": "semantic_cache",
                        "url": url,
                        "response": cached_response,
                        "latency_ms": 1.0,
                        "cache_layer": "semantic",
                        "session_id": self.session_id
                    }
            
            # Layer 2: Check session content (ChromaDB)
            session_content = self._get_session_content_context(query_embedding, top_k)
            
            # Layer 3: Check global vector store
            results = self.vector_store.search(query_embedding, top_k=top_k)
            context_texts = [r["metadata"]["text"] for r in results]
            sources = list(set([r["metadata"]["url"] for r in results]))
            
            context = "\n\n".join(context_texts)
            
            # Combine session content with global results
            if session_content["texts"]:
                logger.info(f"[RAGEngine] session={self.session_id} Including {len(session_content['texts'])} session-specific chunks")
                context = session_content["combined"] + "\n\n" + context if context else session_content["combined"]
                sources.extend(session_content["sources"])
                sources = list(set(sources))
            
            # Layer 4: Integrate session context window (conversation history with LRU)
            session_context = self._get_session_context_window()
            
            full_context = ""
            if session_context:
                full_context += f"=== RECENT CONVERSATION ({self.session_id}) ===\n{session_context}\n\n"
            
            full_context += f"=== RETRIEVED INFORMATION ===\n{context}"
            
            retrieval_result = {
                "source": "vector_store",
                "query": query,
                "context": full_context,
                "sources": sources,
                "chunk_count": len(results),
                "scores": [r["score"] for r in results],
                "query_embedding": query_embedding.tolist() if isinstance(query_embedding, np.ndarray) else query_embedding,
                "cache_layer": "vector_store",
                "session_id": self.session_id
            }
            
            # Cache result for semantic reuse (session-scoped)
            if url:
                self.cache_coordinator.cache_semantic_response(
                    url=url,
                    query_embedding=query_embedding,
                    response=retrieval_result
                )
            
            return retrieval_result
        
        except Exception as e:
            logger.error(f"[RAGEngine] session={self.session_id} Retrieval failed: {e}")
            return {
                "source": "error",
                "error": str(e),
                "context": "",
                "sources": [],
                "session_id": self.session_id
            }
    
    def ingest_and_cache(self, url: str) -> Dict:

        try:
            chunk_count = self.retrieval_pipeline.ingest_url(url, max_words=3000)
            logger.info(f"[RAGEngine] session={self.session_id} Ingested {chunk_count} chunks from {url}")
            return {
                "success": True,
                "url": url,
                "chunks": chunk_count,
                "session_id": self.session_id
            }
        except Exception as e:
            logger.error(f"[RAGEngine] session={self.session_id} Ingestion failed for {url}: {e}")
            return {
                "success": False,
                "url": url,
                "error": str(e),
                "session_id": self.session_id
            }
    
    def add_message_to_context_window(self, role: str, content: str) -> int:

        return self.cache_coordinator.add_message_to_context(
            role=role,
            content=content,
            metadata={"timestamp": datetime.now().isoformat(), "session_id": self.session_id}
        )
    
    def get_full_context(self, query: str, top_k: int = RETRIEVAL_TOP_K) -> Dict:

        retrieval_result = self.retrieve_context(query, top_k=top_k)
        
        return {
            "query": query,
            "context": retrieval_result.get("context", ""),
            "sources": retrieval_result.get("sources", []),
            "cache_hit": retrieval_result.get("source") == "semantic_cache",
            "cache_layer": retrieval_result.get("cache_layer"),
            "scores": retrieval_result.get("scores", []),
            "session_id": self.session_id
        }
    
    def get_stats(self) -> Dict:

        try:
            return {
                "session_id": self.session_id,
                "vector_store": self.vector_store.get_stats(),
                "cache_coordinator": self.cache_coordinator.get_stats(),
                "session_memory": self.session_data.to_dict() if hasattr(self.session_data, 'to_dict') else {},
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.warning(f"[RAGEngine] session={self.session_id} Failed to get stats: {e}")
            return {"session_id": self.session_id, "status": "error"}
    
    def build_rag_prompt_enhancement(self) -> str:

        try:
            formatted_context = self.cache_coordinator.get_formatted_context(max_lines=20)
            
            if formatted_context:
                prompt_enhancement = f"=== CONVERSATION HISTORY ({self.session_id}) ===\n{formatted_context}\n\n"
                logger.info(f"[RAGEngine] session={self.session_id} Built prompt enhancement: {len(formatted_context)} chars")
                return prompt_enhancement
            return ""
        
        except Exception as e:
            logger.error(f"[RAGEngine] session={self.session_id} Failed to build prompt enhancement: {e}")
            return ""
    
    def _get_session_context_window(self) -> str:

        try:
            messages = self.cache_coordinator.get_context_messages()
            if not messages:
                return ""
            
            context_parts = []
            # Build context from recent messages
            for msg in messages[-10:]:  # Keep last 10 messages
                role = msg.get("role", "unknown").capitalize()
                content = msg.get("content", "")
                if content:
                    # Truncate very long messages
                    if len(content) > 200:
                        content = content[:200] + "..."
                    context_parts.append(f"{role}: {content}")
            
            return "\n".join(context_parts) if context_parts else ""
        except Exception as e:
            logger.warning(f"[RAGEngine] session={self.session_id} Failed to get context window: {e}")
            return ""
    
    def _get_session_content_context(self, query_embedding: np.ndarray, top_k: int = 5) -> Dict:

        if not self.session_data or not hasattr(self.session_data, 'processed_content'):
            return {"texts": [], "sources": [], "combined": ""}
        
        try:
            # If session has its own ChromaDB collection, use it for retrieval
            if hasattr(self.session_data, 'chroma_collection') and self.session_data.chroma_collection:
                results = self.session_data.chroma_collection.query(
                    query_embeddings=[query_embedding.tolist() if isinstance(query_embedding, np.ndarray) else query_embedding],
                    n_results=min(top_k, self.session_data.chroma_collection.count())
                )
                
                content_texts = []
                sources = []
                
                if results["documents"] and len(results["documents"]) > 0:
                    for document, metadata in zip(results["documents"][0], results["metadatas"][0]):
                        content_texts.append(document[:500])
                        if "url" in metadata:
                            sources.append(metadata["url"])
                
                combined = "\n\n[Session Content]\n".join(content_texts) if content_texts else ""
                logger.info(f"[RAGEngine] session={self.session_id} Retrieved {len(content_texts)} session chunks from ChromaDB")
                
                return {
                    "texts": content_texts,
                    "sources": sources,
                    "combined": combined
                }
            else:
                # Fallback: use simple similarity matching without ChromaDB
                content_texts = []
                sources = []
                
                if hasattr(self.session_data, 'content_order'):
                    for url in self.session_data.content_order[:top_k]:
                        content = self.session_data.processed_content.get(url, "")
                        if content:
                            content_texts.append(content[:500])
                            sources.append(url)
                
                combined = "\n\n[Session Content]\n".join(content_texts) if content_texts else ""
                logger.info(f"[RAGEngine] session={self.session_id} Retrieved {len(content_texts)} session chunks (fallback)")
                
                return {
                    "texts": content_texts,
                    "sources": sources,
                    "combined": combined
                }
        except Exception as e:
            logger.warning(f"[RAGEngine] session={self.session_id} Failed to get session content: {e}")
            return {"texts": [], "sources": [], "combined": ""}
    
    def retrieve_context(
        self,
        query: str,
        url: Optional[str] = None,
        top_k: int = RETRIEVAL_TOP_K
    ) -> Dict:

        try:
            query_embedding = self.embedding_service.embed_single(query)
            
            # Layer 1: Check semantic cache (URL-specific + query)
            if url:
                cached_response = self.cache_coordinator.get_semantic_response(
                    url=url,
                    query_embedding=query_embedding
                )
                if cached_response:
                    logger.info(f"[RAG] Semantic cache HIT for {url}")
                    return {
                        "source": "semantic_cache",
                        "url": url,
                        "response": cached_response,
                        "latency_ms": 1.0,
                        "cache_layer": "semantic"
                    }
            
            # Layer 2: Check session content (ChromaDB)
            session_content = self._get_session_content_context(query_embedding, top_k)
            
            # Layer 3: Check global vector store
            results = self.vector_store.search(query_embedding, top_k=top_k)
            context_texts = [r["metadata"]["text"] for r in results]
            sources = list(set([r["metadata"]["url"] for r in results]))
            
            context = "\n\n".join(context_texts)
            
            # Combine session content with global results
            if session_content["texts"]:
                logger.info(f"[RAG] Including {len(session_content['texts'])} session-specific content chunks")
                context = session_content["combined"] + "\n\n" + context if context else session_content["combined"]
                sources.extend(session_content["sources"])
                sources = list(set(sources))
            
            # Layer 4: Integrate session context window (conversation history with LRU)
            session_context = self._get_session_context_window()
            
            full_context = ""
            if session_context:
                full_context += f"=== RECENT CONVERSATION CONTEXT ===\n{session_context}\n\n"
            
            full_context += f"=== RETRIEVED INFORMATION ===\n{context}"
            
            retrieval_result = {
                "source": "vector_store",
                "query": query,
                "context": full_context,
                "sources": sources,
                "chunk_count": len(results),
                "scores": [r["score"] for r in results],
                "query_embedding": query_embedding.tolist() if isinstance(query_embedding, np.ndarray) else query_embedding,
                "cache_layer": "vector_store"
            }
            
            # Cache result for semantic reuse
            if url:
                self.cache_coordinator.cache_semantic_response(
                    url=url,
                    query_embedding=query_embedding,
                    response=retrieval_result
                )
            
            return retrieval_result
        
        except Exception as e:
            logger.error(f"[RAG] Retrieval failed: {e}")
            return {
                "source": "error",
                "error": str(e),
                "context": "",
                "sources": []
            }
    
    def ingest_and_cache(self, url: str) -> Dict:

        try:
            chunk_count = self.retrieval_pipeline.ingest_url(url, max_words=3000)
            logger.info(f"[RAG] Ingested {chunk_count} chunks from {url}")
            return {
                "success": True,
                "url": url,
                "chunks": chunk_count
            }
        except Exception as e:
            logger.error(f"[RAG] Ingestion failed for {url}: {e}")
            return {
                "success": False,
                "url": url,
                "error": str(e)
            }
    
    def add_message_to_context_window(self, role: str, content: str) -> int:

        return self.cache_coordinator.add_message_to_context(
            role=role,
            content=content,
            metadata={"timestamp": datetime.now().isoformat()}
        )
    
    def get_full_context(self, query: str, top_k: int = 5) -> Dict:

        retrieval_result = self.retrieve_context(query, top_k=top_k)
        
        return {
            "query": query,
            "context": retrieval_result.get("context", ""),
            "sources": retrieval_result.get("sources", []),
            "cache_hit": retrieval_result.get("source") == "semantic_cache",
            "cache_layer": retrieval_result.get("cache_layer"),
            "scores": retrieval_result.get("scores", [])
        }
    
    def get_stats(self) -> Dict:

        return {
            "vector_store": self.vector_store.get_stats(),
            "cache_coordinator": self.cache_coordinator.get_cache_stats(),
            "session_memory": self.session_data.to_dict() if hasattr(self.session_data, 'to_dict') else {}
        }
    
    def build_rag_prompt_enhancement(self) -> str:

        try:
            formatted_context = self.cache_coordinator.get_formatted_context(max_lines=20)
            
            if formatted_context:
                prompt_enhancement = f"=== CONVERSATION HISTORY (Last 20 Messages) ===\n{formatted_context}\n\n"
                logger.info(f"[RAG] Built prompt enhancement: {len(formatted_context)} chars")
                return prompt_enhancement
            return ""
        
        except Exception as e:
            logger.error(f"[RAG] Failed to build prompt enhancement: {e}")
            return ""
    
    def _get_session_context_window(self) -> str:

        try:
            messages = self.cache_coordinator.get_context_messages()
            if not messages:
                return ""
            
            context_parts = []
            # Build context from recent messages
            for msg in messages[-10:]:  # Keep last 10 messages
                role = msg.get("role", "unknown").capitalize()
                content = msg.get("content", "")
                if content:
                    # Truncate very long messages
                    if len(content) > 200:
                        content = content[:200] + "..."
                    context_parts.append(f"{role}: {content}")
            
            return "\n".join(context_parts) if context_parts else ""
        except Exception as e:
            logger.warning(f"[RAG] Failed to get session context window: {e}")
            return ""
    
    def _get_session_content_context(self, query_embedding: np.ndarray, top_k: int = 5) -> Dict:

        if not self.session_data or not hasattr(self.session_data, 'processed_content'):
            return {"texts": [], "sources": [], "combined": ""}
        
        try:
            # If session has its own ChromaDB collection, use it for retrieval
            if hasattr(self.session_data, 'chroma_collection') and self.session_data.chroma_collection:
                results = self.session_data.chroma_collection.query(
                    query_embeddings=[query_embedding.tolist() if isinstance(query_embedding, np.ndarray) else query_embedding],
                    n_results=min(top_k, self.session_data.chroma_collection.count())
                )
                
                content_texts = []
                sources = []
                
                if results["documents"] and len(results["documents"]) > 0:
                    for document, metadata in zip(results["documents"][0], results["metadatas"][0]):
                        content_texts.append(document[:500])
                        if "url" in metadata:
                            sources.append(metadata["url"])
                
                combined = "\n\n[Session Content]\n".join(content_texts) if content_texts else ""
                logger.info(f"[RAG] Retrieved {len(content_texts)} session content chunks from ChromaDB")
                
                return {
                    "texts": content_texts,
                    "sources": sources,
                    "combined": combined
                }
            else:
                # Fallback: use simple similarity matching without ChromaDB
                content_texts = []
                sources = []
                
                if hasattr(self.session_data, 'content_order'):
                    for url in self.session_data.content_order[:top_k]:
                        content = self.session_data.processed_content.get(url, "")
                        if content:
                            content_texts.append(content[:500])
                            sources.append(url)
                
                combined = "\n\n[Session Content]\n".join(content_texts) if content_texts else ""
                logger.info(f"[RAG] Retrieved {len(content_texts)} session content chunks (fallback mode)")
                
                return {
                    "texts": content_texts,
                    "sources": sources,
                    "combined": combined
                }
        except Exception as e:
            logger.warning(f"[RAG] Failed to get session content context: {e}")
            return {"texts": [], "sources": [], "combined": ""}

