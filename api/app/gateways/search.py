import logging
import uuid
import json
from datetime import datetime, timezone
from quart import request, jsonify, Response
from pipeline.searchPipeline import run_elixposearch_pipeline
from app.utils import validate_query, validate_url, format_openai_response
import os

logger = logging.getLogger("lixsearch-api")


def format_sse_event_openai(event_type: str, content: str, request_id: str = None) -> str:
    model = os.getenv("MODEL")
    escaped_content = content.replace('\n', '\\n')
    response = {
        "id": request_id or f"chatcmpl-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion.chunk",
        "created": int(datetime.now(timezone.utc).timestamp()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {
                    "role": "assistant" if event_type == "INFO" else "content",
                    "content": escaped_content
                },
                "finish_reason": "stop" if event_type == "final" else None
            }
        ],
        "event_type": event_type 
    }
    
    json_str = json.dumps(response, ensure_ascii=False)
    return f"data: {json_str}\n\n"


async def search(pipeline_initialized: bool):
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503

    try:
        if request.method == 'GET':
            query = request.args.get("query", "").strip()
            image_url = request.args.get("image_url") or request.args.get("image")
            stream_param = request.args.get("stream", "true").lower()
        else:
            data = await request.get_json()
            query = data.get("query", "").strip()
            image_url = data.get("image_url") or data.get("image")
            stream_param = str(data.get("stream", "true")).lower()

        # Parse stream parameter (default True)
        stream_mode = stream_param not in ("false", "0", "no")

        if not validate_query(query):
            return jsonify({"error": "Invalid or missing query"}), 400

        if image_url and not validate_url(image_url):
            return jsonify({"error": "Invalid image_url"}), 400

        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])

        logger.info(f"[{request_id}] Search: {query[:50]}... [stream={stream_mode}]")

        # Streaming mode: SSE with OpenAI-format JSON events
        if stream_mode:
            async def event_stream_generator():
                async for chunk in run_elixposearch_pipeline(
                    user_query=query,
                    user_image=image_url,
                    event_id=request_id,  # Enable SSE format from pipeline
                    request_id=request_id
                ):
                    # Parse SSE event: "event: TYPE\ndata: CONTENT\n\n"
                    chunk_str = chunk if isinstance(chunk, str) else chunk.decode('utf-8')
                    
                    try:
                        lines = chunk_str.strip().split('\n')
                        event_type = None
                        event_data = None
                        
                        for line in lines:
                            if line.startswith('event:'):
                                event_type = line.replace('event:', '').strip()
                            elif line.startswith('data:'):
                                event_data = line.replace('data:', '').strip()
                        
                        if event_type and event_data:
                            # Reformat as OpenAI-compatible SSE JSON
                            openai_sse = format_sse_event_openai(event_type, event_data, request_id)
                            yield openai_sse.encode('utf-8')
                        else:
                            # Fallback: pass through as-is if parsing fails
                            yield chunk_str.encode('utf-8') if isinstance(chunk, str) else chunk
                    except Exception as e:
                        logger.warning(f"[{request_id}] Failed to parse SSE event: {e}, passing through")
                        yield chunk_str.encode('utf-8') if isinstance(chunk, str) else chunk

            return Response(
                event_stream_generator(),
                mimetype='text/event-stream',
                headers={
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Content-Type': 'text/event-stream',
                    'Access-Control-Allow-Origin': '*'
                }
            )
        
        # Non-streaming mode: Single JSON response
        else:
            response_content = None
            async for chunk in run_elixposearch_pipeline(
                user_query=query,
                user_image=image_url,
                event_id=None,  # Disable SSE format, yield raw content
                request_id=request_id
            ):
                response_content = chunk

            if not response_content:
                return jsonify({"error": "No response generated"}), 500

            openai_response = format_openai_response(response_content, request_id)

            return Response(
                openai_response,
                mimetype='application/json',
                headers={
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            )

    except Exception as e:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])
        logger.error(f"[{request_id}] Search error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
