import open_clip
import os
import uuid
import shutil
import stat
import base64
import requests
import torch
from PIL import Image
from io import BytesIO
from urllib.parse import quote
from torchvision import transforms
import torch.nn.functional as F
import asyncio
from playwright.async_api import async_playwright


# Set device
device = "cuda" if torch.cuda.is_available() else "cpu"

# Load model
model_path = "model/model_openclip.bin"
model, _, preprocess = open_clip.create_model_and_transforms(
    'ViT-B-32',
    pretrained=model_path
)
model = model.to(device).eval()


# -------------------- Utility Functions -------------------- #

def load_image(image_path_or_pil):
    if isinstance(image_path_or_pil, str):
        image = Image.open(image_path_or_pil).convert("RGB")
    else:
        image = image_path_or_pil.convert("RGB")
    return preprocess(image).unsqueeze(0).to(device)


def find_similarity(image1_tensor, image2_tensor):
    with torch.no_grad():
        f1 = model.encode_image(image1_tensor)
        f2 = model.encode_image(image2_tensor)

    f1 = f1 / f1.norm(dim=-1, keepdim=True)
    f2 = f2 / f2.norm(dim=-1, keepdim=True)
    return F.cosine_similarity(f1, f2).item()


def image_url_to_base64(image_url):
    response = requests.get(image_url)
    response.raise_for_status()
    return base64.b64encode(response.content).decode('utf-8')


def generate_prompt_from_image(image_url):
    image_base64 = image_url_to_base64(image_url)
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
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
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


# -------------------- Google Image Scraper -------------------- #

class GoogleImageSearchAgent:
    def __init__(self, session_id):
        self.session_id = session_id
        self.save_dir = os.path.join("surfedImages", session_id)
        self.user_data_dir = f"playwright_user_data_{session_id}"
        self.playwright = None
        self.browser = None
        os.makedirs(self.save_dir, exist_ok=True)

    async def start(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch_persistent_context(
            user_data_dir=self.user_data_dir,
            headless=True,
            args=["--remote-debugging-port=9222", "--disable-blink-features=AutomationControlled"],
            viewport={'width': 1280, 'height': 800},
            locale="en-US",
        )

    async def close(self):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        if os.path.exists(self.user_data_dir):
            shutil.rmtree(self.user_data_dir, onerror=self.remove_readonly)

    def remove_readonly(self, func, path, excinfo):
        os.chmod(path, stat.S_IWRITE)
        func(path)

    def save_base64_image(self, base64_str, filename):
        if base64_str.startswith("data:image"):
            _, encoded = base64_str.split(",", 1)
            img_data = base64.b64decode(encoded)
            with open(filename, "wb") as f:
                f.write(img_data)
            print(f"[✓] Saved image: {filename}")

    async def search_and_save_images(self, query, max_images=10):
        search_url = f"https://www.google.com/search?tbm=isch&q={quote(query)}"
        page = self.browser.pages[0] if self.browser.pages else await self.browser.new_page()

        await page.goto(search_url, timeout=60000)
        await page.wait_for_selector('.ob5Hkd', timeout=15000)
        await page.mouse.wheel(0, 3000)
        await page.wait_for_timeout(2000)

        elements = await page.query_selector_all('.ob5Hkd > a > div > div > div > g-img > img')
        print(f"[INFO] Found {len(elements)} <img> elements.")

        count = 0
        for i, el in enumerate(elements):
            src = await el.get_attribute("src")
            if src and src.startswith("data:image"):
                filename = os.path.join(self.save_dir, f"image_{i+1}.jpg")
                self.save_base64_image(src, filename)
                count += 1
                if count >= max_images:
                    break


# -------------------- Session Runner -------------------- #

async def run_session(image_url):
    session_id = str(uuid.uuid4())[:8]
    print(f"\n[SESSION] ID: {session_id}")

    # Step 1: Generate Prompt
    print("[STEP 1] Generating prompt from image...")
    prompt = generate_prompt_from_image(image_url)
    print(f"[PROMPT] \"{prompt}\"")

    # Step 2: Search Google and save results
    print("[STEP 2] Searching and saving similar images...")
    agent = GoogleImageSearchAgent(session_id)
    await agent.start()
    await agent.search_and_save_images(prompt, max_images=10)
    await agent.close()

    # Step 3: Match images using OpenCLIP
    print("[STEP 3] Finding best matches using OpenCLIP...")
    ref_image_tensor = load_image(Image.open(BytesIO(requests.get(image_url).content)))

    image_files = sorted(os.listdir(agent.save_dir))
    for idx, file in enumerate(image_files):
        image_path = os.path.join(agent.save_dir, file)
        candidate_tensor = load_image(image_path)
        similarity = find_similarity(ref_image_tensor, candidate_tensor)

        if similarity >= 0.80:
            matched_path = os.path.join(agent.save_dir, f"matched_{idx+1}.jpg")
            os.rename(image_path, matched_path)
            print(f"[MATCH ✅] {file} → matched_{idx+1}.jpg (Score: {similarity:.4f})")
        else:
            print(f"[SKIPPED ❌] {file} (Score: {similarity:.4f})")

    print(f"\n✅ Session completed: {session_id}")
    print(f"🔗 Original Image URL: {image_url}")
    return session_id


image_url = "https://www.shutterstock.com/image-photo/ballerina-young-graceful-woman-ballet-600nw-2536595533.jpg" 
asyncio.run(run_session(image_url))
