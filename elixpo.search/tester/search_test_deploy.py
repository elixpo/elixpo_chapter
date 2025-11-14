import requests
import json
import urllib.parse
messages = "hi"
url = "https://apisearch.elixpo.com/search"
headers = {"Content-Type": "application/json"}
data = { "messages": [
    {"role": "user", "content": "hi my name is anwesha"}, 
    ],
    "stream" : True,
    "deep" : True,
}

data2 = { messages : messages }

response = requests.post(url, headers=headers, data=json.dumps(data))
value = response.json()
print(value)



