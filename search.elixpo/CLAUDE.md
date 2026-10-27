# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

lixSearch is a multi-service intelligent search assistant (Python/Quart) that searches the web, fetches videos/images, and synthesizes answers with sources. It uses a pipeline architecture with distributed caching, vector embeddings via IPC, and Playwright-based search agents.

## Build & Run

### Docker (production)
```bash
./sops-reencrypt.sh --decrypt         # then fill in POLLINATIONS_API_KEY and optional HF_TOKEN
./deploy.sh build              # build image
./deploy.sh start 3            # start with 3 app containers
./deploy.sh scale 5            # scale to 5
./deploy.sh health             # check all services
./deploy.sh logs app           # tail app logs
./autoscale.sh                 # CPU-based autoscaler daemon (1-5 replicas)
```

### Local development
```bash
source venv/bin/activate       # Python 3.11 venv at /mnt/volume_sfo2_01/lixSearch/venv/
redis-server --port 9530 &     # Redis on custom port
chroma run --host localhost --port 9001 &
APP_MODE=ipc python lixsearch/ipcService/main.py &      # embedding service (port 9510)
APP_MODE=worker WORKER_PORT=9002 python lixsearch/app/main.py &
```

### Tests (integration, no unit test framework)
```bash
python tester/test_multi_turn_session.py
python tester/test_session_persistence.py
python tester/test_redis_semantic_cache.py
```

### Health check
```bash
curl http://localhost:9002/api/health    # direct worker
curl http://localhost/api/health         # via nginx
```

## Architecture

### Network topology

All internal services communicate over a private Docker network (`elixpo-network`). None of the internal 9xxx ports are published to the host — they are only reachable within the Docker network (via `expose`). The only externally reachable entry point is nginx.

```
Internet → Cloudflare → search.elixpo.com
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
     Next.js frontend (/)            nginx (:10001, API key)
     search.elixpo/                  ┌────────────────────────┐
     ├── /c/[session]               │  :80   internal/dev    │
     ├── /discover                  │  :10001 production     │
     ├── /library                   │  :443   reserved       │
     └── /api/* (proxy)             └──────────┬─────────────┘
              │                                │
              │  BACKEND_URL + X-Internal-Key   │ proxy_pass
              └───────────┬────────────────────┘
                          ▼
               lixsearch-app (:9002, N replicas, 10 Hypercorn workers each)
                 ├── Gateways (app/gateways/*.py)
                 ├── Pipeline (pipeline/lixsearch.py) — main async generator
                 │     ├── Tool execution (pipeline/optimized_tool_execution.py)
                 │     ├── RAG (ragService/)
                 │     └── LLM inference → Pollinations API (external)
                 ├── Session/cache (sessions/, ragService/cacheCoordinator.py)
                 └── IPC client → ipc-service (:9510, singleton)
                                    ├── CoreEmbeddingService (sentence-transformers)
                                    ├── SearchAgentPool (Playwright text + image agents)
                                    └── Chroma vector DB (:9001)
Redis (:9530) shared across all containers:
  DB 0 — semantic query cache (5min TTL, per-session)
  DB 1 — URL embedding cache (24h TTL, global)
  DB 2 — session hot window (30min TTL, 20 msgs, LRU evicted to disk)
```

### Ports & exposure

| Service | Internal port | Published to host? | Purpose |
|---------|--------------|-------------------|---------|
| nginx | 80, 443, 10001 | **Yes** — 80:80, 443:443, 10001:10001 | Only external entry point |
| lixsearch-app | 9002 | No (`expose` only) | Quart API workers |
| ipc-service | 9510 | No (`expose` only) | Embedding model + Playwright pool |
| chroma-server | 9001 | No (`expose` only) | Vector DB |
| redis | 9530 | No (`expose` only) | Cache (3 DBs) |

### Authentication

- **Port 80** (nginx internal server): No API key required. Used for local dev and inter-service health checks.
- **Port 10001** (nginx authenticated server): API key required via `X-API-Key` header or `?key=` query param. This is the production endpoint routed from `search.elixpo.com` through Cloudflare.
- **Auth-exempt paths** (both ports): `/api/health`, `/docs`, `/api/docs`, `/openapi.json`, `/openapi.yaml`
- **App-level auth**: `INTERNAL_API_KEY` env var in `before_request` middleware (`app/main.py`). Separate from the nginx API key — used for internal service-to-service calls.

### Request flow
```
User → Cloudflare → nginx:10001 (API key check) → app:9002 → gateway (search.py / chat.py)
  → run_elixposearch_pipeline() async generator → query decomposition → tool routing
  → web_search/fetch/image_search/youtube → RAG retrieval → semantic cache check
  → LLM synthesis → SSE or JSON response
```

### Conversation storage (two-tier hybrid)
- **Hot**: Redis DB 2 — last 20 messages per session
- **Cold**: Huffman-compressed `.huff` files in `./data/conversations/<session_id>.huff`
- LRU eviction daemon migrates idle sessions (30min) from Redis to disk
- Disk archives have 30-day TTL, cleaned on startup

