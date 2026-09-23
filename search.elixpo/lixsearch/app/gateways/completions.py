import logging
import uuid
import json
import base64
import os
from datetime import datetime, timezone
from urllib.parse import quote
from quart import request, jsonify, Response
from pipeline.searchPipeline import run_elixposearch_pipeline
from pipeline.config import (
    AGENT_STREAM_CHUNK_CHARS,
    AGENT_STREAM_DEFAULT,
    REQUEST_ID_HEX_SLICE_SIZE,
    LOG_MESSAGE_QUERY_TRUNCATE,
    RESPONSE_MODEL,
)
from pipeline.streaming import TaskAwareChunkBuffer
from app.gateways.image import store_image

logger = logging.getLogger("lixsearch-api")

_PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://search.elixpo.com").rstrip("/")


def _ephemeral_session_id() -> str:
    return f"eph-{uuid.uuid4().hex[:16]}"


def _b64_data_url_to_hosted(data_url: str) -> str:
    """Convert a data:image/...;base64,... URL to a hosted /api/image/ URL."""
    try:
        header, payload = data_url.split(",", 1)
        # header looks like "data:image/png;base64"
        ct = "image/png"
        if ":" in header and ";" in header:
            ct = header.split(":")[1].split(";")[0]
        image_bytes = base64.b64decode(payload)
        image_id = uuid.uuid4().hex[:16]
        capability = store_image(image_id, image_bytes, ct)
        access = f"?access={quote(capability, safe='')}" if capability else ""
        return f"{_PUBLIC_BASE_URL}/api/image/{image_id}.png{access}"
    except Exception as e:
        logger.warning(f"[completions] Failed to host base64 image: {e}")
        return data_url  # fallback: pass through as-is


def _format_chunk(request_id: str, content: str, finish_reason=None, event_type: str = "RESPONSE") -> str:
    chunk = {
        "id": request_id,
        "object": "chat.completion.chunk",
        "created": int(datetime.now(timezone.utc).timestamp()),
        "model": RESPONSE_MODEL,
        "choices": [
            {
                "index": 0,
                "delta": {"content": content} if content else {},
                "finish_reason": finish_reason,
            }
        ],
    }
    if event_type != "RESPONSE":
        chunk["event_type"] = event_type
    return f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"


def _format_completion(request_id: str, content: str, prompt_tokens: int = 0) -> dict:
    completion_tokens = len(content) // 4
    return {
        "id": request_id,
        "object": "chat.completion",
        "created": int(datetime.now(timezone.utc).timestamp()),
        "model": RESPONSE_MODEL,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    }


