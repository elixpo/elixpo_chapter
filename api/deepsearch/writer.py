from typing import Optional
import json


def write_to_plan(reqID: str, plan_data: Optional[dict] = {}):
        plan_data = {
             {
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
                "id": "test123",
                "priority": "high",
                "time_taken": "5.10s",
                "reqID": "test123"
                }
        } 
        with open(f"searchSessions/{reqID}/{reqID}_planning.json", "r") as f:
            planning_data = json.load(f)
            print(planning_data)

if __name__ == "__main__":
    write_to_plan("test123")