## Key Files

| File | Role |
|------|------|
| `lixsearch/pipeline/lixsearch.py` | Main pipeline orchestrator (~900 lines, async generator) |
| `lixsearch/pipeline/config.py` | **All** configuration constants — edit here, not in service files |
| `lixsearch/pipeline/optimized_tool_execution.py` | Tool routing engine |
| `lixsearch/pipeline/tools.py` | Tool definitions (web_search, fetch_full_text, etc.) |
| `lixsearch/pipeline/instruction.py` | System/user/synthesis prompts |
| `lixsearch/app/main.py` | Quart app with lifecycle hooks |
| `lixsearch/app/gateways/` | HTTP handlers: search.py, chat.py, completions.py, session.py, health.py |
| `lixsearch/app/gateways/completions.py` | OpenAI-compatible `/v1/chat/completions` (primary Pollinations endpoint) |
| `lixsearch/ragService/cacheCoordinator.py` | Orchestrates all 3 Redis cache layers |
| `lixsearch/ragService/semanticCacheRedis.py` | SessionContextWindow, SemanticCacheRedis, URLEmbeddingCache |
| `lixsearch/sessions/hybrid_conversation_cache.py` | Two-tier Redis hot + disk cold cache |
| `lixsearch/sessions/conversation_archive.py` | Huffman-compressed disk persistence |
| `lixsearch/sessions/huffman_codec.py` | Pure Python canonical Huffman codec |
| `lixsearch/ipcService/searchPortManager.py` | Search agent pool (Playwright browsers) |
| `lixsearch/ipcService/coreEmbeddingService.py` | Embedding inference via sentence-transformers |

## Critical Patterns

- **session_id** is the single identifier for all cross-service communication. It must be passed through `memoized_results["session_id"]` for CacheCoordinator and friends. Always `snake_case`, always `str`.
- **Config is centralized**: all tunables live in `pipeline/config.py` with `os.getenv()` overrides. Don't hardcode values in service files.
- **Logging convention**: `loguru` with `[Section]` prefixes — `[Pipeline]`, `[RAG]`, `[Cache]`, `[IPC]`, `[POOL]`, `[APP]`.
- **Pipeline yields strings**: `run_elixposearch_pipeline()` is an async generator. Tools return strings that are yielded progressively to the client.
- **IPC is a singleton**: The `ipc-service` container runs one instance shared by all app replicas. The `SearchAgentPool` inside it has configurable `SEARCH_AGENT_POOL_SIZE` and `SEARCH_AGENT_MAX_TABS` (in config.py).
- **Shared volumes**: All app containers mount the same `conversations-data`, `embeddings-data`, `cache-data` volumes and connect to the same Redis instance. No per-container state.

## Docker Services

| Service | Replicas | Port | Published? | Stateful? |
|---------|----------|------|-----------|-----------|
| nginx | 1 | 80, 443, 10001 | Yes (host-bound) | no |
| lixsearch-app | 1-5 (autoscale) | 9002 | No (internal) | no (shared volumes) |
| ipc-service | 1 | 9510 | No (internal) | no |
| chroma-server | 1 | 9001 | No (internal) | yes (embeddings-data) |
| redis | 1 | 9530 | No (internal) | yes (redis-data) |

## Frontend (`search.elixpo/`)

Next.js app deployed on **Cloudflare Pages** at `search.elixpo.com`. Uses `@cloudflare/next-on-pages` for edge runtime.

### Routes

| Route | Purpose | Auth required? |
|-------|---------|---------------|
| `/` | Home — search input | No |
| `/c/[sessionId]` | Conversation view | No (guest or logged-in) |
| `/discover` | Discover feed (public) | No |
| `/discover/[category]` | Category feed (finance, academic, sports, patent, etc.) | No |
| `/library` | Saved conversations | Yes (logged-in users only) |

### Guest access
- Guests (no login) get **15 free requests per IP** (tracked in `RATE_LIMIT_KV`, 24h TTL)
- Guest conversations navigate to `/c/[sessionId]` but are **not saved to library**
- `clientId` is generated per browser (stored in `localStorage` as `elixpo_client_id`)
- `sessionId` is generated per conversation (`sess_` + 16 random chars)
- Rate limit returns `429` with `X-RateLimit-Remaining` header

### Frontend → Backend flow
```
Browser → Cloudflare Pages (edge, Next.js API routes)
           → validates XID header (anti-abuse token)
           → checks guest rate limit (RATE_LIMIT_KV)
           → reads/writes D1 for conversations, discover articles
           → proxies search/session/surf to backend via BACKEND_URL
           → uses X-Internal-Key header for backend auth
```

