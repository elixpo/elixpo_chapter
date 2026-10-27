import logging
import uuid
from datetime import datetime
from quart import request, jsonify, Response
from sessions.main import get_session_manager
from chatEngine.main import get_chat_engine
from pipeline.config import X_REQ_ID_SLICE_SIZE, LOG_MESSAGE_QUERY_TRUNCATE
from app.utils import validate_session_id


def _ephemeral_session_id() -> str:
    return f"eph-{uuid.uuid4().hex[:16]}"

logger = logging.getLogger("lixsearch-api")


async def chat(pipeline_initialized: bool):
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503

    try:
        data = await request.get_json()
        user_message = data.get("message", "").strip()
        session_id = data.get("session_id", "").strip() if data.get("session_id") else None
        use_search = data.get("search", True)
        image_url = data.get("image_url")

        if not user_message:
            return jsonify({"error": "Message is required"}), 400

        if not session_id:
            session_id = _ephemeral_session_id()
            logger.info(f"[chat] No session_id provided, using ephemeral: {session_id}")

        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])
        logger.info(
            f"[{request_id}] chat session={session_id} message={user_message[:LOG_MESSAGE_QUERY_TRUNCATE]}... "
            f"search={use_search} image={bool(image_url)}"
        )

        chat_engine = get_chat_engine()

        async def event_generator():
            if use_search:
                async for chunk in chat_engine.chat_with_search(session_id, user_message):
                    yield chunk.encode('utf-8')
            else:
                async for chunk in chat_engine.generate_contextual_response(session_id, user_message):
                    yield chunk.encode('utf-8')

        return Response(
            event_generator(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Content-Type': 'text/event-stream',
            }
        )

    except Exception as e:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])
        logger.error(f"[{request_id}] chat error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


async def session_chat(session_id: str, pipeline_initialized: bool):
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503

    if not validate_session_id(session_id):
        return jsonify({"error": "Invalid session_id"}), 400

    try:
        session_manager = get_session_manager()

        if not session_manager.get_session(session_id):
            logger.warning(f"[session_chat] Session not found: {session_id}")
            return jsonify({"error": "Session not found"}), 404

        data = await request.get_json()
        user_message = data.get("message", "").strip()
        use_search = data.get("search", False)
        image_url = data.get("image_url")

        if not user_message:
            return jsonify({"error": "Message is required"}), 400

        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])
        logger.info(
            f"[{request_id}] session_chat session={session_id} message={user_message[:LOG_MESSAGE_QUERY_TRUNCATE]}... "
            f"search={use_search}"
        )

        chat_engine = get_chat_engine()

        async def event_generator():
            if use_search:
                async for chunk in chat_engine.chat_with_search(session_id, user_message):
                    yield chunk.encode('utf-8')
            else:
                async for chunk in chat_engine.generate_contextual_response(session_id, user_message):
                    yield chunk.encode('utf-8')

        return Response(
            event_generator(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Content-Type': 'text/event-stream',
            }
        )

    except Exception as e:
        logger.error(f"[session_chat] session={session_id} error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


async def chat_completions(session_id: str, pipeline_initialized: bool):
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503

    if not validate_session_id(session_id):
        return jsonify({"error": "Invalid session_id"}), 400

    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])

    try:
        session_manager = get_session_manager()

        if not session_manager.get_session(session_id):
            logger.warning(f"[{request_id}] Session not found: {session_id}")
            return jsonify({"error": "Session not found"}), 404

        data = await request.get_json()
        messages = data.get("messages", [])
        stream = data.get("stream", False)

        if not messages or not isinstance(messages, list):
            return jsonify({"error": "Messages array is required"}), 400

        user_message = None
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_message = msg.get("content", "").strip()
                break

        if not user_message:
            return jsonify({"error": "No user message found in messages"}), 400

        logger.info(f"[{request_id}] Chat completions {session_id}")

        chat_engine = get_chat_engine()

        if stream:
            async def event_generator():
                async for chunk in chat_engine.generate_contextual_response(session_id, user_message):
                    yield chunk.encode('utf-8')

            return Response(
                event_generator(),
                mimetype='text/event-stream',
                headers={
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Content-Type': 'text/event-stream',
                    'X-Request-ID': request_id
                }
            )
        else:
            response_content = ""
            async for chunk in chat_engine.generate_contextual_response(session_id, user_message):
                if "event: RESPONSE" in chunk:
                    lines = chunk.split('\n')
                    for line in lines:
                        if line.startswith("data:"):
                            response_content += line.replace("data:", "").strip() + "\n"
                elif "event: info" in chunk and "DONE" in chunk:
                    break

            return jsonify({
                "id": f"elixpo-{str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE]}",
                "object": "chat.completion",
                "created": int(datetime.utcnow().timestamp()),
                "model": "lixsearch",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response_content
                    },
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": len(user_message.split()),
                    "completion_tokens": len(response_content.split()),
                    "total_tokens": len(user_message.split()) + len(response_content.split())
                }
            })

    except Exception as e:
        logger.error(f"[{request_id}] Chat completions error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


async def get_chat_history(session_id: str):
    if not validate_session_id(session_id):
        return jsonify({"error": "Invalid session_id"}), 400

    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])

    try:
        logger.info(f"[{request_id}] Getting chat history for session: {session_id}")
        session_manager = get_session_manager()
        history = session_manager.get_conversation_history(session_id)

        if history is None:
            logger.warning(f"[{request_id}] Session not found: {session_id}")
            return jsonify({"error": "Session not found"}), 404

        return jsonify({
            "session_id": session_id,
            "conversation_history": history,
            "message_count": len(history),
            "request_id": request_id
        })

    except Exception as e:
        logger.error(f"[{request_id}] History error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
