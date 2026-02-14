import warnings
import os
import logging

warnings.filterwarnings('ignore', message='Can\'t initialize NVML')

os.environ['CHROMA_TELEMETRY_DISABLED'] = '1'

logging.getLogger('chromadb').setLevel(logging.ERROR)

from multiprocessing.managers import BaseManager
import torch
import threading
from loguru import logger

from typing import Dict, List, Optional
import uuid

import time
import asyncio
import json
import whisper
import random
import shutil
import stat
import numpy as np
from playwright.async_api import async_playwright
from urllib.parse import quote
from config import (
    AUDIO_TRANSCRIBE_SIZE, EMBEDDINGS_DIR, EMBEDDING_MODEL,
    SEMANTIC_CACHE_TTL_SECONDS, SEMANTIC_CACHE_SIMILARITY_THRESHOLD,
    RETRIEVAL_TOP_K, SESSION_SUMMARY_THRESHOLD,
    PERSIST_VECTOR_STORE_INTERVAL, MAX_LINKS_TO_TAKE, isHeadless
)

from session_manager import SessionMemory
from .coreEmbeddingService import CoreEmbeddingService
from .searchPortManager import searchPortManager

class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, SessionMemory] = {}
        self.lock = threading.RLock()
    
    def create_session(self, session_id: str) -> SessionMemory:
        with self.lock:
            if session_id not in self.sessions:
                self.sessions[session_id] = SessionMemory(
                    session_id,
                    summary_threshold=SESSION_SUMMARY_THRESHOLD
                )
            return self.sessions[session_id]
    
    def get_session(self, session_id: str) -> Optional[SessionMemory]:
        with self.lock:
            return self.sessions.get(session_id)
    
    def add_turn(self, session_id: str, user_query: str, assistant_response: str, entities: List[str] = None) -> None:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                session.add_turn(user_query, assistant_response, entities)
    
    def get_session_context(self, session_id: str) -> Dict:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                return session.get_context()
            return {}
    
    def get_minimal_context(self, session_id: str) -> str:
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                return session.get_minimal_context()
            return ""
    
    def delete_session(self, session_id: str) -> None:
        with self.lock:
            if session_id in self.sessions:
                self.sessions[session_id].clear()
                del self.sessions[session_id]





if __name__ == "__main__":
    class ModelManager(BaseManager):
        pass
    
    ModelManager.register("CoreEmbeddingService", CoreEmbeddingService)
    ModelManager.register("accessSearchAgents", accessSearchAgents)
    
    core_service = CoreEmbeddingService()
    search_agents = accessSearchAgents()
    
    manager = ModelManager(address=("localhost", 5010), authkey=b"ipcService")
    server = manager.get_server()
    
    logger.info("[MAIN] Core service started on port 5010...")
    logger.info(f"[MAIN] Vector store stats: {core_service.get_vector_store_stats()}")
    
    try:
        _ensure_background_loop()
        run_async_on_bg_loop(agent_pool.initialize_pool())
    except Exception as e:
        logger.error(f"[MAIN] Failed to initialize agent pool: {e}")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("[MAIN] Shutdown signal received...")
    except Exception as e:
        logger.error(f"[MAIN] Server error: {e}")
    finally:
        shutdown_graceful()
        logger.info("[MAIN] Shutdown complete")
