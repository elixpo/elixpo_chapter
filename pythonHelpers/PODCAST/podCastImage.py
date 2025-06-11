import requests
import urllib.parse

def generate_podcast_thumbnail(prompt, podcastID):
    modifiedThumbnailPrompt = (
    f'''
    Understand the theme of the provided topic .
    Find the closest object or pose for the illustration, 
    paint in vibrant colors, and create a visually striking thumbnail.
    The thumbnail should be eye-catching, with a modern and clean design,
    with digital art format having an exclusive well understanding context with the topic 
    Thsis thumbnail should be suitable for a podcast cover, and will be a 1:1 design,
    Don't put any text on the image it must be a visual representation of the topic.
    Generate Something Soothing and appealing, no NSFW or any kind of disgusting content.
    The thumbnail should be a 1:1 square image, with a resolution of 512x512 pixels.
    Here's the topic for the thumbnail: {prompt}
    '''
    )
    params = {
        "width": 512,
        "height": 512,
        "model": "turbo",
        "seed": 56,
        "token": "fEWo70t94146ZYgk",
        "referrer": "elixpoart",
        "private": True,
        "nologo": True,
    }
    encoded_prompt = urllib.parse.quote(modifiedThumbnailPrompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"

    try:
        response = requests.get(url, params=params, timeout=300)
        response.raise_for_status()
        with open(f'podcastThumbnail_{podcastID}.jpg', 'wb') as f:
            f.write(response.content)
        print(f"✅ Thumbnail saved as podcastThumbnail_{podcastID}.jpg")
        return f'podcastThumbnail_{podcastID}'
    except requests.exceptions.RequestException as e:
        print(f"❌ Error generating thumbnail: {e}")
        return False

def generate_podcast_banner(prompt, podcastID):
    banner_prompt = (
        f"""
        Create a cinematic oil painting-style landscape banner that visually expresses the theme of: {prompt}.
        The image should be soothing, peaceful, and emotionally immersive — designed to accompany a podcast episode and provide a calming atmosphere during playback.
        Use a 16:9 aspect ratio, with a clean, balanced composition and soft brushstrokes, similar to a tranquil painting of a cozy morning room, serene nature scene, or gentle sunlight through windows.
        Emphasize a **cohesive color palette** that suits the topic emotionally — preferably colorful and inviting or nature-inspired tones.
        Avoid any text, symbols, or calligraphy. Let the imagery speak for itself through metaphor and emotion.
        The result should feel like a peaceful still moment — visually beautiful and comforting — something that helps viewers relax while listening to the podcast.
        Do not include anything frightening, unsettling, or out of place for a calm setting.
        """
    )

    params = {
        "model": "turbo",
        "seed": 56,
        "token": "fEWo70t94146ZYgk",
        "referrer": "elixpoart",
        "private": True,
        "nologo": True,
        "width": 1280,
        "height": 720,
    }
    encoded_prompt = urllib.parse.quote(banner_prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"

    try:
        response = requests.get(url, params=params, timeout=12000)
        response.raise_for_status()
        with open(f'podcastBanner_{podcastID}.jpg', 'wb') as f:
            f.write(response.content)
        print(f"✅ Banner saved as podcastBanner_{podcastID}.jpg")
        return f'podcastBanner_{podcastID}'
    except requests.exceptions.RequestException as e:
        print(f"❌ Error generating banner: {e}")


if __name__ == "__main__":
    generate_podcast_banner("Nintendo Switch 2: The new gaming era")
    # generate_podcast_thumbnail("A Quater half of life")