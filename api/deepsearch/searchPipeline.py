import json
from utility import fetch_url_content_parallel, webSearch
def deepsearchFlow(reqID: str):
    with open(f"searchSessions/{reqID}/{reqID}_planning.json", "r") as f:
        planning_data = json.load(f)
        planning_data = planning_data["subqueries"][0]
        query = planning_data["q"]
        get_url = webSearch(query)
        information = fetch_url_content_parallel(query, get_url)
        struct = {
            "query": query,
            "urls": get_url,
            "information": information,
            "id" : planning_data["id"],
            "priority": planning_data["priority"]
        }
        with open(f"searchSessions/{reqID}/{reqID}_deepsearch_{planning_data['id']}.json", "w") as f_out:
            json.dump(struct, f_out, indent=4)
        

if __name__ == "__main__":
    deepsearchFlow("test123")