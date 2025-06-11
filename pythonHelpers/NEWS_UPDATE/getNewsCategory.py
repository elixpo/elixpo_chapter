import requests
from bs4 import BeautifulSoup
from collections import defaultdict
import random

def fetch_trending_topics():
    categorized_feeds = {
        "tech": [
            "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en&gl=US&ceid=US:en"
        ],
        "science": [
            "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en&gl=US&ceid=US:en"
        ],
        "sports": [
            "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en&gl=US&ceid=US:en"
        ],
        "health": [
            "https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en&gl=US&ceid=US:en"
        ],
        "entertainment": [
            "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en&gl=US&ceid=US:en"
        ],
        "travel": [
            "https://news.google.com/rss/headlines/section/topic/TRAVEL?hl=en&gl=US&ceid=US:en"
        ],
        "business": [
            "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en&gl=US&ceid=US:en"
        ]
    }

    positive_keywords = [
        "launch", "innovation", "discovery", "research", "technology", "startup", "breakthrough",
        "win", "victory", "award", "space", "robotics", "ai", "artificial intelligence",
        "quantum", "renewable", "sustainability", "clean energy", "climate", "solar", "electric",
        "medicine", "cure", "development", "progress", "achievement", "milestone", "solution", "success",
        "education", "exploration", "expedition", "feature", "culture", "film", "music", "festival",
        "performance", "exhibition", "design", "growth", "expansion", "release", "announcement",
        "collaboration", "partnership", "support", "investment", "health", "fitness", "recovery",
        "wildlife", "conservation", "art", "celebration", "record-breaking", "positive"
    ]

    exclusion_keywords = [
        "scandal", "lawsuit", "crime", "accident", "death", "controversy", "fraud", "hack", "attack",
        "layoff", "bankruptcy", "recall", "crisis", "collapse", "loss", "murder", "violence", "war",
        "conflict", "protest", "riot", "abuse", "shooting", "rape", "dead", "tragedy", "terror",
        "arrested", "charged", "explosion", "died", "injured", "casualty", "hostage", "detained",
        "disaster", "emergency", "hate", "racism", "xenophobia", "extremism", "clash", "corruption"
    ]

    headlines = []
    seen_keywords = []

    def extract_keywords(title):
        return set(word for word in title.lower().split() if len(word) > 3)

    for category, feeds in categorized_feeds.items():
        random.shuffle(feeds)  # In case we add more per category later
        for feed_url in feeds:
            try:
                response = requests.get(feed_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
                response.raise_for_status()
                soup = BeautifulSoup(response.content, 'xml')
                items = soup.find_all('item')

                for item in items:
                    raw_title = item.title.text.strip()
                    title = raw_title.lower()

                    if (any(pos in title for pos in positive_keywords) and
                        not any(excl in title for excl in exclusion_keywords)):

                        keywords = extract_keywords(title)

                        # Check similarity with previous headlines
                        if all(len(keywords & prev) < 2 for prev in seen_keywords):
                            seen_keywords.append(keywords)
                            headlines.append(raw_title)
                            break  # Only 1 headline per category to ensure diversity

            except requests.RequestException as e:
                print(f"Error fetching {feed_url}: {e}")
                continue

    return headlines[:5]

if __name__ == "__main__":
    topics = fetch_trending_topics()
    print("Trending Topics:" if topics else "No trending topics found.")
    for topic in topics:
        print(f"- {topic}")
