import os
from typing import Optional
from dotenv import load_dotenv
from loguru import logger
from .chat_engine import ChatEngine
load_dotenv()

_chat_engine: Optional[ChatEngine] = None


def initialize_chat_engine(session_manager, retrieval_system) -> ChatEngine:
    global _chat_engine
    _chat_engine = ChatEngine(session_manager, retrieval_system)
    logger.info("[ChatEngine] Global chat engine initialized")
    return _chat_engine


def get_chat_engine() -> Optional[ChatEngine]:
    global _chat_engine
    return _chat_engine
