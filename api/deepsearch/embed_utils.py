import numpy as np
import re

def mmr(doc_embedding, candidate_embeddings, sentences,diversity=0.2, top_k=None):
    if top_k is None:
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

def split_sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
