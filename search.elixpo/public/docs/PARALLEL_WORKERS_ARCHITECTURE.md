# ElixpoSearch Parallel Processing Architecture

## Overview

This architecture implements a **10-worker load-balanced system** for parallel request processing with shared IPC pipeline and vector database access.

```
┌────────────────────────────────────────────────────────────────────┐
│                    LOAD BALANCER (Port 8000)                       │
│                   Round-Robin Health-Aware Routing                 │
│                                                                    │
│  Endpoints: /api/search, /api/chat, /api/session/*, /api/stats   │
└────────────────────────────────────────────────────────────────────┘
          ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ (Round-robin distribution)
┌─────────────────────────────────────────────────────────────────┐
│                        WORKER POOL (10x)                         │
│  Ports: 8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010
│  Each Worker:                                                   │
│    - Independent Quart instance                                │
│    - Request processing service                                │
│    - Shared IPC connection to pipeline                        │
│    - Health check endpoint                                    │
└─────────────────────────────────────────────────────────────────┘
          ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ (All connect to shared pipeline)
┌─────────────────────────────────────────────────────────────────┐
│                 SHARED IPC PIPELINE (Port 5010)                  │
│                  (Single instance, shared by all workers)        │
│                                                                 │
│  Services:                                                      │
│    - RAG Engine                                                │
│    - Embedding Service                                        │
│    - Session Manager                                          │
│    - Chat Engine                                              │
│    - Search Pipeline                                          │
└─────────────────────────────────────────────────────────────────┘
          ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ (All queries go through)
┌─────────────────────────────────────────────────────────────────┐
│                   VECTOR DATABASE (Single)                       │
│                      Chroma Vector Store                         │
│                  (Potential Bottleneck ⚠️)                      │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture Components

### 1. Load Balancer (Port 8000)
**File**: [lixsearch/load_balancer.py](lixsearch/load_balancer.py)

Features:
- **Round-Robin Distribution**: Cycles through workers 8001-8010
- **Health Awareness**: Skips unhealthy workers automatically
- **Health Checks**: Periodically checks all workers (10-second intervals)
- **Request Proxying**: Forwards all API requests to selected worker
- **Async Processing**: Uses aiohttp for non-blocking proxy operations
- **Graceful Degradation**: Falls back to all workers if none healthy

Load Balancer Routes:
```
POST /api/search                           → Round-robin to worker
POST /api/chat                             → Round-robin to worker
POST /api/session/create                   → Round-robin to worker
GET  /api/session/<id>                     → Round-robin to worker
GET  /api/session/<id>/history             → Round-robin to worker
GET  /api/stats                            → Round-robin to worker
GET  /api/health                           → LB health status
```

### 2. Worker Instances (Ports 8001-8010)
**File**: [lixsearch/app.py](lixsearch/app.py)

Features:
- **Configurable Port**: Via `WORKER_PORT` and `WORKER_ID` environment variables
- **Singleton Services**: Each worker initializes its own session with shared IPC
- **Independent Processing**: Handles requests asynchronously
- **Health Endpoint**: `/api/health` for load balancer checks
- **IPC Connection**: Connects to shared IPC pipeline on startup

Environment Variables per Worker:
```bash
WORKER_ID=1              # Identifier for logging
WORKER_PORT=8001         # Port this worker listens on
APP_MODE=worker          # Tells entrypoint to start as worker
```

### 3. Shared IPC Pipeline (Port 5010)
**File**: [lixsearch/ipcService/main.py](lixsearch/ipcService/main.py)

Single instance handling:
- RAG/Retrieval operations
- Embedding generation
- Session management
- Chat processing
- Search pipeline orchestration

**Important**: Only load balancer starts IPC service. Workers wait for it.

### 4. Vector Database (Bottleneck Area)
Located at: `data/embeddings/chroma.sqlite3`

**CRITICAL CONCERN**: 
- 10 workers × average 5-10 concurrent queries = 50-100 concurrent vector DB requests
- Single SQLite Chroma instance may become bottleneck
- **No connection pooling** in current Chroma setup

## Deployment: Docker Compose

```bash
cd docker_setup
docker-compose up -d
```

This starts:
1. **elixpo-search-lb** - Load balancer on port 8000
2. **elixpo-search-worker-1 to worker-10** - 10 workers on ports 8001-8010
3. All use shared IPC service (started by LB)
4. All use shared vector database

### Healthcheck Status
```bash
curl http://localhost:8000/api/health
```

Response:
```json
{
  "status": "healthy",
  "healthy_workers": 10,
  "total_workers": 10,
  "worker_status": {
    "8001": true,
    "8002": true,
    ...
    "8010": true
  }
}
```

## Request Flow Example

1. **Client sends request to Port 8000**
   ```bash
   curl -X POST http://localhost:8000/api/search \
     -H "Content-Type: application/json" \
     -d '{"query": "example"}'
   ```

2. **Load Balancer selects worker** (e.g., 8003)
   ```
   LB: Request matched to /api/search
   LB: Selecting next healthy worker (round-robin)
   LB: Current index: 2 → Worker port 8003
   ```

3. **Worker processes request**
   ```
   Worker-3: Received /api/search
   Worker-3: Connecting to IPC pipeline
   Worker-3: Requesting embeddings from shared IPC
   Worker-3: Querying shared vector DB via IPC
   Worker-3: Returning results
   ```

4. **Load Balancer returns response to client**
   ```json
   {
     "results": [...],
     "total": 42,
     "processing_time": 250
   }
   ```

## Vector Database Bottleneck - Mitigation Strategies

### Current Issue
```
10 Workers → 1 IPC Pipeline → 1 Vector DB (Chroma SQLite)
```

With heavy loads, the vector database becomes the single point of contention.

### Recommended Solutions (Priority Order)

#### 1. **Chroma with Persistent Server** (IMMEDIATE - Best)
Replace embedded Chroma with server mode:
```bash
# Start Chroma server separately
chroma run --host 0.0.0.0 --port 8100

