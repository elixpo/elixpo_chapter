from multiprocessing.managers import BaseManager   
from functools import lru_cache
from loguru import logger



class ModelServerClient(BaseManager):
    pass
ModelServerClient.register('CoreEmbeddingService')
ModelServerClient.register('accessSearchAgents')

_model_server = None

def get_model_server():
    global _model_server
    if _model_server is None:
        try:
            _model_server = ModelServerClient(address=("localhost", 5010), authkey=b"ipcService")
            _model_server.connect()
            logger.info("[SearchPipeline] Connected to model_server via IPC")
        except Exception as e:
            logger.error(f"[SearchPipeline] Failed to connect to model_server: {e}")
            raise
    return _model_server


@lru_cache(maxsize=100)
def cached_web_search_key(query: str) -> str:
    return f"web_search_{hash(query)}"

def format_sse(event: str, data: str) -> str:
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_str}\n\n"

