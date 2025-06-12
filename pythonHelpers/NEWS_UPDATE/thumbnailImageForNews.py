

import requests
from processNewsForTopics import POLLINATIONS_REFERRER, POLLINATIONS_TOKEN
from uploadToStorage import upload_to_storage
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