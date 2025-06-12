import os
import requests
import json
import base64
from datetime import datetime, timezone
import firebase_admin
from firebase_admin import credentials, firestore, storage
from bs4 import BeautifulSoup
from collections import defaultdict
import random
import time
from getNewsTopics import fetch_trending_topics, MAX_NEWS_ITEMS


service_account_path = 'elixpoChatServiceKey.json'
storage_bucket_name = "notes-89337.appspot.com"
voices = ["shimmer", "dan"]
BACKUP_FILE = "news_progress_backup.txt"

POLLINATIONS_TOKEN = "fEWo70t94146ZYgk"
POLLINATIONS_REFERRER = "elixpoart"

try:
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred, {"storageBucket": storage_bucket_name})
    db = firestore.client()
    bucket = storage.bucket()
    print("✅ Firebase initialized successfully.")
except Exception as e:
    print(f"❌ Failed to initialize Firebase: {e}")
    exit()

def generate_color_theme():
    return f"#{random.randint(0, 0xFFFFFF):06x}"



def load_progress():
    if os.path.exists(BACKUP_FILE):
        with open(BACKUP_FILE, "r") as f:
            try:
                progress = json.load(f)
                print(f"✅ Loaded progress: {progress}")
                return progress
            except json.JSONDecodeError:
                print(f"❌ Backup file '{BACKUP_FILE}' is corrupted. Starting fresh.")
                return {}
            except Exception as e:
                 print(f"❌ Error loading progress file '{BACKUP_FILE}': {e}. Starting fresh.")
                 return {}
    print("ℹ️ No backup file found. Starting fresh.")
    return {}

def save_progress(progress_dict):
    try:
        with open(BACKUP_FILE, "w") as f:
            json.dump(progress_dict, f, indent=4)
        print(f"✅ Progress saved: {progress_dict}")
    except Exception as e:
        print(f"❌ Error saving progress file '{BACKUP_FILE}': {e}")

def upload_to_storage(data, destination_blob_path, content_type):
    try:
        blob = bucket.blob(destination_blob_path)
        blob.upload_from_string(data, content_type=content_type)
        blob.make_public()
        print(f"✅ Uploaded to Storage: {destination_blob_path}")
        return blob.public_url
    except Exception as e:
        print(f"❌ Failed to upload to Storage '{destination_blob_path}': {e}")
        return None

def generate_overall_banner_image(news_id, news_title):
    prompt = (
        "A vibrant watercolor painting in news banner style, with vibrant colors and appealing look, "
        "cinematic lighting and bright realistic outlook properly explaining a visual scene for the topic: "
        f"{news_title}"
    )
    url = f"https://image.pollinations.ai/prompt/{requests.utils.quote(prompt)} -- aspect ratio of 16:9 landscape mode"
    params = {
        "height": 720,
        "width": 1280,
        "model": "flux",
        "nologo": True,
        "private": True,
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER
    }
    print(f"🖼️ Generating overall banner image for '{news_title}'...")
    try:
        response = requests.get(url, params=params, timeout=60)
        response.raise_for_status()
        img_data = response.content
        path = f"news/{news_id}/newsBanner.jpg"
        return upload_to_storage(img_data, path, "image/jpeg")
    except requests.exceptions.RequestException as e:
        print(f"❌ Overall banner image gen failed: {e}")
        return None
    except Exception as e:
        print(f"❌ An unexpected error occurred during overall banner image generation: {e}")
        return None

