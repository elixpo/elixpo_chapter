import numpy as np
from loguru import logger
from pathlib import Path
from pipeline.config import MODEL_CACHE_DIR, MODEL_LOCAL_FILES_ONLY
from sentence_transformers import SentenceTransformer
import torch
import threading
from typing import List, Union
import warnings
import os 
from loguru import logger
from commons.environment import load_local_environment

load_local_environment()
warnings.filterwarnings('ignore', message='Can\'t initialize NVML')
Path(MODEL_CACHE_DIR).mkdir(parents=True, exist_ok=True)

class EmbeddingService:
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        # Determine device with fallback strategy
        self.device = self._select_device()
        logger.info(f"[EmbeddingService] Loading model on {self.device}...")
        
        try:
            self.model = SentenceTransformer(
                model_name, 
                cache_folder=MODEL_CACHE_DIR,
                token=os.getenv("HF_TOKEN") or None,
                local_files_only=MODEL_LOCAL_FILES_ONLY,
                device=self.device
            )
        except Exception as e:
            logger.error(f"[EmbeddingService] Failed to load model on {self.device}: {e}")
            # Fallback to CPU if GPU failed
            if self.device != "cpu":
                logger.warning(f"[EmbeddingService] Retrying on CPU...")
                self.device = "cpu"
                try:
                    self.model = SentenceTransformer(
                        model_name, 
                        cache_folder=MODEL_CACHE_DIR,
                        token=os.getenv("HF_TOKEN") or None,
                local_files_only=MODEL_LOCAL_FILES_ONLY,
                        device="cpu"
                    )
                except Exception as cpu_e:
                    logger.error(f"[EmbeddingService] Failed to load model on CPU: {cpu_e}")
                    raise
            else:
                raise
        
        # Move model to device explicitly
        try:
            self.model = self.model.to(self.device)
        except Exception as e:
            logger.warning(f"[EmbeddingService] Could not move model to {self.device}: {e}, continuing anyway")
        
        self.lock = threading.Lock()
        logger.info(f"[EmbeddingService] Model loaded successfully: {model_name} on {self.device}")
    
    @staticmethod
    def _select_device() -> str:

        try:
            # Check if CUDA is available
            if torch.cuda.is_available():
                device_name = torch.cuda.get_device_name(0)
                device_count = torch.cuda.device_count()
                logger.info(f"[EmbeddingService] CUDA available: {device_count} device(s), using '{device_name}'")
                return "cuda"
        except Exception as e:
            logger.warning(f"[EmbeddingService] CUDA availability check failed: {e}")
        
        try:
            # Check if MPS (Apple Metal) is available
            if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                logger.info(f"[EmbeddingService] Apple MPS available")
                return "mps"
        except Exception as e:
            logger.debug(f"[EmbeddingService] MPS check failed: {e}")
        
        # Default to CPU
        logger.info("[EmbeddingService] Using CPU for embeddings")
        return "cpu"
    
    def embed(self, texts: Union[str, List[str]], batch_size: int = 32) -> np.ndarray:
        with self.lock:
            if isinstance(texts, str):
                texts = [texts]
            
            try:
                embeddings = self.model.encode(
                    texts,
                    batch_size=batch_size,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                    device=self.device
                )
                return embeddings
            except Exception as e:
                logger.error(f"[EmbeddingService] Embedding failed on {self.device}: {e}")
                # Try CPU as fallback if not already on CPU
                if self.device != "cpu":
                    logger.warning(f"[EmbeddingService] Retrying embeddings on CPU...")
                    try:
                        embeddings = self.model.encode(
                            texts,
                            batch_size=batch_size,
                            convert_to_numpy=True,
                            normalize_embeddings=True,
                            show_progress_bar=False,
                            device="cpu"
                        )
                        return embeddings
                    except Exception as cpu_e:
                        logger.error(f"[EmbeddingService] CPU fallback failed: {cpu_e}")
                        raise
                raise
    
    def embed_single(self, text: str) -> np.ndarray:
        with self.lock:
            try:
                embedding = self.model.encode(
                    text,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                    device=self.device
                )
                return embedding
            except Exception as e:
                logger.error(f"[EmbeddingService] Single embedding failed on {self.device}: {e}")
                # Try CPU as fallback if not already on CPU
                if self.device != "cpu":
                    logger.warning(f"[EmbeddingService] Retrying single embedding on CPU...")
                    try:
                        embedding = self.model.encode(
                            text,
                            convert_to_numpy=True,
                            normalize_embeddings=True,
                            show_progress_bar=False,
                            device="cpu"
                        )
                        return embedding
                    except Exception as cpu_e:
                        logger.error(f"[EmbeddingService] CPU fallback failed: {cpu_e}")
                        raise
                raise
