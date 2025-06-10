import requests
from bs4 import BeautifulSoup
import json
import requests
from bs4 import BeautifulSoup

def fetch_trending_topics():
    feeds = [
        "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en&gl=US&ceid=US:en",
        "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en&gl=US&ceid=US:en",
        "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en&gl=US&ceid=US:en",
        "https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en&gl=US&ceid=US:en"
    ]

    positive_keywords = [
        "launch", "innovation", "discovery", "research", "tech", "startup", "breakthrough",
        "win", "record", "victory", "gold", "award", "space", "robotics", "climate solution",
        "medicine", "cure", "development", "success", "clean energy", "milestone", "achievement"
    ]

    exclusion_keywords = [
        "Israel", "Hamas", "Trump", "Biden", "war", "conflict", "politics", "election", "attack",
        "sanction", "ban", "military", "terror", "crisis", "shooting", "protest", "violence"
    ]

    headlines = []

    for feed_url in feeds:
        try:
            response = requests.get(feed_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'xml')
            items = soup.find_all('item')

            for item in items:
                title = item.title.text.strip()

                if (any(pos in title.lower() for pos in positive_keywords) and
                        not any(excl in title.lower() for excl in exclusion_keywords)):
                    headlines.append(title)

                if len(headlines) >= 5:
                    return headlines

        except requests.RequestException as e:
            print(f"Error fetching {feed_url}: {e}")
            continue

    return headlines

def send_topic_to_api(topics):
    api_url = "https://text.pollinations.ai/openai"
    headers = {"Content-Type": "application/json"}
    payload = {
        "model": "evil",
        "messages": [
            {
                "role": "system",
                "content": (
                    "You provide suggestions for engaging discussions. "
                    "Here are trending topics at the moment. You pick the most trending topic, "
                    "which avoids political or controversial bias and leans into curiosity, human interest, or general engagement. "
                    "Return a podcast title with just 5–6 words, exciting and creative."
                )
            },
            {
                "role": "user",
                "content": f"These are the available topics:\n{topics}"
            }
        ],
        "seed": 42,
        "token": "fEWo70t94146ZYgk",
        "referrer": "elixpoart",
        "json": "true"
       
    }
    response = requests.post(api_url, headers=headers, data=json.dumps(payload))
    return response.json()

if __name__ == "__main__":
    topics = fetch_trending_topics()
    print("Trending Topics:", topics)
    if topics:
        result = send_topic_to_api(topics)
        print("Fetched Topics:", topics)
        print("API Response:", result.get('choices', [{}])[0].get('message', {}).get('content', 'No content returned.'))
    else:
        print("Failed to fetch trending topics.")
