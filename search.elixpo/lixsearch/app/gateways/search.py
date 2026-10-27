import logging
import uuid
import json
from datetime import datetime, timezone
from quart import request, jsonify, Response
from pipeline.searchPipeline import run_elixposearch_pipeline
from pipeline.lixsearch import PipelineErrorText
from app.utils import validate_query, validate_url, format_openai_response
from pipeline.config import X_REQ_ID_SLICE_SIZE, REQUEST_ID_HEX_SLICE_SIZE, LOG_MESSAGE_QUERY_TRUNCATE, RESPONSE_MODEL


def _ephemeral_session_id() -> str:
    return f"eph-{uuid.uuid4().hex[:16]}"

logger = logging.getLogger("lixsearch-api")


def format_sse_event_openai(event_type: str, content: str, request_id: str = None) -> str:
    is_done_signal = (event_type == "INFO" and "<TASK>DONE</TASK>" in content)
    response = {
        "id": request_id or f"elixpo-{uuid.uuid4().hex[:REQUEST_ID_HEX_SLICE_SIZE]}",
        "object": "chat.completion.chunk",
        "created": int(datetime.now(timezone.utc).timestamp()),
        "model": RESPONSE_MODEL,
        "choices": [
            {
                "index": 0,
                "delta": {
                    "role": "assistant",
                    "content": content
                },
                "finish_reason": "stop" if is_done_signal else None
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
            session_id = request.args.get("session_id", "").strip()
            query = request.args.get("query", "").strip()
            image_url = request.args.get("image_url") or request.args.get("image")
            images_param = request.args.getlist("images")
            stream_param = request.args.get("stream", "false").lower()
        else:
            data = await request.get_json()
            session_id = data.get("session_id", "").strip()
            query = data.get("query", "").strip()
            image_url = data.get("image_url") or data.get("image")
            images_param = data.get("images", [])
            stream_param = str(data.get("stream", "false")).lower()

        # Normalize images: support both single `image` and `images` array (max 3)
        image_urls = []
        if images_param and isinstance(images_param, list):
            image_urls = [u for u in images_param if isinstance(u, str) and u.strip()][:3]
        if image_url and image_url not in image_urls:
            image_urls.insert(0, image_url)
        image_urls = image_urls[:3]

        # For backward compat, set image_url to first image
        if image_urls:
            image_url = image_urls[0]

        is_ephemeral = not session_id
        if not session_id:
            session_id = _ephemeral_session_id()
            logger.info(f"[search] No session_id provided, using ephemeral: {session_id}")

        if not validate_query(query) and not image_urls:
            logger.warning(f"[{session_id}] Invalid query and no image: {query[:50]}")
            return jsonify({"error": "Invalid or missing query (provide query or image)"}), 400

        for img_url in image_urls:
            if not validate_url(img_url):
                logger.warning(f"[{session_id}] Invalid image_url: {img_url}")
                return jsonify({"error": f"Invalid image_url: {img_url}"}), 400

        stream_mode = stream_param not in ("false", "0", "no")

        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])

        logger.info(
            f"[{request_id}] search session={session_id} query={query[:LOG_MESSAGE_QUERY_TRUNCATE]}... "
            f"stream={stream_mode} images={len(image_urls)}"
        )

        if stream_mode:
            async def event_stream_generator():
                try:
                    async for chunk in run_elixposearch_pipeline(
                        user_query=query,
                        user_image=image_url,
                        user_images=image_urls,
                        event_id=request_id,
                        session_id=session_id,
                        is_ephemeral=is_ephemeral,
                    ):
                        chunk_str = chunk if isinstance(chunk, str) else chunk.decode('utf-8')

                        try:
                            lines = chunk_str.strip().split('\n')
                            event_type = None
                            event_data_lines = []

                            for line in lines:
                                if line.startswith('event:'):
                                    event_type = line.replace('event:', '').strip()
                                elif line.startswith('data:'):
                                    # Strip exactly one leading space (SSE spec), preserve the rest
                                    raw = line[5:]  # skip "data:"
                                    if raw.startswith(' '):
                                        raw = raw[1:]
                                    event_data_lines.append(raw)

                            event_data = "\n".join(event_data_lines) if event_data_lines else None
                            if event_type and event_data is not None:
                                openai_sse = format_sse_event_openai(event_type, event_data, request_id)
                                yield openai_sse.encode('utf-8')
                            else:
                                yield chunk_str.encode('utf-8') if isinstance(chunk, str) else chunk
                        except Exception as e:
                            logger.warning(f"[{request_id}] session={session_id} Failed to parse SSE: {e}")
                            yield chunk_str.encode('utf-8') if isinstance(chunk, str) else chunk
                except Exception as e:
                    # Keep the SSE protocol intact: explicit error event + DONE.
                    logger.error(f"[{request_id}] session={session_id} stream failed: {e}", exc_info=True)
                    yield format_sse_event_openai("ERROR", "The request failed unexpectedly. Please try again.", request_id).encode("utf-8")
                    yield format_sse_event_openai("INFO", "<TASK>DONE</TASK>", request_id).encode("utf-8")

            return Response(
                event_stream_generator(),
                mimetype='text/event-stream',
                headers={
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Content-Type': 'text/event-stream',
                    'X-Accel-Buffering': 'no',
                }
            )
        else:
            response_content = ""
            async for chunk in run_elixposearch_pipeline(
                user_query=query,
                user_image=image_url,
                user_images=image_urls,
                event_id=None,
                session_id=session_id,
                is_ephemeral=is_ephemeral,
            ):
                if chunk:
                    response_content = chunk  # non-streaming mode: pipeline yields raw text

            if isinstance(response_content, PipelineErrorText):
                return jsonify({"error": str(response_content), "code": response_content.code}), 503
            if not response_content:
                logger.error(f"[{request_id}] session={session_id} No response generated")
                return jsonify({"error": "No response generated"}), 500

            openai_response = format_openai_response(response_content, request_id)

            return Response(
                openai_response,
                mimetype='application/json',
                headers={
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json',
                }
            )

    except Exception as e:
        session_id = ""
        try:
            if request.method == 'GET':
                session_id = request.args.get("session_id", "")
            else:
                data = await request.get_json()
                session_id = data.get("session_id", "")
        except:
            pass

        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])
        logger.error(f"[{request_id}] session={session_id} Search error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
