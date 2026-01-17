import time
import numpy as np
from sentence_transformers import SentenceTransformer
from nltk.tokenize import sent_tokenize
from typing import List, Tuple
import nltk
import os
import requests
import random
from dotenv import load_dotenv
from web_scraper import fetch_full_text
import asyncio
from urllib.parse import quote
from playwright.async_api import async_playwright  # type: ignore

load_dotenv()

NLTK_DIR = "searchenv/nltk_data"
os.makedirs(NLTK_DIR, exist_ok=True)
nltk.data.path.append(NLTK_DIR)

if not os.path.exists(os.path.join(NLTK_DIR, "tokenizers/punkt")):
    nltk.download("punkt", download_dir=NLTK_DIR)
    nltk.download("punkt_tab", download_dir=NLTK_DIR)


t0 = time.perf_counter()

model = SentenceTransformer(
    "sentence-transformers/all-MiniLM-L6-v2",
    device="cuda",
    cache_folder="model_cache"
)

_ = model.encode("warmup", show_progress_bar=False)

t1 = time.perf_counter()
MODEL_LOAD_TIME = t1 - t0


def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return np.dot(a, b)


def normalize(vecs: np.ndarray) -> np.ndarray:
    return vecs / np.linalg.norm(vecs, axis=1, keepdims=True)


def chunk_text(text: str, max_sentences: int = 5) -> List[str]:
    sentences = sent_tokenize(text)
    chunks = []

    for i in range(0, len(sentences), max_sentences):
        chunk = " ".join(sentences[i:i + max_sentences])
        if chunk.strip():
            chunks.append(chunk)

    return chunks



def generate_intermediate_response(query: str, embed_result: str, max_tokens: int = 500) -> str:
    system_prompt = f"""You are an expert search response formatter. Your task is to take a user query and raw search results, and frame them into a natural, smooth, and engaging response that reads like a well-crafted search summary.
    
Guidelines:
- Format the response to flow naturally from the query
- Highlight the most relevant information
- Make it conversational yet informative
- Use clear structure and formatting when appropriate
- Ensure the response sounds human and polished
- If there are multiple pieces of information, organize them logically
- Avoid overwhelming the user with raw data but pack as much semantic information as you can.
- Keep the response concise but comprehensive
- Fit the response within the {max_tokens} token limit but in detail."""
    
    payload = {
        "model": "gemini-fast",
        "messages": [
            {
                "role": "system",
                "content": system_prompt.replace("\n", " ").strip()
            },
            {
                "role": "user",
                "content": f"Query: {query}\n\nRaw Search Result:\n{embed_result}"
            }
        ],
        "temperature": 0.7,
        "stream": False,
        "private": True,
        "max_tokens": max_tokens,
        "seed": random.randint(1000, 1000000)
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.getenv('TOKEN')}"
    }
    
    try:
        response = requests.post(
            "https://gen.pollinations.ai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            raise RuntimeError(f"Request failed: {response.status_code}, {response.text}")
        
        data = response.json()
        try:
            reply = data["choices"][0]["message"]["content"]
        except Exception as e:
            raise RuntimeError(f"Unexpected response format: {data}") from e
        
        return reply.strip()
    
    except requests.exceptions.Timeout:
        print(f"Timeout occurred formatting response for query: {query}")
        return f"Based on your search for '{query}': {embed_result}"
    except Exception as e:
        print(f"Error in generate_intermediate_response: {e}")
        return f"Based on your search for '{query}': {embed_result}"
    




def select_top_sentences(
    query: str,
    docs: List[str],
    top_k_chunks: int = 4,
    top_k_sentences: int = 8,
) -> Tuple[List[Tuple[str, float]], float]:
    """
    Returns top relevant sentences + inference time
    """

    start = time.perf_counter()

    chunks = []
    chunk_to_sentences = []
    for doc in docs:
        doc_chunks = chunk_text(doc)
        for ch in doc_chunks:
            chunks.append(ch)
            chunk_to_sentences.append(sent_tokenize(ch))

    if not chunks:
        return [], 0.0

    embeddings = model.encode(
        [query] + chunks,
        batch_size=16,
        show_progress_bar=False
    )

    query_emb = embeddings[0:1]
    chunk_embs = embeddings[1:]

    query_emb = normalize(query_emb)
    chunk_embs = normalize(chunk_embs)

    scores = (chunk_embs @ query_emb.T).squeeze()

    top_chunk_idxs = np.argsort(scores)[-top_k_chunks:][::-1]

    candidate_sentences = []

    for idx in top_chunk_idxs:
        chunk_score = scores[idx]
        for s in chunk_to_sentences[idx]:
            score = chunk_score
            if query.lower() in s.lower():
                score += 0.06
            candidate_sentences.append((s, float(score)))

    candidate_sentences.sort(key=lambda x: x[1], reverse=True)

    end = time.perf_counter()

    return candidate_sentences[:top_k_sentences], end - start




USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
]

