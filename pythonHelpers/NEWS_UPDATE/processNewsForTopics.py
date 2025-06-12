import os
import requests
import json
import base64
from datetime import datetime, timezone # Use timezone aware datetimes
import firebase_admin
from firebase_admin import credentials, firestore, storage
from bs4 import BeautifulSoup
from collections import defaultdict
import random
import time # Added for potential retries or delays

# --- Configuration ---
service_account_path = 'elixpoChatServiceKey.json'
storage_bucket_name = "notes-89337.appspot.com"
voices = ["shimmer", "dan"]
BACKUP_FILE = "news_progress_backup.txt"
MAX_NEWS_ITEMS = 1 # Set to 5 for production, 1 for testing as requested
POLLINATIONS_TOKEN = "fEWo70t94146ZYgk"
POLLINATIONS_REFERRER = "elixpoart"

# --- Firebase Initialization ---
try:
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred, {"storageBucket": storage_bucket_name})
    db = firestore.client()
    bucket = storage.bucket()
    print("✅ Firebase initialized successfully.")
except Exception as e:
    print(f"❌ Failed to initialize Firebase: {e}")
    exit() # Exit if Firebase fails to initialize

# --- Utility Functions ---

def generate_color_theme():
    """Generates a random hex color code (placeholder)."""
    return f"#{random.randint(0, 0xFFFFFF):06x}"

# --- Get News Topics ---

# This function is taken directly from your provided code
def fetch_trending_topics():
    print("🔍 Attempting to fetch trending topics...")
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

    # Shuffle categories to get diverse topics each run
    categories = list(categorized_feeds.keys())
    random.shuffle(categories)

    for category in categories:
        feeds = categorized_feeds[category]
        random.shuffle(feeds)
        if len(headlines) >= MAX_NEWS_ITEMS: # Stop if we have enough topics
            break

        for feed_url in feeds:
            try:
                print(f"Fetching feed for '{category}': {feed_url}")
                response = requests.get(feed_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15) # Increased timeout
                response.raise_for_status()
                soup = BeautifulSoup(response.content, 'xml')
                items = soup.find_all('item')

                for item in items:
                    raw_title = item.title.text.strip()
                    title = raw_title.lower()

                    if (any(pos in title for pos in positive_keywords) and
                        not any(excl in title for excl in exclusion_keywords)):

                        keywords = extract_keywords(title)

                        # Check similarity with previous headlines (simple keyword overlap check)
                        # Adjust the threshold (e.g., < 2) based on desired diversity
                        is_similar = False
                        for prev_keywords in seen_keywords:
                            if len(keywords & prev_keywords) >= 2: # Check for at least 2 shared keywords
                                is_similar = True
                                break

                        if not is_similar:
                            seen_keywords.append(keywords)
                            headlines.append(raw_title)
                            print(f"  ✅ Added headline: {raw_title}")

                if len(headlines) >= MAX_NEWS_ITEMS: # Stop fetching feeds if we have enough topics
                    break

            except requests.RequestException as e:
                print(f"  ❌ Error fetching {feed_url}: {e}")
                # Continue to the next feed or category

    print(f"✅ Finished fetching topics. Found {len(headlines)} suitable headlines.")
    return headlines[:MAX_NEWS_ITEMS]


# --- Progress Tracking ---
def load_progress():
    """Loads progress from the backup file."""
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
    """Saves current progress to the backup file."""
    try:
        with open(BACKUP_FILE, "w") as f:
            json.dump(progress_dict, f, indent=4) # Use indent for readability
        print(f"✅ Progress saved: {progress_dict}")
    except Exception as e:
        print(f"❌ Error saving progress file '{BACKUP_FILE}': {e}")

# --- AI & Storage Interactions ---

def upload_to_storage(data, destination_blob_path, content_type):
    """Uploads data (bytes) to Firebase Storage."""
    try:
        blob = bucket.blob(destination_blob_path)
        blob.upload_from_string(data, content_type=content_type)
        blob.make_public() # Make the file publicly accessible
        print(f"✅ Uploaded to Storage: {destination_blob_path}")
        return blob.public_url
    except Exception as e:
        print(f"❌ Failed to upload to Storage '{destination_blob_path}': {e}")
        return None

