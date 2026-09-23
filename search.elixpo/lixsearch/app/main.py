import logging
import asyncio
import signal
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from quart import Quart, request, jsonify, send_file, render_template_string
from quart_cors import cors
from sessions.main import get_session_manager
from ragService.main import get_retrieval_system
from chatEngine.main import initialize_chat_engine
from commons.requestID import RequestIDMiddleware
from app.gateways import health, search, session, stats, surf, completions, responses, image, export, content
from app.auth import install_api_auth
from mcpServer import build_mcp_server
from mcpServer.asgi import MCPMount
logger = logging.getLogger("lixsearch-api")


def _run_archive_cleanup() -> None:

    try:
        from sessions.hybrid_conversation_cache import _get_archive
        archive = _get_archive()
        removed = archive.cleanup_expired()
        if removed:
            logger.info(f"[APP] Archive cleanup: removed {removed} expired sessions")
    except Exception as e:
        logger.warning(f"[APP] Archive cleanup error: {e}")


def _run_redis_memory_check() -> None:

    try:
        from pipeline.config import create_redis_client
        client = create_redis_client(db=0)
        info = client.info("memory")
        used = info.get("used_memory", 0)
        maxmem = info.get("maxmemory", 0)
        if maxmem > 0:
            usage_pct = (used / maxmem) * 100
            if usage_pct > 85:
                logger.warning(
                    f"[APP] Redis memory pressure: {usage_pct:.0f}% "
                    f"({info.get('used_memory_human')}/{info.get('maxmemory_human')})"
                )
                # Trigger active expiry scan on all DBs
                for db in range(5):
                    try:
                        db_client = create_redis_client(db=db)
                        expired = 0
                        cursor = 0
                        while True:
                            cursor, keys = db_client.scan(cursor=cursor, count=200)
                            for key in keys:
                                if db_client.ttl(key) == -1:
                                    # Key has no TTL — skip (persistent)
                                    pass
                            if cursor == 0:
                                break
                        logger.debug(f"[APP] Redis DB{db} scan complete")
                    except Exception:
                        pass
            else:
                logger.debug(f"[APP] Redis memory: {usage_pct:.0f}%")
        else:
            logger.debug(f"[APP] Redis memory: {info.get('used_memory_human', 'unknown')} (no maxmemory set)")
    except Exception as e:
        logger.debug(f"[APP] Redis memory check failed: {e}")


def _run_global_memory_maintenance() -> None:
    """Doctor health snapshot plus idempotent Janitor expiry cleanup."""
    try:
        from agentRuntime.global_memory import get_global_memory_store
        store = get_global_memory_store()
        removed = store.janitor_cleanup()
        status = store.doctor_status()
        logger.info(
            "[GlobalMemory] Doctor healthy=%s promoted=%s candidates=%s; "
            "Janitor removed=%s",
            status["healthy"], status["promoted"], status["candidates"], removed,
        )
    except Exception as e:
        logger.warning(f"[GlobalMemory] Maintenance failed: {e}")


def _run_content_cleanup() -> None:

    try:
        from app.gateways.image import _cleanup_expired_images
        _cleanup_expired_images()
    except Exception as e:
        logger.debug(f"[APP] Image cleanup error: {e}")
    try:
        from app.gateways.content import _cleanup_expired_content
        _cleanup_expired_content()
    except Exception as e:
        logger.debug(f"[APP] Content cleanup error: {e}")


def _run_memory_janitor(*, dry_run: bool = False) -> dict:
    """Run one cluster-wide lifecycle pass; Redis lock elects one replica."""
    from graphMemory.client import GraphMemoryClient
    from ipcService.coreServiceManager import get_core_embedding_service
    from memoryJanitor import Janitor
    from pipeline.config import (
        AGENT_STATE_REDIS_DB, CONVERSATION_ARCHIVE_DIR, GRAPH_MEMORY_REDIS_DB,
        JANITOR_ENABLED, SESSION_LEDGER_REDIS_DB, create_redis_client,
    )

    if not JANITOR_ENABLED:
        return {"enabled": False, "acquired": False}

    graph_redis = create_redis_client(db=GRAPH_MEMORY_REDIS_DB, decode_responses=True)
    janitor = Janitor(
        lock_redis=graph_redis,
        ledger_redis=create_redis_client(db=SESSION_LEDGER_REDIS_DB, decode_responses=True),
        state_redis=create_redis_client(db=AGENT_STATE_REDIS_DB, decode_responses=True),
        graph_redis=graph_redis,
        graph_client=GraphMemoryClient(graph_redis, enabled=True),
        core_service=get_core_embedding_service(),
        artifact_dirs=(
            os.getenv("CONTENT_STORE_DIR", "/app/data/cache/content"),
            os.getenv("IMAGE_STORE_DIR", "/app/data/cache/images"),
        ),
        conversation_dir=CONVERSATION_ARCHIVE_DIR,
    )
    report = janitor.run(dry_run=dry_run).to_dict()
    if report["acquired"]:
        logger.info("[Janitor] lifecycle report=%s", report)
    else:
        logger.debug("[Janitor] another replica owns the maintenance lock")
    return report


