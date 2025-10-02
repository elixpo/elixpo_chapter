from multiprocessing.managers import BaseManager
from sentence_transformers import SentenceTransformer, util
import torch, threading
from concurrent.futures import ThreadPoolExecutor
from loguru import logger

class ipcModules:
    def __init__(self):
        logger.info("Loading embedding model...")
        self.model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = self.model.to(self.device)
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

if __name__ == "__main__":
    class modelManager(BaseManager): pass
    modelManager.register("EmbeddingService", ipcModules)

    manager = modelManager(address=("localhost", 5002), authkey=b"embedding")
    server = manager.get_server()
    logger.info("Starting embedding service on port 5002...")
    server.serve_forever()
