import torch
import numpy as np
from PIL import Image
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer
import base64
import io
import os
import time
import requests

# -------------------------------
# Ensure Model Directory Exists
# -------------------------------
MODEL_DIR = "models"
os.makedirs(MODEL_DIR, exist_ok=True)

MODEL_PATH = os.path.join(MODEL_DIR, "RealESRGAN_x4plus.pth")

# -------------------------------
# Auto Download Model if Missing
# -------------------------------
def download_model():
    if not os.path.exists(MODEL_PATH):
        print("Downloading Real-ESRGAN model...")
        url = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.3.0/RealESRGAN_x4plus.pth"

        response = requests.get(url, stream=True)
        with open(MODEL_PATH, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        print("Model downloaded successfully:", MODEL_PATH)

download_model()

# -------------------------------
# Device
# -------------------------------
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

# -------------------------------
# Load Real-ESRGAN Model
# -------------------------------
state_dict = torch.load(MODEL_PATH, map_location=device)['params_ema']

model = RRDBNet(
    num_in_ch=3,
    num_out_ch=3,
    num_feat=64,
    num_block=23,
    num_grow_ch=32,
    scale=4
)
model.load_state_dict(state_dict, strict=False)
model = model.to(device)

upsampler = RealESRGANer(
    scale=4,
    model_path=MODEL_PATH,
    model=model,
    tile=512,
    tile_pad=10,
    pre_pad=10,
    half=True,
    device=device
)

# -------------------------------
# Base64 Encoder/Decoder
# -------------------------------
def b64_to_image(b64_string):
    decoded = base64.b64decode(b64_string)
    buffer = io.BytesIO(decoded)
    img = Image.open(buffer).convert("RGB")
    return img

def image_to_b64(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    b64_output = base64.b64encode(buffer.getvalue()).decode()
    return b64_output

# -------------------------------
# Main Upscale Function
# -------------------------------
def upscale_b64(b64_image):
    # Decode input
    input_image = b64_to_image(b64_image)

    # Run ESRGAN
    img_np = np.array(input_image, dtype=np.uint8)
    output_np, _ = upsampler.enhance(img_np, outscale=4)

    # Convert to image
    output_img = Image.fromarray(output_np)

    # Save file
    output_path = f"uploads/upscaled_{int(time.time())}.png"
    os.makedirs("uploads", exist_ok=True)
    output_img.save(output_path)

    # Convert to base64
    output_b64 = image_to_b64(output_img)

    return {
        "file_path": output_path,
        "base64": output_b64
    }

# -------------------------------
# Example Usage
# -------------------------------
if __name__ == "__main__":
    # test by reading a local file and encoding to b64
    with open("test.png", "rb") as f:
        b64_input = base64.b64encode(f.read()).decode()

    result = upscale_b64(b64_input)

    print("Image saved at:", result["file_path"])
    print("Base64 output (first 200 chars):", result["base64"][:200])
