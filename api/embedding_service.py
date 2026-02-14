from sentence_transformers import SentenceTransformer
import torch
import numpy as np
from loguru import logger
from typing import List, Union, Dict, Tuple, Optional
import threading
import faiss
import json
import os
from datetime import datetime
from pathlib import Path


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

class VectorStore:
    def __init__(self, embedding_dim: int = 384, embeddings_dir: str = "./embeddings"):
        self.embedding_dim = embedding_dim
        self.embeddings_dir = embeddings_dir
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        Path(embeddings_dir).mkdir(parents=True, exist_ok=True)
        
        self.index = faiss.IndexFlatIP(embedding_dim)
        if self.device == "cuda":
            self.index = faiss.index_cpu_to_gpu(faiss.StandardGpuResources(), 0, self.index)
        
        self.metadata = []
        self.chunk_count = 0
        self.lock = threading.RLock()
        
        self.index_path = os.path.join(embeddings_dir, "faiss_index.bin")
        self.metadata_path = os.path.join(embeddings_dir, "metadata.json")
        
        self._load_from_disk()
        logger.info(f"[VectorStore] Initialized with {self.chunk_count} chunks on {self.device}")
    
    def add_chunks(self, chunks: List[Dict]) -> None:
        with self.lock:
            embeddings = []
            new_metadata = []
            
            for chunk in chunks:
                emb = chunk["embedding"]
                if isinstance(emb, list):
                    emb = np.array(emb, dtype=np.float32)
                elif isinstance(emb, torch.Tensor):
                    emb = emb.cpu().numpy().astype(np.float32)
                else:
                    emb = np.array(emb, dtype=np.float32)
                
                emb = emb / (np.linalg.norm(emb) + 1e-8)
                embeddings.append(emb)
                
                new_metadata.append({
                    "url": chunk["url"],
                    "chunk_id": chunk.get("chunk_id", self.chunk_count),
                    "text": chunk["text"],
                    "timestamp": chunk.get("timestamp", datetime.now().isoformat())
                })
                self.chunk_count += 1
            
            if embeddings:
                embeddings_array = np.array(embeddings, dtype=np.float32)
                self.index.add(embeddings_array)
                self.metadata.extend(new_metadata)
    
    def search(self, query_embedding: np.ndarray, top_k: int = 5) -> List[Dict]:
        with self.lock:
            if isinstance(query_embedding, torch.Tensor):
                query_embedding = query_embedding.cpu().numpy().astype(np.float32)
            else:
                query_embedding = np.array(query_embedding, dtype=np.float32)
            
            query_embedding = query_embedding / (np.linalg.norm(query_embedding) + 1e-8)
            query_embedding = query_embedding.reshape(1, -1)
            
            distances, indices = self.index.search(query_embedding, min(top_k, self.index.ntotal))
            
            results = []
            for i, idx in enumerate(indices[0]):
                if idx >= 0 and idx < len(self.metadata):
                    results.append({
                        "score": float(distances[0][i]),
                        "metadata": self.metadata[idx]
                    })
            
            return results
    
    def persist_to_disk(self) -> None:
        with self.lock:
            try:
                if self.device == "cuda":
                    cpu_index = faiss.index_gpu_to_cpu(self.index)
                    faiss.write_index(cpu_index, self.index_path)
                else:
                    faiss.write_index(self.index, self.index_path)
                
                with open(self.metadata_path, "w") as f:
                    json.dump(self.metadata, f)
                
                logger.info(f"[VectorStore] Persisted {self.chunk_count} chunks to {self.embeddings_dir}")
            except Exception as e:
                logger.error(f"[VectorStore] Failed to persist: {e}")
    
    def _load_from_disk(self) -> None:
        try:
            if os.path.exists(self.index_path) and os.path.exists(self.metadata_path):
                index = faiss.read_index(self.index_path)
                
                if self.device == "cuda":
                    self.index = faiss.index_cpu_to_gpu(faiss.StandardGpuResources(), 0, index)
                else:
                    self.index = index
                
                with open(self.metadata_path, "r") as f:
                    self.metadata = json.load(f)
                
                self.chunk_count = len(self.metadata)
                logger.info(f"[VectorStore] Loaded {self.chunk_count} chunks from disk")
        except Exception as e:
            logger.warning(f"[VectorStore] Could not load from disk: {e}")
    
    def get_stats(self) -> Dict:
        with self.lock:
            return {
                "total_chunks": self.chunk_count,
                "device": self.device,
                "embedding_dim": self.embedding_dim
            }
