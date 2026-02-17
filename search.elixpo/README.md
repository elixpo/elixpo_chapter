# Elixpo Search Agent


A Python-based web search and synthesis API that processes user queries, performs web and YouTube searches, scrapes content, and generates detailed Markdown answers with sources and images. Built for extensibility, robust error handling, and efficient information retrieval using modern async APIs and concurrency.

**NEW: Now features an IPC-based embedding model server for optimized GPU resource usage and better scalability!**

---

### GPU Memory Optimization (IPC Architecture):
```
Legacy Model (Before IPC):
App Worker 1 → Local Embedding Model (GPU: ~1GB)
App Worker 2 → Local Embedding Model (GPU: ~1GB)  
App Worker 3 → Local Embedding Model (GPU: ~1GB)
Total: ~6GB GPU memory per 3 workers

Optimized Model (With IPC):
App Worker 1 ──┐
App Worker 2 ──┤→ IPC TCP → Embedding Server (GPU: ~2GB)
App Worker 3 ──┘
Total: ~2GB GPU memory (67% reduction!)
```

---

## Architecture Overview

The system uses an **IPC-based Inter-Process Communication architecture** with async task processing, semantic caching, and efficient resource pooling:

```mermaid
graph TB
  subgraph "Client Layer"
    A1["🔷 App Worker 1<br/>Port: 5000<br/>Async Request Handler"]
    A2["🔷 App Worker 2<br/>Port: 5001<br/>Async Request Handler"]  
    A3["🔷 App Worker N<br/>Port: 500X<br/>Async Request Handler"]
  end
  
  subgraph "Request Processing"
    RQ["📦 Request Queue<br/>Max: 100 pending"]
    PS["🚦 Processing Semaphore<br/>Max: 15 concurrent"]
  end
  
  subgraph "IPC Communication"
    IPC["🔌 IPC Manager<br/>TCP Port: 5010<br/>BaseManager"]
  end
  
  subgraph "Model Server Layer"
    ES["🧠 Embedding Server<br/>SentenceTransformer<br/>GPU-Optimized"]
    SAP["🌐 Search Agent Pool<br/>Playwright Browser<br/>Automation"]
    TRANS["🎙️ Transcription<br/>Whisper Model<br/>GPU-Optimized"]
  end
  
  subgraph "Data & Cache Layer"
    VS["📊 Vector Store<br/>FAISS Index<br/>GPU Accelerated"]
    SC["⚡ Semantic Cache<br/>TTL: 3600s<br/>Similarity: 0.90"]
    SM["💾 Session Memory<br/>Per-user context<br/>FAISS sessions"]
  end
  
  subgraph "Search Services"
    YS["🔍 Yahoo Search<br/>Results"]
    YI["🖼️ Image Search<br/>Yahoo/Bing"]
    WEB["📄 Web Scraping<br/>BeautifulSoup"]
    YT["📹 YouTube<br/>Transcripts & Metadata"]
  end
  
  subgraph "Synthesis & Response"
    LLM["🤖 Pollinations LLM<br/>Chat Completions"]
    RESP["📤 Response Formatter<br/>Markdown + Sources"]
  end
  
  A1 --> RQ
  A2 --> RQ
  A3 --> RQ
  RQ --> PS
  
  PS -->|TCP:5010| IPC
  
  IPC -->|embed, search| ES
  IPC -->|web/image search| SAP
  IPC -->|transcribe| TRANS
  
  ES --> VS
  ES --> SC
  
  TRANS --> TRANS
  VS --> FAISS["FAISS GPU Index"]
  SM --> FAISS
  
  SAP --> YS
  SAP --> YI
  
  A1 --> WEB
  A2 --> WEB
  A3 --> WEB
  
  A1 --> YT
  A2 --> YT
  A3 --> YT
  
  PS --> LLM
  LLM --> RESP
  RESP --> A1
  RESP --> A2
  RESP --> A3
  
  classDef appLayer fill:#e3f2fd,stroke:#1976d2,stroke-width:2px,color:#000
  classDef ipcLayer fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000
  classDef modelLayer fill:#fff3e0,stroke:#e65100,stroke-width:3px,color:#000
  classDef cacheLayer fill:#e0f2f1,stroke:#00796b,stroke-width:2px,color:#000
  classDef externalLayer fill:#f1f8e9,stroke:#558b2f,stroke-width:2px,color:#000
  classDef queueLayer fill:#fce4ec,stroke:#c2185b,stroke-width:2px,color:#000
  
  class A1,A2,A3 appLayer
  class IPC ipcLayer
  class ES,TRANS,SAP modelLayer
  class VS,SC,SM cacheLayer
  class YS,YI,WEB,YT,LLM externalLayer
  class RQ,PS queueLayer
```

---

## System Flow: Request to Response

