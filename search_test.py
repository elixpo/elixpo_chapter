import requests
import urllib.parse
query = "what's 1+1?"
url = f"https://search.pollinations.ai/search?query={urllib.parse.quote(query)}"

response = requests.get(url)

print(response.text)
