import open_clip
import torch
from PIL import Image
from torchvision import transforms
import requests
from io import BytesIO
import torch.nn.functional as F

device = "cuda" if torch.cuda.is_available() else "cpu"


model_path = "model/model_openclip.bin"
model, _, preprocess = open_clip.create_model_and_transforms(
    'ViT-B-32',
    pretrained=model_path  
)

model = model.to(device).eval()


def load_image(path):
    image = Image.open(path).convert("RGB")
    return preprocess(image).unsqueeze(0).to(device)



def findSimilarity(image1, image2):
    with torch.no_grad():
        f1 = model.encode_image(image1)
        f2 = model.encode_image(image2)

    f1 = f1 / f1.norm(dim=-1, keepdim=True)
    f2 = f2 / f2.norm(dim=-1, keepdim=True)
    similarity = F.cosine_similarity(f1, f2).item()


    if (max(0.8, similarity)) >= 0.8:
        print("✅ Images are similar enough!")
    elif (max(0.6, similarity)) >= 0.6:
        print("⚠️ Images are somewhat similar.")
    elif (max(0.4, similarity)) >= 0.4:
        print("❗ Images are not very similar.")
    return similarity


def load_image_from_url(url):
    response = requests.get(url)
    image = Image.open(BytesIO(response.content)).convert("RGB")
    return preprocess(image).unsqueeze(0).to(device)



if __name__ == "__main__":
    image1 = load_image_from_url("https://example.com/test1.jpg")
    image2 = load_image_from_url("https://example.com/test3.jpg")
    print("🔍 Comparing images...")
    similarity = findSimilarity(image1, image2)
    print(f"🔍 Cosine Similarity: {similarity:.4f}")