```mermaid
sequenceDiagram
  participant User
  participant AppWorker as App Worker<br/>Async Handler
  participant Pipeline as Search Pipeline<br/>Orchestrator
  participant IPC as IPC Manager<br/>TCP:5010
  participant Models as Model Server<br/>GPU Services
  participant LLM as Pollinations<br/>API
  participant External as External<br/>Services

  User->>AppWorker: POST /search<br/>{"query": "..."}
  AppWorker->>Pipeline: run_elixposearch_pipeline()
  
  Pipeline->>Pipeline: Clean query<br/>Extract URLs
  Pipeline->>IPC: retrieve(query)
  IPC->>Models: Vector search
  Models->>IPC: context results
  
  Pipeline->>LLM: Message #1<br/>Plan tools
  LLM->>Pipeline: Tool calls<br/>web_search, etc
  
  alt Tool: web_search
    Pipeline->>IPC: web_search(query)
    IPC->>Models: Search agents
    Models->>External: Browser automation
    External->>IPC: Results
  end
  
  alt Tool: transcribe_audio
    Pipeline->>IPC: transcribe(url)
    IPC->>Models: Whisper model
    Models->>External: YouTube download
    External->>IPC: Transcript
  end
  
  alt Tool: fetch_full_text
    Pipeline->>External: Scrape URL
    External->>Pipeline: HTML content
    Pipeline->>IPC: embed(content)
    IPC->>Pipeline: Embeddings
  end
  
  Pipeline->>LLM: Message #2-N<br/>Tool results
  LLM->>Pipeline: Final response
  
  Pipeline->>AppWorker: Formatted markdown<br/>+ sources
  AppWorker->>User: SSE stream<br/>event: final
```

---

## Key Architectural Components

### 1. **🚀 Async Request Processing**
- Non-blocking async handlers using Quart
- Asyncio-based event loop for concurrent operations
- Thread pool executor for blocking I/O operations (only when necessary)
- Max 15 concurrent operations with semaphore control

### 2. **🧠 GPU-Optimized IPC Embedding**
- Single embedding model instance on GPU
- SentenceTransformer with FAISS indexing
- Thread-safe operations with lock management
- Automatic batch processing for efficiency

### 3. **🌐 Browser Automation Pool**
- Playwright-based search agents
- Automatic rotation after 20 tabs per agent
- Dynamic port allocation (9000-19999)
- Headless mode for lower resource usage

### 4. **⚡ Semantic Caching System**
- TTL-based cache (default: 3600 seconds)
- Cosine similarity matching (threshold: 0.90)
- Per-URL cache management
- Automatic expired entry cleanup

### 5. **💾 Session-Based Knowledge Management**
- Per-user session with independent FAISS indexes
- Conversation history tracking
- Content embeddings for relevance scoring
- Automatic memory summarization

### 6. **📊 Tool Orchestration**
Tools are executed via the LLM agent which chooses:
- `cleanQuery` - Extract & validate URLs from query
- `web_search` - Search the web for information
- `fetch_full_text` - Scrape and embed web content
- `image_search` - Find relevant images (async)
- `youtubeMetadata` - Extract video metadata
- `transcribe_audio` - Convert video to text
- `get_local_time` - Timezone lookups
- `generate_prompt_from_image` - Vision-based search
- `replyFromImage` - Direct image queries

---

## File Structure

### Core Modules

| File | Purpose | Key Classes |
|------|---------|-------------|
| **app.py** | Main Quart API server | FastAPI routes, initialization |
| **searchPipeline.py** | Tool orchestration + LLM interaction | `run_elixposearch_pipeline()` |
| **rag_engine.py** | RAG pipeline & retrieval | `RAGEngine`, `RetrievalSystem` |
| **model_server.py** | IPC embedding/transcription server | `CoreEmbeddingService`, port manager |
| **embedding_service.py** | SentenceTransformer wrapper | `EmbeddingService`, `VectorStore` |
| **session_manager.py** | Per-user context management | `SessionManager`, `SessionData` |
| **chat_engine.py** | Conversational response generation | `ChatEngine` |
| **semantic_cache.py** | Query result caching | `SemanticCache` |

### Utility Modules

| File | Purpose |
|------|---------|
| **utility.py** | Web search, image search, URL cleaning |
| **search.py** | Web scraping utilities |
| **getYoutubeDetails.py** | YouTube metadata & transcription (IPC) |
| **transcribe.py** | Standalone audio transcription client |
| **getImagePrompt.py** | Vision-language model for image queries |
| **getTimeZone.py** | Timezone/location utilities |
| **tools.py** | Tool definitions for LLM |
| **instruction.py** | System/user/synthesis prompts |
| **config.py** | Configuration constants |
| **requestID.py** | Request tracking middleware |
