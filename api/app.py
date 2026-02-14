from quart import Quart, request, jsonify, Response, websocket
from quart_cors import cors
import asyncio
import logging
import sys
import uuid
import os
from datetime import datetime
import re
import subprocess
import time
from searchPipeline import run_elixposearch_pipeline
from session_manager import get_session_manager
from rag_engine import get_retrieval_system
from chat_engine import initialize_chat_engine, get_chat_engine
from requestID import RequestIDMiddleware


def _validate_query(query: str, max_length: int = 5000) -> bool:
    if not query or not isinstance(query, str):
        return False
    if len(query) > max_length:
        return False
    if len(query.strip()) == 0:
        return False
    return True


def _validate_session_id(session_id: str, pattern: str = r'^[a-zA-Z0-9\-]{8,36}$') -> bool:
    if not session_id or not isinstance(session_id, str):
        return False
    return bool(re.match(pattern, session_id))


def _validate_url(url: str, max_length: int = 2048) -> bool:
    if not url or not isinstance(url, str):
        return False
    if len(url) > max_length:
        return False
    if not url.startswith(('http://', 'https://')):
        return False
    return True


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger("elixpo-api")

app = Quart(__name__)
cors(app)

app.asgi_middleware_stack.insert(0, (RequestIDMiddleware(), []))

pipeline_initialized = False
initialization_lock = asyncio.Lock()
model_server_process = None


@app.before_serving
async def startup():
    global pipeline_initialized

    async with initialization_lock:
        if pipeline_initialized:
            return

        logger.info("[APP] Starting ElixpoSearch...")
        try:
            session_manager = get_session_manager()
            retrieval_system = get_retrieval_system()
            initialize_chat_engine(session_manager, retrieval_system)

            pipeline_initialized = True
            logger.info("[APP] ElixpoSearch ready")
        except Exception as e:
            logger.error(f"[APP] Initialization failed: {e}", exc_info=True)
            raise


@app.after_serving
async def shutdown():
    global model_server_process
    logger.info("[APP] Shutting down...")
    
    # CRITICAL FIX #8: Stop model server gracefully
    if model_server_process:
        try:
            logger.info("[APP] Terminating model server...")
            model_server_process.terminate()
            model_server_process.wait(timeout=5)
            logger.info("[APP] Model server terminated")
        except subprocess.TimeoutExpired:
            logger.warning("[APP] Model server did not terminate gracefully, killing...")
            model_server_process.kill()
        except Exception as e:
            logger.warning(f"[APP] Error terminating model server: {e}")


@app.route('/api/health', methods=['GET'])
async def health_check():
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "initialized": pipeline_initialized
    })