def generate_block_image(news_id, news_index, news_title):
    prompt = ("A vibrant watercolor painting in news banner style, with vibrant colors and appealing look, "
              "cinematic lighting and bright realistic outlook properly explaining a visual scene for the topic: "
              f"{news_title}")
    url = f"https://image.pollinations.ai/prompt/{requests.utils.quote(prompt)} -- aspect ratio of 16:9 landscape mode"
    params = {
        "height": 720,
        "width": 1280,
        "model": "flux",
        "nologo": True,
        "private": True,
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER
    }
    print(f"🖼️ Generating block image for topic {news_index}: '{news_title}'...")
    try:
        response = requests.get(url, params=params, timeout=60)
        response.raise_for_status()
        img_data = response.content
        path = f"news/{news_id}/newsID{news_index}/newsBackground.jpg"
        return upload_to_storage(img_data, path, "image/jpeg")
    except requests.exceptions.RequestException as e:
        print(f"❌ Block image gen failed for topic {news_index}: {e}")
        return None
    except Exception as e:
        print(f"❌ An unexpected error occurred during block image generation for topic {news_index}: {e}")
        return None

def generate_news_analysis(news_title):
    url = "https://text.pollinations.ai/openai"
    payload = {
        "model": "elixposearch",
        "messages": [{"role": "user", "content": f"Give me a detailed analysis of this latest news headline {news_title}"}],
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER,
        "json": True
    }
    print(f"🔬 Getting detailed analysis using elixposearch for '{news_title}'...")
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=60)
        response.raise_for_status()
        response_json = response.json()

        message_content = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")
        if message_content:
            try:
                parsed_content = json.loads(message_content)
                analysis_content = parsed_content.get("content", "No detailed analysis provided.")
                sources = parsed_content.get("sources", ["No sources provided."])
                print("✅ Analysis received from elixposearch.")
                return {"content": analysis_content, "sources": sources}
            except json.JSONDecodeError:
                print("❌ elixposearch API returned non-JSON content inside the 'content' field.")
                print(f"Raw content: {message_content[:500]}...")
                return None
        else:
            print("❌ elixposearch API returned empty content.")
            return None

    except requests.exceptions.RequestException as e:
        print(f"❌ elixposearch analysis failed for '{news_title}': {e}")
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
    )

    payload = {
        "model": "evil",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Create a news script based on this analysis: {analysis_content}"},
        ],
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER,
        "json": False,
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

def generate_voiceover(news_script, news_id, news_index, voice):
    url = "https://text.pollinations.ai/openai"
    payload = {
        "model": "openai-audio",
        "modalities": ["text", "audio"],
        "audio": {"voice": voice, "format": "wav"},
        "messages": [
            {
                "role": "developer",
                "content": (
                    "Okay, here’s the vibe — you're an energetic, fast-talking news host who’s naturally funny, curious, and a little playful. "
                    "Start *right away* with the topic — no intros, no greetings, no identity stuff. Just dive in like, ‘Oh wow, get this—’ and go. "
                    "Sound totally human: it’s okay to say things like ‘um’, ‘hmm’, or take a short breath before a big detail. Feel free to *slightly* stutter, casually reword something, or chuckle if the moment’s funny — that’s what makes it real. "
                    "Add light humor where it fits — just subtle, natural stuff. If something sounds ridiculous or cool, say it like you mean it. Imagine you’re on a podcast and your goal is to keep listeners smiling and hooked. "
                    "Speed up naturally — you’re excited to tell this story — but still clear. Use pauses for effect, like after a big stat, or before a surprising twist. Don’t rush, but don’t drag either. "
                    "Smile through your voice. Be curious, expressive, slightly sassy if it works. Bring real charm, like you’re sharing this over coffee with a friend. "
                    "No robotic reading. No filler. No fake facts. Just bring the script to life with humor, breath, warmth, and energy. "
                    "The whole thing should feel like a fun, punchy, real-person monologue that lasts 1 to 1.5 minutes, tops. Leave listeners grinning, curious, or saying ‘whoa’."
                )
            },
            {
                "role": "user",
                "content": news_script
            }
        ],
        "private": True,
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER
    }
    print(f"🎙️ Generating voiceover for topic {news_index}...")
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=60)
        response.raise_for_status()
        response_json = response.json()
        audio_data_base64 = response_json.get('choices', [{}])[0].get('message', {}).get('audio', {}).get('data')
        if audio_data_base64:
            audio_data = base64.b64decode(audio_data_base64)
            path = f"news/{news_id}/newsID{news_index}/news{news_index}.wav"
            return upload_to_storage(audio_data, path, "audio/wav")
        else:
             print("❌ Voiceover API returned no audio data.")
             print(f"Partial response: {response_json}")
             return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Voiceover gen failed for topic {news_index}: {e}")
        return None
    except (KeyError, TypeError, base64.Error) as e:
        print(f"❌ Error processing audio data from API response for topic {news_index}: {e}")
        return None
    except Exception as e:
        print(f"❌ An unexpected error occurred during voiceover generation for topic {news_index}: {e}")
        return None

