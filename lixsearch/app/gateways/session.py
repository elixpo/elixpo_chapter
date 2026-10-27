import logging
import asyncio
import uuid
from datetime import datetime
from quart import request, jsonify
from sessions.main import get_session_manager
from sessions.hybrid_conversation_cache import HybridConversationCache
from pipeline.config import X_REQ_ID_SLICE_SIZE
from app.utils import validate_session_id
from sessions.episodic_memory import request_memory_scope

logger = logging.getLogger("lixsearch-api")


async def create_session():
    try:
        query = request.args.get("query", "").strip()

        if not query:
            return jsonify({"error": "Query is required. Pass as ?query=..."}), 400

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
        return jsonify({"error": "Internal server error"}), 500


async def get_session_info(session_id: str):
    if not validate_session_id(session_id):
        return jsonify({"error": "Invalid session_id"}), 400

    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])

    try:
        logger.info(f"[{request_id}] get_session_info session={session_id}")

        # Always pull conversation history from the persistent hybrid cache
        # (Redis hot window + disk cold archive) — this is the source of truth.
        cache = HybridConversationCache(session_id)
        messages = cache.get_full()

        # Also check in-memory SessionData for metadata (query, urls, etc.)
        session_manager = get_session_manager()
        session_data = session_manager.get_session(session_id)

        if messages or session_data:
            summary = session_manager.get_session_summary(session_id) if session_data else {}
            summary["messages"] = messages or []
            summary["conversation_turns"] = len(messages) if messages else 0
            return jsonify({
                "session_id": session_id,
                "query": session_data.query if session_data else (messages[0].get("content", "") if messages else ""),
                "summary": summary,
                "request_id": request_id,
                "timestamp": datetime.utcnow().isoformat()
            })

        logger.warning(f"[{request_id}] session={session_id} not found")
        return jsonify({"error": "Session not found"}), 404

    except Exception as e:
        logger.error(f"[{request_id}] get_session_info session={session_id} error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


async def get_session_summary(session_id: str):
    if not validate_session_id(session_id):
        return jsonify({"error": "Invalid session_id"}), 400

    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])

    try:
        logger.info(f"[{request_id}] Getting summary for session: {session_id}")

        # Always pull from persistent hybrid cache (Redis + disk)
        cache = HybridConversationCache(session_id)
        messages = cache.get_full()

        session_manager = get_session_manager()
        session_data = session_manager.get_session(session_id)

        if messages or session_data:
            summary = session_manager.get_session_summary(session_id) if session_data else {}
            summary["messages"] = messages or []
            summary["conversation_turns"] = len(messages) if messages else 0
            return jsonify({
                "session_id": session_id,
                "summary": summary,
                "request_id": request_id
            })

        return jsonify({"error": "Session not found"}), 404

    except Exception as e:
        logger.error(f"[{request_id}] Summary error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


async def delete_session(session_id: str):
    if not validate_session_id(session_id):
        return jsonify({"error": "Invalid session_id"}), 400

    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])

    try:
        logger.info(f"[{request_id}] Deleting session: {session_id}")
        session_manager = get_session_manager()
        session_manager.cleanup_session(session_id)
        try:
            from ipcService.coreServiceManager import CoreServiceManager
            manager = CoreServiceManager.get_instance()
            scope = request_memory_scope(session_id, namespace="search")
            await asyncio.to_thread(
                manager.call, "core", "delete_episodes", scope.filters()
            )
        except Exception as exc:
            logger.warning(f"[{request_id}] Episodic deletion skipped: {exc}")

        logger.info(f"[{request_id}] Session deleted: {session_id}")

        return jsonify({
            "message": "Session deleted",
            "session_id": session_id,
            "request_id": request_id
        }), 200

    except Exception as e:
        logger.error(f"[{request_id}] Session deletion error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
