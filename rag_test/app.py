from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Query
from pydantic import BaseModel
from typing import Dict, Optional
import asyncio
import uvicorn
import time
from sentence_transformers import SentenceTransformer
import threading
from search import YahooSearchAgentText, port_manager

from rag import (
    fetch_all_content, 
    build_enhanced_vector_index, 
    search_enhanced_index, 
    summarize_with_api_async
)

# Request/Response Models
class SearchRequest(BaseModel):
    query: str
    max_links: Optional[int] = 5
    top_k: Optional[int] = 3

class SearchResponse(BaseModel):
    query: str
    total_time: float
    timing: Dict[str, float]
    urls_found: int
    content_fetched: int
    search_results: list
    summary: dict
    sources: list
    engine_stats: dict

# -------------------------------
# Persistent Search Engine Pool
# -------------------------------
class PersistentSearchEngine:
    def __init__(self, max_searches: int = 50):
        self.agent: Optional[YahooSearchAgentText] = None
        self.search_count = 0
        self.max_searches = max_searches
        self.port = None
        self.lock = asyncio.Lock()
        self.created_at = None
        self.last_used = None
    
    async def get_agent(self) -> YahooSearchAgentText:
        """Get the current agent or create a new one if needed"""
        async with self.lock:
            # Check if we need a new agent
            if (self.agent is None or 
                self.search_count >= self.max_searches):
                await self._create_new_agent()
            
            self.last_used = time.time()
            return self.agent
    
    async def _create_new_agent(self):
        """Create a new search agent and close the old one"""
        # Close existing agent if any
        if self.agent:
            try:
                await self.agent.close()
                print(f"[ENGINE] Closed old agent on port {self.port} after {self.search_count} searches")
            except Exception as e:
                print(f"[ENGINE] Error closing old agent: {e}")
        
        # Create new agent
        self.agent = YahooSearchAgentText()  # Let it auto-allocate port
        await self.agent.start()
        self.port = self.agent.custom_port
        self.search_count = 0
        self.created_at = time.time()
        self.last_used = time.time()
        
        print(f"[ENGINE] Created new agent on port {self.port}")
    
    async def search(self, query: str, max_links: int = 5):
        """Perform search and increment counter"""
        agent = await self.get_agent()
        async with self.lock:
            self.search_count += 1
            search_num = self.search_count
        
        print(f"[ENGINE] Search #{search_num}/{self.max_searches} on port {self.port}")
        results = await agent.search(query, max_links)
        return results
    
    def get_stats(self) -> dict:
        """Get current engine statistics"""
        return {
            "port": self.port,
            "search_count": self.search_count,
            "max_searches": self.max_searches,
            "searches_remaining": self.max_searches - self.search_count,
            "created_at": self.created_at,
            "last_used": self.last_used,
            "uptime": time.time() - self.created_at if self.created_at else 0
        }
    
    async def close(self):
        """Clean shutdown of the engine"""
        async with self.lock:
            if self.agent:
                try:
                    await self.agent.close()
                    print(f"[ENGINE] Engine on port {self.port} closed cleanly")
                except Exception as e:
                    print(f"[ENGINE] Error during clean shutdown: {e}")
                finally:
                    self.agent = None

# -------------------------------
# Global Engine Pool Manager
# -------------------------------
class EnginePoolManager:
    def __init__(self):
        self.engines = {}  # Thread-safe dict for multiple engines if needed
        self.primary_engine = PersistentSearchEngine(max_searches=50)
        self.model = None
        self.model_lock = threading.Lock()
    
    async def get_primary_engine(self) -> PersistentSearchEngine:
        """Get the primary search engine"""
        return self.primary_engine
    
    def get_model(self) -> SentenceTransformer:
        """Get or load the sentence transformer model"""
        if self.model is None:
            with self.model_lock:
                if self.model is None:  # Double-check locking
                    print("[MODEL] Loading SentenceTransformer model...")
                    self.model = SentenceTransformer("all-MiniLM-L6-v2")
                    print("[MODEL] Model loaded successfully")
        return self.model
    
    async def cleanup(self):
        """Clean up all engines"""
        await self.primary_engine.close()
        print("[POOL] Engine pool cleaned up")

# Initialize global pool manager
pool_manager = EnginePoolManager()

