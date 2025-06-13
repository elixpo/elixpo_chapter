from getNewsTopics import fetch_trending_topics
from getNewsInfo import generate_news_analysis, generate_news_script
from newsVocieOver import generate_voiceover
from bannerImageForNews import generate_visual_prompt, generate_overall_banner_image
from firebase_admin import credentials, firestore, storage
import firebase_admin
import json
import base64
from datetime import timezone, datetime
import hashlib
service_account_path = 'elixpoChatServiceKey.json'
storage_bucket_name = "notes-89337.appspot.com"
voices = ["shimmer", "dan"]

try:
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred, {"storageBucket": storage_bucket_name})
    db = firestore.client()
    bucket = storage.bucket()
    print("✅ Firebase initialized successfully.")
except Exception as e:
    print(f"❌ Failed to initialize Firebase: {e}")
    exit()


def main():
    # get the trending topics name
    trending_topics = fetch_trending_topics()
    if trending_topics:
        print("Trending topics fetched successfully:")
        now_str = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        overall_news_id = hashlib.sha256(now_str.encode()).hexdigest()[:16]
        for index,topic in enumerate(trending_topics):
            print(f"- {topic}")
            # Add some noise to the hash by including the topic and index
            noise = f"{topic}-{index}-{now_str}"
            news_id = hashlib.sha256(noise.encode()).hexdigest()[:16]
            #get the latest news on this topic
            news_info = generate_news_analysis(topic)
            # generate a script for the news
            news_response = generate_news_script(news_info)
            news_script = json.loads(news_response)
            newsScript = news_script.get("script", "")
            newsURL = news_script.get("source_link", "")
            # generate the voice for the news script
            audio_data_base64 = generate_voiceover(newsScript, topic, index, voices[index % len(voices)])
            if audio_data_base64:
                audio_data = base64.b64decode(audio_data_base64)
                output_path = f"news_{news_id}_{index}.wav"
                with open(output_path, "wb") as f:
                    f.write(audio_data)
                print(f"✅ Audio saved to {output_path}")
            #generate image for the news
            visual_prompt = generate_visual_prompt(topic)
            image_response = generate_overall_banner_image(news_id, visual_prompt)
            with open(f'banner_{news_id}.jpg', 'wb') as f:
                f.write(image_response.content)
            print(f'banner_{news_id}.jpg')
    else:
        print("No trending topics found.")


if __name__ == "__main__":
    main()
