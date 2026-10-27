import logging
import asyncio
import aiohttp
from quart import Quart, request, jsonify
from quart_cors import cors
import time

logger = logging.getLogger("lixsearch-lb")


class LoadBalancer:
    def __init__(self, num_workers: int = 10, start_port: int = 8001):
        self.app = Quart(__name__)
        self.num_workers = num_workers
        self.start_port = start_port
        self.worker_ports = [start_port + i for i in range(num_workers)]
        self.current_worker_index = 0
        self.healthy_workers = set(self.worker_ports)
        self.worker_health_status = {port: True for port in self.worker_ports}
        self.session = None
        
        self._setup_cors()
        self._register_routes()
        self._register_lifecycle_hooks()
    
    def _setup_cors(self):
        cors(self.app)
    
    def get_next_worker(self) -> int:
        if not self.healthy_workers:
            logger.warning("[LB] No healthy workers available, falling back to all workers")
            self.healthy_workers = set(self.worker_ports)
        
        # Find the next healthy worker
        attempts = 0
        max_attempts = len(self.worker_ports)
        
        while attempts < max_attempts:
            worker_port = self.worker_ports[self.current_worker_index % len(self.worker_ports)]
            self.current_worker_index += 1
            
            if worker_port in self.healthy_workers:
                return worker_port
            attempts += 1
        
        return self.worker_ports[0]
    
    async def health_check_workers(self):
        while True:
            try:
                await asyncio.sleep(10)  # Check every 10 seconds
                
                for port in self.worker_ports:
                    try:
                        async with self.session.get(
                            f"http://localhost:{port}/api/health",
                            timeout=aiohttp.ClientTimeout(total=5)
                        ) as resp:
                            if resp.status == 200:
                                if port not in self.healthy_workers:
                                    logger.info(f"[LB] Worker on port {port} is now healthy")
                                self.healthy_workers.add(port)
                                self.worker_health_status[port] = True
                            else:
                                logger.warning(f"[LB] Worker on port {port} returned status {resp.status}")
                                self.healthy_workers.discard(port)
                                self.worker_health_status[port] = False
                    except Exception as e:
                        logger.warning(f"[LB] Health check failed for port {port}: {e}")
                        self.healthy_workers.discard(port)
                        self.worker_health_status[port] = False
            except Exception as e:
                logger.error(f"[LB] Health check loop error: {e}")
    
    async def proxy_request(self, path: str, worker_port: int):
        try:
            worker_url = f"http://localhost:{worker_port}{path}"
            
            headers = {k: v for k, v in request.headers.items() 
                      if k.lower() not in ['host', 'connection', 'transfer-encoding']}
            
            # Get request body if it exists
            body = None
            if request.method in ['POST', 'PUT', 'PATCH']:
                body = await request.get_data()
            
            # Proxy the request
            async with self.session.request(
                method=request.method,
                url=worker_url,
                headers=headers,
                data=body,
                timeout=aiohttp.ClientTimeout(total=120)
            ) as resp:
                response_body = await resp.read()
                
                # Forward response headers
                response_headers = {k: v for k, v in resp.headers.items()
                                  if k.lower() not in ['connection', 'transfer-encoding']}
                
                return response_body, resp.status, response_headers
        
        except asyncio.TimeoutError:
            logger.error(f"[LB] Request to worker {worker_port} timed out")
            return jsonify({"error": "Worker timeout"}), 504, {}
        except Exception as e:
            logger.error(f"[LB] Proxy error for worker {worker_port}: {e}")
            return jsonify({"error": "Worker unavailable"}), 503, {}
    
    def _register_routes(self):
        
        @self.app.route('/api/health', methods=['GET'])
        async def health():
            healthy_count = len(self.healthy_workers)
            return jsonify({
                "status": "healthy" if healthy_count > 0 else "degraded",
                "healthy_workers": healthy_count,
                "total_workers": self.num_workers,
                "worker_status": self.worker_health_status
            }), 200
        
        @self.app.route('/api/search', methods=['POST', 'GET'])
        async def search():
            worker_port = self.get_next_worker()
            logger.info(f"[LB] Routing /api/search to worker {worker_port}")
            
            path = f"/api/search?{request.query_string.decode()}" if request.query_string else "/api/search"
            body, status, headers = await self.proxy_request(path, worker_port)
            return body, status, headers
        
        @self.app.route('/api/session/create', methods=['POST'])
        async def create_session():
            worker_port = self.get_next_worker()
            logger.info(f"[LB] Routing /api/session/create to worker {worker_port}")
            body, status, headers = await self.proxy_request("/api/session/create", worker_port)
            return body, status, headers
        
        @self.app.route('/api/session/<session_id>', methods=['GET', 'DELETE'])
        async def get_session(session_id):
            worker_port = self.get_next_worker()
            logger.info(f"[LB] Routing /api/session/{session_id} to worker {worker_port}")
            path = f"/api/session/{session_id}"
            body, status, headers = await self.proxy_request(path, worker_port)
            return body, status, headers
        
        @self.app.route('/api/session/<session_id>/entity/<entity>', methods=['GET'])
        async def get_entity_evidence(session_id, entity):
            worker_port = self.get_next_worker()
            path = f"/api/session/{session_id}/entity/{entity}"
            body, status, headers = await self.proxy_request(path, worker_port)
            return body, status, headers
        
        @self.app.route('/api/session/<session_id>/summary', methods=['GET'])
        async def get_session_summary(session_id):
            worker_port = self.get_next_worker()
            path = f"/api/session/{session_id}/summary"
            body, status, headers = await self.proxy_request(path, worker_port)
            return body, status, headers
        
        @self.app.route('/api/chat', methods=['POST'])
        async def chat():
            worker_port = self.get_next_worker()
            path = "/api/chat"
            body, status, headers = await self.proxy_request(path, worker_port)
            return body, status, headers
        
        @self.app.route('/api/session/<session_id>/chat', methods=['POST'])
        async def session_chat(session_id):
            worker_port = self.get_next_worker()
            path = f"/api/session/{session_id}/chat"
            body, status, headers = await self.proxy_request(path, worker_port)
            return body, status, headers
        
        @self.app.route('/api/session/<session_id>/chat/completions', methods=['POST'])
        async def chat_completions(session_id):
            worker_port = self.get_next_worker()
            path = f"/api/session/{session_id}/chat/completions"
            body, status, headers = await self.proxy_request(path, worker_port)
            return body, status, headers
        
        @self.app.route('/api/session/<session_id>/history', methods=['GET'])
        async def get_chat_history(session_id):
            worker_port = self.get_next_worker()
            path = f"/api/session/{session_id}/history"
            body, status, headers = await self.proxy_request(path, worker_port)
            return body, status, headers
        
        @self.app.route('/api/stats', methods=['GET'])
        async def stats():

            worker_port = self.get_next_worker()
            path = "/api/stats"
            body, status, headers = await self.proxy_request(path, worker_port)
            return body, status, headers
    
    def _register_lifecycle_hooks(self):
        @self.app.before_serving
        async def startup():
            logger.info("[LB] Initializing Load Balancer...")
            self.session = aiohttp.ClientSession()
            logger.info(f"[LB] Load Balancer configured for {self.num_workers} workers on ports {self.worker_ports}")
            asyncio.create_task(self.health_check_workers())
            logger.info("[LB] Health check monitor started")
        
        @self.app.after_serving
        async def shutdown():
            logger.info("[LB] Shutting down Load Balancer...")
            if self.session:
                await self.session.close()


def create_load_balancer(num_workers: int = 10, start_port: int = 8001):
    return LoadBalancer(num_workers, start_port)


if __name__ == "__main__":
    import os
    import logging
    
    # Configure logging
    logging.basicConfig(
        level=os.getenv('LOG_LEVEL', 'INFO'),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Get configuration from environment or defaults
    num_workers = int(os.getenv('WORKER_COUNT', '3'))
    start_port = int(os.getenv('WORKER_START_PORT', '9002'))
    lb_port = int(os.getenv('LB_PORT', '9000'))
    lb_host = os.getenv('LB_HOST', '0.0.0.0')
    
    logger.info(f"[MAIN] Starting Load Balancer on {lb_host}:{lb_port}")
    logger.info(f"[MAIN] Configured for {num_workers} workers on ports {start_port}-{start_port + num_workers - 1}")
    
    lb = create_load_balancer(num_workers=num_workers, start_port=start_port)
    lb.app.run(host=lb_host, port=lb_port, workers=1)
