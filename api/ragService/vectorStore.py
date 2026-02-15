from loguru import logger 
import torch
import chromadb
from pathlib import Path
import threading
import numpy as np
from pipeline.config import EMBEDDING_DIMENSION
from typing import List, Dict
from datetime import datetime
import os
from chromadb.telemetry.product import ProductTelemetryClient, ProductTelemetryEvent
from overrides import override


class NoOpProductTelemetry(ProductTelemetryClient):
    @override
    def capture(self, event: ProductTelemetryEvent) -> None:
        return


class VectorStore:
    def __init__(self, embedding_dim: int = None, embeddings_dir: str = "./embeddings"):
        if embedding_dim is None:
            embedding_dim = EMBEDDING_DIMENSION
        self.embedding_dim = embedding_dim
        self.embeddings_dir = embeddings_dir
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        Path(embeddings_dir).mkdir(parents=True, exist_ok=True)
        
        try:
            chroma_settings = chromadb.config.Settings(
                anonymized_telemetry=False,
                chroma_telemetry_impl="ragService.vectorStore.NoOpProductTelemetry",
                chroma_product_telemetry_impl="ragService.vectorStore.NoOpProductTelemetry",
            )
            self.client = chromadb.PersistentClient(
                path=embeddings_dir,
                settings=chroma_settings
            )
            self.collection = self.client.get_or_create_collection(
                name="document_embeddings",
                metadata={"hnsw:space": "cosine"}
            )
            logger.info(f"[VectorStore] ChromaDB collection initialized successfully on {self.device}")
        except Exception as e:
            logger.error(f"[VectorStore] Failed to initialize ChromaDB: {e}")
            raise
        
        self.chunk_count = 0
        self.lock = threading.RLock()
        
        self.metadata_path = os.path.join(embeddings_dir, "metadata.json")
        
        self._load_from_disk()
        logger.info(f"[VectorStore] Initialized with {self.chunk_count} chunks on {self.device}")
    
    def add_chunks(self, chunks: List[Dict]) -> None:
        with self.lock:
            ids = []
            embeddings = []
            documents = []
            metadatas = []
            
            for i, chunk in enumerate(chunks):
                emb = chunk["embedding"]
                if isinstance(emb, list):
                    emb = np.array(emb, dtype=np.float32)
                elif isinstance(emb, torch.Tensor):
                    emb = emb.cpu().numpy().astype(np.float32)
                else:
                    emb = np.array(emb, dtype=np.float32)
                
                emb = emb / (np.linalg.norm(emb) + 1e-8)
                
                chunk_id = str(self.chunk_count + i)
                ids.append(chunk_id)
                embeddings.append(emb.tolist())
                documents.append(chunk["text"])
                metadatas.append({
                    "url": chunk["url"],
                    "chunk_id": chunk.get("chunk_id", chunk_id),
                    "timestamp": chunk.get("timestamp", datetime.now().isoformat())
                })
                self.chunk_count += 1
            
            if ids:
                self.collection.add(
                    ids=ids,
                    embeddings=embeddings,
                    documents=documents,
                    metadatas=metadatas
                )
    
    def search(self, query_embedding: np.ndarray, top_k: int = 5) -> List[Dict]:
        with self.lock:
            if isinstance(query_embedding, torch.Tensor):
                query_embedding = query_embedding.cpu().numpy().astype(np.float32)
            else:
                query_embedding = np.array(query_embedding, dtype=np.float32)
            
            query_embedding = query_embedding / (np.linalg.norm(query_embedding) + 1e-8)
            
            results = self.collection.query(
                query_embeddings=[query_embedding.tolist()],
                n_results=min(top_k, self.chunk_count if self.chunk_count > 0 else 1)
            )
            
            output = []
            if results["ids"] and len(results["ids"]) > 0:
                for i, (doc_id, distance, metadata, document) in enumerate(
                    zip(results["ids"][0], 
                        results["distances"][0], 
                        results["metadatas"][0], 
                        results["documents"][0])
                ):
                    output.append({
                        "score": float(1 - distance),  # Convert distance to similarity
                        "metadata": {
                            **metadata,
                            "text": document
                        }
                    })
            
            return output
    
    def persist_to_disk(self) -> None:
        with self.lock:
            try:
                logger.info(f"[VectorStore] Data auto-persisted by ChromaDB to {self.embeddings_dir}")
            except Exception as e:
                logger.error(f"[VectorStore] Failed to persist: {e}")
    
    def _load_from_disk(self) -> None:
        try:
            count = self.collection.count()
            self.chunk_count = count
            if count > 0:
                logger.info(f"[VectorStore] Loaded {count} chunks from disk")
        except Exception as e:
            logger.warning(f"[VectorStore] Could not load from disk: {e}")
            self.chunk_count = 0
    
    def get_stats(self) -> Dict:
        with self.lock:
            return {
                "total_chunks": self.chunk_count,
                "device": self.device,
                "embedding_dim": self.embedding_dim
            }
    
    def search_with_cache_check(self, query_embedding: np.ndarray, top_k: int = 5, cache_similarity_threshold: float = 0.85) -> Dict:
        with self.lock:
            if isinstance(query_embedding, torch.Tensor):
                query_embedding = query_embedding.cpu().numpy().astype(np.float32)
            else:
                query_embedding = np.array(query_embedding, dtype=np.float32)
            
            query_embedding = query_embedding / (np.linalg.norm(query_embedding) + 1e-8)
            
            results = self.collection.query(
                query_embeddings=[query_embedding.tolist()],
                n_results=min(top_k, self.chunk_count if self.chunk_count > 0 else 1)
            )
            
            output = []
            similarities = []
            
            if results["ids"] and len(results["ids"]) > 0:
                for i, (doc_id, distance, metadata, document) in enumerate(
                    zip(results["ids"][0], 
                        results["distances"][0], 
                        results["metadatas"][0], 
                        results["documents"][0])
                ):
                    similarity = float(1 - distance)
                    similarities.append(similarity)
                    output.append({
                        "score": similarity,
                        "metadata": {
                            **metadata,
                            "text": document
                        }
                    })
            
            best_match_similarity = similarities[0] if similarities else 0.0
            avg_similarity = sum(similarities) / len(similarities) if similarities else 0.0
            cache_hit = best_match_similarity >= cache_similarity_threshold
            
            return {
                'results': output,
                'cache_hit': cache_hit,
                'avg_similarity': avg_similarity,
                'best_match_similarity': best_match_similarity
            }
