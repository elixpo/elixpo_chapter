from processNewsGeneral import POLLINATIONS_TOKEN, POLLINATIONS_REFERRER, MAX_NEWS_ITEMS, load_progress, save_progress
from getNewsTopics import fetch_trending_topics
import requests
import json
import time
from datetime import timezone, datetime
import hashlib

def generate_news_analysis(news_title):
    url = "https://text.pollinations.ai/openai"
    payload = {
        "model": "elixposearch",
        "messages": [{"role": "user", "content": f"Give me the latest detailed news for the topic: {news_title}"}],
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER,
        "json": True
    }
    print(f"🔬 Getting detailed analysis using elixposearch for '{news_title}'...")
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=180)
        response.raise_for_status()
        response_json = response.json()

        message_content = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")
        if message_content:
            try:
                print("✅ Analysis received from elixposearch.")
                return message_content
            except:
                print("❌ elixposearch API returned non-JSON content inside the 'content' field.")
                return None
        else:
            print("❌ elixposearch API returned empty content.")
            return None
    except Exception as e:
        print(f"❌ An unexpected error occurred during elixposearch analysis for '{news_title}': {e}")
        return None

def generate_news_script(analysis_content):
    url = "https://text.pollinations.ai/openai"
    system_prompt = (
    "You are the lively, engaging, and emotionally intelligent newswriter for the 'Elixpo Daily News'. "
    "Start directly with the topic — no introductions or identity mentions. "
    "Write the news in a crisp, energetic, and approachable tone based *only* on the provided analysis. "
    "Use fast-paced storytelling, clear language, and emotional color where appropriate, maintaining a warm, human, and trustworthy presence. "
    "You may add a gentle chuckle, subtle pauses, or light empathy if appropriate — never robotic or dull. "
    "Avoid markdown, bullet points, or any formatting — just plain text. Write the final script in fluent, flowing prose. "
    "Do not invent facts or add commentary beyond the content provided in the analysis. Stick tightly to the given material, but write with charm and energy. "
    "Keep the script suitable for a short podcast narration of about 1–2 minutes. Use natural transitions and avoid formal tone or filler. "
    "Ensure the script flows well for natural speech."
    "Return the script and the link of the news source in a JSON object with keys 'script' and 'source_link'. "
    "Example: {\"script\": \"Your script here.\", \"source_link\": \"the news link here\"}"
    )

    payload = {
        "model": "evil",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Create a news script based on this analysis: {analysis_content}"},
        ],
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER,
        "json": True,
        "seed": 123
    }
    print("📝 Generating news script from analysis...")
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=60)
        response.raise_for_status()
        response_json = response.json()
        script_content = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")
        if script_content:
             print("✅ News script generated.")
             return script_content
        else:
             print("❌ Script generation API returned empty content.")
             return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Script generation failed: {e}")
        return None
    except Exception as e:
        print(f"❌ An unexpected error occurred during script generation: {e}")
        return None