class lixSearch:
    
    def __init__(self):
        self.app = Quart(__name__)
        self.pipeline_initialized = False
        self.skill_registry = None
        self.initialization_lock = asyncio.Lock()
        self._mcp_session_context = None
        
        self._setup_cors()
        install_api_auth(self.app)
        self._setup_middleware()
        self._setup_mcp()
        self._register_routes()
        self._register_error_handlers()
        self._register_lifecycle_hooks()
    
    def _setup_cors(self):
        cors(self.app, allow_origin="*", allow_headers=["Content-Type", "Authorization", "X-Request-ID", "X-API-Key"])
    
    def _setup_middleware(self):
        middleware = RequestIDMiddleware(self.app.asgi_app)
        self.app.asgi_app = middleware

    def _setup_mcp(self):
        self.mcp_server = build_mcp_server(lambda: self.pipeline_initialized)
        self.mcp_app = self.mcp_server.streamable_http_app()
        self.app.asgi_app = MCPMount(self.app.asgi_app, self.mcp_app)
    
    def _register_routes(self):
        async def health_check_wrapper():
            return await health.health_check(self.pipeline_initialized)

        async def search_wrapper():
            return await search.search(self.pipeline_initialized)

        _public_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'public')

        async def scalar_ui():
            html = '''<!DOCTYPE html>
<html>
<head>
    <title>OreoLook API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OreoLook API Docs</title>
    <link rel="icon" type="image/png" href="/favicon.png" />
    <style>* { margin: 0; padding: 0; } body { margin: 0; }</style>
</head>
<body>
    <script id="api-reference" data-url="/openapi.json" data-configuration='{"theme":"kepler","layout":"modern","hideDarkModeToggle":false,"searchHotKey":"k","defaultOpenAllTags":false}'></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>'''
            return html, 200, {"Content-Type": "text/html"}

        async def serve_favicon():
            favicon_path = os.path.join(_public_dir, 'images', 'icon.png')
            return await send_file(favicon_path, mimetype='image/png')

        self.app.route('/api/health', methods=['GET'])(health_check_wrapper)
        self.app.route('/api/search', methods=['GET'])(search_wrapper)

        async def completions_wrapper():
            return await completions.chat_completions(self.pipeline_initialized)
        self.app.route('/v1/chat/completions', methods=['POST'])(completions_wrapper)

        async def responses_wrapper():
            return await responses.responses(self.pipeline_initialized)
        self.app.route('/v1/responses', methods=['POST'])(responses_wrapper)

        async def models_list():
            from pipeline.config import RESPONSE_MODEL
            return jsonify({
                "object": "list",
                "data": [
                    {
                        "id": RESPONSE_MODEL,
                        "object": "model",
                        "created": 1700000000,
                        "owned_by": "elixpo",
                    }
                ],
            })
        self.app.route('/v1/models', methods=['GET'])(models_list)
        self.app.route('/api/models', methods=['GET'])(models_list)
        self.app.route('/api/session/create', methods=['GET'])(session.create_session)
        self.app.route('/api/session/<session_id>', methods=['GET'])(session.get_session_info)
        self.app.route('/api/session/<session_id>', methods=['DELETE'])(session.delete_session)
        self.app.route('/api/stats', methods=['GET'])(stats.get_stats)
        
        # Scalar API documentation UI
        self.app.route('/docs', methods=['GET'])(scalar_ui)
        self.app.route('/api/docs', methods=['GET'])(scalar_ui)
        self.app.route('/favicon.png', methods=['GET'])(serve_favicon)
        
        # OpenAPI spec endpoints
        _openapi_spec_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'openapi.yaml')

        async def openapi_spec_json():
            import yaml
            try:
                with open(_openapi_spec_path, 'r') as f:
                    spec = yaml.safe_load(f)
                return jsonify(spec)
            except Exception as e:
                logger.error(f"[APP] Failed to load OpenAPI spec: {e}")
                return jsonify({"error": "OpenAPI spec not found"}), 404

        async def openapi_spec_yaml():
            try:
                with open(_openapi_spec_path, 'r') as f:
                    content = f.read()
                return content, 200, {"Content-Type": "text/yaml; charset=utf-8"}
            except Exception as e:
                logger.error(f"[APP] Failed to load OpenAPI spec: {e}")
                return "OpenAPI spec not found", 404

        self.app.route('/openapi.json', methods=['GET'])(openapi_spec_json)
        self.app.route('/openapi.yaml', methods=['GET'])(openapi_spec_yaml)

        async def surf_wrapper():
            return await surf.surf(self.pipeline_initialized)

        self.app.route('/api/surf', methods=['GET'])(surf_wrapper)

        # Image proxy endpoint (serves generated images by ID)
        async def serve_image_wrapper(image_id):
            return await image.serve_image(image_id)
        self.app.route('/api/image/<image_id>', methods=['GET'])(serve_image_wrapper)

        # PDF export endpoint
        self.app.route('/api/export/pdf', methods=['POST'])(export.export_pdf)

        # Content serving endpoint (PDFs and other generated content)
        async def serve_content_wrapper(content_id):
            return await content.serve_content(content_id)
        self.app.route('/api/content/<content_id>', methods=['GET'])(serve_content_wrapper)
    
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

                logger.info("[APP] Initializing lixSearch core services...")
                try:
                    from skillRegistry import get_skill_registry
                    self.skill_registry = get_skill_registry()
                    logger.info(f"[APP] Loaded {len(self.skill_registry)} validated skills")

                    session_manager = get_session_manager()
                    retrieval_system = get_retrieval_system()
                    initialize_chat_engine(session_manager, retrieval_system)

                    # Reject model duplication before initializing the local backend.
                    from pipeline.config import CORE_SERVICE_BACKEND
                    if CORE_SERVICE_BACKEND == "local" and int(os.getenv("WORKERS", "1")) > 1:
                        raise RuntimeError("The local core backend requires WORKERS=1 to avoid duplicating the embedding model and browser pool")

                    from ipcService.coreServiceManager import CoreServiceManager
                    core_manager = CoreServiceManager.get_instance()
                    logger.info(f"[APP] Core backend ready: {core_manager.get_backend_name()}")

                    self.pipeline_initialized = True
                    logger.info("[APP] lixSearch initialized and ready")

                    self._mcp_session_context = self.mcp_server.session_manager.run()
                    await self._mcp_session_context.__aenter__()
                    logger.info("[APP] OreoLook MCP ready at /mcp")
                except Exception as e:
                    logger.error(f"[APP] Initialization failed: {e}", exc_info=True)
                    raise

                # Run conversation archive TTL cleanup on startup (async, non-blocking)
                try:
                    from pipeline.config import HYBRID_STARTUP_CLEANUP
                    if HYBRID_STARTUP_CLEANUP:
                        await asyncio.to_thread(_run_archive_cleanup)
                        await asyncio.to_thread(_run_global_memory_maintenance)
                        await asyncio.to_thread(_run_memory_janitor)
                except Exception as e:
                    logger.warning(f"[APP] Archive startup cleanup failed (non-fatal): {e}")

                # Start periodic maintenance task (cleanup + Redis memory monitoring)
                async def _periodic_maintenance():
                    from pipeline.config import JANITOR_INTERVAL_SECONDS
                    while True:
                        await asyncio.sleep(JANITOR_INTERVAL_SECONDS)
                        try:
                            await asyncio.to_thread(_run_archive_cleanup)
                            await asyncio.to_thread(_run_content_cleanup)
                            await asyncio.to_thread(_run_redis_memory_check)
                            await asyncio.to_thread(_run_global_memory_maintenance)
                            await asyncio.to_thread(_run_memory_janitor)
                            logger.info("[APP] Periodic maintenance completed")
                        except Exception as e:
                            logger.warning(f"[APP] Periodic maintenance error: {e}")

                asyncio.create_task(_periodic_maintenance())

        @self.app.after_serving
        async def shutdown():
            logger.info("[APP] Shutting down lixSearch — flushing active sessions to disk...")
            if self._mcp_session_context is not None:
                try:
                    await self._mcp_session_context.__aexit__(None, None, None)
                except Exception as e:
                    logger.warning(f"[APP] MCP shutdown error: {e}")
            try:
                await asyncio.to_thread(_run_archive_cleanup)
            except Exception as e:
                logger.warning(f"[APP] Shutdown cleanup error: {e}")
            try:
                from ipcService.coreServiceManager import CoreServiceManager
                await asyncio.to_thread(CoreServiceManager.shutdown_instance)
            except Exception as e:
                logger.warning(f"[APP] Core backend shutdown error: {e}")
            logger.info("[APP] Shutdown complete")
    
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


if __name__ == "__main__":
    import os
    import logging
    
    # Configure logging
    logging.basicConfig(
        level=os.getenv('LOG_LEVEL', 'INFO'),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Get configuration
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('WORKER_PORT', '9002'))
    workers = int(os.getenv('WORKERS', '1'))
    
    logger.info(f"[APP] Initializing with WORKER_PORT={port}, WORKERS={workers}")
    
    # Create and run app
    app_instance = create_app()
    app_instance.run(host=host, port=port, workers=workers)
