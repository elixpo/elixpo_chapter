from topicScraper import fetch_trending_topics, send_topic_to_api
from podCastCreator import get_latest_info, generate_podcast_script
from storyTeller import generate_podcast_audio
from podCastImage import generate_podcast_thumbnail, generate_podcast_banner
from podcastID import generatePodcastID
import firebase_admin
from firebase_admin import credentials, firestore, storage
import os
import time
import json

service_account_path = 'elixpoChatServiceKey.json'
cred = credentials.Certificate(service_account_path)
firebase_admin.initialize_app(cred, {
    "storageBucket": "notes-89337.appspot.com"
})

db = firestore.client()
bucket = storage.bucket()
local_cache_file = "podcast_backup.txt"

def log(msg):
    print(f"[Elixpo] {msg}")

def write_backup(data):
    with open(local_cache_file, "w") as f:
        for k, v in data.items():
            f.write(f"{k}={v}\n")

def read_backup():
    if not os.path.exists(local_cache_file):
        return {}
    with open(local_cache_file, "r") as f:
        return dict(line.strip().split("=", 1) for line in f.readlines() if "=" in line)

def cleanup_files(podcast_id):
    for f in os.listdir():
        if f.startswith(f"elixpoNews_{podcast_id}") and f.endswith(".wav"):
            os.remove(f)
        elif f.startswith(f"podcastThumbnail_{podcast_id}") or f.startswith(f"podcastBanner_{podcast_id}"):
            os.remove(f)
        elif f.startswith(f"podcast_{podcast_id}") and f.endswith(".wav"):
            os.remove(f)
        elif f == f"podcast_backup.txt":
            os.remove(f)

