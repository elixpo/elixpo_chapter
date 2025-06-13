import os
import json
import base64
import hashlib
import time
from datetime import datetime, timezone

from getNewsTopics import fetch_trending_topics
from getNewsInfo import generate_news_analysis, generate_news_script
from newsVocieOver import generate_voiceover
from bannerImageForNews import generate_visual_prompt, generate_overall_banner_image
from thumbnailImageForNews import create_combined_visual_prompt, generate_vector_image, create_combined_news_summary
from processNewsGeneral import MAX_NEWS_ITEMS
from firebase_admin import credentials, firestore, storage
import firebase_admin

# === Firebase Setup ===
service_account_path = 'elixpoChatServiceKey.json'
storage_bucket_name = "notes-89337.appspot.com"
voices = ["shimmer", "dan"]
backup_file = "newsBackup.txt"

try:
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred, {"storageBucket": storage_bucket_name})
    db = firestore.client()
    bucket = storage.bucket()
    print("✅ Firebase initialized.")
except Exception as e:
    print(f"❌ Firebase init error: {e}")
    exit()

def log_backup(entry):
    with open(backup_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

def load_backup():
    if not os.path.exists(backup_file):
        return []
    with open(backup_file, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f.readlines()]

def upload_bytes_to_bucket(data_bytes, storage_path, content_type):
    blob = bucket.blob(storage_path)
    blob.upload_from_string(data_bytes, content_type=content_type)
    blob.make_public()
    return blob.public_url

def main():
    backup_data = load_backup()
    processed_ids = {item['news_id']: item for item in backup_data if 'news_id' in item}

    trending_topics = fetch_trending_topics()
    if not trending_topics:
        print("No trending topics.")
        return

    now_str = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    overall_news_id = hashlib.sha256(now_str.encode()).hexdigest()[:16]
    summary_doc_ref = db.collection("news").document(overall_news_id)

    summary_doc_ref.set({
        "date": datetime.now(timezone.utc).isoformat(),
        "summary": "",
        "thumbnail_url": "",
        "status": "started",
        "items": []
    })

    print("🔁 Resuming from backup if any...")

    for index, topic in enumerate(trending_topics[:MAX_NEWS_ITEMS]):
        noise = f"{topic}-{index}-{now_str}"
        news_id = hashlib.sha256(noise.encode()).hexdigest()[:16]
        news_item = {
            "news_id": news_id,
            "topic": topic,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "started"
        }

        prev = processed_ids.get(news_id)
        if prev and prev.get("status") == "image_uploaded":
            print(f"✅ Already processed topic {index+1}: {topic}")
            continue
        print(f"⚙️ Processing topic {index+1}/{MAX_NEWS_ITEMS}: {topic}")

        try:
            # --- Step 1: Script Generation ---
            if not prev or prev.get("status") == "started":
                info = generate_news_analysis(topic)
                script_response = generate_news_script(info)
                script_data = json.loads(script_response)
                newsScript = script_data.get("script", "")
                newsURL = script_data.get("source_link", "")
                news_item.update({"script": newsScript, "source_link": newsURL, "status": "script_generated"})
                log_backup(news_item)
                summary_doc_ref.update({"items": firestore.ArrayUnion([news_item])})
                time.sleep(1)

            # --- Step 2: Audio Generation ---
            if not prev or prev.get("status") == "script_generated":
                audio_base64 = generate_voiceover(news_item["script"], topic, index, voices[index % len(voices)])
                if audio_base64:
                    audio_bytes = base64.b64decode(audio_base64)
                    audio_path = f"news/{overall_news_id}/{news_id}/news{index}.wav"
                    audio_url = upload_bytes_to_bucket(audio_bytes, audio_path, content_type="audio/wav")
                    news_item.update({"audio_url": audio_url, "status": "audio_uploaded"})
                    log_backup(news_item)
                    summary_doc_ref.update({"items": firestore.ArrayUnion([news_item])})
                    time.sleep(1)

            # --- Step 3: Banner Generation ---
            if not prev or prev.get("status") == "audio_uploaded":
                visual_prompt = generate_visual_prompt(topic)
                banner_response = generate_overall_banner_image(news_id, visual_prompt)
                image_path = f"news/{overall_news_id}/{news_id}/newsBackground.jpg"
                banner_url = upload_bytes_to_bucket(banner_response.content, image_path, content_type="image/jpeg")
                news_item.update({"image_url": banner_url, "status": "image_uploaded"})
                log_backup(news_item)
                summary_doc_ref.update({"items": firestore.ArrayUnion([news_item])})
                time.sleep(1)

        except Exception as e:
            print(f"❌ Error for topic '{topic}': {e}")
            log_backup({**news_item, "status": "error", "error": str(e)})

    # === Final Summary and Thumbnail ===
    try:
        print("🎨 Generating final thumbnail and summary...")
        combined_topic = " | ".join(trending_topics[:MAX_NEWS_ITEMS])
        thumbnail_prompt = create_combined_visual_prompt(combined_topic)
        thumbnail_bytes = generate_vector_image(overall_news_id, thumbnail_prompt)

        thumb_path = f"news/{overall_news_id}/newsBanner.jpg"
        thumb_url = upload_bytes_to_bucket(thumbnail_bytes, thumb_path, content_type="image/jpeg")

        summary_text = create_combined_news_summary(trending_topics[:MAX_NEWS_ITEMS])
        summary_doc_ref.update({
            "summary": summary_text,
            "thumbnail_url": thumb_url,
            "status": "complete"
        })
        print("✅ Final summary and thumbnail uploaded.")

        # 🔥 Cleanup backup if everything succeeded
        if os.path.exists(backup_file):
            os.remove(backup_file)
            print("🧹 Deleted backup file.")

    except Exception as e:
        print(f"❌ Final summary/thumbnail error: {e}")
        log_backup({"overall_id": overall_news_id, "status": "final_error", "error": str(e)})

if __name__ == "__main__":
    main()
