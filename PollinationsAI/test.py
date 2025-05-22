import requests
import urllib.parse

prompt = '''
    A bright, sunny rural village scene during a daytime community health camp. In the foreground, a young female medical student with expressive eyes and precise hand gestures (holding a clipboard or stethoscope) is attentively interacting with a smiling elder villager. Around her, several other medical students (diverse genders) in white coats are seen engaging with villagers — checking blood pressure, writing notes, handing out medicine — creating a warm, collaborative vibe. Children and families observe nearby with curiosity. In the background, a makeshift medical tent or banner flutters gently, with ongoing check-ups slightly blurred for cinematic depth. Lighting is clean and natural, with high detail on hands, eyes, and expressions — no sepia or vintage filters. The environment is full of life: earthy paths, bright clothes, clear skies, and human connection.
'''
params = {
    "width": 1024,
    "height": 720,
    "seed": 545451510,
    "model": "gptimage",
    "nologo": "true",
    "token": "elixpoart",
}
encoded_prompt = urllib.parse.quote(prompt)
url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"

try:
    response = requests.get(url, params=params, timeout=300) 
    response.raise_for_status() 

    with open('generated_image.jpg', 'wb') as f:
        f.write(response.content)
    print("Image saved as generated_image2.jpg")

except requests.exceptions.RequestException as e:
    print(f"Error fetching image: {e}")
    
    