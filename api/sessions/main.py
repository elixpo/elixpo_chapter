import uuid
import threading
from typing import Dict, List, Optional, Tuple
from loguru import logger
import os
import warnings
from .session_manager import SessionManager

warnings.filterwarnings('ignore', message='Can\'t initialize NVML')
os.environ['CHROMA_TELEMETRY_DISABLED'] = '1'


def initialize_session_manager(max_sessions: int = 1000, ttl_minutes: int = 30):
    global _session_manager
    _session_manager = SessionManager(max_sessions, ttl_minutes)
    logger.info("[SessionManager] Global session manager initialized")
    return _session_manager

def get_session_manager() -> SessionManager:
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager


_session_manager: Optional[SessionManager] = None