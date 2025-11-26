from typing import Optional
import json


def write_to_plan(reqID: str, plan_data: Optional[dict] = None):
    if plan_data is None:
        plan_data = {
            "query": "capital of france",
            "urls": [
                "https://en.wikipedia.org/wiki/Paris",
                "https://www.britannica.com/place/Paris",
                "https://www.mappr.co/capital-cities/france/",
                "https://theworldcountries.com/geo/capital-city/Paris",
                "https://www.newworldencyclopedia.org/entry/Paris,_France",
                "https://www.countryaah.com/france-faqs/",
                "https://alea-quiz.com/en/what-is-the-capital-of-france/"
            ],
            "information": "The capital of France is Paris. geography What is the capital of France? geography  What is the capital of France? Answer The capital of France is Paris.",
            "id": 2,
            "priority": "high",
            "time_taken": "5.10s",
            "reqID": "test123"
        }
    with open(f"searchSessions/{reqID}/{reqID}_planning.json", "r") as f:
        planning_data = json.load(f)
        for item in planning_data["subqueries"]:
            if(item["id"] == plan_data["id"]):
                print(item)
                item["query"] = plan_data["query"]
                item["urls"] = plan_data["urls"]
                item["response"] = plan_data["information"]
                item["time_taken"] = plan_data["time_taken"]
                item["reqID"] = plan_data["reqID"]
                item["videoTitle"] = plan_data.get("videoTitle", "")
                
    with open(f"searchSessions/{reqID}/{reqID}_planning.json", "w") as f:
        json.dump(planning_data, f, indent=4)

if __name__ == "__main__":
    write_to_plan("test123")