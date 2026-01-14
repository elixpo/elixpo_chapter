import numpy as np
from sentence_transformers import SentenceTransformer
from nltk.tokenize import sent_tokenize
from typing import List, Tuple
import nltk
import os 

if not os.path.exists('searchenv/nltk_data'):
    nltk.download("punkt", download_dir='./searchenv/nltk_data')
    nltk.download("punkt_tab", download_dir='./searchenv/nltk_data')


# -----------------------------
# Load embedding model (CPU)
# -----------------------------

model = SentenceTransformer(
    "sentence-transformers/all-MiniLM-L6-v2",
    device="cpu",
    cache_folder = "model_cache"
)


# -----------------------------
# Utility
# -----------------------------

def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return np.dot(a, b)


def normalize(vecs: np.ndarray) -> np.ndarray:
    return vecs / np.linalg.norm(vecs, axis=1, keepdims=True)


# -----------------------------
# Chunk documents
# -----------------------------

def chunk_text(text: str, max_sentences: int = 5) -> List[str]:
    sentences = sent_tokenize(text)
    chunks = []

    for i in range(0, len(sentences), max_sentences):
        chunk = " ".join(sentences[i:i + max_sentences])
        if chunk.strip():
            chunks.append(chunk)

    return chunks


# -----------------------------
# Sentence selection pipeline
# -----------------------------

def select_top_sentences(
    query: str,
    docs: List[str],
    top_k_chunks: int = 5,
    top_k_sentences: int = 8,
) -> List[Tuple[str, float]]:
    """
    Returns top relevant sentences with similarity scores
    """

    # 1. Chunk documents
    chunks = []
    chunk_to_sentences = []

    for doc in docs:
        doc_chunks = chunk_text(doc)
        for ch in doc_chunks:
            chunks.append(ch)
            chunk_to_sentences.append(sent_tokenize(ch))

    if not chunks:
        return []

    # 2. Embed query + chunks
    embeddings = model.encode(
        [query] + chunks,
        batch_size=16,
        show_progress_bar=False
    )

    query_emb = embeddings[0:1]
    chunk_embs = embeddings[1:]

    # 3. Normalize
    query_emb = normalize(query_emb)
    chunk_embs = normalize(chunk_embs)

    # 4. Chunk similarity
    scores = chunk_embs @ query_emb.T
    scores = scores.squeeze()

    # 5. Pick top chunks
    top_chunk_idxs = np.argsort(scores)[-top_k_chunks:][::-1]

    # 6. Sentence-level refinement (cheap)
    candidate_sentences = []

    for idx in top_chunk_idxs:
        chunk_score = scores[idx]
        sentences = chunk_to_sentences[idx]

        for s in sentences:
            # lexical bias + semantic inheritance
            score = chunk_score
            if query.lower() in s.lower():
                score += 0.05
            candidate_sentences.append((s, float(score)))

    # 7. Final ranking
    candidate_sentences.sort(key=lambda x: x[1], reverse=True)

    return candidate_sentences[:top_k_sentences]


docs = [
    """
    Semantic caching stores query embeddings to avoid repeated computation.
    It is widely used in retrieval-augmented generation systems.
    This technique significantly reduces latency.
    """,
    """
    Embedding models convert text into dense vectors.
    MiniLM models are efficient and suitable for edge devices.
    They are commonly used for semantic search.
    """
]

query = "How does semantic caching reduce latency?"

results = select_top_sentences(query, docs)

for sent, score in results:
    print(f"{score:.3f} | {sent}")

