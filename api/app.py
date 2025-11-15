from quart import Quart, request, jsonify
import asyncio
import aiohttp
import base64
import io
import os
import glob
from PIL import Image
from loguru import logger
import time
from esrgan import upscale_b64
import threading
from concurrent.futures import ThreadPoolExecutor

app = Quart(__name__)

# Configuration
MAX_FILE_SIZE = 7 * 1024 * 1024  
MAX_IMAGE_DIMENSION = 2048 
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'bmp'}
CLEANUP_INTERVAL = 300  #in seconds has been counted
FILE_MAX_AGE = 300  #in seconds has been counted

executor = ThreadPoolExecutor(max_workers=10)

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
cleanup_task = None
cleanup_running = True

async def cleanup_old_files():
    global cleanup_running
    logger.info("Starting cleanup background task...")
    
    while cleanup_running:
        try:
            current_time = time.time()
            files_pattern = os.path.join(UPLOAD_FOLDER, "*")
            files_to_check = glob.glob(files_pattern)
            
            deleted_count = 0
            for file_path in files_to_check:
                try:
                    if os.path.isdir(file_path):
                        continue
                    
                    
                    file_mtime = os.path.getmtime(file_path)
                    file_age = current_time - file_mtime
                    
                    if file_age > FILE_MAX_AGE:
                        os.remove(file_path)
                        deleted_count += 1
                        logger.debug(f"Deleted old file: {file_path} (age: {file_age:.1f}s)")
                        
                except OSError as e:
                    logger.warning(f"Failed to delete file {file_path}: {e}")
                    
            if deleted_count > 0:
                logger.info(f"Cleanup completed: deleted {deleted_count} old files")
                
        except Exception as e:
            logger.error(f"Cleanup task error: {e}")
        
        # Wait for next cleanup cycle
        await asyncio.sleep(CLEANUP_INTERVAL)

@app.before_serving
async def startup():
    global cleanup_task
    cleanup_task = asyncio.create_task(cleanup_old_files())
    logger.info("Background cleanup task started")

@app.after_serving
async def shutdown():
    global cleanup_running, cleanup_task
    cleanup_running = False
    
    if cleanup_task:
        try:
            cleanup_task.cancel()
            await cleanup_task
        except asyncio.CancelledError:
            logger.info("Cleanup task cancelled")
        except Exception as e:
            logger.error(f"Error stopping cleanup task: {e}")
    
    logger.info("Background tasks stopped")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_image_size_from_base64(b64_string):
    try:
        decoded = base64.b64decode(b64_string)
        return len(decoded)
    except Exception:
        return 0

def get_image_dimensions(img):
    return img.size  

async def download_image(url: str) -> bytes:
    try:
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise Exception(f"HTTP {response.status}: Failed to download image")
                
                content_length = response.headers.get('content-length')
                if content_length and int(content_length) > MAX_FILE_SIZE:
                    raise Exception(f"Image too large: {content_length} bytes (max: {MAX_FILE_SIZE})")
                
                data = b""
                async for chunk in response.content.iter_chunked(8192):
                    data += chunk
                    if len(data) > MAX_FILE_SIZE:
                        raise Exception(f"Image too large: {len(data)} bytes (max: {MAX_FILE_SIZE})")
                
                return data
    except asyncio.TimeoutError:
        raise Exception("Timeout downloading image")
    except Exception as e:
        raise Exception(f"Failed to download image: {str(e)}")

def validate_and_prepare_image(image_data: bytes):
    try:
        if len(image_data) > MAX_FILE_SIZE:
            raise Exception(f"Image too large: {len(image_data)} bytes (max: {MAX_FILE_SIZE})")
        img = Image.open(io.BytesIO(image_data))
        width, height = img.size
        
        
        if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
            raise Exception(f"Image dimensions too large: {width}x{height} (max: {MAX_IMAGE_DIMENSION})")
        
        
        b64_string = base64.b64encode(image_data).decode()
        
        return b64_string, width, height, img.format
    except Exception as e:
        raise Exception(f"Invalid image: {str(e)}")

async def process_upscale(b64_image: str, scale: int):
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(executor, upscale_b64, b64_image, scale)
        return result
    except Exception as e:
        logger.error(f"Upscaling error: {e}")
        raise

