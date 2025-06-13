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
    print("\u2705 Firebase initialized.")
except Exception as e:
    print(f"\u274c Firebase init error: {e}")
    exit()

def log_backup(entry):
    with open(backup_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

def load_backup():
    if not os.path.exists(backup_file):
        return {}, []
    with open(backup_file, "r", encoding="utf-8") as f:
        lines = f.readlines()
        meta = json.loads(lines[0]) if lines else {}
        entries = [json.loads(line) for line in lines[1:]]
        return meta, entries

def save_backup_meta(overall_id, topics):
    with open(backup_file, "w", encoding="utf-8") as f:
        f.write(json.dumps({"overall_id": overall_id, "topics": topics}, ensure_ascii=False) + "\n")

def upload_bytes_to_bucket(data_bytes, storage_path, content_type):
    blob = bucket.blob(storage_path)
    blob.upload_from_string(data_bytes, content_type=content_type)
    blob.make_public()
    return blob.public_url

def update_news_item(summary_doc_ref, index, data):
    summary_doc_ref.update({f"items.{index}": data})

def safe_retry(func, retries=2, wait=5):
    for i in range(retries + 1):
        try:
            return func()
        except Exception as e:
            if i < retries:
                print(f"Retry {i+1}/{retries} due to error: {e}. Waiting {wait}s...")
                time.sleep(wait)
            else:
                raise

def main():
    backup_meta, backup_data = load_backup()

    if backup_meta:
        trending_topics = backup_meta.get("topics", [])
        overall_news_id = backup_meta.get("overall_id")
    else:
        trending_topics = fetch_trending_topics()
        if not trending_topics:
            print("No trending topics.")
            return
        now_str = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        overall_news_id = hashlib.sha256(now_str.encode()).hexdigest()[:16]
        save_backup_meta(overall_news_id, trending_topics)

    summary_doc_ref = db.collection("news").document(overall_news_id)
    if not backup_meta:
        summary_doc_ref.set({
            "date": datetime.now(timezone.utc).isoformat(),
            "summary": "",
            "thumbnail_url": "",
            "status": "started",
            "items": [{} for _ in range(MAX_NEWS_ITEMS)]
        })

    processed = {item['news_id']: item for item in backup_data if 'news_id' in item}

    for index, topic in enumerate(trending_topics[:MAX_NEWS_ITEMS]):
        noise = f"{topic}-{index}-{overall_news_id}"
        news_id = hashlib.sha256(noise.encode()).hexdigest()[:16]
        news_item = {
            "news_id": news_id,
            "topic": topic,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "started"
        }

        prev = processed.get(news_id, {})

        if prev.get("status") == "complete":
            print(f"✅ Topic {index} already complete: {topic}")
            continue

        print(f"⚙️ Processing topic {index+1}/{MAX_NEWS_ITEMS}: {topic}")

        try:
            # Step 1: Script Generation
            if prev.get("status") in [None, "started"]:
                info = safe_retry(lambda: generate_news_analysis(topic))
                if not info or "error" in str(info).lower():
                    raise Exception(f"Failed to generate analysis for: {topic}")
                script_response = safe_retry(lambda: generate_news_script(info))
                script_data = json.loads(script_response)
                if "script" not in script_data or not script_data["script"]:
                    raise Exception(f"Invalid script generated for: {topic}")

                news_item.update({
                    "script": script_data.get("script", ""),
                    "source_link": script_data.get("source_link", ""),
                    "status": "script_generated"
                })
                log_backup(news_item)
                update_news_item(summary_doc_ref, index, news_item)
                prev = news_item.copy()

            # Step 2: Audio Generation
            if prev.get("status") == "script_generated":
                audio_base64 = safe_retry(lambda: generate_voiceover(
                    prev["script"], topic, index, voices[index % len(voices)]))
                audio_bytes = base64.b64decode(audio_base64)
                audio_path = f"news/{overall_news_id}/{news_id}/news{index}.wav"
                audio_url = upload_bytes_to_bucket(audio_bytes, audio_path, content_type="audio/wav")
                news_item.update({"audio_url": audio_url, "status": "audio_uploaded"})
                log_backup(news_item)
                update_news_item(summary_doc_ref, index, news_item)
                prev = news_item.copy()

            # Step 3: Banner Generation
            if prev.get("status") == "audio_uploaded":
                prompt = generate_visual_prompt(topic)
                banner_response = safe_retry(lambda: generate_overall_banner_image(news_id, prompt))
                img_path = f"news/{overall_news_id}/{news_id}/newsBackground.jpg"
                image_url = upload_bytes_to_bucket(banner_response.content, img_path, content_type="image/jpeg")
                news_item.update({"image_url": image_url, "status": "complete"})
                log_backup(news_item)
                update_news_item(summary_doc_ref, index, news_item)
                prev = news_item.copy()

            # Final per-item status
            summary_doc_ref.update({f"items.{index}.status": f"news{index}_complete"})

        except Exception as e:
            print(f"❌ Error for topic '{topic}': {e}")
            log_backup({**news_item, "status": "error", "error": str(e)})
            continue

        print("Sleeping for 5 seconds...")
        time.sleep(5)

    # Final summary and thumbnail
    try:
        print("🎨 Generating final thumbnail and summary...")
        thumbnail_prompt = create_combined_visual_prompt(" | ".join(trending_topics[:MAX_NEWS_ITEMS]))
        thumbnail_bytes = generate_vector_image(overall_news_id, thumbnail_prompt)
        thumb_path = f"news/{overall_news_id}/newsBanner.jpg"
        thumb_url = upload_bytes_to_bucket(thumbnail_bytes, thumb_path, content_type="image/jpeg")

        summary_text = create_combined_news_summary(trending_topics[:MAX_NEWS_ITEMS])
        if not summary_text or "error" in summary_text.lower():
            raise Exception("Summary generation failed")

        summary_doc_ref.update({
            "summary": summary_text,
            "thumbnail_url": thumb_url,
            "status": "complete"
        })

        print("✅ Final summary and thumbnail uploaded.")

        all_items_complete = True
        for i in range(MAX_NEWS_ITEMS):
            item = summary_doc_ref.get().to_dict().get("items", [])[i]
            if not item or item.get("status") != "complete":
                all_items_complete = False
                break

        if all_items_complete and os.path.exists(backup_file):
            os.remove(backup_file)
            print("🧹 Deleted backup file.")
        else:
            print("⚠️ Backup retained — some items may not be complete.")


    except Exception as e:
        print(f"❌ Final summary/thumbnail error: {e}")
        log_backup({"overall_id": overall_news_id, "status": "final_error", "error": str(e)})
        print("⚠️ Backup NOT deleted — resume possible.")

if __name__ == "__main__":
    main()
