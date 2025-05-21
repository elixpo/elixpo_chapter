import requests
import urllib.parse

prompt = '''
    your prompt goes here
'''
params = {
    "width": 1280,
    "height": 720,
    "seed": 42,
    "model": "flux",
    "nologo": "false", #true to remove the logo 
    "token": "your token",
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
    
    