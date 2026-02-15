import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import logging
import os
import asyncio
from pipeline.lixsearch import run_elixposearch_pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("elixpo")

if __name__ == "__main__":
    import asyncio
    from commons.requestID import reqID
    async def main():
        user_query = "what was the first thing I asked you?"
        user_image = None
        event_id = None
        request_id = "test-request-001"
        start_time = asyncio.get_event_loop().time()
        async_generator = run_elixposearch_pipeline(user_query, user_image, event_id=event_id, request_id=request_id)
        answer = None
        try:
            async for event_chunk in async_generator:
                if event_chunk and "event: final" in event_chunk:
                    lines = event_chunk.split('\n')
                    for line in lines:
                        if line.startswith('data: '):
                            if answer is None:
                                answer = line[6:]
                            else:
                                answer += line[6:]
                    break
                elif event_chunk and "event: final-part" in event_chunk:
                    lines = event_chunk.split('\n')
                    for line in lines:
                        if line.startswith('data: '):
                            if answer is None:
                                answer = line[6:]
                            else:
                                answer += line[6:]
        except Exception as e:
            logger.error(f"Error during async generator iteration: {e}", exc_info=True)
            answer = "Failed to get answer due to an error."
        end_time = asyncio.get_event_loop().time()
        processing_time = end_time - start_time
        if answer:
            print(f"\n--- Final Answer Received in {processing_time:.2f}s ---\n{answer}")
        else:
            print(f"\n--- No answer received after {processing_time:.2f}s ---")
    asyncio.run(main())