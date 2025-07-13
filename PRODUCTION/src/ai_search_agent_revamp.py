
import requests
import json
from clean_query import cleanQuery 
from search import google_search, ddgs_search, mojeek_form_search 
from getYoutubeDetails import get_youtube_metadata, get_youtube_transcript
from scrape import fetch_full_text


url = "https://text.pollinations.ai/openai"
headers = {"Content-Type": "application/json"}

tools = [
    {
        "type": "function",
        "function": {
            "name": "cleanQuery",
            "description": "Takes in a query, and returns a json object with the following keys: 'websites', 'youtube', and 'cleaned_query'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The initial raw query mentioned made by the user"},
                },
                "required": ["query"]
            }
        }
    }
]

sample_query = "Check out this website https://example.com and this YouTube video https://youtu.be/dQw4w9WgXcQ for more info."
messages = [{"role": "user", "content": sample_query}]
response = requests.post(
    url,
    headers=headers,
    json={
        "model": "openai",
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto"  
    }

)
response.raise_for_status()
response_data = response.json()
if response_data.get("choices", [{}])[0].get("message", {}).get("tool_calls"):
    tool_call = response_data["choices"][0]["message"]["tool_calls"][0]
    function_name = tool_call["function"]["name"]
    function_args = json.loads(tool_call["function"]["arguments"])
    if function_name == "cleanQuery":
        cleaned_query = cleanQuery(function_args.get("query"))
        print("Cleaned Query Result:", cleaned_query)

        messages.append(response_data["choices"][0]["message"]) 
        messages.append(
                {
                    "tool_call_id": tool_call["id"], 
                    "role": "tool",
                    "name": function_name,
                    "content": cleaned_query, 
                }
            )
        second_payload = {
                 "model": "openai",
                 "messages": messages
            }
        second_response = requests.post(
            url,
            headers=headers,
            json=second_payload
        )
        second_response.raise_for_status()
        cleanedFinalQuery = second_response.json()
        print(json.dumps(cleanedFinalQuery, indent=2))
        print("\nFinal Assistant Message:", cleanedFinalQuery['choices'][0]['message']['content'])