def get_random_user_agent():
    return random.choice(USER_AGENTS)

async def handle_accept_popup(page):
    try:
        accept_button = await page.query_selector("button:has-text('Accept')")
        if not accept_button:
            accept_button = await page.query_selector("button:has-text('Aceptar todo')")
        if not accept_button:
            accept_button = await page.query_selector("button:has-text('Aceptar')")

        if accept_button:
            await accept_button.click()
            print("[INFO] Accepted cookie/privacy popup.")
            await asyncio.sleep(1)
    except Exception as e:
        print(f"[WARN] No accept popup found: {e}")

async def warmup_playwright():
    """Warmup playwright engine - time not counted in actual search"""
    print("[WARMUP] Starting playwright warmup...")
    warmup_start = time.perf_counter()
    try:
        playwright = await async_playwright().start()
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir="/tmp/chrome-warmup-temp",
            headless=True,
            args=[
                "--remote-debugging-port=10000",
                "--disable-blink-features=AutomationControlled",
                "--disable-web-security",
                "--no-first-run",
                "--disable-default-apps",
                "--disable-sync",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
            user_agent=get_random_user_agent(),
            viewport={'width': 1280, 'height': 720},
        )
        
        # Quick page load to warm up
        page = await context.new_page()
        await page.goto("about:blank", timeout=5000)
        await page.close()
        
        await context.close()
        await playwright.stop()
        
        warmup_end = time.perf_counter()
        print(f"[WARMUP] Playwright warmup completed in {warmup_end - warmup_start:.3f} seconds")
        return warmup_end - warmup_start
    except Exception as e:
        print(f"[WARN] Playwright warmup failed: {e}")
        return 0.0

