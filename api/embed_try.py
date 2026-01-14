import time
import numpy as np
from sentence_transformers import SentenceTransformer
from nltk.tokenize import sent_tokenize
from typing import List, Tuple
import nltk
import os
from web_scraper import fetch_full_text

NLTK_DIR = "searchenv/nltk_data"
os.makedirs(NLTK_DIR, exist_ok=True)
nltk.data.path.append(NLTK_DIR)

if not os.path.exists(os.path.join(NLTK_DIR, "tokenizers/punkt")):
    nltk.download("punkt", download_dir=NLTK_DIR)
    nltk.download("punkt_tab", download_dir=NLTK_DIR)


t0 = time.perf_counter()

model = SentenceTransformer(
    "sentence-transformers/all-MiniLM-L6-v2",
    device="cpu",
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


def select_top_sentences(
    query: str,
    docs: List[str],
    top_k_chunks: int = 4,
    top_k_sentences: int = 10,
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




query = "What happened at the SIR hearing?"
t2 = time.perf_counter()
docs = fetch_full_text("https://www.financialexpress.com/india-news/six-others-have-claimed-as-father-ec-summons-bengal-voters-for-sir-hearing-over-logical-discrepancy/4106668/")
print(docs)
t3 = time.perf_counter()
print(f"Web scrape time  : {t3 - t2:.3f} seconds")
results, inference_time = select_top_sentences(query, docs)

print(f"\nModel load time   : {MODEL_LOAD_TIME:.3f} seconds")
print(f"Inference time    : {inference_time:.3f} seconds\n")

for sent, score in results:
    if score > 0.3:
        print(sent)
