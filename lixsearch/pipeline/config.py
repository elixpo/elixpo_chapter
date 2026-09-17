import os
from commons.environment import load_local_environment
import re
load_local_environment()

# Keep all Hugging Face and SentenceTransformers artifacts on persistent disk.
MODEL_CACHE_DIR = os.path.abspath(os.getenv("MODEL_CACHE_DIR", "./data/models"))
MODEL_LOCAL_FILES_ONLY = os.getenv("MODEL_LOCAL_FILES_ONLY", "false").lower() in {"1", "true", "yes"}
os.environ.setdefault("HF_HOME", MODEL_CACHE_DIR)
os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", MODEL_CACHE_DIR)

MAX_TRANSCRIPT_WORD_COUNT = 3000
MAX_TOTAL_SCRAPE_WORD_COUNT = 1800
MAX_IMAGES_TO_INCLUDE = 10
MAX_LINKS_TO_TAKE = 4
MIN_LINKS_TO_TAKE = 1
MAX_LINKS_TO_TAKE_DETAILED = 4
MIN_LINKS_TO_TAKE_DETAILED = 2

MAX_SOURCES_STANDARD = 4
MAX_SOURCES_DETAILED = 8
SOURCES_PER_SEARCH = 4
BASE_CACHE_DIR = "./data/audio_cache"

isHeadless = True
POLLINATIONS_ENDPOINT = "https://gen.pollinations.ai/v1/chat/completions"
POLLINATIONS_ENDPOINT_IMAGE = "https://gen.pollinations.ai/image/"

MAX_SESSIONS = 1000
SESSION_TTL_MINUTES = 30
RAG_CONTEXT_REFRESH = True
MODEL_POOL_SIZE = 1
MODEL_MAX_TABS = 20
SEARCH_AGENT_POOL_SIZE = int(os.getenv("SEARCH_AGENT_POOL_SIZE", "2"))
SEARCH_AGENT_MAX_TABS = int(os.getenv("SEARCH_AGENT_MAX_TABS", "15"))
MODEL_CACHE_CLEANUP_MINUTES = 30
MODEL_CACHE_MAX_AGE_MINUTES = 60
FETCH_MIN_USEFUL_CHARS = 120
FETCH_EVIDENCE_MAX_CHARS = 4000

SEARCH_DEPTH_BOUNDS = {
    "quick": {"min": 1, "max": 2},
    "standard": {"min": 2, "max": 4},
    "thorough": {"min": 2, "max": 4},
}


INTERNAL_LEAK_PATTERNS = [
    r"\bthe user wants\b",
    r"\bthe user is asking\b",
    r"\bi should\b",
    r"\bi need to\b",
    r"\bi will (search|fetch|look|check|use|find|retrieve)\b",
    r"\blet me (search|fetch|look|check|find|retrieve|get)\b",
    r"\bfirst priority\b",
    r"\bbased on the rag\b",
    r"\bbased on the (web search|search results|tool)\b",
    r"\bquery_conversation_cache\b",
    r"\btool(?:s)?\b.*\b(use|call|execute)\b",
    r"\b(web_search|fetch_full_text|cache_hit|cache_miss|semantic_cache)\b",
    r"^(step \d+|first,|second,|next,|finally,)",
]


LEAKED_TOOL_RE = re.compile(
    r"(?:Functions?\.)?"
    r"(?:web_search|fetch_full_text|query_conversation_cache|get_session_conversation_history|"
    r"cleanQuery|transcribe_audio|generate_prompt_from_image|replyFromImage|image_search|"
    r"youtubeMetadata|get_local_time|create_image|export_to_pdf|deep_research|"
    r"optimized_tool_execution|memoized_results|semantic_cache|cache_hit|cache_miss)"
    r"(?::\d+)?",
    re.IGNORECASE,
)

# Matches hallucinated XML tags the model sometimes emits (structure only, not content)
LEAKED_XML_TAG_RE = re.compile(
    r"</?(?:function_calls|invoke|parameter)\b[^>]*>",
    re.IGNORECASE,
)

LLM_MODEL = os.getenv("LLM_MODEL", "nova-fast")
LLM_MODEL_FALLBACK = os.getenv("LLM_MODEL_FALLBACK", "nova")
LLM_DECISION_MODEL = os.getenv("LLM_DECISION_MODEL", LLM_MODEL)
LLM_DECISION_TIMEOUT_SECONDS = float(os.getenv("LLM_DECISION_TIMEOUT_SECONDS", "1.8"))
SSE_CHUNK_CHARS = int(os.getenv("SSE_CHUNK_CHARS", "32"))
IMAGE_MODEL1 = os.getenv("IMAGE_MODEL1", "flux")
IMAGE_MODEL2 = os.getenv("IMAGE_MODEL2", "flux")
VISION_MODEL = os.getenv("VISION_MODEL", "gemini-fast")


