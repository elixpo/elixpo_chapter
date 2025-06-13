import os
import json
import firebase_admin
from firebase_admin import credentials, firestore, storage
import random
service_account_path = 'elixpoChatServiceKey.json'
storage_bucket_name = "notes-89337.appspot.com"
voices = ["shimmer", "dan"]
BACKUP_FILE = "news_progress_backup.txt"
POLLINATIONS_TOKEN = "fEWo70t94146ZYgk"
POLLINATIONS_REFERRER = "elixpoart"
MAX_NEWS_ITEMS = 1


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

