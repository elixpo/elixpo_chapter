"""
Production-Ready FastAPI Application
- Uses model_server for hot-loading models
- Session-based architecture with knowledge graphs
- RAG-enhanced responses
- Production logging and monitoring
"""

from quart import Quart, request, jsonify, Response, websocket
from quart_cors import cors
import asyncio
import logging
import sys
import uuid
from datetime import datetime
import json

# Production imports
from production_pipeline import initialize_production_pipeline, get_production_pipeline
from session_manager import get_session_manager
from rag_engine import get_rag_engine
from requestID import RequestIDMiddleware

# Initialize logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger("elixpo-api")

# Initialize Quart app
app = Quart(__name__)
cors(app)

# Global state
pipeline_initialized = False
initialization_lock = asyncio.Lock()


@app.before_serving
async def startup():
    """Initialize all components on server startup"""
    global pipeline_initialized
    
    async with initialization_lock:
        if pipeline_initialized:
            return
        
        logger.info("[APP] Starting ElixpoSearch server...")
        logger.info("[APP] Initializing model server...")
        
        try:
            # Initialize production pipeline (includes model loading)
            pipeline = await initialize_production_pipeline()
            pipeline_initialized = True
            logger.info("[APP] ElixpoSearch server ready")
        except Exception as e:
            logger.error(f"[APP] Failed to initialize: {e}", exc_info=True)
            raise


@app.after_serving
async def shutdown():
    """Cleanup on server shutdown"""
    logger.info("[APP] Shutting down ElixpoSearch server...")


# ============================================
# Public API Endpoints
# ============================================


@app.route('/api/health', methods=['GET'])
async def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "initialized": pipeline_initialized
    })


