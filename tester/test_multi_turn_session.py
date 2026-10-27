#!/usr/bin/env python3
"""
Integration test for multi-turn session persistence.
Simulates a real chat session with multiple requests using the same session_id.
"""

import sys
import asyncio
import json
import uuid
sys.path.insert(0, '/mnt/volume_sfo2_01/lixSearch')

from lixsearch.pipeline.lixsearch import run_elixposearch_pipeline
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("test_multi_turn")

async def simulate_conversation():
    """Simulate a multi-turn conversation with the same session_id."""
    
    session_id = f"test-session-{uuid.uuid4().hex[:8]}"
    logger.info(f"Starting test session: {session_id}")
    logger.info("=" * 80)
    
    # Turn 1: First question
    logger.info("TURN 1: Asking about Python")
    logger.info("-" * 80)
    
    query1 = "What are the main features of Python?"
    all_output1 = []
    
    async for chunk in run_elixposearch_pipeline(
        user_query=query1,
        session_id=session_id,
        event_id="test-event-1",
        request_id="test-req-1"
    ):
        if isinstance(chunk, str):
            all_output1.append(chunk)
    
    response1 = "".join(all_output1)
    logger.info(f"Q1: {query1}")
    logger.info(f"Response length: {len(response1)} chars")
    logger.info("✓ Turn 1 completed")
    
    # Turn 2: Follow-up question
    logger.info("\nTURN 2: Follow-up about Python libraries")
    logger.info("-" * 80)
    
    query2 = "What are some popular Python libraries?"
    all_output2 = []
    
    async for chunk in run_elixposearch_pipeline(
        user_query=query2,
        session_id=session_id,
        event_id="test-event-2",
        request_id="test-req-2"
    ):
        if isinstance(chunk, str):
            all_output2.append(chunk)
    
    response2 = "".join(all_output2)
    logger.info(f"Q2: {query2}")
    logger.info(f"Response length: {len(response2)} chars")
    logger.info("✓ Turn 2 completed")
    
    # Turn 3: Ask for conversation summary
    logger.info("\nTURN 3: Asking for conversation summary")
    logger.info("-" * 80)
    
    query3 = "Can you summarize what we've discussed so far?"
    all_output3 = []
    
    async for chunk in run_elixposearch_pipeline(
        user_query=query3,
        session_id=session_id,
        event_id="test-event-3",
        request_id="test-req-3"
    ):
        if isinstance(chunk, str):
            all_output3.append(chunk)
    
    response3 = "".join(all_output3)
    logger.info(f"Q3: {query3}")
    logger.info(f"Response: {response3[:200]}...")  # First 200 chars
    logger.info("✓ Turn 3 completed")
    
    # Verify the summary mentions previous topics
    logger.info("\nVERIFICATION:")
    logger.info("-" * 80)
    
    success = True
    
    if "No previous conversation found" in response3 or "no conversation history" in response3.lower():
        logger.error("❌ FAILURE: Summary indicates no previous conversation was found!")
        logger.error("   The session persistence is broken.")
        success = False
    elif "Python" in response3 or "features" in response3 or "libraries" in response3:
        logger.info("✓ Summary references previous topics")
    else:
        logger.warning("⚠️  Summary might not properly reference previous topics")
    
    if success:
        logger.info("\n" + "=" * 80)
        logger.info("✅ SESSION PERSISTENCE TEST PASSED!")
        logger.info("=" * 80)
    else:
        logger.info("\n" + "=" * 80)
        logger.info("❌ SESSION PERSISTENCE TEST FAILED!")
        logger.info("=" * 80)
    
    return success

if __name__ == "__main__":
    try:
        success = asyncio.run(simulate_conversation())
        sys.exit(0 if success else 1)
    except Exception as e:
        logger.error(f"Test error: {e}", exc_info=True)
        sys.exit(1)
