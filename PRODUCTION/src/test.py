import base64
import requests
import json

# === Configuration ===
url = "http://localhost:5000/search"
text_query = "whats the latest news of this airlines from india?"  
image_path = "https://upload.wikimedia.org/wikipedia/commons/4/45/VT-JRF_%40_JFK%2C_2024-11-04.png"  



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
