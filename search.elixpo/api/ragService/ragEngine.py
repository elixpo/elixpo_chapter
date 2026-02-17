from ragService.embeddingService import EmbeddingService
from ragService.retrievalPipeline import RetrievalPipeline
from ragService.vectorStore import VectorStore
from sessions.sessionData import SessionData
from ragService.semanticCache import SemanticCache
import numpy as np
from loguru import logger
from typing import Dict, Optional
from pipeline.config import LOG_MESSAGE_PREVIEW_TRUNCATE



class RAGEngine:
    def __init__(
        self,
        embedding_service: EmbeddingService,
        vector_store: VectorStore,
        semantic_cache: SemanticCache,
        session_data: SessionData
    ):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.semantic_cache = semantic_cache
        self.session_data = session_data
        self.retrieval_pipeline = RetrievalPipeline(
            embedding_service,
            vector_store
        )
        logger.info("[RAG] Optimized RAG engine initialized")
    
    def retrieve_context(
        self,
        query: str,
        url: Optional[str] = None,
        top_k: int = 5
    ) -> Dict:
        try:
            query_embedding = self.embedding_service.embed_single(query)
            
            if url:
                cached_response = self.semantic_cache.get(url, query_embedding)
                if cached_response:
                    logger.info(f"[RAG] Semantic cache HIT for {url}")
                    return {
                        "source": "semantic_cache",
                        "url": url,
                        "response": cached_response,
                        "latency_ms": 1.0
                    }
            
            # CRITICAL FIX #8: Try session data first, then global vector store
            session_content = self._get_session_content_context(query_embedding, top_k)
            
            # Get global vector store results
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
            
            session_context = self._get_session_context()
            
            full_context = ""
            if session_context:
                full_context += f"Context from previous exchanges:\n{session_context}\n\n"
            
            full_context += f"Retrieved Information:\n{context}"
            
            retrieval_result = {
                "source": "vector_store",
                "query": query,
                "context": full_context,
                "sources": sources,
                "chunk_count": len(results),
                "scores": [r["score"] for r in results],
                "query_embedding": query_embedding.tolist() if isinstance(query_embedding, np.ndarray) else query_embedding
            }
            
            if url:
                self.semantic_cache.set(url, query_embedding, retrieval_result)
            
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
    
    
    def get_full_context(self, query: str, top_k: int = 5) -> Dict:
        retrieval_result = self.retrieve_context(query, top_k=top_k)
        
        return {
            "query": query,
            "context": retrieval_result.get("context", ""),
            "sources": retrieval_result.get("sources", []),
            "cache_hit": retrieval_result.get("source") == "semantic_cache",
            "scores": retrieval_result.get("scores", [])
        }
    
    def get_stats(self) -> Dict:
        return {
            "vector_store": self.vector_store.get_stats(),
            "semantic_cache": self.semantic_cache.get_stats(),
            "session_memory": self.session_data.to_dict()
        }
    
    def build_rag_prompt_enhancement(self, session_id: str, top_k: int = 5) -> str:
        try:
            # Get session memory context
            context_parts = []
            
            if self.session_data:
                session_context = self._get_session_context()
                if session_context:
                    context_parts.append("=== Previous Context ===")
                    context_parts.append(session_context)
                    context_parts.append("")
            
            # Return formatted context for system prompt
            rag_prompt = "\n".join(context_parts) if context_parts else ""
            logger.info(f"[RAG] Built prompt enhancement: {len(rag_prompt)} chars")
            return rag_prompt
        
        except Exception as e:
            logger.error(f"[RAG] Failed to build prompt enhancement: {e}")
            return ""
    
    def _get_session_context(self) -> str:
        """Extract context from SessionData's conversation history."""
        if not self.session_data:
            return ""
        
        try:
            history = self.session_data.get_conversation_history()
            if not history:
                return ""
            
            # Build context from recent conversation turns
            context_parts = []
            # Keep last 2-3 turns for context
            for msg in history[-3:]:
                role = msg.get("role", "unknown")
                content = msg.get("content", "")
                if content:
                    context_parts.append(f"{role.capitalize()}: {content[:LOG_MESSAGE_PREVIEW_TRUNCATE]}")
            
            return "\n".join(context_parts) if context_parts else ""
        except Exception as e:
            logger.warning(f"[RAG] Failed to extract session context: {e}")
            return ""
    
    def _get_session_content_context(self, query_embedding: np.ndarray, top_k: int = 5) -> Dict:
        """CRITICAL FIX #8: Get relevant content from session's fetched URLs using ChromaDB."""
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