# Initialize FastAPI app
app = FastAPI(
    title="Enhanced RAG API",
    description="Fast RAG pipeline with persistent search engines",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------
# API Endpoints
# -------------------------------
@app.get("/search", response_model=SearchResponse)
async def enhanced_search_get(
    query: str = Query(..., description="Search query"),
    max_links: int = Query(5, description="Maximum number of links to fetch"),
    top_k: int = Query(3, description="Number of top results to return")
):
    """Enhanced RAG search with persistent engine (GET version)"""
    start_time = time.time()
    try:
        print(f"\n🔍 Processing query: '{query}'")
        engine = await pool_manager.get_primary_engine()

        search_start = time.time()
        urls = await engine.search(query, max_links)
        search_time = time.time() - search_start

        if not urls:
            raise HTTPException(status_code=404, detail="No search results found")

        print(f"✅ Found {len(urls)} URLs in {search_time:.2f}s")

        fetch_start = time.time()
        content_dict = await fetch_all_content(urls)
        fetch_time = time.time() - fetch_start

        if not content_dict:
            raise HTTPException(status_code=404, detail="No content could be fetched")

        print(f"✅ Fetched content from {len(content_dict)} URLs in {fetch_time:.2f}s")

        embedding_start = time.time()
        valid_urls = list(content_dict.keys())
        documents = list(content_dict.values())

        model = pool_manager.get_model()
        index, embeddings, metadata = build_enhanced_vector_index(documents, valid_urls, model)
        embedding_time = time.time() - embedding_start

        search_results = search_enhanced_index(query, model, index, metadata, top_k=top_k)

        summary_start = time.time()
        context_parts = []
        for result in search_results:
            context_parts.append(f"Source: {result['url']}\nContent: {result['full_content']}\n")

        context = "\n" + "="*50 + "\n".join(context_parts)
        summary_result = await summarize_with_api_async(context, query)
        summary_time = time.time() - summary_start

        total_time = time.time() - start_time

        engine_stats = engine.get_stats()

        response_data = {
            "query": query,
            "total_time": round(total_time, 2),
            "timing": {
                "search": round(search_time, 2),
                "fetch": round(fetch_time, 2),
                "embedding": round(embedding_time, 2),
                "summary": round(summary_time, 2)
            },
            "urls_found": len(urls),
            "content_fetched": len(content_dict),
            "search_results": search_results,
            "summary": summary_result,
            "sources": valid_urls,
            "engine_stats": engine_stats
        }

        print(f"✅ Request completed in {total_time:.2f}s")
        return SearchResponse(**response_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error processing request: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/search", response_model=SearchResponse)
async def enhanced_search(request: SearchRequest):
    """Enhanced RAG search with persistent engine"""
    start_time = time.time()
    
    try:
        # Step 1: Get search engine and perform search
        print(f"\n🔍 Processing query: '{request.query}'")
        engine = await pool_manager.get_primary_engine()
        
        search_start = time.time()
        urls = await engine.search(request.query, request.max_links)
        search_time = time.time() - search_start
        
        if not urls:
            raise HTTPException(status_code=404, detail="No search results found")
        
        print(f"✅ Found {len(urls)} URLs in {search_time:.2f}s")
        
        # Step 2: Fetch content concurrently
        fetch_start = time.time()
        content_dict = await fetch_all_content(urls)
        fetch_time = time.time() - fetch_start
        
        if not content_dict:
            raise HTTPException(status_code=404, detail="No content could be fetched")
        
        print(f"✅ Fetched content from {len(content_dict)} URLs in {fetch_time:.2f}s")
        
        # Step 3: Generate embeddings and build index
        embedding_start = time.time()
        valid_urls = list(content_dict.keys())
        documents = list(content_dict.values())
        
        model = pool_manager.get_model()
        index, embeddings, metadata = build_enhanced_vector_index(documents, valid_urls, model)
        embedding_time = time.time() - embedding_start
        
        # Step 4: Search for most relevant documents
        search_results = search_enhanced_index(request.query, model, index, metadata, top_k=request.top_k)
        
        # Step 5: Generate summary
        summary_start = time.time()
        context_parts = []
        for result in search_results:
            context_parts.append(f"Source: {result['url']}\nContent: {result['full_content']}\n")
        
        context = "\n" + "="*50 + "\n".join(context_parts)
        summary_result = await summarize_with_api_async(context, request.query)
        summary_time = time.time() - summary_start
        
        total_time = time.time() - start_time
        
        # Get engine stats
        engine_stats = engine.get_stats()
        
        # Compile response
        response_data = {
            "query": request.query,
            "total_time": round(total_time, 2),
            "timing": {
                "search": round(search_time, 2),
                "fetch": round(fetch_time, 2),
                "embedding": round(embedding_time, 2),
                "summary": round(summary_time, 2)
            },
            "urls_found": len(urls),
            "content_fetched": len(content_dict),
            "search_results": search_results,
            "summary": summary_result,
            "sources": valid_urls,
            "engine_stats": engine_stats
        }
        
        print(f"✅ Request completed in {total_time:.2f}s")
        return SearchResponse(**response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error processing request: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    engine = await pool_manager.get_primary_engine()
    engine_stats = engine.get_stats()
    
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "engine_stats": engine_stats,
        "port_manager_status": port_manager.get_status()
    }

@app.get("/stats")
async def get_stats():
    """Get detailed statistics about the system"""
    engine = await pool_manager.get_primary_engine()
    engine_stats = engine.get_stats()
    
    return {
        "engine": engine_stats,
        "port_manager": port_manager.get_status(),
        "model_loaded": pool_manager.model is not None,
        "system_time": time.time()
    }

@app.post("/engine/restart")
async def restart_engine():
    """Manually restart the search engine"""
    try:
        engine = await pool_manager.get_primary_engine()
        old_stats = engine.get_stats()
        
        # Force create a new agent
        async with engine.lock:
            engine.search_count = engine.max_searches  # Force renewal
        
        # This will trigger agent recreation on next use
        new_agent = await engine.get_agent()
        new_stats = engine.get_stats()
        
        return {
            "message": "Engine restarted successfully",
            "old_stats": old_stats,
            "new_stats": new_stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to restart engine: {str(e)}")

# -------------------------------
# Startup and Shutdown Events
# -------------------------------
@app.on_event("startup")
async def startup_event():
    """Initialize the search engine on startup"""
    print("🚀 Starting Enhanced RAG API...")
    print("🔧 Preloading sentence transformer model...")
    
    # Preload the model in a thread to avoid blocking startup
    def load_model():
        pool_manager.get_model()
    
    import threading
    model_thread = threading.Thread(target=load_model)
    model_thread.start()
    
    print("✅ API ready for requests!")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown"""
    print("🛑 Shutting down Enhanced RAG API...")
    await pool_manager.cleanup()
    print("✅ Cleanup completed")

# -------------------------------
# Development Server
# -------------------------------
if __name__ == "__main__":
    print("🔥 Starting development server...")
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=5002,
        reload=True,
        log_level="info"
    )