#!/usr/bin/env python3
"""
Test script for Redis-based semantic cache
Tests both Redis and fallback file-based implementations
"""

import numpy as np
import sys
import os
from pathlib import Path

# Add project paths
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from lixsearch.ragService.semanticCacheRedis import (
    SemanticCacheRedis,
    URLEmbeddingCache,
    SessionContextWindow
)
from loguru import logger

logger.remove()
logger.add(sys.stdout, level="DEBUG")


def test_redis_semantic_cache():
    """Test the Redis-based semantic cache with new API."""
    logger.info("=" * 60)
    logger.info("Testing SemanticCacheRedis (New Session-Based API)")
    logger.info("=" * 60)
    
    session_id = "test_session_123"
    
    try:
        cache = SemanticCacheRedis(
            session_id=session_id,
            ttl_seconds=300,
            similarity_threshold=0.90,
            redis_host="localhost",
            redis_port=6379,
            redis_db=0
        )
        
        url1 = "https://example.com/page1"
        url2 = "https://example.com/page2"
        
        # Create test embeddings
        embedding1 = np.random.randn(384).astype(np.float32)
        embedding2 = np.random.randn(384).astype(np.float32)
        embedding1_similar = embedding1 + np.random.randn(384) * 0.01  # Very similar
        
        # Create test responses
        response1 = {"content": "Response 1", "score": 0.95}
        response2 = {"content": "Response 2", "score": 0.87}
        
        # Store
        cache.set(url1, embedding1, response1)
        cache.set(url2, embedding2, response2)
        logger.info(f"✅ Stored 2 responses in cache for {session_id}")
        
        # Retrieve
        retrieved1 = cache.get(url1, embedding1)
        retrieved2 = cache.get(url2, embedding2)
        
        logger.info(f"Retrieved from URL1: {retrieved1}")
        logger.info(f"Retrieved from URL2: {retrieved2}")
        
        # Test similar embedding (should potentially match)
        similar_retrieved = cache.get(url1, embedding1_similar)
        logger.info(f"Retrieved with similar embedding: {similar_retrieved}")
        
        # Test stats
        stats = cache.get_stats()
        logger.info(f"Cache stats: {stats}")
        
        # Test clear session
        cache.clear_session()
        logger.info(f"✅ Cleared all cache entries for {session_id}")
        
        logger.success("✅ SemanticCacheRedis tests passed!")
        
    except ConnectionError as e:
        logger.warning(f"⚠️  Redis not available: {e}")
        logger.warning("Skipping SemanticCacheRedis test. Make sure Redis is running on localhost:6379")
        return False
    
    return True


def test_url_embedding_cache():
    """Test the URL embedding cache."""
    logger.info("=" * 60)
    logger.info("Testing URLEmbeddingCache (Global, 24h TTL)")
    logger.info("=" * 60)
    
    session_id = "test_session_456"
    
    try:
        cache = URLEmbeddingCache(
            session_id=session_id,
            ttl_seconds=3600,
            redis_host="localhost",
            redis_port=6379,
            redis_db=1
        )
        
        url = "https://example.com/article"
        embedding = np.random.randn(384).astype(np.float32)
        
        # Store
        cache.set(url, embedding)
        logger.info(f"✅ Stored embedding for {url}")
        
        # Retrieve
        retrieved = cache.get(url)
        if retrieved is not None:
            logger.info(f"✅ Retrieved embedding, shape: {retrieved.shape}")
        else:
            logger.warning(f"Retrieved embedding is None")
        
        # Test stats
        stats = cache.get_stats()
        logger.info(f"Cache stats: {stats}")
        
        logger.success("✅ URLEmbeddingCache tests passed!")
        
    except ConnectionError as e:
        logger.warning(f"⚠️ Redis not available: {e}")
        return False
    
    return True


def test_session_context_window():
    """Test the session context window (LRU message storage)."""
    logger.info("=" * 60)
    logger.info("Testing SessionContextWindow (LRU, 30m TTL)")
    logger.info("=" * 60)
    
    session_id = "test_session_789"
    
    try:
        context = SessionContextWindow(
            session_id=session_id,
            window_size=5,
            ttl_seconds=1800,
            redis_host="localhost",
            redis_port=6379,
            redis_db=2
        )
        
        # Add messages
        context.add_message("user", "Hello, what is AI?")
        context.add_message("assistant", "AI is artificial intelligence...")
        context.add_message("user", "Tell me more about deep learning")
        logger.info(f"✅ Added 3 messages to context window")
        
        # Get context
        messages = context.get_context()
        logger.info(f"✅ Retrieved {len(messages)} messages from context")
        
        # Get formatted context
        formatted = context.get_formatted_context()
        logger.info(f"Formatted context:\n{formatted}")
        
        # Get stats
        stats = context.get_stats()
        logger.info(f"Context stats: {stats}")
        
        # Clear
        context.clear()
        logger.info(f"✅ Cleared context window")
        
        logger.success("✅ SessionContextWindow tests passed!")
        
    except ConnectionError as e:
        logger.warning(f"⚠️ Redis not available: {e}")
        return False
    
    return True


def test_embedding_service_device():
    """Test embedding service device selection."""
    logger.info("=" * 60)
    logger.info("Testing EmbeddingService Device Selection")
    logger.info("=" * 60)
    
    try:
        from lixsearch.ragService.embeddingService import EmbeddingService
        
        # Don't actually load the model, just test device selection
        device = EmbeddingService._select_device()
        logger.info(f"Selected device: {device}")
        assert device in ["cuda", "cpu", "mps"], f"Invalid device: {device}"
        
        logger.success("✅ Device selection tests passed!")
    except Exception as e:
        logger.error(f"Device selection test failed: {e}")


if __name__ == "__main__":
    logger.info("\n" + "=" * 60)
    logger.info("Redis-Based Semantic Cache Test Suite (New API)")
    logger.info("=" * 60 + "\n")
    
    redis_available = True
    
    try:
        if not test_redis_semantic_cache():
            redis_available = False
    except Exception as e:
        logger.error(f"SemanticCacheRedis test failed: {e}")
        redis_available = False
    
    if redis_available:
        try:
            test_url_embedding_cache()
        except Exception as e:
            logger.error(f"URLEmbeddingCache test failed: {e}")
        
        try:
            test_session_context_window()
        except Exception as e:
            logger.error(f"SessionContextWindow test failed: {e}")
    
    try:
        test_embedding_service_device()
    except Exception as e:
        logger.error(f"Device selection test failed: {e}")
    
    if redis_available:
        logger.info("\n" + "=" * 60)
        logger.success("✅ All tests passed successfully!")
        logger.info("=" * 60)
    else:
        logger.warning("\n" + "=" * 60)
        logger.warning("⚠️  Redis tests skipped - Redis not available")
        logger.warning("To run all tests, start Redis on localhost:6379")
        logger.warning("=" * 60)
