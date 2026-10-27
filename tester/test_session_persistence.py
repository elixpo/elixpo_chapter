#!/usr/bin/env python3
"""
Test script to diagnose session context persistence issue.
Verifies that SessionContextWindow correctly writes to and reads from Redis.
"""

import sys
import time
sys.path.insert(0, '/mnt/volume_sfo2_01/lixSearch')

from lixsearch.ragService.semanticCacheRedis import SessionContextWindow
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("test_session_persistence")

def test_session_persistence():
    session_id = "test-session-123"
    
    logger.info("=" * 80)
    logger.info("TEST 1: Create SessionContextWindow and add user message")
    logger.info("=" * 80)
    
    try:
        # Simulate Request 1
        window1 = SessionContextWindow(session_id=session_id)
        logger.info(f"Created SessionContextWindow for {session_id}")
        
        window1.add_message(role="user", content="What is the capital of France?")
        logger.info("Added user message to window1")
        
        context1 = window1.get_context()
        logger.info(f"Context after adding user message: {len(context1)} messages")
        for msg in context1:
            logger.info(f"  - {msg['role'].upper()}: {msg['content'][:60]}")
        
        window1.add_message(role="assistant", content="The capital of France is Paris.")
        logger.info("Added assistant message to window1")
        
        context1 = window1.get_context()
        logger.info(f"Context after adding assistant message: {len(context1)} messages")
        for msg in context1:
            logger.info(f"  - {msg['role'].upper()}: {msg['content'][:60]}")
        
    except Exception as e:
        logger.error(f"Error in Request 1: {e}", exc_info=True)
        return False
    
    # Small delay to ensure Redis persistence
    time.sleep(0.5)
    
    logger.info("=" * 80)
    logger.info("TEST 2: Create NEW SessionContextWindow and check if messages persist")
    logger.info("=" * 80)
    
    try:
        # Simulate Request 2  with fresh SessionContextWindow instance
        window2 = SessionContextWindow(session_id=session_id)
        logger.info(f"Created NEW SessionContextWindow for {session_id}")
        
        context2 = window2.get_context()
        logger.info(f"Context from new window2 (before adding anything): {len(context2)} messages")
        for msg in context2:
            logger.info(f"  - {msg['role'].upper()}: {msg['content'][:60]}")
        
        if len(context2) == 0:
            logger.error("❌ FAILURE: NEW SessionContextWindow has NO messages from previous request!")
            logger.error("   This is the bug we need to fix.")
            return False
        
        if len(context2) != 2:
            logger.warning(f"⚠️  Expected 2 messages but got {len(context2)}")
            return False
        
        # Add second user message
        window2.add_message(role="user", content="What is the capital of Germany?")
        logger.info("Added second user message to window2")
        
        context2 = window2.get_context()
        logger.info(f"Context after adding second user message: {len(context2)} messages")
        for msg in context2:
            logger.info(f"  - {msg['role'].upper()}: {msg['content'][:60]}")
        
        if len(context2) != 3:
            logger.warning(f"⚠️  Expected 3 messages but got {len(context2)}")
            return False
        
    except Exception as e:
        logger.error(f"Error in Request 2: {e}", exc_info=True)
        return False
    
    logger.info("=" * 80)
    logger.info("TEST 3: Verify all messages in third request")
    logger.info("=" * 80)
    
    try:
        window3 = SessionContextWindow(session_id=session_id)
        logger.info(f"Created third SessionContextWindow for {session_id}")
        
        context3 = window3.get_context()
        logger.info(f"Context from window3 (simulating 3rd request): {len(context3)} messages")
        for i, msg in enumerate(context3, 1):
            logger.info(f"  {i}. {msg['role'].upper()}: {msg['content'][:60]}")
        
        if len(context3) != 3:
            logger.warning(f"⚠️  Expected 3 messages but got {len(context3)}")
            return False
        
        # Check that we can retrieve conversation history
        if context3[0]['role'] != 'user' or "France" not in context3[0]['content']:
            logger.error("❌ First message should be about France")
            return False
        
        if context3[1]['role'] != 'assistant' or "Paris" not in context3[1]['content']:
            logger.error("❌ Second message should be about Paris")
            return False
        
        if context3[2]['role'] != 'user' or "Germany" not in context3[2]['content']:
            logger.error("❌ Third message should be about Germany")
            return False
        
    except Exception as e:
        logger.error(f"Error in Request 3: {e}", exc_info=True)
        return False
    
    logger.info("=" * 80)
    logger.info("✅ ALL TESTS PASSED!")
    logger.info("=" * 80)
    
    # Clean up
    try:
        window3.clear()
        logger.info("Cleaned up test session")
    except:
        pass
    
    return True

if __name__ == "__main__":
    success = test_session_persistence()
    sys.exit(0 if success else 1)
