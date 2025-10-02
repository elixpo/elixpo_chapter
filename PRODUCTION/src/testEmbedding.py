from multiprocessing.managers import BaseManager
from utility import fetch_url_content_parallel
import re

class modelManager(BaseManager): pass
modelManager.register("ipcService")

manager = modelManager(address=("localhost", 5002), authkey=b"ipcService")
manager.connect()
service = manager.Service()

# Example usage
urls = [
    "https://en.wikipedia.org/wiki/Eiffel_Tower",
    "https://www.britannica.com/topic/Eiffel-Tower-Paris-France"
]
docs = fetch_url_content_parallel(urls, max_workers=2)

# Better text preprocessing
def preprocess_text(text):
    # Remove URLs, special characters, and clean up
    text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
    text = re.sub(r'[^\w\s.,!?;:]', ' ', text)
    
    # Split into sentences more intelligently
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
    # Filter out short or meaningless sentences
    meaningful_sentences = []
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) > 20 and len(sentence.split()) > 3:
            # Remove sentences that are mostly navigation/UI elements
            if not any(word in sentence.lower() for word in ['feedback', 'menu', 'navigation', 'click', 'download']):
                meaningful_sentences.append(sentence)
    
    return meaningful_sentences[:15]  # Take more meaningful sentences

sentences = preprocess_text(docs)
print(f"Processing {len(sentences)} sentences...")

query = "Where is the Eiffel Tower located?"
data_embed, query_embed = service.encodeSemantic(sentences, query)
scores = service.cosineScore(query_embed, data_embed, k=5)

print(f"\nQuery: {query}\n")
print("Top matches:")
for idx, score in scores:
    if score > 0.8:  
        print(f"Score: {score:.4f}")
        print(f"Text: {sentences[idx][:200]}...")
        print("-" * 50)