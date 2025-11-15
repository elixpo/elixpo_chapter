from multiprocessing.managers import BaseManager
import threading
from concurrent.futures import ThreadPoolExecutor
import time
import sys
import os
import signal
import numpy as np
from basicsr.archs.rrdbnet_arch import RRDBNet
from config import MODEL_PATH_x2, MODEL_PATH_x4
from realesrgan import RealESRGANer
import torch
from loguru import logger

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
use_half = torch.cuda.is_available()

class ipcModules:
    def __init__(self):
        logger.info("Loading upscaler models...")
        model_x2 = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
        model_x4 = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)

        self.upsampler_x4 = RealESRGANer(
            scale=4,
            model_path=MODEL_PATH_x4,
            model=model_x4,
            tile=512,
            tile_pad=10,
            pre_pad=0,
            half=use_half,
            device=device
        )
        self.upsampler_x2 = RealESRGANer(
            scale=2,
            model_path=MODEL_PATH_x2,
            model=model_x2,
            tile=512,
            tile_pad=10,
            pre_pad=0,
            half=use_half,
            device=device
        )
        logger.info("Models loaded successfully")

    def enhance_x2(self, img_array, outscale=2):
        try:
            return self.upsampler_x2.enhance(img_array, outscale=outscale)
        except Exception as e:
            logger.error(f"Error in x2 enhancement: {e}")
            raise

    def enhance_x4(self, img_array, outscale=4):
        try:
            return self.upsampler_x4.enhance(img_array, outscale=outscale)
        except Exception as e:
            logger.error(f"Error in x4 enhancement: {e}")
            raise

    def get_upsampler_x2(self):
        return self.upsampler_x2
    
    def get_upsampler_x4(self):
        return self.upsampler_x4

def shutdown_graceful():
    logger.info("Shutting down model server gracefully...")
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        logger.info("GPU memory cleared")

def signal_handler(signum, frame):
    logger.info(f"Received signal {signum}, shutting down...")
    shutdown_graceful()
    os._exit(0)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5002
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    class modelManager(BaseManager): 
        pass
    
    modelManager.register("ipcService", ipcModules)
    manager = modelManager(address=("localhost", port), authkey=b"ipcService")
    server = manager.get_server()
    
    logger.info(f"Starting model server on port {port}")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server stopped by user.")
    except Exception as e:
        logger.error(f"Server error: {e}")
    finally:
        shutdown_graceful()
        logger.info("Shutdown complete.")
