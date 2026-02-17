import logging
import asyncio
import signal

from quart import Quart, request, jsonify
from quart_cors import cors
from sessions.main import get_session_manager
from ragService.main import get_retrieval_system
from chatEngine.main import initialize_chat_engine
from commons.requestID import RequestIDMiddleware
from app.gateways import health, search, session, chat, stats, websocket
logger = logging.getLogger("lixsearch-api")


class lixSearch:
    
    def __init__(self):
        self.app = Quart(__name__)
        self.pipeline_initialized = False
        self.initialization_lock = asyncio.Lock()
        
        self._setup_cors()
        self._setup_middleware()
        self._register_routes()
        self._register_error_handlers()
        self._register_lifecycle_hooks()
    
    def _setup_cors(self):
        cors(self.app)
    
    def _setup_middleware(self):
        middleware = RequestIDMiddleware(self.app.asgi_app)
        self.app.asgi_app = middleware
    
    def _register_routes(self):
        async def health_check_wrapper():
            return await health.health_check(self.pipeline_initialized)
        
        async def search_wrapper():
            return await search.search(self.pipeline_initialized)
        
        async def chat_wrapper():
            return await chat.chat(self.pipeline_initialized)
        
        async def session_chat_wrapper(session_id):
            return await chat.session_chat(session_id, self.pipeline_initialized)
        
        async def chat_completions_wrapper(session_id):
            return await chat.chat_completions(session_id, self.pipeline_initialized)
        
        self.app.route('/api/health', methods=['GET'])(health_check_wrapper)
        self.app.route('/api/search', methods=['POST', 'GET'])(search_wrapper)
        self.app.route('/api/session/create', methods=['POST'])(session.create_session)
        self.app.route('/api/session/<session_id>', methods=['GET'])(session.get_session_info)
        self.app.route('/api/session/<session_id>/kg', methods=['GET'])(session.get_session_kg)
        self.app.route('/api/session/<session_id>/query', methods=['POST'])(session.query_session_kg)
        self.app.route('/api/session/<session_id>/entity/<entity>', methods=['GET'])(
            session.get_entity_evidence
        )
        self.app.route('/api/session/<session_id>/summary', methods=['GET'])(session.get_session_summary)
        self.app.route('/api/session/<session_id>', methods=['DELETE'])(session.delete_session)
        self.app.route('/api/chat', methods=['POST'])(chat_wrapper)
        self.app.route('/api/session/<session_id>/chat', methods=['POST'])(session_chat_wrapper)
        self.app.route('/api/session/<session_id>/chat/completions', methods=['POST'])(chat_completions_wrapper)
        self.app.route('/api/session/<session_id>/history', methods=['GET'])(chat.get_chat_history)
        self.app.route('/api/stats', methods=['GET'])(stats.get_stats)
        self.app.websocket('/ws/search')(websocket.websocket_search)
    
    def _register_error_handlers(self):
        @self.app.errorhandler(404)
        async def not_found(error):
            return jsonify({"error": "Not found"}), 404
        
        @self.app.errorhandler(500)
        async def internal_error(error):
            request_id = request.headers.get("X-Request-ID", "")
            logger.error(f"[{request_id}] Internal error: {error}", exc_info=True)
            return jsonify({
                "error": "Internal server error",
                "request_id": request_id
            }), 500
    
    def _register_lifecycle_hooks(self):
        @self.app.before_serving
        async def startup():
            async with self.initialization_lock:
                if self.pipeline_initialized:
                    return
                
                logger.info("[APP] Initializing lixSearch (IPC service must be started manually)...")
                try:
                    session_manager = get_session_manager()
                    retrieval_system = get_retrieval_system()
                    initialize_chat_engine(session_manager, retrieval_system)
                    
                    self.pipeline_initialized = True
                    logger.info("[APP] lixSearch initialized and ready")
                except Exception as e:
                    logger.error(f"[APP] Initialization failed: {e}", exc_info=True)
                    raise
        
        @self.app.after_serving
        async def shutdown():
            logger.info("[APP] Shutting down lixSearch...")
    
    def run(self, host: str = "0.0.0.0", port: int = 8000, workers: int = 1):
        import hypercorn.asyncio
        from hypercorn.config import Config
        
        config = Config()
        config.bind = [f"{host}:{port}"]
        config.workers = workers
        
        logger.info("[APP] Starting lixSearch...")
        logger.info(f"[APP] Listening on http://{host}:{port}")
        
        asyncio.run(hypercorn.asyncio.serve(self.app, config))


def create_app() -> lixSearch:
    return lixSearch()
