storage_bucket_name = "notes-89337.appspot.com"
from firebase_admin import credentials, firestore, storage
from processNewsForTopics import bucket, db

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