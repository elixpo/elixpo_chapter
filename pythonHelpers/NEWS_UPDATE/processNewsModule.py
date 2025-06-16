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

def log_backup_state(state):
    with open(backup_file, "w", encoding="utf-8") as f:
        f.write(json.dumps(state, ensure_ascii=False, indent=2))

def load_backup_state():
    if not os.path.exists(backup_file):
        return None
    with open(backup_file, "r", encoding="utf-8") as f:
        return json.load(f)

def upload_bytes_to_bucket(data_bytes, storage_path, content_type):
    blob = bucket.blob(storage_path)
    blob.upload_from_string(data_bytes, content_type=content_type)
    blob.make_public()
    return blob.public_url

def safe_retry(func, retries=2, wait=5):
    for i in range(retries + 1):
        try:
            return func()
        except Exception as e:
            if i < retries:
                print(f"Retry {i+1}/{retries} after error: {e} (waiting {wait}s)")
                time.sleep(wait)
            else:
                 raise # Re-raise the exception after the last retry attempt

def main():
    # === Load or Initialize Backup ===
    backup = load_backup_state()
    if backup:
        overall_id = backup["overall_id"]
        trending_topics = backup["topics"]
        items = backup["items"]
        print("🗂️ Loaded backup.")
    else:
        trending_topics = fetch_trending_topics()
        if not trending_topics:
            print("⚠️ No trending topics found.")
            return
        now_str = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        overall_id = hashlib.sha256(now_str.encode()).hexdigest()[:16]
        items = [{} for _ in range(MAX_NEWS_ITEMS)]
        backup = {
            "overall_id": overall_id,
            "topics": trending_topics,
            "items": items,
            "summary": "",
            "thumbnail_url": "",
            "status": "started"
        }
        log_backup_state(backup)

    summary_doc = db.collection("news").document(overall_id)
    gen_stats_doc = db.collection("genStats").document("news")

    # Ensure the main document exists on first run or after a final failure
    if backup["status"] == "started" or backup["status"] == "final_error":
         try:
              summary_doc.set({
                  "date": datetime.now(timezone.utc).isoformat(),
                  "summary": backup.get("summary", ""), # Keep existing summary/thumb if final_error
                  "thumbnail_url": backup.get("thumbnail_url", ""),
                  "status": "processing", # Set to processing while individual items are worked on
                  "items": backup["items"], # Use items from backup
                  "overall_id": overall_id
              })
              backup["status"] = "processing"
              log_backup_state(backup)
         except Exception as e:
             print(f"❌ Failed to initialize/update summary doc: {e}")
             backup["status"] = "final_firestore_error"
             backup["error"] = str(e)
             log_backup_state(backup)
             return # Exit if we can't even update the main doc

    # === Process Each News Item ===
    for index, topic in enumerate(trending_topics[:MAX_NEWS_ITEMS]):
        noise = f"{topic}-{index}-{overall_id}"
        news_id = hashlib.sha256(noise.encode()).hexdigest()[:16]
        # Ensure item structure exists even if it was {} in backup
        item = backup["items"][index] or {}
        item.setdefault("news_id", news_id) # Ensure news_id is set
        item.setdefault("topic", topic)     # Ensure topic is set


        # If complete, skip
        if item.get("status") == "complete":
            print(f"✅ Skipping complete topic {index}: {topic}")
            continue

        print(f"⚙️ Processing topic {index+1}/{MAX_NEWS_ITEMS}: {topic}")

        current_status = item.get("status")

        # Step 1: Script (Retry if None, started, or failed script)
        if current_status in [None, "started", f"news{index}_script_failed"]:
            try:
                print(f"Attempting Script for topic {index}")
                info = safe_retry(lambda: generate_news_analysis(topic))
                if not info or "error" in str(info).lower():
                    raise Exception("Analysis failed")

                script_data = json.loads(safe_retry(lambda: generate_news_script(info)))
                if "script" not in script_data or not script_data["script"]:
                    raise Exception("Script invalid")

                item.update({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "script": script_data["script"],
                    "source_link": script_data.get("source_link", ""),
                    "status": "script_generated",
                    "error": None # Clear previous error on success
                })
                backup["items"][index] = item
                log_backup_state(backup)
                # Update Firestore only for this item
                summary_doc.update({f"items.{index}": item})
                current_status = "script_generated" # Update current_status for next check
                print(f"✅ Script generated for topic {index}")

            except Exception as e:
                item["status"] = f"news{index}_script_failed"
                item["error"] = str(e)
                backup["items"][index] = item
                log_backup_state(backup)
                summary_doc.update({f"items.{index}": item}) # Log failure to firestore
                print(f"❌ Script error for topic {index}: {e}")
                # Continue to the next item in the loop on failure
                continue

        # Step 2: Audio (Retry if script generated or failed audio)
        if current_status == "script_generated" or current_status == f"news{index}_audio_failed":
            try:
                print(f"Attempting Audio for topic {index}")
                # Check if script exists before generating audio
                if "script" not in item or not item["script"]:
                    raise Exception("Script is missing for audio generation")

                audio_base64 = safe_retry(lambda: generate_voiceover(
                    item["script"], topic, index, voices[index % len(voices)]))
                audio_bytes = base64.b64decode(audio_base64)
                audio_path = f"news/{overall_id}/{news_id}/news{index}.wav"
                audio_url = upload_bytes_to_bucket(audio_bytes, audio_path, content_type="audio/wav")

                item.update({"audio_url": audio_url, "status": "audio_uploaded", "error": None})
                backup["items"][index] = item
                log_backup_state(backup)
                summary_doc.update({f"items.{index}": item})
                current_status = "audio_uploaded" # Update current_status
                print(f"✅ Audio uploaded for topic {index}")

            except Exception as e:
                item["status"] = f"news{index}_audio_failed"
                item["error"] = str(e)
                backup["items"][index] = item
                log_backup_state(backup)
                summary_doc.update({f"items.{index}": item})
                print(f"❌ Audio error for topic {index}: {e}")
                # Continue to the next item in the loop on failure
                continue


        # Step 3: Image (Retry if audio uploaded or failed image)
        if current_status == "audio_uploaded" or current_status == f"news{index}_image_failed":
            try:
                print(f"Attempting Image for topic {index}")
                # Check if topic exists before generating image prompt
                if "topic" not in item or not item["topic"]:
                    raise Exception("Topic is missing for image generation")

                prompt = generate_visual_prompt(item["topic"])
                banner_img = safe_retry(lambda: generate_overall_banner_image(item["news_id"], prompt))
                img_path = f"news/{overall_id}/{news_id}/newsBackground.jpg"
                image_url = upload_bytes_to_bucket(banner_img.content, img_path, content_type="image/jpeg")

                item.update({"image_url": image_url, "status": "complete", "error": None})
                backup["items"][index] = item
                log_backup_state(backup)
                summary_doc.update({f"items.{index}": item})
                current_status = "complete" # Update current_status
                print(f"✅ Image uploaded and item complete for topic {index}")

            except Exception as e:
                item["status"] = f"news{index}_image_failed"
                item["error"] = str(e)
                backup["items"][index] = item
                log_backup_state(backup)
                summary_doc.update({f"items.{index}": item})
                print(f"❌ Image error for topic {index}: {e}")
                # Continue to the next item in the loop on failure
                continue

        # Sleep only after successfully completing an item, or if it was skipped
        if current_status == "complete":
            print("🕒 Sleeping 5 seconds...")
            time.sleep(5)


    # === Final Thumbnail & Summary ===
    print("Checking if all items are complete for final steps...")
    all_items_complete = all(item.get("status") == "complete" for item in backup["items"])

    if all_items_complete:
        try:
            print("🖼️ Generating final thumbnail & summary...")
            # Ensure topics are available for the combined prompt/summary
            if not trending_topics:
                 raise Exception("Trending topics missing for final steps")

            combined_topics = [item.get("topic", "") for item in backup["items"] if item.get("topic")]
            if not combined_topics:
                 raise Exception("No successful topics found for final steps")


            prompt = create_combined_visual_prompt(" | ".join(combined_topics))
            thumb_bytes = generate_vector_image(overall_id, prompt)
            thumb_path = f"news/{overall_id}/newsThumbnail.jpg"
            thumb_url = upload_bytes_to_bucket(thumb_bytes, thumb_path, "image/jpeg")

            summary_text = create_combined_news_summary(combined_topics)
            if not summary_text or "error" in summary_text.lower():
                raise Exception("Summary generation failed")

            summary_doc.update({
                "summary": summary_text,
                "thumbnail_url": thumb_url,
                "status": "complete",
                "error": None # Clear any previous final error
            })

            backup.update({
                "summary": summary_text,
                "thumbnail_url": thumb_url,
                "status": "complete",
                "error": None
            })
            log_backup_state(backup)

            # Clean old
            try:
                gen_stats_data = gen_stats_doc.get().to_dict()
                if gen_stats_data:
                    prev_id = gen_stats_data.get("latestNewsId")
                    if prev_id and prev_id != overall_id: # Don't delete the current one
                        print(f"🧹 Attempting to delete old news folder: news/{prev_id}/")
                        prefix = f"news/{prev_id}/"
                        try:
                            blobs = list(bucket.list_blobs(prefix=prefix))
                            for b in blobs:
                                b.delete()
                            print(f"🧹 Deleted old news folder: {prefix}")
                        except Exception as delete_error:
                            print(f"⚠️ Failed to delete old news folder {prefix}: {delete_error}")


            except Exception as get_stats_error:
                print(f"⚠️ Failed to get genStats doc for cleanup: {get_stats_error}")


            gen_stats_doc.update({
                "genNumber": firestore.Increment(1),
                "latestNewsId": overall_id,
                "latestNewsThumbnail": thumb_url,
                "latestNewsSummary": summary_text,
                "latestNewsDate": datetime.now(timezone.utc).isoformat()
            })

            os.remove(backup_file)
            print("✅ All items complete. Final steps successful. Backup file deleted.")

        except Exception as e:
            backup["status"] = "final_error"
            backup["error"] = str(e)
            log_backup_state(backup)
            summary_doc.update({"status": "final_error", "error": str(e)})
            print(f"❌ Final step error: {e}")
            print("⚠️ Backup NOT deleted — resume is possible.")

    else:
        print("⚠️ Not all items complete. Final steps skipped.")
        print("⚠️ Backup retained — resume is possible.")


if __name__ == "__main__":
    main()