### Frontend data layer
- **Cloudflare D1** (SQLite) — persistent storage for sessions, messages, bookmarks, discover articles
- **Cloudflare KV** (`SESSIONS_KV`) — read cache for session data (10min TTL, invalidated on write)
- **Cloudflare KV** (`RATE_LIMIT_KV`) — guest IP rate limiting (24h TTL)
- Schema: `workers/migrations/0001_init/schema.sql` (base), `0002_users/schema.sql` (users + auth)
- Models: `Session`, `Message`, `Bookmark`, `DiscoverArticle`, `User`

### Frontend API routes

| Route | Purpose |
|-------|---------|
| `api/search` | Proxies search queries to backend `/api/search` (SSE streaming, rate-limited) |
| `api/session` | Proxies session create/get to backend |
| `api/conversations` | Lists/saves conversations (D1 direct) |
| `api/conversations/[sessionId]` | Loads conversation messages (D1 + KV cache) |
| `api/discover` | Fetches discover articles (D1 direct) |
| `api/discover/generate` | Generates articles via backend, saves to D1 |
| `api/surf` | Proxies surf queries to backend |
| `api/auth/login` | Redirects to Elixpo Accounts SSO |
| `api/auth/callback` | OAuth callback — exchanges code, syncs user to D1, sets cookies |
| `api/auth/me` | Returns current user (SSO + local profile merged) |
| `api/auth/refresh` | Refreshes access token via refresh token cookie |
| `api/auth/logout` | Clears auth cookies |
| `api/user/profile` | GET/PATCH/DELETE user profile + preferences |

### Key frontend files

| File | Role |
|------|------|
| `src/lib/api.ts` | Backend URL, headers, XID validation |
| `src/lib/auth.ts` | SSO OAuth flow, token exchange, cookie management |
| `src/lib/db.ts` | D1 queries + KV cache + rate limiting + user CRUD |
| `src/hooks/useSession.ts` | Session/clientId management |
| `src/app/api/search/route.ts` | Search proxy (SSE passthrough, rate-limited) |
| `wrangler.toml` | Cloudflare Pages config (D1 + KV bindings) |
| `workers/migrations/0001_init/schema.sql` | D1 database schema |
| `workers/migrations/0002_users/schema.sql` | User table + auth columns |
| `env.d.ts` | Cloudflare env type declarations |

### Deploy frontend
```bash
cd search.elixpo/
npm run pages:build            # build with @cloudflare/next-on-pages
npm run pages:deploy           # deploy to Cloudflare Pages
npm run db:migrate             # apply D1 migrations (production)
npm run db:migrate:local       # apply D1 migrations (local dev)
```

### Cloudflare setup (one-time)
```bash
wrangler d1 create elixpo_search                    # create D1 database
wrangler kv namespace create elixpo_search_sessions     # create KV for session cache
wrangler kv namespace create elixpo_search_ratelimit    # create KV for rate limiting
# paste the IDs into wrangler.toml
wrangler secret put INTERNAL_API_KEY         # backend auth key
wrangler secret put XID                      # anti-abuse token
wrangler secret put API_KEY                  # nginx API key
wrangler secret put SSO_CLIENT_ID            # OAuth client ID from accounts.elixpo.com
wrangler secret put SSO_CLIENT_SECRET        # OAuth client secret from accounts.elixpo.com
```

### SSO Authentication (Elixpo Accounts)
- **Provider**: `accounts.elixpo.com` — OAuth 2.0 Authorization Code flow
- **Login**: `/api/auth/login` redirects to SSO → callback exchanges code for tokens → sets httpOnly cookies
- **Cookies**: `elixpo_access_token` (15min), `elixpo_refresh_token` (7d), both httpOnly/Secure/SameSite=Lax
- **User sync**: On login, user profile is upserted from SSO into local D1 `User` table
- **Rate limiting**: Authenticated users skip guest rate limit; guests get 15 requests/IP/24h
- **User profile**: Local D1 stores bio, location, website, company, jobTitle, preferences (theme, language, searchRegion, safeSearch, deepSearchDefault), tier, usage stats
- Register an OAuth app at `accounts.elixpo.com/dashboard/oauth-apps` with redirect URI `https://search.elixpo.com/api/auth/callback`

## Environment Variables

### Backend (.env.local)
Required: `POLLINATIONS_API_KEY`; optional: `HF_TOKEN`
Optional overrides: `REDIS_HOST`, `REDIS_PORT`, `QDRANT_MODE`, `QDRANT_URL`, `QDRANT_PATH`, `QDRANT_COLLECTION`, `IPC_HOST`, `IPC_PORT`, `WORKERS` (Hypercorn workers per container, default 10), `WORKER_PORT` (default 9002), `LOG_LEVEL`

### Frontend (wrangler.toml vars + secrets)
Vars: `BACKEND_URL`, `GUEST_REQUEST_LIMIT`, `SSO_REDIRECT_URI`
Secrets (via `wrangler secret put`): `INTERNAL_API_KEY`, `XID`, `API_KEY`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`

## Commit Rule

- All commits use a single author: `Circuit-Overtime <ayushbhatt633@gmail.com>`. Do not add `Co-Authored-By` or any other attribution trailers.
