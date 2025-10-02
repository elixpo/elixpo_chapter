from multiprocessing.managers import BaseManager
from sentence_transformers import SentenceTransformer, util
import torch, threading
from concurrent.futures import ThreadPoolExecutor
from loguru import logger
from playwright.async_api import async_playwright  #type: ignore
import random


USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
]

class ipcModules:
    def __init__(self, start_port=9000, end_port=9999):
        logger.info("Loading embedding model...")
        self.model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = self.model.to(self.device)
        self.start_port = start_port
        self.end_port = end_port
        self.used_ports = set()
        logger.info(f"Model loaded on device: {self.device}")
        self.executor = ThreadPoolExecutor(max_workers=2)
        self._gpu_lock = threading.Lock()
        self._operation_semaphore = threading.Semaphore(2)

    def encodeSemantic(self, data: list[str], query: str):
        data_embedding = self.model.encode(data, convert_to_tensor=True)
        query_embedding = self.model.encode([query], convert_to_tensor=True)
        return data_embedding.cpu().numpy(), query_embedding.cpu().numpy()

    def cosineScore(self, query_embedding, data_embedding, k=3):
        query_tensor = torch.tensor(query_embedding)
        data_tensor = torch.tensor(data_embedding)
        cosine_scores = util.cos_sim(query_tensor, data_tensor)[0]
        top_k = torch.topk(cosine_scores, k=k)
        return [(int(idx), float(score)) for score, idx in zip(top_k.values, top_k.indices)]
    
    def get_port(self):
        with self.lock:
            for _ in range(100):  
                port = random.randint(self.start_port, self.end_port)
                if port not in self.used_ports:
                    self.used_ports.add(port)
                    print(f"[PORT] Allocated port {port}. Active ports: {len(self.used_ports)}")
                    return port
            
            # If random selection fails, try sequential search
            for port in range(self.start_port, self.end_port + 1):
                if port not in self.used_ports:
                    self.used_ports.add(port)
                    print(f"[PORT] Allocated port {port} (sequential). Active ports: {len(self.used_ports)}")
                    return port
            
            raise Exception(f"No available ports in range {self.start_port}-{self.end_port}")
        
    def release_port(self, port):
        with self.lock:
            if port in self.used_ports:
                self.used_ports.remove(port)
                print(f"[PORT] Released port {port}. Active ports: {len(self.used_ports)}")
            else:
                print(f"[PORT] Warning: Attempted to release port {port} that wasn't tracked")

    

if __name__ == "__main__":
    class modelManager(BaseManager): pass
    modelManager.register("EmbeddingService", ipcModules)

    manager = modelManager(address=("localhost", 5002), authkey=b"embedding")
    server = manager.get_server()
    logger.info("Starting embedding service on port 5002...")
    server.serve_forever()