def save_news_block_to_firestore(news_id, news_index, news_title, script, timestamp, voice_link, image_link, color_theme, news_source_link):
    doc_ref = db.collection("news").document(news_id)

    block_data = {
        "name": news_title,
        "content": script,
        "timestamp": timestamp,
        "voice_link": voice_link,
        "color_theme": color_theme,
        "image_link": image_link,
        "news_source_link": news_source_link
    }

    try:
        snapshot = doc_ref.get()
        if not snapshot.exists:
            print(f"⚠️ Document {news_id} does not exist when trying to save block {news_index}. Creating...")
            data = {}
        else:
             data = snapshot.to_dict()

        data.setdefault("blocks", [])
        while len(data["blocks"]) <= news_index:
            data["blocks"].append({})

        data["blocks"][news_index] = block_data

        data.setdefault("status", {})
        data["status"][str(news_index)] = "done"

        doc_ref.set(data)

        print(f"✅ Firestore updated for block {news_index}: {news_id}")
        return True
    except Exception as e:
        print(f"❌ Failed to save block {news_index} to Firestore: {e}")
        return False

def save_overall_news_info_to_firestore(news_id, date, news_summary, overall_banner_url):
     doc_ref = db.collection("news").document(news_id)
     data = {
         "date": date.strftime("%Y-%m-%d"),
         "news_summary": news_summary,
         "overall_news_thumbnail": overall_banner_url,
         "news_banner": overall_banner_url,
     }
     try:
         doc_ref.set(data, merge=True)
         print(f"✅ Firestore overall info updated for {news_id}")
         return True
     except Exception as e:
         print(f"❌ Failed to save overall info for {news_id} to Firestore: {e}")
         return False