@app.route('/api/search', methods=['POST'])
async def search():
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503

    try:
        data = await request.get_json()
        query = data.get("query", "").strip()
        image_url = data.get("image_url")
        session_id = data.get("session_id")

        if not _validate_query(query):
            return jsonify({"error": "Invalid or missing query"}), 400

        if session_id and not _validate_session_id(session_id):
            return jsonify({"error": "Invalid session_id format"}), 400

        if image_url and not _validate_url(image_url):
            return jsonify({"error": "Invalid image_url"}), 400

        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])

        logger.info(f"[{request_id}] Search: {query[:50]}... session: {session_id or 'new'}")

        async def event_generator():
            async for chunk in run_elixposearch_pipeline(
                user_query=query,
                user_image=image_url,
                event_id=request_id
            ):
                yield chunk.encode('utf-8')

        return Response(
            event_generator(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Content-Type': 'text/event-stream',
                'Access-Control-Allow-Origin': '*'
            }
        )

    except Exception as e:
        logger.error(f"[{request_id}] Search error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/create', methods=['POST'])
async def create_session():
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503

    try:
        data = await request.get_json()
        query = data.get("query", "").strip()

        if not query:
            return jsonify({"error": "Query is required"}), 400

        session_manager = get_session_manager()
        session_id = session_manager.create_session(query)

        logger.info(f"[API] Session: {session_id}")

        return jsonify({
            "session_id": session_id,
            "query": query,
            "created_at": datetime.utcnow().isoformat()
        }), 201

    except Exception as e:
        logger.error(f"[API] Session creation error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>', methods=['GET'])
async def get_session_info(session_id: str):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])

    try:
        logger.info(f"[{request_id}] Getting session info: {session_id}")
        session_manager = get_session_manager()
        session_data = session_manager.get_session(session_id)

        if not session_data:
            logger.warning(f"[{request_id}] Session not found: {session_id}")
            return jsonify({"error": "Session not found"}), 404

        retrieval_system = get_retrieval_system()
        rag_engine = retrieval_system.get_rag_engine(session_id)
        rag_stats = rag_engine.get_stats()

        return jsonify({
            "session_id": session_id,
            "query": session_data.query,
            "summary": session_manager.get_session_summary(session_id),
            "rag_stats": rag_stats,
            "request_id": request_id
        })

    except Exception as e:
        logger.error(f"[{request_id}] Session info error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>/kg', methods=['GET'])
async def get_session_kg(session_id: str):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])

    try:
        logger.info(f"[{request_id}] Getting KG for session: {session_id}")
        retrieval_system = get_retrieval_system()
        rag_engine = retrieval_system.get_rag_engine(session_id)
        context = rag_engine.get_full_context(session_id)

        if "error" in context:
            logger.warning(f"[{request_id}] KG fetch error for session: {session_id}")
            return jsonify(context), 404

        return jsonify({
            **context,
            "request_id": request_id
        })

    except Exception as e:
        logger.error(f"[{request_id}] KG fetch error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>/query', methods=['POST'])
async def query_session_kg(session_id: str):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])

    try:
        logger.info(f"[{request_id}] Querying KG for session: {session_id}")
        data = await request.get_json()
        query = data.get("query", "").strip()
        top_k = data.get("top_k", 5)

        if not query:
            return jsonify({"error": "Query is required"}), 400

        retrieval_system = get_retrieval_system()
        rag_engine = retrieval_system.get_rag_engine(session_id)
        results = rag_engine.retrieve_context(query, top_k=top_k)

        return jsonify({
            "query": query,
            "session_id": session_id,
            "results": results,
            "request_id": request_id
        })

    except Exception as e:
        logger.error(f"[{request_id}] KG query error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>/entity/<entity>', methods=['GET'])
async def get_entity_evidence(session_id: str, entity: str):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])

    try:
        logger.info(f"[{request_id}] Getting entity evidence: {entity} for session: {session_id}")
        retrieval_system = get_retrieval_system()
        rag_engine = retrieval_system.get_rag_engine(session_id)
        results = rag_engine.retrieve_context(entity, url=session_id, top_k=3)

        if "error" in results:
            logger.warning(f"[{request_id}] Entity not found: {entity}")
            return jsonify(results), 404

        return jsonify({
            "entity": entity,
            "evidence": results,
            "request_id": request_id
        })

    except Exception as e:
        logger.error(f"[{request_id}] Entity evidence error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>/summary', methods=['GET'])
async def get_session_summary(session_id: str):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])

    try:
        logger.info(f"[{request_id}] Getting summary for session: {session_id}")
        retrieval_system = get_retrieval_system()
        rag_engine = retrieval_system.get_rag_engine(session_id)
        stats = rag_engine.get_stats()

        if not stats:
            logger.warning(f"[{request_id}] Session not found: {session_id}")
            return jsonify({"error": "Session not found"}), 404

        return jsonify({
            "session_id": session_id,
            "stats": stats,
            "request_id": request_id
        })

    except Exception as e:
        logger.error(f"[{request_id}] Summary error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>', methods=['DELETE'])
async def delete_session(session_id: str):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])

    try:
        logger.info(f"[{request_id}] Deleting session: {session_id}")
        session_manager = get_session_manager()
        session_manager.cleanup_session(session_id)

        logger.info(f"[{request_id}] Session deleted: {session_id}")

        return jsonify({
            "message": "Session deleted",
            "session_id": session_id,
            "request_id": request_id
        }), 200

    except Exception as e:
        logger.error(f"[{request_id}] Session deletion error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/stats', methods=['GET'])
async def get_stats():
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])

    try:
        logger.info(f"[{request_id}] Getting stats")
        session_manager = get_session_manager()
        stats = session_manager.get_stats()

        return jsonify({
            "timestamp": datetime.utcnow().isoformat(),
            "sessions": stats,
            "request_id": request_id
        })

    except Exception as e:
        logger.error(f"[{request_id}] Stats error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/chat', methods=['POST'])
async def chat():
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503

    try:
        data = await request.get_json()
        user_message = data.get("message", "").strip()
        session_id = data.get("session_id")
        use_search = data.get("search", True)
        image_url = data.get("image_url")

        if not user_message:
            return jsonify({"error": "Message is required"}), 400

        if not session_id:
            session_manager = get_session_manager()
            session_id = session_manager.create_session(user_message)

        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])
        logger.info(f"[{request_id}] Chat: {user_message[:50]}... session: {session_id}")

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
                'Access-Control-Allow-Origin': '*'
            }
        )

    except Exception as e:
        logger.error(f"[{request_id}] Chat error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>/chat', methods=['POST'])
async def session_chat(session_id: str):
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503

    try:
        session_manager = get_session_manager()

        if not session_manager.get_session(session_id):
            return jsonify({"error": "Session not found"}), 404

        data = await request.get_json()
        user_message = data.get("message", "").strip()
        use_search = data.get("search", False)
        image_url = data.get("image_url")

        if not user_message:
            return jsonify({"error": "Message is required"}), 400

        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])
        logger.info(f"[{request_id}] Session chat {session_id}: {user_message[:50]}...")

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
                'Access-Control-Allow-Origin': '*'
            }
        )

    except Exception as e:
        logger.error(f"[API] Session chat error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>/chat/completions', methods=['POST'])
async def chat_completions(session_id: str):
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503

    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])

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
                    'Access-Control-Allow-Origin': '*',
                    'X-Request-ID': request_id
                }
            )
        else:
            response_content = ""
            async for chunk in chat_engine.generate_contextual_response(session_id, user_message):
                if chunk.startswith("event: final"):
                    lines = chunk.split('\n')
                    for line in lines:
                        if line.startswith("data:"):
                            response_content = line.replace("data:", "").strip()

            return jsonify({
                "id": f"chatcmpl-{str(uuid.uuid4())[:12]}",
                "object": "chat.completion",
                "created": int(datetime.utcnow().timestamp()),
                "model": "elixpo-rag",
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
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>/history', methods=['GET'])
async def get_chat_history(session_id: str):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])

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
        return jsonify({"error": str(e)}), 500


