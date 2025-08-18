import requests
from dotenv import load_dotenv
import os

load_dotenv()

url = "https://search.pollinations.ai/search"
text_query = "when was this company founded? what are the latest news of this company"  
image_path = "https://www.mensjournal.com/.image/ar_4:3%2Cc_fill%2Ccs_srgb%2Cfl_progressive%2Cq_auto:good%2Cw_1200/MjE0NTIzNjc1MTk2NTMyNTE2/walmart-pulls-1st-quarter-earnings-estimates-as-tariffs-upend-economic-forecasting.jpg"

payload = {
   
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
    ],
    "stream": False,
    "model": "elixposearch",
    "token": os.getenv("TOKEN"),
}

response = requests.post(url, json=payload)

print("Status Code:", response.status_code)
try:
    print("Response JSON:", response.json())
except:
    print("Response Text:", response.text)
