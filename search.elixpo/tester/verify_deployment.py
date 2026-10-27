from pathlib import Path

import requests
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
API_KEY = dotenv_values(ROOT / ".env.local").get("API_KEY")
if not API_KEY:
    raise RuntimeError("API_KEY is required in .env.local")

response = requests.post(
    "https://search.elixpo.com/v1/chat/completions",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": "lixsearch",
        "messages": [{"role": "user", "content": "What are the latest developments in AI?"}],
        "stream": False,
    },
    timeout=300,
)
response.raise_for_status()
print(response.json()["choices"][0]["message"]["content"])
