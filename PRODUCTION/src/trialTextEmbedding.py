from sentence_transformers import SentenceTransformer, util
import torch

# Load MiniLM model
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# Dummy "document sentences"
sentences = [
    "The Eiffel Tower is located in Paris.",
    "Python is a programming language used for AI and data science.",
    "The Great Wall of China is visible from space.",
    "Football is the most popular sport in the world.",
    "SpaceX is developing rockets for interplanetary travel."
]

# Encode them
sentence_embeddings = model.encode(sentences, convert_to_tensor=True)
print(sentence_embeddings)
# Query
query = "Where is the Eiffel Tower?"
query_embedding = model.encode(query, convert_to_tensor=True)

# Step 1: Retrieval (cosine similarity)
cosine_scores = util.cos_sim(query_embedding, sentence_embeddings)[0]

# Get top-k (say k=3)
top_k = torch.topk(cosine_scores, k=3)

print("\nQuery:", query)
print("\nTop relevant sentences (retrieval):")
for score, idx in zip(top_k.values, top_k.indices):
    if(score > 0.7):  # Threshold for relevance
        print(f"{sentences[idx]} (score: {score:.4f})")
    