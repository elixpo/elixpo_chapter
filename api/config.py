"""
Production Configuration for ElixpoSearch
"""

# ============================================
# Content Processing
# ============================================
MAX_TRANSCRIPT_WORD_COUNT = 3000
MAX_TOTAL_SCRAPE_WORD_COUNT = 3000
MAX_IMAGES_TO_INCLUDE = 4
MAX_LINKS_TO_TAKE = 6
AUDIO_TRANSCRIBE_SIZE = "small"  # small, base, medium, or large
BASE_CACHE_DIR = "./cached_audio"

# ============================================
# Server Configuration
# ============================================
isHeadless = True
POLLINATIONS_ENDPOINT = "https://enter.pollinations.ai/api/generate/v1/chat/completions"

# ============================================
# Session Management
# ============================================
MAX_SESSIONS = 1000  # Max concurrent sessions
SESSION_TTL_MINUTES = 30  # Session time-to-live in minutes

# ============================================
# Knowledge Graph & RAG
# ============================================
KG_TOP_K_ENTITIES = 15  # Number of top entities to use in RAG
KG_TOP_K_RELATIONSHIPS = 10  # Number of relationships to include
RAG_CONTEXT_REFRESH = True  # Auto-refresh RAG context
USE_KG_FOR_RAG = True  # Enable knowledge graph for RAG

# ============================================
# Model Server
# ============================================
MODEL_POOL_SIZE = 1  # Number of search agents
MODEL_MAX_TABS = 20  # Max tabs per agent
MODEL_CACHE_CLEANUP_MINUTES = 30  # Cache cleanup interval
MODEL_CACHE_MAX_AGE_MINUTES = 60  # Max age for cache items

# ============================================
# LLM Configuration
# ============================================
LLM_MODEL = "claude-3.5-sonnet"  # Primary LLM
LLM_MAX_TOKENS = 3000  # Max tokens in LLM responses
LLM_TEMPERATURE = 0.7  # LLM temperature (0.0 - 1.0)
LLM_TOP_P = 1.0  # LLM top_p

# ============================================
# Search & Crawling
# ============================================
SEARCH_MAX_RESULTS = 8  # Max web search results to fetch
YOUTUBE_MAX_VIDEOS = 2  # Max YouTube videos per query
IMAGE_SEARCH_MAX = 5  # Max images to search for
FETCH_TIMEOUT = 30  # Timeout for fetching URLs (seconds)

# ============================================
# Performance & Optimization
# ============================================
PARALLEL_WORKERS = 10  # Max parallel URL fetching workers
REQUEST_TIMEOUT = 300  # Request timeout (seconds)
EMBEDDING_BATCH_SIZE = 64  # Batch size for embeddings
EMBEDDING_DIVERSITY = 0.4  # Diversity score for MMR in embeddings

# ============================================
# Logging
# ============================================
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
LOG_FILE = None  # Set to file path to log to file

# ============================================
# Experimental Features
# ============================================
ENABLE_WEBSOCKET_STREAMING = True  # Enable WebSocket endpoints
ENABLE_ENTITY_EXTRACTION = True  # Enable KG entity extraction
ENABLE_RELATIONSHIP_DETECTION = True  # Enable relationship detection