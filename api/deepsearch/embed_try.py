from sentence_transformers import SentenceTransformer
import numpy as np
import re
from config import transcription   # your text


# -----------------------------
# Multilingual model (works for 50+ languages)
# -----------------------------
model = SentenceTransformer(
    "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
)


# -----------------------------
# Safe embedding wrapper
# -----------------------------
def embed_texts(texts, batch_size=64):
    if isinstance(texts, str):
        texts = [texts]

    emb = model.encode(
        texts,
        convert_to_numpy=True,
        normalize_embeddings=True,
        batch_size=batch_size,
        show_progress_bar=False
    )

    # Ensure np array
    emb = np.asarray(emb)

    # Make sure shape = (N, D)
    if emb.ndim == 1:
        emb = emb.reshape(1, -1)

    return emb


# -----------------------------
# MMR implementation
# -----------------------------
def mmr(doc_embedding, candidate_embeddings, sentences,diversity=0.2):
    top_k = len(sentences) // 2 + 1
    candidate_embeddings = np.asarray(candidate_embeddings)
    doc_embedding = np.asarray(doc_embedding).reshape(-1)

    N = candidate_embeddings.shape[0]
    top_k = min(top_k, N)

    similarity_to_query = candidate_embeddings @ doc_embedding
    similarity_between_candidates = candidate_embeddings @ candidate_embeddings.T

    selected = []
    selected_idx = []

    # 1) Pick most relevant
    idx = int(similarity_to_query.argmax())
    selected_idx.append(idx)
    selected.append(sentences[idx])

    # 2) Iterative picks
    for _ in range(top_k - 1):
        mmr_scores = np.full(N, -np.inf)

        for i in range(N):
            if i in selected_idx:
                continue

            relevance = similarity_to_query[i]
            redundancy = similarity_between_candidates[i, selected_idx].max()

            mmr_scores[i] = (1 - diversity) * relevance - diversity * redundancy

        next_idx = int(mmr_scores.argmax())

        if next_idx in selected_idx or mmr_scores[next_idx] == -np.inf:
            break

        selected_idx.append(next_idx)
        selected.append(sentences[next_idx])

    return selected


# -----------------------------
# Sentence splitting
# -----------------------------
def split_sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]


# -----------------------------
# Extract relevant sentences
# -----------------------------
def extract_relevant(text, query):
    sentences = split_sentences(text)
    top_k = len(sentences) // 2 + 1
    print(f"[info] {len(sentences)} sentences extracted")

    if not sentences:
        return []

    sent_emb = embed_texts(sentences)
    query_emb = embed_texts(query)[0]

    return mmr(
        doc_embedding=query_emb,
        candidate_embeddings=sent_emb,
        sentences=sentences,
        diversity=0.4
    )


# -----------------------------
# Run
# -----------------------------
if __name__ == "__main__":
    selected = extract_relevant(transcription, "summarize me")
    print("\n".join(selected))
