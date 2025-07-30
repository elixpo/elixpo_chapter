import requests
import base64

def generate_prompt_from_image(imageBase64: str) -> str:
    api_url = "https://text.pollinations.ai/openai"
    headers = {"Content-Type": "application/json"}

    instruction = (
        "Describe the contents of this image in the form of a short, clear image search query. "
        "Include objects, setting, mood, people, logos, colors, style — whatever stands out. "
        "Make it search-friendly."
    )

    data = {
        "model": "openai",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imageBase64}"}}
                ]
            }
        ],
        "token": "fEWo70t94146ZYgk",
        "max_tokens": 100
    }

    response = requests.post(api_url, headers=headers, json=data)
    response.raise_for_status()
    result = response.json()
    return result["choices"][0]["message"]["content"].strip()


def image_url_to_base64(image_url):
    response = requests.get(image_url)
    response.raise_for_status()
    return base64.b64encode(response.content).decode('utf-8')





image_url = "https://www.shutterstock.com/image-photo/ballerina-young-graceful-woman-ballet-600nw-2536595533.jpg" 
image_base64 = image_url_to_base64(image_url)
prompt = generate_prompt_from_image(image_base64)
print(prompt)