@app.route('/api/search', methods=['POST'])
async def search():
    """
    Main search endpoint with session support
    
    Request body:
    {
        "query": "search query",
        "image_url": "optional image url",
        "session_id": "optional existing session id"
    }
    
    Response: Streaming SSE events
    """
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503
    
    try:
        data = await request.get_json()
        query = data.get("query", "").strip()
        image_url = data.get("image_url")
        session_id = data.get("session_id")
        
        if not query:
            return jsonify({"error": "Query is required"}), 400
        
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])
        
        logger.info(f"[{request_id}] Search request: {query[:50]}... session: {session_id or 'new'}")
        
        pipeline = get_production_pipeline()
        
        async def event_generator():
            """Generate SSE events"""
            async for chunk in pipeline.process_request(
                query=query,
                image_url=image_url,
                session_id=session_id,
                request_id=request_id
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
    """Create a new session"""
    if not pipeline_initialized:
        return jsonify({"error": "Server not initialized"}), 503
    
    try:
        data = await request.get_json()
        query = data.get("query", "").strip()
        
        if not query:
            return jsonify({"error": "Query is required"}), 400
        
        session_manager = get_session_manager()
        session_id = session_manager.create_session(query)
        
        logger.info(f"[API] Created session: {session_id}")
        
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
    """Get session information and knowledge graph summary"""
    try:
        session_manager = get_session_manager()
        session_data = session_manager.get_session(session_id)
        
        if not session_data:
            return jsonify({"error": "Session not found"}), 404
        
        rag_engine = get_rag_engine()
        rag_stats = rag_engine.get_summary_stats(session_id)
        
        return jsonify({
            "session_id": session_id,
            "query": session_data.query,
            "summary": session_manager.get_session_summary(session_id),
            "rag_stats": rag_stats
        })
    
    except Exception as e:
        logger.error(f"[API] Session info error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>/kg', methods=['GET'])
async def get_session_kg(session_id: str):
    """Get knowledge graph for a session"""
    try:
        rag_engine = get_rag_engine()
        context = rag_engine.build_rag_context(session_id)
        
        if "error" in context:
            return jsonify(context), 404
        
        return jsonify(context)
    
    except Exception as e:
        logger.error(f"[API] KG fetch error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>/query', methods=['POST'])
async def query_session_kg(session_id: str):
    """Query the knowledge graph of a session"""
    try:
        data = await request.get_json()
        query = data.get("query", "").strip()
        top_k = data.get("top_k", 5)
        
        if not query:
            return jsonify({"error": "Query is required"}), 400
        
        rag_engine = get_rag_engine()
        results = rag_engine.query_knowledge_graph(session_id, query, top_k=top_k)
        
        return jsonify({
            "query": query,
            "session_id": session_id,
            "results": results
        })
    
    except Exception as e:
        logger.error(f"[API] KG query error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>/entity/<entity>', methods=['GET'])
async def get_entity_evidence(session_id: str, entity: str):
    """Get evidence for a specific entity from a session"""
    try:
        rag_engine = get_rag_engine()
        evidence = rag_engine.extract_entity_evidence(session_id, entity)
        
        if "error" in evidence:
            return jsonify(evidence), 404
        
        return jsonify(evidence)
    
    except Exception as e:
        logger.error(f"[API] Entity evidence error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>/summary', methods=['GET'])
async def get_session_summary(session_id: str):
    """Get a document summary for a session"""
    try:
        rag_engine = get_rag_engine()
        summary = rag_engine.build_document_summary(session_id)
        
        if not summary:
            return jsonify({"error": "Session not found"}), 404
        
        return jsonify({
            "session_id": session_id,
            "summary": summary
        })
    
    except Exception as e:
        logger.error(f"[API] Summary error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/session/<session_id>', methods=['DELETE'])
async def delete_session(session_id: str):
    """Delete a session"""
    try:
        session_manager = get_session_manager()
        session_manager.cleanup_session(session_id)
        
        logger.info(f"[API] Deleted session: {session_id}")
        
        return jsonify({"message": "Session deleted"}), 200
    
    except Exception as e:
        logger.error(f"[API] Session deletion error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/api/stats', methods=['GET'])
async def get_stats():
    """Get system statistics"""
    try:
        session_manager = get_session_manager()
        stats = session_manager.get_stats()
        
        return jsonify({
            "timestamp": datetime.utcnow().isoformat(),
            "sessions": stats
        })
    
    except Exception as e:
        logger.error(f"[API] Stats error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ============================================
# Error Handlers
# ============================================


@app.errorhandler(404)
async def not_found(error):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
async def internal_error(error):
    logger.error(f"Internal server error: {error}", exc_info=True)
    return jsonify({"error": "Internal server error"}), 500


# ============================================
# WebSocket Support (Optional - for real-time)
# ============================================


@app.websocket('/ws/search')
async def websocket_search():
    """WebSocket for real-time search streaming"""
    try:
        while True:
            data = await websocket.receive_json()
            query = data.get("query", "").strip()
            
            if not query:
                await websocket.send_json({"error": "Query required"})
                continue
            
            pipeline = get_production_pipeline()
            
            async for chunk in pipeline.process_request(
                query=query,
                image_url=data.get("image_url")
            ):
                # Send each chunk as JSON
                lines = chunk.split('\n')
                for line in lines:
                    if line.startswith('event:'):
                        event_type = line.replace('event:', '').strip()
                    elif line.startswith('data:'):
                        data_content = line.replace('data:', '').strip()
                        await websocket.send_json({
                            "event": event_type,
                            "data": data_content
                        })
    
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        await websocket.send_json({"error": str(e)})


# ============================================
# CLI Support
# ============================================


if __name__ == "__main__":
    import hypercorn.asyncio
    from hypercorn.config import Config
    
    # Configuration
    config = Config()
    config.bind = ["0.0.0.0:8000"]
    config.workers = 1
    
    logger.info("[APP] Starting ElixpoSearch API server...")
    logger.info("[APP] Listening on http://0.0.0.0:8000")
    
    asyncio.run(hypercorn.asyncio.serve(app, config))