async def playwright_web_search(query: str, max_links: int = 5) -> Tuple[List[str], float]:
    """
    Search using playwright and return URLs + timing
    Time includes playwright startup and search execution
    """
    search_start = time.perf_counter()
    results = []
    
    try:
        playwright = await async_playwright().start()
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir="/tmp/chrome-search-temp",
            headless=True,
            args=[
                "--remote-debugging-port=10001",
                "--disable-blink-features=AutomationControlled",
                "--disable-web-security",
                "--no-first-run",
                "--disable-default-apps",
                "--disable-sync",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
            user_agent=get_random_user_agent(),
            viewport={'width': 1280, 'height': 720},
        )
        
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
            window.chrome = {runtime: {}};
        """)
        
        page = await context.new_page()
        search_url = f"https://search.yahoo.com/search?p={quote(query)}&fr=yfp-t&fr2=p%3Afp%2Cm%3Asb&fp=1"
        print(f"[SEARCH] Navigating to: {search_url}")
        await page.goto(search_url, timeout=50000)
        
        # Handle popup
        await handle_accept_popup(page)
        
        # Simulate human behavior
        await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
        await page.wait_for_timeout(random.randint(1000, 2000))
        
        # Wait for results
        await page.wait_for_selector("div.compTitle > a", timeout=55000)
        
        # Extract links
        link_elements = await page.query_selector_all("div.compTitle > a")
        blacklist = ["yahoo.com/preferences", "yahoo.com/account", "login.yahoo.com", "yahoo.com/gdpr"]
        
        for link in link_elements:
            if len(results) >= max_links:
                break
            href = await link.get_attribute("href")
            if href and href.startswith("http") and not any(b in href for b in blacklist):
                results.append(href)
        
        print(f"[SEARCH] Found {len(results)} URLs")
        
        await page.close()
        await context.close()
        await playwright.stop()
        
    except Exception as e:
        print(f"[ERROR] Playwright search failed: {e}")
    
    search_end = time.perf_counter()
    search_time = search_end - search_start
    
    return results, search_time

async def run_complete_pipeline(query: str):
    """Run complete search pipeline with separate timing metrics"""
    
    print(f"\n{'='*70}")
    print(f"COMPLETE SEARCH PIPELINE FOR: '{query}'")
    print(f"{'='*70}\n")
    
    # SETUP PHASE (not counted in final metrics)
    setup_start = time.perf_counter()
    print("[SETUP] Warming up playwright engine...")
    playwright_warmup_time = await warmup_playwright()
    setup_end = time.perf_counter()
    print(f"[SETUP] Total setup time: {setup_end - setup_start:.3f} seconds\n")
    
    # ACTUAL PIPELINE METRICS
    print("[PIPELINE] Starting actual search and processing pipeline...\n")
    
    # 1. SEARCH PHASE
    print("━" * 70)
    print("PHASE 1: PLAYWRIGHT SEARCH")
    print("━" * 70)
    urls, search_time = await playwright_web_search(query, max_links=3)
    print(f"✓ Found {len(urls)} URLs in {search_time:.3f} seconds\n")
    
    if not urls:
        print("[ERROR] No URLs found")
        return
    
    # 2. FETCH CONTENT PHASE
    print("━" * 70)
    print("PHASE 2: FETCH & SCRAPE CONTENT")
    print("━" * 70)
    fetch_start = time.perf_counter()
    docs = []
    for url in urls:
        try:
            print(f"  Fetching: {url[:60]}...")
            text = fetch_full_text(url)
            if text:
                docs.append(text)
                print(f"    ✓ Fetched {len(text)} characters")
        except Exception as e:
            print(f"    ✗ Failed: {e}")
    fetch_end = time.perf_counter()
    fetch_time = fetch_end - fetch_start
    print(f"✓ Fetched {len(docs)} documents in {fetch_time:.3f} seconds\n")
    
    if not docs:
        print("[ERROR] No documents fetched")
        return
    
    # 3. SEMANTIC EXTRACTION PHASE
    print("━" * 70)
    print("PHASE 3: SEMANTIC SENTENCE EXTRACTION")
    print("━" * 70)
    results, inference_time = select_top_sentences(query, docs, top_k_chunks=3, top_k_sentences=5)
    print(f"✓ Extracted {len(results)} top sentences in {inference_time:.3f} seconds")
    
    top_text = "\n".join([f"  • {sent[:80]}... (score: {score:.3f})" for sent, score in results[:3]])
    print(f"\nTop sentences:\n{top_text}\n")
    
    # 4. RESPONSE FORMATTING PHASE
    print("━" * 70)
    print("PHASE 4: LLM RESPONSE FORMATTING")
    print("━" * 70)
    response_start = time.perf_counter()
    sent = "\n".join([s for s, _ in results if results])
    final_resp = generate_intermediate_response(query, sent)
    response_end = time.perf_counter()
    response_time = response_end - response_start
    print(f"✓ Generated formatted response in {response_time:.3f} seconds\n")
    
    print(f"Formatted Response:\n{'-' * 70}")
    print(final_resp)
    print(f"{'-' * 70}\n")
    
    # FINAL SUMMARY
    total_pipeline_time = search_time + fetch_time + inference_time + response_time
    
    print("=" * 70)
    print("TIMING SUMMARY (excluding warmup)")
    print("=" * 70)
    print(f"Model Load Time (warmup):        {MODEL_LOAD_TIME:.3f} seconds")
    print(f"Playwright Warmup (excluded):    {playwright_warmup_time:.3f} seconds")
    print(f"\nPipeline Breakdown:")
    print(f"  1. Playwright Search:          {search_time:.3f} seconds")
    print(f"  2. Content Fetching:           {fetch_time:.3f} seconds")
    print(f"  3. Semantic Extraction:        {inference_time:.3f} seconds")
    print(f"  4. LLM Response Format:        {response_time:.3f} seconds")
    print(f"  " + "-" * 66)
    print(f"  TOTAL PIPELINE TIME:           {total_pipeline_time:.3f} seconds")
    print("=" * 70 + "\n")

# Main execution
if __name__ == "__main__":
    query = "latest news between america and venezuela?"
    asyncio.run(run_complete_pipeline(query))