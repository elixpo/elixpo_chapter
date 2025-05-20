import requests
import urllib.parse

prompt = '''
    A chaotic cyberpunk street scene at night, drenched in rain. Multiple neon signs display flickering text in English, Japanese, and Arabic, with one sign reading “未来都市” (Future City) in glowing blue kanji. A crowded marketplace with street vendors selling glowing tech gadgets, holographic menus floating above their stalls showing scrolling prices and animated icons. The crowd is a mix of humans wearing futuristic clothing and androids with transparent limbs revealing glowing circuitry inside. Reflections of neon text and colorful umbrellas shimmer on puddles of water on cracked asphalt. In the background, a large billboard features a pixelated retro video game character alongside glitchy QR codes and scrolling ticker text in multiple languages. Flying drones buzz overhead with blinking red and green lights. Smoke from street food grills curls into the air, blending with fog illuminated by multicolor lasers from nearby clubs. Include graffiti tags on walls in stylized Latin and Cyrillic scripts, with one tag reading “Resistance” in dripping red paint.
'''
params = {
    "width": 1280,
    "height": 720,
    "seed": 42,
    "model": "gptimage",
    "nologo": "true", # Optional
    "referrer": "elixpoart" # Optional
}
encoded_prompt = urllib.parse.quote(prompt)
url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"

try:
    response = requests.get(url, params=params, timeout=300) # Increased timeout for image generation
    response.raise_for_status() # Raise an exception for bad status codes

    with open('generated_image.jpg', 'wb') as f:
        f.write(response.content)
    print("Image saved as generated_image.jpg")

except requests.exceptions.RequestException as e:
    print(f"Error fetching image: {e}")
    # Consider checking response.text for error messages from the API
    # if response is not None: print(response.text)