def main():
    log("Starting podcast generation workflow...")
    backup = read_backup()
    
    try:
        time.sleep(2)
        #delete existing podcast details 
        log("Cleaning up existing podcast details in Storage...")
        podcastDoc = db.collection("genStats").document("podcast").get()
        if podcastDoc.exists:
            latest_podcast_id = podcastDoc.to_dict().get("latestPodcastID")
            if latest_podcast_id:
                log(f"Found latestPodcastID in Firestore: {latest_podcast_id}")
                blobs = list(bucket.list_blobs(prefix=f'podcast/{latest_podcast_id}/'))
                if blobs:
                    for blob in blobs:
                        blob.delete()
                    log(f"Deleted storage folder for podcast ID: {latest_podcast_id}")
                else:
                    log(f"No storage folder found for podcast ID: {latest_podcast_id}")
            else:
                log("No latestPodcastID found in Firestore.")
        else:
            log("No podcast document found in Firestore. Skipping storage cleanup.")
        # === Topic Fetch ===
        
        if backup.get("status") is None:
            log("Fetching trending topics...")
            topics = fetch_trending_topics()
            if not topics:
                log("Failed to fetch trending topics.")
                return
            result = send_topic_to_api(topics)
            content = result.get('choices', [{}])[0].get('message', {}).get('content', 'No content returned.')

            log("Received content from topic API.")
            if isinstance(content, str):
                try:
                    content_dict = json.loads(content)
                except json.JSONDecodeError:
                    content_dict = {}
            else:
                content_dict = content

            topic_name = content_dict.get("podcast_title", "")
            topic_name = str(topic_name)
            topic_name = topic_name.replace(",", " ").strip()
            topic_source = content_dict.get("source_url", "")
            podcast_id = generatePodcastID(topic_name)
            doc_ref = db.collection('podcasts').document(podcast_id)
            timestamp = str(int(time.time()))   
            doc_ref.set({
                'podcast_name': topic_name,
                'timestamp': timestamp,
                'podcast_id': podcast_id,
                'topic_chosen': topic_name,
                'topic_source': topic_source,
                'time_generated': time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(int(timestamp))),
                'status': 'topic_stored'
            })

            backup.update({
                "podcast_id": podcast_id,
                "topic_name": topic_name,
                "topic_source": topic_source,
                "status": "topic_stored"
            })
            write_backup(backup)
            log(f"Topic stored: {topic_name} | ID: {podcast_id}")
        else:
            podcast_id = backup["podcast_id"]
            topic_name = backup["topic_name"]
            topic_source = backup["topic_source"]
            doc_ref = db.collection('podcasts').document(podcast_id)

        # === Script Generation ===
        if backup["status"] == "topic_stored":
            time.sleep(2)
            log("Generating podcast script...")
            info = get_latest_info(topic_name)
            podcast_script = generate_podcast_script(info, topic_name)
            doc_ref.update({
                'podcast_script': podcast_script,
                'status': 'script_generated'
            })
            backup.update({
                "podcast_script": podcast_script,
                "status": "script_generated"
            })
            write_backup(backup)
            log("Script generated and saved to Firestore.")

        else:
            podcast_script = backup.get("podcast_script")

        # === Audio Generation ===
        if backup["status"] == "script_generated":
            time.sleep(2)
            log("Generating podcast audio...")
            audio_name = generate_podcast_audio(podcast_script, podcast_id)
            if not audio_name:
                log("Audio generation failed.")
                return
            if audio_name.split("_")[1] == podcast_id:
                blob = bucket.blob(f'podcast/{podcast_id}/{audio_name+".wav"}')
                blob.upload_from_filename(audio_name+".wav")
                blob.make_public()
                audio_url = blob.public_url
                doc_ref.update({
                    'podcast_audio_url': audio_url,
                    'status': 'audio_uploaded'
                })
                backup.update({
                    "status": "audio_uploaded"
                })
                write_backup(backup)
                log("Audio uploaded and saved to Firestore.")
            else:
                log("Audio generation failed.")
                return

        # === Thumbnail + Banner ===
        if backup["status"] == "audio_uploaded":
            time.sleep(2)
            log("Generating thumbnail and banner images...")
            thumbnail = generate_podcast_thumbnail(topic_name, podcast_id)
            if not thumbnail:
                log("Thumbnail generation failed.")
                return
            elif thumbnail.split("_")[1] == podcast_id:
                blob = bucket.blob(f'podcast/{podcast_id}/{thumbnail+".jpg"}')
                blob.upload_from_filename(thumbnail+".jpg")
                blob.make_public()
                thumbnail_url = blob.public_url
                doc_ref.update({'podcast_thumbnail_url': thumbnail_url})
                log("Thumbnail uploaded.")

            banner = generate_podcast_banner(topic_name, podcast_id)
            if not banner:
                log("Banner generation failed.")
                return
            elif banner.split("_")[1] == podcast_id:
                blob = bucket.blob(f'podcast/{podcast_id}/{banner+"jpg"}')
                blob.upload_from_filename(banner+".jpg")
                blob.make_public()
                banner_url = blob.public_url
                doc_ref.update({'podcast_banner_url': banner_url})
                log("Banner uploaded.")
                doc_ref.update({
                    'status': 'thumbnail_uploaded',
                    'podcast_thumbnail_url': thumbnail_url,
                    'podcast_banner_url': banner_url
                        })
                backup.update({"status": "thumbnail_uploaded"})

        # === Update Podcast Details ===
        if backup["status"] == "thumbnail_uploaded":
                podcastDoc_ref = db.collection("genStats").document("podcast")
                podcastDoc = podcastDoc_ref.get()
                banner_url = backup.get("banner_url", "")
                if podcastDoc.exists:
                    genNumber = podcastDoc.to_dict()["genNumber"]
                    podcastDoc_ref.update({"genNumber": genNumber + 1})
                    podcastDoc_ref.update({"latestPodcastID": podcast_id})
                    podcastDoc_ref.update({"latestPodcastName": topic_name})
                    podcastDoc_ref.update({"latestPodcastThumbnail": thumbnail_url})
                else:
                    print("Document does not exist.")

                log("Podcast details updated successfully.")
                doc_ref.update({'status': 'complete'})
                backup.update({"status": "complete"})
                write_backup(backup)
                cleanup_files(podcast_id)
                log("Podcast generation completed successfully. Cleanup done.")

    except Exception as e:
        log(f"❌ Error: {e}")

if __name__ == "__main__":
    main()