async def chat_completions(pipeline_initialized: bool):

    if not pipeline_initialized:
        return jsonify({"error": {"message": "Server not initialized", "type": "server_error"}}), 503

    request_id = f"elixpo-{uuid.uuid4().hex[:REQUEST_ID_HEX_SLICE_SIZE]}"

    try:
        data = await request.get_json()
        if not data:
            return jsonify({"error": {"message": "Request body required", "type": "invalid_request_error"}}), 400

        messages = data.get("messages")
        if not messages or not isinstance(messages, list):
            return jsonify({"error": {"message": "messages array is required", "type": "invalid_request_error"}}), 400

        stream = data.get("stream", AGENT_STREAM_DEFAULT) is not False
        # OpenAI Chat Completions is stateless: continuity comes only from messages.
        session_id = _ephemeral_session_id()

        # Extract the last user message as the query
        user_query = ""
        image_urls = []
        for msg in reversed(messages):
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, str):
                    user_query = content.strip()
                elif isinstance(content, list):
                    # OpenAI vision format: [{"type": "text", "text": "..."}, {"type": "image_url", ...}]
                    for part in content:
                        if part.get("type") == "text":
                            user_query = part.get("text", "").strip()
                        elif part.get("type") == "image_url":
                            url = part.get("image_url", {}).get("url", "")
                            if url:
                                # Convert base64 data URLs to hosted URLs
                                if url.startswith("data:"):
                                    url = _b64_data_url_to_hosted(url)
                                image_urls.append(url)
                break

        if not user_query and not image_urls:
            return jsonify({"error": {"message": "No user message found in messages", "type": "invalid_request_error"}}), 400

        # Build chat history: all messages before the last user message (exclude system)
        chat_history = []
        for msg in messages[:-1] if messages else []:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                if isinstance(content, list):
                    # Flatten vision-format content to text
                    text_parts = [p.get("text", "") for p in content if p.get("type") == "text"]
                    content = " ".join(text_parts)
                chat_history.append({"role": role, "content": content})

        is_ephemeral = True

        image_url = image_urls[0] if image_urls else None

        logger.info(
            f"[{request_id}] /v1/chat/completions session={session_id} "
            f"query={user_query[:LOG_MESSAGE_QUERY_TRUNCATE]}... "
            f"stream={stream} history={len(chat_history)} images={len(image_urls)}"
        )

        if stream:
            async def stream_generator():
                buffer = TaskAwareChunkBuffer(AGENT_STREAM_CHUNK_CHARS)

                def formatted(events):
                    for kind, value in events:
                        yield _format_chunk(
                            request_id, value,
                            event_type="RESPONSE" if kind == "text" else "INFO",
                        )

                async for chunk in run_elixposearch_pipeline(
                    user_query=user_query,
                    user_image=image_url,
                    user_images=image_urls if image_urls else None,
                    event_id=request_id,
                    session_id=session_id,
                    chat_history=chat_history if chat_history else None,
                    is_ephemeral=is_ephemeral,
                ):
                    chunk_str = chunk if isinstance(chunk, str) else chunk.decode("utf-8")

                    try:
                        lines = chunk_str.splitlines()
                        event_type = None
                        event_data_lines = []
                        for line in lines:
                            if line.startswith("event:"):
                                event_type = line.replace("event:", "").strip()
                            elif line.startswith("data:"):
                                raw = line[5:]
                                if raw.startswith(" "):
                                    raw = raw[1:]
                                event_data_lines.append(raw)

                        event_data = "\n".join(event_data_lines) if event_data_lines else None
                        if event_type and event_data is not None:
                            if event_type == "RESPONSE":
                                for output in formatted(buffer.feed(event_data)):
                                    yield output
                            else:
                                for output in formatted(buffer.flush()):
                                    yield output
                                yield _format_chunk(request_id, event_data, event_type=event_type)
                        else:
                            for output in formatted(buffer.flush()):
                                yield output
                            yield chunk_str
                    except Exception as e:
                        logger.warning(f"[{request_id}] session={session_id} Failed to parse SSE: {e}")
                        for output in formatted(buffer.flush()):
                            yield output
                        yield chunk_str

                for output in formatted(buffer.flush()):
                    yield output
                yield _format_chunk(request_id, "", finish_reason="stop")
                yield "data: [DONE]\n\n"

            return Response(
                stream_generator(),
                mimetype="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Content-Type": "text/event-stream",
                    "X-Accel-Buffering": "no",
                    "X-Request-ID": request_id,
                },
            )
        else:
            # Non-streaming: collect full response
            response_content = ""
            async for chunk in run_elixposearch_pipeline(
                user_query=user_query,
                user_image=image_url,
                user_images=image_urls if image_urls else None,
                event_id=None,
                session_id=session_id,
                chat_history=chat_history if chat_history else None,
                is_ephemeral=is_ephemeral,
            ):
                if chunk:
                    response_content = chunk  # non-streaming: pipeline yields final text

            if not response_content:
                return jsonify({"error": {"message": "No response generated", "type": "server_error"}}), 500

            def _msg_tokens(m):
                c = m.get("content", "")
                if isinstance(c, list):
                    return sum(len(p.get("text", "")) for p in c if p.get("type") == "text") // 4
                return len(c) // 4
            prompt_tokens = sum(_msg_tokens(m) for m in messages)
            result = _format_completion(request_id, response_content, prompt_tokens)

            return Response(
                json.dumps(result, ensure_ascii=False),
                mimetype="application/json",
                headers={"Content-Type": "application/json", "X-Request-ID": request_id},
            )

    except Exception as e:
        logger.error(f"[{request_id}] /v1/chat/completions error: {e}", exc_info=True)
        return jsonify({"error": {"message": "Internal server error", "type": "server_error"}}), 500
