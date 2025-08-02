import base64
import requests

def image_url_to_base64(image_url):
    response = requests.get(image_url)
    response.raise_for_status()
    return base64.b64encode(response.content).decode('utf-8')


def generate_image_query(url):
    image_base64 = image_url_to_base64(url)
    api_url = "https://text.pollinations.ai/openai"
    headers = {
        "Content-Type": "application/json"
    }

    detailed_instruction = (
        "Describe the contents of this image in the form of a natural, short human-like search query. "
        "Include as much detail as possible: setting, objects, people, text, signs, brands, logos, style "
        "would type into a search engine to find similar images. Prioritize clarity, descriptive precision, and keywords "
        "likely to improve search relevance."
        "Keep the prompt short and relevant, no need for huge long descriptions, just focus on the key elements that would help in searching for similar images."
    )

    data = {
        "model": "openai",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": detailed_instruction},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
                ]
            }
        ],
        "token": "fEWo70t94146ZYgk",
        "max_tokens": 100
    }

    response = requests.post(api_url, headers=headers, json=data)
    response.raise_for_status()

    return response.json()

# Example usage
if __name__ == "__main__":
    result = generate_image_query("https://example.com/test.jpg")
    print("Generated Search Query:\n", result['choices'][0]['message']['content'].strip())
