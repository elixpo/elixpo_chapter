import base64
import requests
import json

# === Configuration ===
url = "http://localhost:5000/search"
text_query = "whats 1+1?"  
image_path = None



# === Construct payload ===
payload = {
    "stream": True,
    "messages": [
        {
            "role": "user",
            "content": [
                { "type": "text", "text": text_query },
                {
                    "type": "image_url",
                    "image_url": { "url": image_path }
                }
            ]
        }
    ]
}

# === Send POST request ===
response = requests.post(url, json=payload)

# === Print response ===
print("Status Code:", response.status_code)
try:
    print("Response JSON:", response.json())
except:
    print("Response Text:", response.text)
