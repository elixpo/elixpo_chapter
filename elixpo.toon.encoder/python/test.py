from encoders import encodeValue
import json
from dotenv import load_dotenv
import os
import requests

load_dotenv()
polliToken = os.getenv("polli_token")
async def sendPayload():
    with open("data/dummy_w_nest.json") as j:
        users = json.load(j)
    url = "https://enter.pollinations.ai/api/generate/v1/chat/completions"
    payload = {
        "messages": [
            {
                "role": "system",
                "content": "You are an expert AI model and you can figure out users data and information from the given data to you",
            },
            {
                "role": "user",
                "content": f"Tell me something about David Brown from the data -- {json.dumps(users)}"
            }
        ],
        "model": "openai",
        "frequency_penalty": 0,
        "logit_bias": None,
        "logprobs": False,
        "top_logprobs": 0,
        "max_tokens": 200,
        "n": 1,
        "presence_penalty": 0,
        "response_format": {
            "type": "text",
        },
        "seed": 42,
        "stop": "",
        "stream": False,
        "stream_options": {
            "include_usage": True,
        },
        "thinking": {
            "type": "disabled",
            "budget_tokens": 1,
        },
        "temperature": 1,
        "top_p": 1,
    }
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {polliToken}",
        }
        response = requests.post(url, json=payload, headers=headers)
        if(not response.ok):
            raise Exception(f"API request failed with status {response.status_code}: {response.text}")
        
        data = await response.json()
        data_resp = data.choices[0].message.content
        print("Full Response:", data)
        print("Response from Pollinations API:", data_resp)
    except Exception as e:
        print("Error during API request:", str(e))

        