@app.route('/upscale', methods=['POST', 'GET'])
async def upscale_endpoint():
    try:
        data = await request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        img_url = data.get('img_url')
        scale = data.get('scale', 2)
        
        if scale not in [2, 4]:
            return jsonify({"error": "Scale must be 2 or 4"}), 400
        
        if not img_url:
            return jsonify({"error": "img_url is required"}), 400
        
        if not isinstance(img_url, str) or not (img_url.startswith('http://') or img_url.startswith('https://')):
            return jsonify({"error": "Invalid img_url format"}), 400
        
        start_time = time.time()
        
        try:
            logger.info(f"Downloading image from: {img_url}")
            image_data = await download_image(img_url)
        except Exception as e:
            logger.error(f"Download failed: {e}")
            return jsonify({"error": str(e)}), 400

        try:
            b64_image, width, height, img_format = validate_and_prepare_image(image_data)
            logger.info(f"Image validated: {width}x{height}, format: {img_format}, size: {len(image_data)} bytes")
        except Exception as e:
            logger.error(f"Image validation failed: {e}")
            return jsonify({"error": str(e)}), 400
        
        b64_size = get_image_size_from_base64(b64_image)
        if b64_size > MAX_FILE_SIZE:
            return jsonify({
                "error": f"Image too large for upscaling: {b64_size} bytes (max: {MAX_FILE_SIZE})",
                "original_size": {"width": width, "height": height, "bytes": len(image_data)}
            }), 400
        
        
        estimated_output_size = len(image_data) * (scale ** 2)
        if estimated_output_size > MAX_FILE_SIZE * 2:  
            return jsonify({
                "error": f"Upscaled image would be too large: ~{estimated_output_size} bytes",
                "original_size": {"width": width, "height": height, "bytes": len(image_data)},
                "scale": scale
            }), 400
        
        
        try:
            logger.info(f"Starting upscaling: {width}x{height} -> {width*scale}x{height*scale}")
            result = await process_upscale(b64_image, scale)
            
            processing_time = time.time() - start_time
            logger.info(f"Upscaling completed in {processing_time:.2f}s")
            
            return jsonify({
                "success": True,
                "file_path": result["file_path"],
                "base64": result["base64"],
                "original_size": {
                    "width": width,
                    "height": height,
                    "bytes": len(image_data)
                },
                "upscaled_size": {
                    "width": width * scale,
                    "height": height * scale,
                    "scale": scale
                },
                "processing_time": round(processing_time, 2)
            })
            
        except Exception as e:
            logger.error(f"Upscaling failed: {e}")
            return jsonify({"error": f"Upscaling failed: {str(e)}"}), 500
        
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/health', methods=['GET'])
async def health_check():
    return jsonify({
        "status": "healthy",
        "timestamp": time.time(),
        "max_file_size_mb": MAX_FILE_SIZE / 1024 / 1024,
        "max_dimension": MAX_IMAGE_DIMENSION,
        "supported_scales": [2, 4],
        "cleanup_interval_minutes": CLEANUP_INTERVAL / 60,
        "file_max_age_minutes": FILE_MAX_AGE / 60
    })

@app.route('/status', methods=['GET'])
async def status():
    from esrgan import MODEL_SERVERS
    upload_stats = {"total_files": 0, "total_size_mb": 0}
    try:
        files_pattern = os.path.join(UPLOAD_FOLDER, "*")
        files = glob.glob(files_pattern)
        upload_stats["total_files"] = len([f for f in files if os.path.isfile(f)])
        total_size = sum(os.path.getsize(f) for f in files if os.path.isfile(f))
        upload_stats["total_size_mb"] = round(total_size / 1024 / 1024, 2)
    except Exception as e:
        logger.warning(f"Error getting upload stats: {e}")
    
    return jsonify({
        "status": "running",
        "model_servers": len(MODEL_SERVERS),
        "thread_pool_workers": executor._max_workers,
        "supported_formats": list(ALLOWED_EXTENSIONS),
        "cleanup_task_running": cleanup_running,
        "upload_folder_stats": upload_stats,
        "limits": {
            "max_file_size_mb": MAX_FILE_SIZE / 1024 / 1024,
            "max_dimension": MAX_IMAGE_DIMENSION,
            "cleanup_interval_minutes": CLEANUP_INTERVAL / 60,
            "file_max_age_minutes": FILE_MAX_AGE / 60
        }
    })

@app.route('/cleanup', methods=['POST'])
async def manual_cleanup():
    try:
        current_time = time.time()
        files_pattern = os.path.join(UPLOAD_FOLDER, "*")
        files_to_check = glob.glob(files_pattern)
        
        deleted_count = 0
        errors = []
        
        for file_path in files_to_check:
            try:
                if os.path.isdir(file_path):
                    continue
                
                file_mtime = os.path.getmtime(file_path)
                file_age = current_time - file_mtime
                
                if file_age > FILE_MAX_AGE:
                    os.remove(file_path)
                    deleted_count += 1
                    
            except OSError as e:
                errors.append(f"Failed to delete {file_path}: {e}")
        
        return jsonify({
            "success": True,
            "deleted_files": deleted_count,
            "errors": errors
        })
        
    except Exception as e:
        return jsonify({"error": f"Manual cleanup failed: {str(e)}"}), 500

if __name__ == '__main__':
    logger.info("Starting Quart application...")
    app.run(host='0.0.0.0', port=8000, debug=False, workers=4)