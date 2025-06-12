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
from uploadToStorage import upload_to_storage, save_news_block_to_firestore, save_overall_news_info_to_firestore
from bannerImageForNews import generate_overall_banner_image
from thumbnailImageForNews import generate_block_image
from newsVocieOver import generate_voiceover
from getNewsInfo import generate_news_analysis, generate_news_script

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