RESPONSE_MODEL = os.getenv("RESPONSE_MODEL", "lixsearch")
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "700"))
LLM_MAX_TOKENS_DETAILED = int(os.getenv("LLM_MAX_TOKENS_DETAILED", "1800"))
HISTORY_TOKEN_BUDGET = int(os.getenv("HISTORY_TOKEN_BUDGET", "3000"))
HISTORY_TOKEN_BUDGET_DETAILED = int(os.getenv("HISTORY_TOKEN_BUDGET_DETAILED", "6000"))
LLM_TEMPERATURE = 0.7
LLM_TOP_P = 1.0

TOPIC_DECOMPOSITION_MAX_PARTS = 4
TOPIC_DECOMPOSITION_TIMEOUT = int(os.getenv("TOPIC_DECOMPOSITION_TIMEOUT", "25"))

# Deep Search mode
DEEP_SEARCH_MAX_SUB_QUERIES = 4
DEEP_SEARCH_MAX_ITERATIONS_PER_SUB = 2
DEEP_SEARCH_MAX_TOKENS_PER_SUB = 900
DEEP_SEARCH_FINAL_SYNTHESIS_MAX_TOKENS = 1800
DEEP_SEARCH_MIN_LINKS_PER_SUB = 2
DEEP_SEARCH_MAX_LINKS_PER_SUB = 4
DEEP_SEARCH_TIMEOUT_PER_SUB = 60
DEEP_SEARCH_MAX_WEB_SEARCHES_PER_SUB = 1
DEEP_SEARCH_WEB_SEARCH_CONCURRENCY = 2
DEEP_SEARCH_WEB_SEARCH_TIMEOUT_SECONDS = 20
DEEP_SEARCH_GATING_MIN_COMPLEXITY = "MODERATE"

SEARCH_MAX_RESULTS = 8
SEARCH_MAX_RESULTS_DETAILED =  15
YOUTUBE_MAX_VIDEOS = 2
IMAGE_SEARCH_MAX = 10
FETCH_TIMEOUT = 30
PARALLEL_WORKERS = 10
REQUEST_TIMEOUT = 300

EMBEDDING_BATCH_SIZE = 32

LOG_LEVEL = "INFO"

EMBEDDINGS_DIR = "./data/embeddings"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIMENSION = 384
CHUNK_SIZE = 600
CHUNK_OVERLAP = 60

SEMANTIC_CACHE_DIR = "./data/cache"
SEMANTIC_CACHE_TTL_SECONDS = 3600
SEMANTIC_CACHE_SIMILARITY_THRESHOLD = 0.90

X_REQ_ID_SLICE_SIZE = 12
RETRIEVAL_TOP_K = 5
SESSION_SUMMARY_THRESHOLD = 6
PERSIST_VECTOR_STORE_INTERVAL = 300
CONVERSATION_CACHE_DIR = "./data/cache/conversation"
CACHE_WINDOW_SIZE = 10
CACHE_COMPRESSION_ENABLED = True
CACHE_SIMILARITY_THRESHOLD = 0.85
CACHE_MAX_ENTRIES = 50
CACHE_TTL_SECONDS = 1800
CACHE_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
CACHE_MIN_QUERY_LENGTH = 10
CACHE_COMPRESSION_METHOD = "zlib"
REQUEST_ID_LEGACY_SLICE_SIZE = 10
REQUEST_ID_HEX_SLICE_SIZE = 8
LOG_MESSAGE_QUERY_TRUNCATE = 50
LOG_MESSAGE_CONTEXT_TRUNCATE = 100
LOG_MESSAGE_LONG_TRUNCATE = 150
LOG_MESSAGE_PREVIEW_TRUNCATE = 200
LOG_ENTRY_ID_DISPLAY_SIZE = 8
IMAGE_SEARCH_QUERY_WORDS_LIMIT = 15
ERROR_MESSAGE_TRUNCATE = 100
ERROR_CONTEXT_TRUNCATE = 150

