import multiprocessing as mp
import sys
import os
import time
import uuid

sys.path.append(os.path.dirname(__file__))
from textEmbedModel import get_embedding_model

def worker_main(request_q, response_q):
    model = get_embedding_model()
    while True:
        req = request_q.get()
        if req is None:
            break  # Shutdown signal
        req_id, text = req
        try:
            embedding = model.encode([text])[0].tolist()
            response_q.put((req_id, embedding))
        except Exception as e:
            response_q.put((req_id, {"error": str(e)}))

if __name__ == "__main__":
    mp.set_start_method("spawn")
    manager = mp.Manager()
    request_q = manager.Queue()
    response_q = manager.Queue()
    worker_main(request_q, response_q)