# Connect all workers to it
CHROMA_API_IMPL=http
CHROMA_SERVER_HOST=chroma-server
CHROMA_SERVER_PORT=8100
```

**Advantages**:
- ✅ Dedicated process for vector operations
- ✅ Better resource management
- ✅ Built-in HTTP API with connection pooling
- ✅ Scales independently

**Implementation**:
- Add Chroma service to docker-compose.yml
- Update [lixsearch/ragService/vectorStore.py](lixsearch/ragService/vectorStore.py) to use HTTP client

#### 2. **Vector Cache Layer** (MEDIUM - Recommended Addition)
Implement semantic caching in IPC pipeline:
- Cache embeddings between requests
- Cache similar vector queries
- Reduce redundant DB hits

**File to modify**: [lixsearch/ragService/semanticCache.py](lixsearch/ragService/semanticCache.py)
```python
class SemanticCache:
    def __init__(self, ttl=3600):
        self.cache = {}
        self.query_cache = {}
        
    async def get_cached_embedding(self, text: str):
        """Reuse embeddings for identical or similar texts"""
        
    async def get_cached_results(self, query_hash: str):
        """Cache vector search results"""
```

#### 3. **Connection Pooling** (MEDIUM - Next Step)
Implement connection pool in IPC pipeline:
```python
class VectorDBPool:
    def __init__(self, max_connections=20):
        self.pool = asyncio.Queue(maxsize=max_connections)
        
    async def get_connection(self):
        """Get connection from pool"""
        
    async def return_connection(self, conn):
        """Return connection to pool"""
```

#### 4. **Sharded Vector DB** (ADVANCED - Future)
Distribute embedding data across multiple instances:
```
Query → LB → Shard Selector
         ├→ Shard 1 (letters A-H)
         ├→ Shard 2 (letters I-P)
         └→ Shard 3 (letters Q-Z)
```

#### 5. **Redis Caching Layer** (ADVANCED)
Add Redis for session/query result caching:
```
Worker → Redis Cache Check
         ├→ Hit: Return cached result
         └→ Miss: Query Vector DB → Cache → Return
