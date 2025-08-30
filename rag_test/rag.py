import asyncio
import aiohttp
import requests
from duckduckgo_search import DDGS
from bs4 import BeautifulSoup
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
from typing import List, Dict, Tuple
import time
from concurrent.futures import ThreadPoolExecutor
import threading
import torch

# Import the Yahoo search functionality
from search import web_search

# -------------------------------
# 1. Concurrent Content Fetching
# -------------------------------
async def fetch_content_async(session: aiohttp.ClientSession, url: str) -> Tuple[str, str]:
    try:
        timeout = aiohttp.ClientTimeout(total=10)
        async with session.get(url, timeout=timeout) as response:
            if response.status == 200:
                html = await response.text()
                soup = BeautifulSoup(html, "html.parser")
                # Extract visible text
                text = " ".join([t.get_text(" ", strip=True) for t in soup.find_all(["p", "li", "h1", "h2", "h3", "div"])])
                # Clean and limit text
                text = " ".join(text.split())[:1000]  # Limit to ~1000 chars
                print(f"[INFO] Successfully fetched content from {url} ({len(text)} chars)")
                return url, text
            else:
                print(f"[WARN] HTTP {response.status} for {url}")
                return url, ""
    except Exception as e:
        print(f"[WARN] Could not fetch {url}: {e}")
        return url, ""