# --- Content Generation Steps ---

def generate_overall_banner_image(news_id, news_title):
    """Generates and uploads the overall news banner image."""
    prompt = (
        "A vibrant watercolor painting in news banner style, with vibrant colors and appealing look, "
        "cinematic lighting and bright realistic outlook properly explaining a visual scene for the topic: "
        f"{news_title}"
    )
    # Direct request to image API
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
        response = requests.get(url, params=params, timeout=60) # Added timeout
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
    """Generates and uploads the image for a specific news block."""
    prompt = ("A vibrant watercolor painting in news banner style, with vibrant colors and appealing look, "
              "cinematic lighting and bright realistic outlook properly explaining a visual scene for the topic: "
              f"{news_title}")
    # Direct request to image API
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
        response = requests.get(url, params=params, timeout=60) # Added timeout
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
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=60) # Added timeout
        response.raise_for_status()
        response_json = response.json()

        # Based on the original code's subsequent json.loads call, it seems
        # the *content* field itself contains a JSON string with 'content' and 'sources'.
        message_content = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")
        if message_content:
            try:
                # Attempt to parse the JSON string *within* the content field
                parsed_content = json.loads(message_content)
                analysis_content = parsed_content.get("content", "No detailed analysis provided.")
                sources = parsed_content.get("sources", ["No sources provided."])
                print("✅ Analysis received from elixposearch.")
                # Return the parsed content and sources
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
    """Generates the news script from the analysis using AI (likely 'evil' or similar text model)."""
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
        "model": "evil", # Using 'evil' or similar text model for script generation based on analysis
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Create a news script based on this analysis: {analysis_content}"},
        ],
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER,
        "json": False, # Do NOT request JSON output here, we want plain text script
        "seed": 123 # Different seed for script generation
    }
    print("📝 Generating news script from analysis...")
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=60) # Added timeout
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
    """Generates and uploads the voiceover for a news script."""
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
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=60) # Added timeout
        response.raise_for_status()
        response_json = response.json()
        audio_data_base64 = response_json.get('choices', [{}])[0].get('message', {}).get('audio', {}).get('data') # Safer access
        if audio_data_base64:
            audio_data = base64.b64decode(audio_data_base64)
            path = f"news/{news_id}/newsID{news_index}/news{news_index}.wav"
            return upload_to_storage(audio_data, path, "audio/wav")
        else:
             print("❌ Voiceover API returned no audio data.")
             print(f"Partial response: {response_json}") # Print partial response for debugging
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


# --- Firestore Saving ---

def save_news_block_to_firestore(news_id, news_index, news_title, script, timestamp, voice_link, image_link, color_theme, news_source_link):
    """Saves data for a single news block to Firestore."""
    doc_ref = db.collection("news").document(news_id)

    # Structure for the news block within the 'blocks' array
    block_data = {
        "name": news_title,
        "content": script,
        "timestamp": timestamp,
        "voice_link": voice_link,
        "color_theme": color_theme,
        "image_link": image_link, # This is the block-specific image
        "news_source_link": news_source_link
    }

    try:
        # Read the current document to modify the 'blocks' list
        snapshot = doc_ref.get()
        if not snapshot.exists:
            print(f"⚠️ Document {news_id} does not exist when trying to save block {news_index}. Creating...")
            data = {} # Start with empty data if doc didn't exist
        else:
             data = snapshot.to_dict()

        # Ensure 'blocks' list exists and has enough space
        data.setdefault("blocks", [])
        while len(data["blocks"]) <= news_index:
            data["blocks"].append({}) # Pad list with empty dicts if needed

        # Update the specific block's data
        data["blocks"][news_index] = block_data

        # Update status
        data.setdefault("status", {})
        data["status"][str(news_index)] = "done"

        # Write the modified data back (this overwrites the blocks list and status)
        doc_ref.set(data)

        print(f"✅ Firestore updated for block {news_index}: {news_id}")
        return True
    except Exception as e:
        print(f"❌ Failed to save block {news_index} to Firestore: {e}")
        return False

