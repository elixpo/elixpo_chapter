import numpy as np
from loguru import logger
from sentence_transformers import SentenceTransformer
import torch
import threading
from typing import List, Union
import warnings
import os 
from loguru import logger
import logging

warnings.filterwarnings('ignore', message='Can\'t initialize NVML')
os.environ['CHROMA_TELEMETRY_DISABLED'] = '1'
logging.getLogger('chromadb').setLevel(logging.ERROR)

class EmbeddingService:
    def __init__(self, model_name: str = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"[EmbeddingService] Loading model on {self.device}...")
        
        self.model = SentenceTransformer(model_name)
        self.model = self.model.to(self.device)
        
        self.lock = threading.Lock()
        logger.info(f"[EmbeddingService] Model loaded: {model_name}")
    
    def embed(self, texts: Union[str, List[str]], batch_size: int = 32) -> np.ndarray:
        with self.lock:
            if isinstance(texts, str):
                texts = [texts]
            
            embeddings = self.model.encode(
                texts,
                batch_size=batch_size,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
                device=self.device
            )
            
            return embeddings
    
    def embed_single(self, text: str) -> np.ndarray:
        with self.lock:
            embedding = self.model.encode(
                text,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
                device=self.device
            )
            return embedding

