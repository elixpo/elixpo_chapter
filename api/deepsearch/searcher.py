import json
from utility import fetch_url_content_parallel, webSearch, preprocess_text
from multiprocessing.managers import BaseManager
import os 
import time
from typing import Optional
from responseGenerator import generate_intermediate_response
import asyncio
from utility import rerank


class modelManager(BaseManager): pass
modelManager.register("ipcService")
manager = modelManager(address=("localhost", 5010), authkey=b"ipcService")
manager.connect()
embedModelService = manager.ipcService()

async def subQueryPlan(block, reqID):
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
    response = await generate_intermediate_response(struct["urls"], struct["query"], struct["information"], struct["priority"])
    struct["information"] = response
    print(f"Subquery processed: {query}")
    print(f"Reranked Information: {json.dumps(struct, indent=2)}")  
        
            


if __name__ == "__main__":
    asyncio.run(subQueryPlan({"q": "capital of france", "id": "test123", "priority": "high"}, "test123"))