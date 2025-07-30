import open_clip
import torch
from torchvision import transforms
import torch.nn.functional as F
from PIL import Image
import requests
from io import BytesIO

device = "cuda" if torch.cuda.is_available() else "cpu"
model_path = "model/model_openclip.bin"
model, _, preprocess = open_clip.create_model_and_transforms(
    'ViT-B-32',
    pretrained=model_path
)
model = model.to(device).eval()



def load_image(image_url_or_pil):
    try:
        if isinstance(image_url_or_pil, str):
            headers = {"User-Agent": "Mozilla/5.0"}  # prevent 403 errors
            response = requests.get(image_url_or_pil, headers=headers, timeout=10)
            response.raise_for_status()

            # Use BytesIO for image loading
            image = Image.open(BytesIO(response.content)).convert("RGB")
        else:
            image = image_url_or_pil.convert("RGB")

        return preprocess(image).unsqueeze(0).to(device)

    except (requests.RequestException) as e:
        print(f"[ERROR] Failed to load image: {e}")
        return None

def find_similarity(image1_tensor, image2_tensor):
    if image1_tensor is None or image2_tensor is None:
        return None

    with torch.no_grad():
        f1 = model.encode_image(image1_tensor)
        f2 = model.encode_image(image2_tensor)

    f1 = f1 / f1.norm(dim=-1, keepdim=True)
    f2 = f2 / f2.norm(dim=-1, keepdim=True)
    return F.cosine_similarity(f1, f2).item()


img1 = load_image("https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/640px-PNG_transparency_demonstration_1.png")
img2 = load_image("https://media.istockphoto.com/id/1861010855/photo/full-length-shot-of-a-ballerina-dancing-and-leaning-backwards.jpg?s=612x612&w=0&k=20&c=UbuYC3wOp9-V67SBYzZCjdExrMYMRdHJYjGE4Y-492o=")

similarity = find_similarity(img1, img2)
print(f"🔍 Cosine Similarity: {similarity:.4f}")



