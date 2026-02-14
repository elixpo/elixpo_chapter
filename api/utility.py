from collections import deque
from loguru import logger
from multiprocessing.managers import BaseManager
import concurrent.futures
import asyncio
import re
from urllib.parse import urlparse, parse_qs
from typing import Dict, List, Tuple, Optional
import numpy as np
import time


_deepsearch_store = {}

class modelManager(BaseManager): 
    pass

modelManager.register("accessSearchAgents")

search_service = None
_ipc_ready = False
_ipc_initialized = False



if __name__ == "__main__":
    pass