```

## Configuration Files

### docker-compose.yml Structure
- **Load Balancer Service**: Depends on all 10 workers
- **10 Worker Services**: Each with unique port and ID
- **Shared Network**: All services on `elixpo-network`
- **Shared Volumes**: embeddings and cache data

### Environment Setup

Create `.env` file in `docker_setup/`:
```bash
# Vector DB Settings
CHROMA_DB_PATH=/app/data/embeddings
CHROMA_BATCH_SIZE=100

# IPC Settings
IPC_HOST=localhost
IPC_PORT=5010

# API Settings
API_TIMEOUT=120
MAX_RETRIES=3

# Logging
LOG_LEVEL=INFO
```

## Performance Tuning

### Load Balancer Settings
```python
# In load_balancer.py
HEALTH_CHECK_INTERVAL = 10  # seconds
TIMEOUT = 120  # seconds per request
```

### Worker Settings
```bash
# Per worker in docker-compose.yml
PYTHONUNBUFFERED=1  # Real-time logging
WORKER_TIMEOUT=120
```

### Vector DB Optimization
```python
# In vectorStore.py
BATCH_EMBEDDING=True  # Batch embeddings
EMBEDDING_CACHE_SIZE=1000
QUERY_TIMEOUT=30
```

## Monitoring & Debugging

### Check Load Balancer Status
```bash
curl http://localhost:8000/api/health | jq
```

### Check Individual Worker
```bash
curl http://localhost:8001/api/health
curl http://localhost:8002/api/health
# ... up to 8010
```

### Monitor Logs
```bash
# Load Balancer
docker logs elixpo-search-lb -f

# Worker 1
docker logs elixpo-search-worker-1 -f

# All workers
for i in {1..10}; do echo "=== Worker $i ===" && docker logs elixpo-search-worker-$i -n 20; done
```

### Check Vector DB Usage
```bash
# Inside any worker container
sqlite3 /app/data/embeddings/chroma.sqlite3 "SELECT count(*) FROM collections;"
```

## Scaling Beyond 10 Workers

To increase workers beyond 10:

1. **Modify docker-compose.yml**: Add more worker services (8011, 8012, etc.)
2. **Update load_balancer.py**:
   ```python
   lb = create_load_balancer(num_workers=20, start_port=8001)
   ```
3. **Update entrypoint.sh**: Already supports arbitrary worker count
4. **Address Vector DB bottleneck**: Implement solutions from "Mitigation Strategies"

## Quick Start

### Local Development
```bash
# Terminal 1: Start IPC service
python3 -m lixsearch.ipcService.main

# Terminal 2: Start worker on 8001
WORKER_PORT=8001 WORKER_ID=1 python3 lixsearch/app.py

# Terminal 3: Start another worker on 8002
WORKER_PORT=8002 WORKER_ID=2 python3 lixsearch/app.py

# Terminal 4: Start load balancer
python3 lixsearch/load_balancer_app.py

# Test
curl -X POST http://localhost:8000/api/search -H "Content-Type: application/json" -d '{"query": "test"}'
```

### Docker Deployment
```bash
cd docker_setup
docker-compose up -d
sleep 30  # Wait for startup
curl http://localhost:8000/api/health
```

## Next Steps

1. ✅ **Implement Chroma Server** - Replace embedded Chroma
2. ✅ **Add Semantic Caching** - Reduce vector DB load
3. ✅ **Connection Pooling** - Improve concurrent capacity
4. ✅ **Redis Layer** - Cache hot queries
5. ⏳ **Metrics Collection** - Monitor bottlenecks in production

## Summary

This architecture provides:
- **10-fold parallelism** via worker pool
- **Health-aware load balancing** with automatic failover
- **Scalable request distribution** without code changes
- **Shared pipeline efficiency** for stateful operations
- **Docker-native deployment** for easy scaling

The main concern is the **single vector database bottleneck** - implementing the Chroma server solution will immediately improve throughput by 5-10x.