def save_overall_news_info_to_firestore(news_id, date, news_summary, overall_banner_url):
     """Saves main news document fields (for index 0 processing)."""
     doc_ref = db.collection("news").document(news_id)
     data = {
         "date": date.strftime("%Y-%m-%d"),
         "news_summary": news_summary, # Summary taken from the script of the first block
         "overall_news_thumbnail": overall_banner_url, # Link to the banner stored outside block folder
         "news_banner": overall_banner_url, # Assuming news_banner and overall_news_thumbnail are the same
     }
     try:
         # Use set with merge=True to update these top-level fields without affecting the 'blocks' list
         doc_ref.set(data, merge=True)
         print(f"✅ Firestore overall info updated for {news_id}")
         return True
     except Exception as e:
         print(f"❌ Failed to save overall info for {news_id} to Firestore: {e}")
         return False


# --- Main Workflow ---

def getFullNewsInfo():
    """Main function to orchestrate the news generation process."""
    print("--- Starting News Generation Process ---")

    progress = load_progress()
    current_news_id = progress.get("news_id")
    start_index = int(progress.get("last_index", 0))

    # If it's a fresh start or previous batch was completed/failed irrecoverably, generate a new ID
    if not current_news_id or start_index >= MAX_NEWS_ITEMS:
        current_news_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        start_index = 0
        print(f"🆕 Starting new news batch with ID: {current_news_id}")
    else:
        print(f"🔁 Resuming news batch ID: {current_news_id} from index: {start_index}")

    topics = fetch_trending_topics()

    if not topics:
        print("❌ No suitable topics found. Exiting.")
        # Optionally clear progress if no topics means the day's run is over
        save_progress({}) # Clear progress to start fresh next time
        return

    # Ensure we don't try to process more topics than we found or the max allowed
    topics_to_process = topics[:MAX_NEWS_ITEMS]
    num_topics = len(topics_to_process)
    print(f"📰 Found {num_topics} topics to process (max {MAX_NEWS_ITEMS}).")

    overall_banner_url = None

    # --- Step 0: Handle overall news document and banner for index 0 ---
    # This step only happens if we are starting from index 0
    if start_index == 0 and num_topics > 0:
        print("Handling overall news document and banner (Index 0 step)...")
        overall_banner_url = generate_overall_banner_image(current_news_id, topics_to_process[0])
        if overall_banner_url:
            # Save initial progress *after* banner is generated
            save_progress({"news_id": current_news_id, "last_index": 0}) # Save ID even if index 0 fails later
        else:
            print("❌ Failed to generate overall banner. Cannot proceed with this batch.")
            save_progress({}) # Clear progress if critical initial step fails
            return

    elif start_index > 0:
        # If resuming from index > 0, we need the existing overall_banner_url
        # Fetch it from Firestore if possible.
        doc_ref = db.collection("news").document(current_news_id)
        snapshot = doc_ref.get(["overall_news_thumbnail"])
        if snapshot.exists:
            overall_banner_url = snapshot.get("overall_news_thumbnail")
            if not overall_banner_url:
                 print(f"⚠️ Resuming batch {current_news_id}, but overall_news_thumbnail not found in Firestore. This might cause issues.")
        else:
            print(f"⚠️ Resuming batch {current_news_id}, but document not found in Firestore. Starting fresh.")
            # If the document is missing entirely when resuming, the state is corrupted.
            # Start fresh with a new ID.
            current_news_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
            start_index = 0
            overall_banner_url = None # Reset if starting fresh
            print("❌ Critical error: Resume ID found, but Firestore document is missing. Resetting progress.")
            save_progress({}) # Clear corrupted state
            # Re-fetch topics for the new batch
            topics = fetch_trending_topics()
            topics_to_process = topics[:MAX_NEWS_ITEMS]
            num_topics = len(topics_to_process)
            if num_topics > 0:
                 print(f"📰 Starting new batch {current_news_id} with {num_topics} topics after reset.")
                 # Re-run the index 0 setup for the new batch ID
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


    # --- Step 1-N: Process each topic ---
    for i in range(start_index, num_topics):
        topic = topics_to_process[i]
        print(f"\n--- Processing Topic {i+1}/{num_topics}: {topic} ---")

        # --- Step 1.1: Get detailed analysis using elixposearch ---
        analysis_result = generate_news_analysis(topic)
        if not analysis_result or not analysis_result["content"]:
            print(f"Skipping topic {i} due to failed analysis from elixposearch.")
            # Save progress up to the *start* of this failed index
            save_progress({"news_id": current_news_id, "last_index": i}) # Save progress before failed index
            continue # Skip to the next topic

        detailed_info = analysis_result["content"]
        news_source_links = analysis_result["sources"] # Get sources here

        # --- Step 1.2: Generate script (using a text model) ---
        script = generate_news_script(detailed_info)
        if not script:
            print(f"Skipping topic {i} due to failed script generation.")
             # Save progress up to the *start* of this failed index
            save_progress({"news_id": current_news_id, "last_index": i})
            continue # Skip to the next topic

        # --- Step 1.3: Generate voiceover ---
        voice_to_use = voices[i % len(voices)]
        voice_url = generate_voiceover(script, current_news_id, i, voice_to_use)
        if not voice_url:
            print(f"Skipping topic {i} due to failed voiceover generation.")
             # Save progress up to the *start* of this failed index
            save_progress({"news_id": current_news_id, "last_index": i})
            continue # Skip to the next topic

        # --- Step 1.4: Generate block image ---
        # Note: Overall banner is generated once for index 0 outside the loop
        block_image_url = generate_block_image(current_news_id, i, topic)
        if not block_image_url:
            print(f"Skipping topic {i} due to failed block image generation.")
             # Save progress up to the *start* of this failed index
            save_progress({"news_id": current_news_id, "last_index": i})
            continue # Skip to the next topic

        # --- Step 1.5: Select color theme ---
        color_theme = generate_color_theme()

        # --- Step 1.6: Save block data to Firestore ---
        timestamp = datetime.now(timezone.utc)

        # For index 0, also save the overall news info *now* that we have the script (for summary)
        # and the overall_banner_url from the step before the loop.
        if i == 0 and overall_banner_url:
             print("Saving overall news info for index 0...")
             # Use the script from the first block as the news summary
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
            image_link=block_image_url, # This is the block-specific image URL
            color_theme=color_theme,
            news_source_link=", ".join(news_source_links) # Join sources into a single string
        )

        if save_success:
            # --- Step 1.7: Save progress ---
            save_progress({"news_id": current_news_id, "last_index": i + 1})
        else:
            print(f"❌ Failed to save block {i} to Firestore. Progress remains at index {i} for retry.")
            # Progress is not saved for this index, so it will be re-attempted on resume.
            # This is intended behavior for resuming after a save failure.

        # Optional: Add a small delay between processing topics to be polite to APIs
        time.sleep(1)

    print("\n--- News Generation Process Finished ---")
    # Check if the last attempted index matches the number of topics we planned to process.
    # If so, consider the batch complete and clear progress.
    final_progress = load_progress() # Load latest state
    # Check if the batch ID is still the one we were working on and if the last_index >= num_topics
    if final_progress.get("news_id") == current_news_id and final_progress.get("last_index", 0) >= num_topics:
         print(f"✅ All {num_topics} topics attempted for batch {current_news_id}. Clearing progress.")
         save_progress({}) # Clear progress to start a new batch next time
    else:
         print(f"ℹ️ Process finished, but not all topics ({final_progress.get('last_index', 0)}/{num_topics}) were successfully processed in this run for batch {current_news_id}. Progress saved for resume.")


# --- Execution Start ---
if __name__ == "__main__":
    getFullNewsInfo()