async def fetch_all_content(urls: List[str]) -> Dict[str, str]:
    """Fetch content from multiple URLs concurrently"""
    connector = aiohttp.TCPConnector(limit=10, limit_per_host=3)
    timeout = aiohttp.ClientTimeout(total=30)
    
    async with aiohttp.ClientSession(
        connector=connector,
        timeout=timeout,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    ) as session:
        tasks = [fetch_content_async(session, url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        content_dict = {}
        for result in results:
            if isinstance(result, tuple):
                url, content = result
                if content.strip():  # Only include non-empty content
                    content_dict[url] = content
            else:
                print(f"[ERROR] Exception in fetch task: {result}")
        
        return content_dict

# -------------------------------
# 2. Concurrent Embedding Generation
# -------------------------------
def generate_embeddings_concurrent(texts: List[str], model: SentenceTransformer, batch_size: int = 32) -> np.ndarray:
    """Generate embeddings for texts concurrently using batching"""
    print(f"[INFO] Generating embeddings for {len(texts)} documents...")
    
    # Use model's encode method which is already optimized for batching
    embeddings = model.encode(
        texts, 
        convert_to_numpy=True,
        batch_size=batch_size,
        show_progress_bar=True
    )
    
    print(f"[INFO] Generated embeddings: {embeddings.shape}")
    return embeddings

# -------------------------------
# 3. Enhanced Vector Search
# -------------------------------
def build_enhanced_vector_index(docs: List[str], urls: List[str], model: SentenceTransformer) -> Tuple[faiss.Index, np.ndarray, List[Dict]]:
    """Build FAISS index with metadata"""
    embeddings = generate_embeddings_concurrent(docs, model)
    
    # Create index
    dim = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)
    
    # Create metadata for each document
    metadata = []
    for i, (url, doc) in enumerate(zip(urls, docs)):
        metadata.append({
            'id': i,
            'url': url,
            'content': doc[:500] + "..." if len(doc) > 500 else doc,  # Preview
            'full_content': doc,
            'length': len(doc)
        })
    
    return index, embeddings, metadata

def search_enhanced_index(query: str, model: SentenceTransformer, index: faiss.Index, 
                         metadata: List[Dict], top_k: int = 3) -> List[Dict]:
    """Search index and return results with metadata"""
    q_emb = model.encode([query], convert_to_numpy=True)
    distances, indices = index.search(q_emb, top_k)
    
    results = []
    for i, (distance, idx) in enumerate(zip(distances[0], indices[0])):
        if idx < len(metadata):  # Valid index
            result = metadata[idx].copy()
            result['relevance_score'] = float(distance)
            result['rank'] = i + 1
            results.append(result)
    
    return results

# -------------------------------
# 4. Enhanced Summarization
# -------------------------------
async def summarize_with_api_async(context: str, query: str, max_retries: int = 3) -> Dict:
    print("Summarizing with ai")
    endpoint = "https://text.pollinations.ai/openai"
    headers = {"Content-Type": "application/json"}
    
    messages = [
        {
            "role": "system", 
            "content": "You are a helpful assistant that provides comprehensive summaries based on search results. Focus on accuracy and include key details."
        },
        {
            "role": "user", 
            "content": f"Query: {query}\n\nBased on the following search results, provide a comprehensive summary:\n\n{context}\n\nPlease provide a detailed summary that addresses the query."
        }
    ]
    
    payload = {
        "model": "mistral",
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 1000,
        "token": "O6avo5r25XbBPnQ3"
    }
    
    for attempt in range(max_retries):
        try:
            timeout = aiohttp.ClientTimeout(total=60)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(endpoint, headers=headers, json=payload) as response:
                    if response.status == 200:
                        result = await response.json()
                        print("[INFO] Successfully generated summary")
                        return result
                    else:
                        print(f"[WARN] API returned status {response.status}")
                        
        except Exception as e:
            print(f"[ERROR] Attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
    
    return {"error": "Failed to generate summary after all retries"}

# -------------------------------
# 5. Main Enhanced Pipeline
# -------------------------------
async def enhanced_rag_pipeline(query: str, max_links: int = 5, top_k: int = 3) -> Dict:
    """Complete RAG pipeline with concurrent processing"""
    print(f"\n{'='*60}")
    print(f"🔍 Starting Enhanced RAG Pipeline for: '{query}'")
    print('='*60)
    
    start_time = time.time()
    
    # Step 1: Search for URLs
    print("\n📱 Step 1: Searching for relevant URLs...")
    search_start = time.time()
    urls = await web_search(query)
    search_time = time.time() - search_start
    
    if not urls:
        print("❌ No URLs found!")
        return {"error": "No search results found", "query": query}
    
    print(f"✅ Found {len(urls)} URLs in {search_time:.2f}s")
    for i, url in enumerate(urls, 1):
        print(f"  {i}. {url}")
    
    # Step 2: Fetch content concurrently
    print("\n📄 Step 2: Fetching content concurrently...")
    fetch_start = time.time()
    content_dict = await fetch_all_content(urls)
    fetch_time = time.time() - fetch_start
    
    if not content_dict:
        print("❌ No content fetched!")
        return {"error": "No content could be fetched", "query": query, "urls": urls}
    
    print(f"✅ Fetched content from {len(content_dict)} URLs in {fetch_time:.2f}s")
    
    # Prepare data for embedding
    valid_urls = list(content_dict.keys())
    documents = list(content_dict.values())
    
    # Step 3: Generate embeddings and build index
    print("\n🧠 Step 3: Generating embeddings and building vector index...")
    embedding_start = time.time()
    
    # Load model
    model = SentenceTransformer("all-MiniLM-L6-v2")
    if hasattr(model, 'to'):
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = model.to(device)
        print(f"[INFO] Model loaded on {device.upper()}")

    
    # Build enhanced index with concurrent processing
    index, embeddings, metadata = build_enhanced_vector_index(documents, valid_urls, model)
    embedding_time = time.time() - embedding_start
    
    print(f"✅ Built vector index in {embedding_time:.2f}s")
    
    # Step 4: Search for most relevant documents
    print(f"\n🎯 Step 4: Finding top {top_k} most relevant documents...")
    search_results = search_enhanced_index(query, model, index, metadata, top_k=top_k)
    
    print("📊 Search Results:")
    for result in search_results:
        print(f"  Rank {result['rank']}: {result['url']}")
        print(f"    Relevance Score: {result['relevance_score']:.4f}")
        print(f"    Content Length: {result['length']} chars")
        print(f"    Preview: {result['content']}")
        print()
    
    # Step 5: Prepare context and generate summary
    print("📝 Step 5: Generating comprehensive summary...")
    context_parts = []
    for result in search_results:
        context_parts.append(f"Source: {result['url']}\nContent: {result['full_content']}\n")
    
    context = "\n" + "="*50 + "\n".join(context_parts)
    
    summary_start = time.time()
    summary_result = await summarize_with_api_async(context, query)
    summary_time = time.time() - summary_start
    
    total_time = time.time() - start_time
    
    # Compile final results
    results = {
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
        "sources": valid_urls
    }
    
    print(f"\n✅ Pipeline completed in {total_time:.2f}s")
    return results

# -------------------------------
# 6. Display Results
# -------------------------------
def display_results(results: Dict):
    """Display the final results in a formatted way"""
    print(f"\n{'🎉 FINAL RESULTS 🎉':=^80}")
    print(f"Query: {results['query']}")
    print(f"Total Time: {results['total_time']}s")
    print(f"\nTiming Breakdown:")
    for step, time_taken in results['timing'].items():
        print(f"  {step.capitalize()}: {time_taken}s")
    
    print(f"\nSources ({len(results['sources'])}):")
    for i, url in enumerate(results['sources'], 1):
        print(f"  {i}. {url}")
    
    print(f"\n{'📄 SUMMARY':=^80}")
    if 'choices' in results['summary'] and results['summary']['choices']:
        content = results['summary']['choices'][0]['message']['content']
        print(content)
    elif 'error' in results['summary']:
        print(f"❌ Summary Error: {results['summary']['error']}")
    else:
        print(f"Raw summary result: {results['summary']}")
    
    print("="*80)

# -------------------------------
# 7. Main Execution
# -------------------------------
if __name__ == "__main__":
    async def main():
        queries = [
            "latest research on quantum computing 2025"
        ]
        
        for query in queries:
            try:
                results = await enhanced_rag_pipeline(query, max_links=5, top_k=3)
                display_results(results)
                
                # Add delay between queries
                if query != queries[-1]:
                    print("\n⏳ Waiting 3 seconds before next query...\n")
                    await asyncio.sleep(3)
                    
            except Exception as e:
                print(f"❌ Error processing query '{query}': {e}")
                import traceback
                traceback.print_exc()

    # Run the enhanced pipeline
    asyncio.run(main())