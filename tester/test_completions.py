import requests
import json
URL = "https://search.elixpo.com/v1/chat/completions"
payload = {
    "messages": [
        {"role": "user", "content": "I'm planning a trip to Japan next month"},
        {"role": "assistant", "content": "That sounds exciting! Japan is a wonderful destination. Are you looking for recommendations on places to visit?"},
        {"role": "user", "content": "I'm mostly interested in traditional temples and shrines in Kyoto"},
        {"role": "assistant", "content": "Kyoto is the heart of traditional Japan with over 2,000 temples and shrines. Some must-visits include Fushimi Inari Taisha with its thousands of vermillion torii gates, Kinkaku-ji (Golden Pavilion), and Arashiyama Bamboo Grove. The best time to explore is early morning to avoid crowds."},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Tell me some latest information about"},
                {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/3/3c/Kiyomizu.jpg"}}
            ]
        }
    ],
    "stream": False
}
print(f"POST {URL}")
print(f"Payload: {json.dumps(payload, indent=2)}\n")
r = requests.post(URL, json=payload, timeout=120)
print(f"Status: {r.status_code}")
print(f"Response:\n{json.dumps(r.json(), indent=2)}")
