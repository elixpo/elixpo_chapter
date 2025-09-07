from multiprocessing import Process, Pipe
from textEmbedModel import get_embedding_model, fast_web_search_with_embeddings
import asyncio

def worker_process(conn):
    model = get_embedding_model()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    while True:
        try:
            msg = conn.recv()
            if msg["cmd"] == "search":
                query = msg["query"]
                max_chars = msg.get("max_chars", 2000)
                result, urls = loop.run_until_complete(
                    fast_web_search_with_embeddings(query, model, max_chars=max_chars)
                )
                conn.send({"result": result, "urls": urls})
            elif msg["cmd"] == "exit":
                break
        except Exception as e:
            conn.send({"error": str(e)})
    conn.close()