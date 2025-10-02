from multiprocessing.managers import BaseManager
from concurrent.futures import ThreadPoolExecutor
from functools import wraps
from loguru import logger
import threading
from sentence_transformers import SentenceTransformer, util
import torch

class ipcModules:
    logger.info("Starting IPC Modules")
    def __init__(self):
        self.model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="embedding-worker")
        self._gpu_lock = threading.Lock() 
        self._operation_semaphore = threading.Semaphore(2)