QDRANT_MODE = os.getenv("QDRANT_MODE", "server").strip().lower()
QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
QDRANT_PATH = os.path.abspath(os.getenv("QDRANT_PATH", "./data/qdrant"))
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "document_embeddings")
QDRANT_ON_DISK = os.getenv("QDRANT_ON_DISK", "true").lower() in {"1", "true", "yes"}
QDRANT_QUANTILE = float(os.getenv("QDRANT_QUANTILE", "0.99"))
QDRANT_ALWAYS_RAM = os.getenv("QDRANT_ALWAYS_RAM", "true").lower() in {"1", "true", "yes"}
QDRANT_TIMEOUT = int(os.getenv("QDRANT_TIMEOUT", "30"))
EPISODIC_MEMORY_TOP_K = max(1, min(int(os.getenv("EPISODIC_MEMORY_TOP_K", "4")), 12))
EPISODIC_MEMORY_MAX_CHARS = max(256, min(int(os.getenv("EPISODIC_MEMORY_MAX_CHARS", "2000")), 8000))
EPISODIC_MEMORY_TIMEOUT_SECONDS = max(
    0.05, min(float(os.getenv("EPISODIC_MEMORY_TIMEOUT_SECONDS", "0.75")), 5.0)
)
EPISODIC_MEMORY_TTL_SECONDS = max(
    3600, int(os.getenv("EPISODIC_MEMORY_TTL_SECONDS", str(30 * 86400)))
)
EPISODIC_MEMORY_MIN_SCORE = max(
    0.0, min(float(os.getenv("EPISODIC_MEMORY_MIN_SCORE", "0.30")), 1.0)
)
GRAPH_MEMORY_ENABLED = os.getenv("GRAPH_MEMORY_ENABLED", "false").lower() in {"1", "true", "yes"}
GRAPH_MEMORY_REDIS_DB = int(os.getenv("GRAPH_MEMORY_REDIS_DB", "5"))
GRAPH_MEMORY_CACHE_TTL_SECONDS = max(60, int(os.getenv("GRAPH_MEMORY_CACHE_TTL_SECONDS", "3600")))
GRAPH_MEMORY_MAX_ITEMS = max(1, min(int(os.getenv("GRAPH_MEMORY_MAX_ITEMS", "8")), 24))
GRAPH_MEMORY_MAX_CHARS = max(256, min(int(os.getenv("GRAPH_MEMORY_MAX_CHARS", "2000")), 8000))
GRAPH_MEMORY_RETRY_LIMIT = max(1, min(int(os.getenv("GRAPH_MEMORY_RETRY_LIMIT", "8")), 32))

VECTOR_DB_POOL_SIZE = 20
VECTOR_DB_QUERY_TIMEOUT = 30
VECTOR_DB_BATCH_TIMEOUT = 60
VECTOR_DB_CONNECTION_TIMEOUT = 10
VECTOR_DB_MAX_RETRIES = 3
VECTOR_DB_RETRY_DELAY = 2

SEMANTIC_QUERY_CACHE_TTL = 3600
SEMANTIC_QUERY_CACHE_MAX_SIZE = 1000
SEMANTIC_QUERY_CACHE_SIMILARITY_THRESHOLD = 0.98
SEMANTIC_CACHE_CLEANUP_INTERVAL = 300