def getFullNewsInfo():
    print("--- Starting News Generation Process ---")

    progress = load_progress()
    current_news_id = progress.get("news_id")
    start_index = int(progress.get("last_index", 0))

    if not current_news_id or start_index >= MAX_NEWS_ITEMS:
        current_news_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        start_index = 0
        print(f"🆕 Starting new news batch with ID: {current_news_id}")
    else:
        print(f"🔁 Resuming news batch ID: {current_news_id} from index: {start_index}")

    topics = fetch_trending_topics()

    if not topics:
        print("❌ No suitable topics found. Exiting.")
        save_progress({})
        return

    topics_to_process = topics[:MAX_NEWS_ITEMS]
    num_topics = len(topics_to_process)
    print(f"📰 Found {num_topics} topics to process (max {MAX_NEWS_ITEMS}).")

    overall_banner_url = None

    if start_index == 0 and num_topics > 0:
        print("Handling overall news document and banner (Index 0 step)...")
        overall_banner_url = generate_overall_banner_image(current_news_id, topics_to_process[0])
        if overall_banner_url:
            save_progress({"news_id": current_news_id, "last_index": 0})
        else:
            print("❌ Failed to generate overall banner. Cannot proceed with this batch.")
            save_progress({})
            return

    elif start_index > 0:
        doc_ref = db.collection("news").document(current_news_id)
        snapshot = doc_ref.get(["overall_news_thumbnail"])
        if snapshot.exists:
            overall_banner_url = snapshot.get("overall_news_thumbnail")
            if not overall_banner_url:
                 print(f"⚠️ Resuming batch {current_news_id}, but overall_news_thumbnail not found in Firestore. This might cause issues.")
        else:
            print(f"⚠️ Resuming batch {current_news_id}, but document not found in Firestore. Starting fresh.")
            current_news_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
            start_index = 0
            overall_banner_url = None
            print("❌ Critical error: Resume ID found, but Firestore document is missing. Resetting progress.")
            save_progress({})
            topics = fetch_trending_topics()
            topics_to_process = topics[:MAX_NEWS_ITEMS]
            num_topics = len(topics_to_process)
            if num_topics > 0:
                 print(f"📰 Starting new batch {current_news_id} with {num_topics} topics after reset.")
                 print("Handling overall news document and banner (Index 0 step) for new batch...")
                 overall_banner_url = generate_overall_banner_image(current_news_id, topics_to_process[0])
                 if overall_banner_url:
                     save_progress({"news_id": current_news_id, "last_index": 0})
                 else:
                     print("❌ Failed to generate overall banner for new batch. Exiting.")
                     save_progress({})
                     return
            else:
                 print("❌ No suitable topics found even after resetting progress. Exiting.")
                 save_progress({})
                 return

    for i in range(start_index, num_topics):
        topic = topics_to_process[i]
        print(f"\n--- Processing Topic {i+1}/{num_topics}: {topic} ---")

        analysis_result = generate_news_analysis(topic)
        if not analysis_result or not analysis_result["content"]:
            print(f"Skipping topic {i} due to failed analysis from elixposearch.")
            save_progress({"news_id": current_news_id, "last_index": i})
            continue

        detailed_info = analysis_result["content"]
        news_source_links = analysis_result["sources"]

        script = generate_news_script(detailed_info)
        if not script:
            print(f"Skipping topic {i} due to failed script generation.")
            save_progress({"news_id": current_news_id, "last_index": i})
            continue

        voice_to_use = voices[i % len(voices)]
        voice_url = generate_voiceover(script, current_news_id, i, voice_to_use)
        if not voice_url:
            print(f"Skipping topic {i} due to failed voiceover generation.")
            save_progress({"news_id": current_news_id, "last_index": i})
            continue

        block_image_url = generate_block_image(current_news_id, i, topic)
        if not block_image_url:
            print(f"Skipping topic {i} due to failed block image generation.")
            save_progress({"news_id": current_news_id, "last_index": i})
            continue

        color_theme = generate_color_theme()

        timestamp = datetime.now(timezone.utc)

        if i == 0 and overall_banner_url:
             print("Saving overall news info for index 0...")
             save_overall_news_info_to_firestore(current_news_id, timestamp, script, overall_banner_url)
        elif i == 0 and not overall_banner_url:
             print("⚠️ Overall banner URL was missing for index 0. Overall news info will not be fully saved.")

        save_success = save_news_block_to_firestore(
            news_id=current_news_id,
            news_index=i,
            news_title=topic,
            script=script,
            timestamp=timestamp,
            voice_link=voice_url,
            image_link=block_image_url,
            color_theme=color_theme,
            news_source_link=", ".join(news_source_links)
        )

        if save_success:
            save_progress({"news_id": current_news_id, "last_index": i + 1})
        else:
            print(f"❌ Failed to save block {i} to Firestore. Progress remains at index {i} for retry.")

        time.sleep(1)

    print("\n--- News Generation Process Finished ---")
    final_progress = load_progress()
    if final_progress.get("news_id") == current_news_id and final_progress.get("last_index", 0) >= num_topics:
         print(f"✅ All {num_topics} topics attempted for batch {current_news_id}. Clearing progress.")
         save_progress({})
    else:
         print(f"ℹ️ Process finished, but not all topics ({final_progress.get('last_index', 0)}/{num_topics}) were successfully processed in this run for batch {current_news_id}. Progress saved for resume.")

if __name__ == "__main__":
    getFullNewsInfo()