"""Vector-based long-term memory management using Qdrant."""

import asyncio
import logging
import time
import uuid
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from sentence_transformers import SentenceTransformer

from memory_system.config import (
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_VECTOR_DB_PATH,
    LTM_IMPORTANCE_THRESHOLD,
    LTM_SEARCH_RESULTS,
)

logger = logging.getLogger(__name__)


class VectorMemoryManager:
    """
    Manages long-term memory storage and retrieval using Qdrant vector database.
    
    This class handles:
    - Embedding generation using sentence-transformers
    - Vector storage in Qdrant
    - Semantic search with importance-based filtering
    - Two-pass search (important memories + general relevance)
    """
    
    def __init__(
        self,
        storage_path: str = DEFAULT_VECTOR_DB_PATH,
        embedding_model: str = DEFAULT_EMBEDDING_MODEL,
    ):
        """
        Initialize the vector memory manager.
        
        Args:
            storage_path: Path for Qdrant database storage
            embedding_model: Name of the sentence-transformers model to use
                Can be any HuggingFace model name or local path
        """
        self.storage_path = storage_path
        self.embedding_model_name = embedding_model
        
        # Initialize embedding model with lazy loading and auto-download
        logger.info(f"Loading embedding model: {embedding_model}")
        try:
            self.embedding_model = SentenceTransformer(embedding_model)
            self.embedding_dim = self.embedding_model.get_sentence_embedding_dimension()
            logger.info(f"Successfully loaded embedding model (dimension: {self.embedding_dim})")
        except Exception as e:
            logger.error(f"Failed to load embedding model '{embedding_model}': {e}")
            logger.info("Falling back to default model: all-MiniLM-L6-v2")
            self.embedding_model = SentenceTransformer(DEFAULT_EMBEDDING_MODEL)
            self.embedding_dim = self.embedding_model.get_sentence_embedding_dimension()
            self.embedding_model_name = DEFAULT_EMBEDDING_MODEL
        
        # Initialize Qdrant client (local mode)
        logger.info(f"Initializing Qdrant client at: {storage_path}")
        self.client = QdrantClient(path=storage_path)
        
        # Cache for collection names to avoid repeated checks
        self._collections_cache: set[str] = set()
    
    def _ensure_collection(self, context_id: str) -> None:
        """
        Ensure a collection exists for the given context.
        
        Args:
            context_id: Unique identifier for the conversation context
        """
        if context_id in self._collections_cache:
            return
        
        try:
            # Check if collection exists
            collections = self.client.get_collections().collections
            collection_names = [c.name for c in collections]
            
            if context_id not in collection_names:
                # Create collection with cosine distance
                self.client.create_collection(
                    collection_name=context_id,
                    vectors_config=VectorParams(
                        size=self.embedding_dim,
                        distance=Distance.COSINE,
                    ),
                )
                logger.info(f"Created Qdrant collection: {context_id}")
            
            self._collections_cache.add(context_id)
        except Exception as e:
            logger.error(f"Failed to ensure collection {context_id}: {e}")
            raise
    
    async def add_memory(
        self,
        summary_text: str,
        context_id: str,
        importance_score: int = 5,
    ) -> None:
        """
        Add a memory summary to the vector database.
        
        Args:
            summary_text: The summarized memory text
            context_id: Context identifier (collection name)
            importance_score: Importance rating (1-10)
        """
        def _blocking_add():
            try:
                self._ensure_collection(context_id)
                
                # Generate embedding
                embedding = self.embedding_model.encode(summary_text).tolist()
                
                # Create point with metadata
                point = PointStruct(
                    id=str(uuid.uuid4()),
                    vector=embedding,
                    payload={
                        "summary": summary_text,
                        "importance": importance_score,
                        "created_at": time.time(),
                    },
                )
                
                # Insert into Qdrant
                self.client.upsert(
                    collection_name=context_id,
                    points=[point],
                )
                
                logger.info(
                    f"Added LTM summary (importance={importance_score}) to '{context_id}'"
                )
            except Exception as e:
                logger.error(f"Failed to add memory to {context_id}: {e}")
        
        await asyncio.to_thread(_blocking_add)
    
    async def search_memories(
        self,
        query_text: str,
        context_id: str,
        n_results: int = LTM_SEARCH_RESULTS,
    ) -> list[dict[str, Any]]:
        """
        Search for relevant memories using two-pass system.
        
        First pass: Search for highly important memories (score >= threshold)
        Second pass: General relevance search
        Results are combined and deduplicated.
        
        Args:
            query_text: Query text for semantic search
            context_id: Context identifier
            n_results: Number of results to return
            
        Returns:
            List of memory dicts with 'summary', 'importance', 'created_at'
        """
        def _blocking_search():
            try:
                self._ensure_collection(context_id)
                
                # Check if collection has any points
                collection_info = self.client.get_collection(context_id)
                if collection_info.points_count == 0:
                    logger.debug(f"No memories found in collection: {context_id}")
                    return []
                
                # Generate query embedding
                query_embedding = self.embedding_model.encode(query_text).tolist()
                
                # Pass 1: Search for important memories
                important_results = self.client.search(
                    collection_name=context_id,
                    query_vector=query_embedding,
                    limit=n_results,
                    query_filter=Filter(
                        must=[
                            FieldCondition(
                                key="importance",
                                range={"gte": LTM_IMPORTANCE_THRESHOLD},
                            )
                        ]
                    ),
                )
                
                # Pass 2: General relevance search
                general_results = self.client.search(
                    collection_name=context_id,
                    query_vector=query_embedding,
                    limit=n_results,
                )
                
                # Combine and deduplicate results
                seen_ids = set()
                combined_memories = []
                
                for result in important_results + general_results:
                    if result.id not in seen_ids:
                        seen_ids.add(result.id)
                        combined_memories.append({
                            "summary": result.payload["summary"],
                            "importance": result.payload["importance"],
                            "created_at": result.payload["created_at"],
                        })
                
                logger.info(
                    f"Found {len(combined_memories)} relevant memories in '{context_id}'"
                )
                return combined_memories
            
            except Exception as e:
                logger.error(f"Failed to search memories in {context_id}: {e}")
                return []
        
        return await asyncio.to_thread(_blocking_search)
    
    async def reset(self, context_id: str) -> bool:
        """
        Delete all memories for a context by deleting the collection.
        
        Args:
            context_id: Context identifier
            
        Returns:
            True if collection was deleted, False if it didn't exist or error occurred
        """
        def _blocking_reset():
            try:
                # Check if collection exists
                collections = self.client.get_collections().collections
                collection_names = [c.name for c in collections]
                
                if context_id not in collection_names:
                    logger.debug(f"Collection {context_id} does not exist")
                    return False
                
                # Delete collection
                self.client.delete_collection(context_id)
                
                # Remove from cache
                if context_id in self._collections_cache:
                    self._collections_cache.remove(context_id)
                
                logger.info(f"Reset LTM for context: {context_id}")
                return True
            
            except Exception as e:
                logger.error(f"Failed to reset memories for {context_id}: {e}")
                return False
        
        return await asyncio.to_thread(_blocking_reset)