REDIS_ENABLED = True
REDIS_HOST = os.getenv("REDIS_HOST")
REDIS_PORT = int(os.getenv("REDIS_PORT"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None
REDIS_URL = f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/0" if REDIS_PASSWORD else f"redis://{REDIS_HOST}:{REDIS_PORT}/0"
REDIS_SOCKET_CONNECT_TIMEOUT = 5
REDIS_SOCKET_KEEPALIVE = True
REDIS_KEY_PREFIX = "elixpo"


_redis_pools = {}  # (host, port, db) → ConnectionPool
_redis_pools_lock = __import__("threading").Lock()


def create_redis_client(host=None, port=None, db=0, **kwargs):
    import redis as _redis

    host = host or REDIS_HOST
    port = port or REDIS_PORT
    port = int(port)

    pool_key = (host, port, db)

    with _redis_pools_lock:
        if pool_key not in _redis_pools:
            pool_kwargs = dict(
                host=host,
                port=port,
                db=db,
                decode_responses=kwargs.pop("decode_responses", False),
                socket_connect_timeout=kwargs.pop("socket_connect_timeout", REDIS_SOCKET_CONNECT_TIMEOUT),
                socket_keepalive=kwargs.pop("socket_keepalive", REDIS_SOCKET_KEEPALIVE),
                max_connections=SEMANTIC_CACHE_REDIS_POOL_SIZE,
            )

            # Try with password first, then without
            password = REDIS_PASSWORD
            if password:
                try:
                    pool = _redis.ConnectionPool(password=password, **pool_kwargs)
                    test_client = _redis.Redis(connection_pool=pool)
                    test_client.ping()
                    _redis_pools[pool_key] = pool
                except _redis.exceptions.AuthenticationError:
                    password = None

            if pool_key not in _redis_pools:
                pool = _redis.ConnectionPool(password=None, **pool_kwargs)
                test_client = _redis.Redis(connection_pool=pool)
                test_client.ping()
                _redis_pools[pool_key] = pool

    return _redis.Redis(connection_pool=_redis_pools[pool_key])

SEMANTIC_CACHE_REDIS_HOST = REDIS_HOST
SEMANTIC_CACHE_REDIS_PORT = REDIS_PORT
SEMANTIC_CACHE_REDIS_DB = 0
SEMANTIC_CACHE_REDIS_TTL_SECONDS = 300
SEMANTIC_CACHE_REDIS_SIMILARITY_THRESHOLD = 0.90
SEMANTIC_CACHE_REDIS_MAX_ITEMS_PER_URL = 50

URL_EMBEDDING_CACHE_REDIS_DB = 1
URL_EMBEDDING_CACHE_TTL_SECONDS = 86400
URL_EMBEDDING_CACHE_BATCH_SIZE = 100

SESSION_CONTEXT_WINDOW_REDIS_DB = 2
SESSION_LEDGER_REDIS_DB = int(os.getenv("SESSION_LEDGER_REDIS_DB", "2"))
SESSION_LEDGER_TTL_SECONDS = int(os.getenv("SESSION_LEDGER_TTL_SECONDS", str(24 * 3600)))
SESSION_LEDGER_WINDOW_SIZE = int(os.getenv("SESSION_LEDGER_WINDOW_SIZE", "20"))
SESSION_LEDGER_LOCK_SECONDS = int(os.getenv("SESSION_LEDGER_LOCK_SECONDS", "180"))
SESSION_LEDGER_LOCK_WAIT_SECONDS = float(os.getenv("SESSION_LEDGER_LOCK_WAIT_SECONDS", "5"))
AGENT_STATE_REDIS_DB = int(os.getenv("AGENT_STATE_REDIS_DB", "3"))
GLOBAL_MEMORY_REDIS_DB = int(os.getenv("GLOBAL_MEMORY_REDIS_DB", "4"))
GLOBAL_MEMORY_TTL_SECONDS = int(os.getenv("GLOBAL_MEMORY_TTL_SECONDS", str(30 * 86400)))
GLOBAL_MEMORY_CANDIDATE_TTL_SECONDS = int(os.getenv("GLOBAL_MEMORY_CANDIDATE_TTL_SECONDS", str(7 * 86400)))
GLOBAL_MEMORY_MAX_ITEMS = int(os.getenv("GLOBAL_MEMORY_MAX_ITEMS", "8"))
GLOBAL_MEMORY_MAX_CHARS = int(os.getenv("GLOBAL_MEMORY_MAX_CHARS", "2000"))
AGENT_RESPONSE_TTL_SECONDS = int(os.getenv("AGENT_RESPONSE_TTL_SECONDS", "86400"))
AGENT_HISTORY_MAX_MESSAGES = int(os.getenv("AGENT_HISTORY_MAX_MESSAGES", "20"))
AGENT_STREAM_CHUNK_CHARS = int(os.getenv("AGENT_STREAM_CHUNK_CHARS", "96"))
AGENT_STREAM_DEFAULT = os.getenv("AGENT_STREAM_DEFAULT", "true").lower() in {"1", "true", "yes"}
SESSION_CONTEXT_WINDOW_TTL_SECONDS = int(os.getenv("SESSION_CONTEXT_WINDOW_TTL", "86400"))  # 24h — Redis hot tier; refreshed on every access
SESSION_CONTEXT_WINDOW_SIZE = 20
SESSION_CONTEXT_WINDOW_MAX_TOKENS = None

SEMANTIC_CACHE_REDIS_POOL_SIZE = 50
SEMANTIC_CACHE_REDIS_MAX_SESSIONS = 1000
SEMANTIC_CACHE_REDIS_CONNECTION_TIMEOUT = 10
SEMANTIC_CACHE_REDIS_COMPRESSION_ENABLED = False

SEMANTIC_CACHE_REDIS_CLEANUP_INTERVAL = 300
SEMANTIC_CACHE_REDIS_STATS_INTERVAL = 60
SEMANTIC_CACHE_REDIS_ENABLE_MONITORING = True


CONVERSATION_ARCHIVE_DIR = "./data/conversations"
SESSION_DISK_TTL_DAYS = int(os.getenv("SESSION_DISK_TTL_DAYS", "14"))  # purge after 14 days inactive
SESSION_LRU_EVICT_AFTER_MINUTES = int(os.getenv("SESSION_LRU_EVICT_AFTER_MINUTES", "120"))  # 2h before evicting to disk        
HYBRID_HOT_WINDOW_SIZE = 20                 
HYBRID_STARTUP_CLEANUP = True               

CORE_SERVICE_BACKEND = os.getenv("CORE_SERVICE_BACKEND", "ipc").strip().lower()

IPC_HOST = os.getenv("IPC_HOST")
IPC_PORT = int(os.getenv("IPC_PORT"))
_IPC_AUTHKEY = os.getenv("IPC_AUTHKEY")
IPC_AUTHKEY = _IPC_AUTHKEY.encode() if isinstance(_IPC_AUTHKEY, str) else _IPC_AUTHKEY
IPC_TIMEOUT = 30