if __name__ == "__main__":
    # getFullNewsInfo()
    # print("📰 News generation process completed.")
    # analysis = generate_news_analysis("2025 U.S. Open leaderboard: J.J. Spaun sizzles as Brooks Koepka, Jon Rahm chase in difficult start at Oakmont - CBS Sports")
    mdContent = '''
    # 2025 U.S. Open Leaderboard and News Update: J.J. Spaun Leads, Koepka and Rahm Chasing at Oakmont

## Tournament Overview

The 125th U.S. Open teed off at Oakmont Country Club in Pennsylvania on Thursday, June 12, 2025. Oakmont, renowned for its punishing rough and fast greens, is hosting the championship for a record 10th time. The tournament runs through Sunday, June 15, with a field featuring top PGA Tour and LIV Golf players alongside regional qualifiers. The course is set up as a par 70, stretching to 7,372 yards, and is widely considered the toughest test in championship golf this year, with the winning score expected to be near even par due to the USGA's notoriously difficult setup. The rough, according to defending champion Bryson DeChambeau, is "cooked beyond belief" and a major factor in this week’s challenge [USA Today](https://www.usatoday.com/story/sports/golf/2025/06/09/us-open-2025-time-tv-odds-live-stream/84070189007/), [Today's Golfer](https://www.todays-golfer.com/news-and-events/majors/us-open/2025-preview/).

## Round 1 Highlights and Leaderboard

### J.J. Spaun Sets the Early Pace

- **Leader**: J.J. Spaun surged to a 4-under-par 66, finishing Day 1 as the solo leader and the only player to go significantly below par on the demanding Oakmont layout. Spaun’s round stood out as many big names struggled to handle the course’s difficulties.
- **Chasers**: Brooks Koepka, representing LIV Golf, emerged as the top scorer from that circuit, outperforming his teammates Bryson DeChambeau and Jon Rahm and placing himself well within striking distance after Round 1 [Sports Illustrated](https://www.si.com/golf/us-open).
- **Challenging Conditions**: The Day 1 scoring average was over four shots above par, highlighting just how tough Oakmont is playing. Even brief periods when the course seemed "gettable" saw few players able to take advantage.
- **Notable Performances**:
    - **Brooks Koepka**: Best round among LIV contingent, quietly positioning himself among the contenders.
    - **Jon Rahm**: Remains in the hunt, but not in the top echelon after the first round.
    - **Rory McIlroy**: Endured a difficult start, reminding fans of the relentless challenge Oakmont presents.
    - **James Nicholas**: The 28-year-old Korn Ferry Tour member found himself inside the top 10, marking one of the better performances among lesser-known competitors.
- **Historic Shots**: Patrick Reed made only the fourth recorded albatross (2 on a par-5) in U.S. Open history. Shane Lowry also notched a shot never seen before at a U.S. Open at Oakmont, adding to Day 1’s drama [Sports Illustrated](https://www.si.com/golf/us-open).

### Scoring Expectations

- Experts and players alike suggest that even par could be good enough to win this championship, given Thursday’s carnage and the USGA’s reputation for making the weekend even tougher [Today's Golfer](https://www.todays-golfer.com/news-and-events/majors/us-open/2025-preview/).

## Featured Odds (as of June 6)

- **Scottie Scheffler**: +275 (favorite)
- **Bryson DeChambeau**: +800
- **Rory McIlroy**: +800
- **Jon Rahm**: +1200
- **Brooks Koepka**: Considered undervalued after a strong start [USA Today](https://www.usatoday.com/story/sports/golf/2025/06/09/us-open-2025-time-tv-odds-live-stream/84070189007/), [SI](https://www.si.com/golf/us-open).

## TV and Streaming Coverage

All times Eastern (convert to local as needed):

- **Friday, June 13 (Round 2)**
  - 6:30 a.m.–1 p.m.: Peacock
  - 1–7 p.m.: NBC, Fubo
  - 7–8 p.m.: Peacock
- **Saturday, June 14 (Round 3)**
  - 10 a.m.–12 p.m.: USA Network, Fubo
  - 12–8 p.m.: NBC, Fubo
- **Sunday, June 15 (Final Round)**
  - 9 a.m.–12 p.m.: USA Network, Fubo
  - 12–7 p.m.: NBC, Peacock, Fubo

Comprehensive coverage, including featured groups and live streams, is available on Peacock, usopen.com, the USGA app, and Fubo [USA Today](https://www.usatoday.com/story/sports/golf/2025/06/09/us-open-2025-time-tv-odds-live-stream/84070189007/).

---

## Summary

The opening round of the 2025 U.S. Open at Oakmont has lived up to its reputation for difficulty, producing high scores across the board but also moments of brilliance, with J.J. Spaun leading after a sizzling 66. Top stars like Brooks Koepka and Jon Rahm are within touching distance, while previous favorites such as Scottie Scheffler and Rory McIlroy have ground to make up. With Oakmont’s notorious weekend conditions ahead, expect plenty of drama and a leaderboard that may well condense as survival becomes paramount. For up-to-date scores and highlights, tune into the scheduled TV coverage throughout the weekend [SI](https://www.si.com/golf/us-open), [Today's Golfer](https://www.todays-golfer.com/news-and-events/majors/us-open/2025-preview/), [USA Today](https://www.usatoday.com/story/sports/golf/2025/06/09/us-open-2025-time-tv-odds-live-stream/84070189007/).

    '''
    script = generate_news_script(mdContent)
    script = json.loads(script)
    scriptContent = script.get("script", "")
    scripturl = script.get("source_link", "")
    print(scriptContent, scripturl)
