import json
from utility import fetch_url_content_parallel, webSearch, preprocess_text
from multiprocessing.managers import BaseManager

class modelManager(BaseManager): pass
modelManager.register("ipcService")
manager = modelManager(address=("localhost", 5002), authkey=b"ipcService")
manager.connect()
embedModelService = manager.ipcService()

def mainQueryResponse(reqID: str):
    with open(f"searchSessions/{reqID}/{reqID}_planning.json", "r") as f:
        planning_data = json.load(f)
        planning_data = planning_data["main_query"]
        query = planning_data
        get_url = webSearch(query)
        information = fetch_url_content_parallel(query, get_url)
        reranked_info = rerank(reqID, query, information)
        struct = {
            "query": query,
            "urls": get_url,
            "information": reranked_info,
            "id" : 0,
            "priority": "high"
        }
        fileName = f"searchSessions/{reqID}/results/{reqID}_mainquery.json"
        with open(fileName, "w") as f_out:
            json.dump(struct, f_out, indent=4)
        deepsearchFlow(reqID)

def deepsearchFlow(reqID: str):
    with open(f"searchSessions/{reqID}/{reqID}_planning.json", "r") as f:
        planning_data = json.load(f)
        for planning_data in planning_data["subqueries"]:
            query = planning_data["q"]
            get_url = webSearch(query)
            information = fetch_url_content_parallel(query, get_url)
            reranked_info = rerank(reqID, query, information)
            struct = {
                "query": query,
                "urls": get_url,
                "information": reranked_info,
                "id" : planning_data["id"],
                "priority": planning_data["priority"]
        }
        fileName = f"searchSessions/{reqID}/results/{reqID}_deepsearch_{planning_data['id']}.json"
        with open(fileName, "w") as f_out:
            json.dump(struct, f_out, indent=4)
        


def rerank(reqID, query, information):
    # with open(f"searchSessions/{reqID}/results/{reqID}_deepsearch_1.json", "r") as f:
    #     data = json.load(f)
    #     information = data["information"]
    sentences = information if isinstance(information, list) else preprocess_text(str(information))
    data_embed, query_embed = embedModelService.encodeSemantic(sentences, [query])
    scores = embedModelService.cosineScore(query_embed, data_embed, k=10)  
    information_piece = ""
    seen_sentences = set()  
    for idx, score in scores:
        if score > 0.6:  
            sentence = sentences[idx].strip()
            if sentence not in seen_sentences and len(sentence) > 20: 
                information_piece += sentence + " "
                seen_sentences.add(sentence)
    return information_piece.strip()

if __name__ == "__main__":
    mainQueryResponse("test123")