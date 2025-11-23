import json
from utility import fetch_url_content_parallel, webSearch, preprocess_text
from multiprocessing.managers import BaseManager
import os 
import time

class modelManager(BaseManager): pass
modelManager.register("ipcService")
manager = modelManager(address=("localhost", 5010), authkey=b"ipcService")
manager.connect()
embedModelService = manager.ipcService()

def subQueryPlan(block, reqID):
    start_time = time.time()
    query = block["q"]
    get_url = webSearch(query)
    information = fetch_url_content_parallel(query, get_url)
    reranked_info = rerank(query, information)
    end_time = time.time()
    struct = {
        "query": query,
        "urls": get_url,
        "information": reranked_info,
        "id": block["id"],
        "priority": block["priority"],
        "time_taken": f"{end_time - start_time:.2f}s",
        "reqID": reqID

    }

    print(f"Subquery processed: {query}")
    print(f"Reranked Information: {json.dumps(struct, indent=2)}")  
        
            
        
def rerank(query, information):
    sentences = information if isinstance(information, list) else preprocess_text(str(information))
    data_embed, query_embed = embedModelService.encodeSemantic(sentences, [query])
    scores = embedModelService.cosineScore(query_embed, data_embed, k=5)  
    information_piece = ""
    seen_sentences = set()  
    for idx, score in scores:
        if score > 0.8:  
            sentence = sentences[idx].strip()
            if sentence not in seen_sentences and len(sentence) > 20: 
                information_piece += sentence + " "
                seen_sentences.add(sentence)
    return information_piece.strip()

if __name__ == "__main__":
    subQueryPlan({"q": "capital of france", "id": "test123", "priority": "high"}, "test123")