@app.errorhandler(404)
async def not_found(error):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
async def internal_error(error):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])
    logger.error(f"[{request_id}] Internal error: {error}", exc_info=True)
    return jsonify({
        "error": "Internal server error",
        "request_id": request_id
    }), 500


@app.websocket('/ws/search')
async def websocket_search():
    request_id = str(uuid.uuid4())[:12]
    logger.info(f"[{request_id}] WebSocket connection established")

    try:
        while True:
            data = await websocket.receive_json()
            query = data.get("query", "").strip()

            if not query:
                await websocket.send_json({
                    "error": "Query required",
                    "request_id": request_id
                })
                continue

            logger.info(f"[{request_id}] WS Query: {query[:50]}")

            async for chunk in run_elixposearch_pipeline(
                user_query=query,
                user_image=data.get("image_url"),
                event_id=request_id
            ):
                lines = chunk.split('\n')
                event_type = None
                for line in lines:
                    if line.startswith('event:'):
                        event_type = line.replace('event:', '').strip()
                    elif line.startswith('data:'):
                        data_content = line.replace('data:', '').strip()
                        if event_type:
                            await websocket.send_json({
                                "event": event_type,
                                "data": data_content,
                                "request_id": request_id
                            })

    except Exception as e:
        logger.error(f"[{request_id}] WS error: {e}", exc_info=True)
        try:
            await websocket.send_json({
                "error": str(e),
                "request_id": request_id
            })
        except:
            pass


if __name__ == "__main__":
    import hypercorn.asyncio
    from hypercorn.config import Config

    config = Config()
    config.bind = ["0.0.0.0:8000"]
    config.workers = 1

    logger.info("[APP] Starting ElixpoSearch...")
    logger.info("[APP] Listening on http://0.0.0.0:8000")

    asyncio.run(hypercorn.asyncio.serve(app, config))
