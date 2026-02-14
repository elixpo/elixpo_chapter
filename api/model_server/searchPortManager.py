
from loguru import logger
import random
import asyncio
import threading 


USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
]


def get_random_user_agent():
    return random.choice(USER_AGENTS)


async def handle_accept_popup(page):
    try:
        accept_button = await page.query_selector("button:has-text('Accept')")
        if not accept_button:
            accept_button = await page.query_selector("button:has-text('Aceptar todo')")
        if not accept_button:
            accept_button = await page.query_selector("button:has-text('Aceptar')")

        if accept_button:
            await accept_button.click()
            logger.info("[POPUP] Accepted cookie/privacy popup.")
            await asyncio.sleep(1)
    except Exception as e:
        logger.warning(f"[POPUP] No accept popup found: {e}")


class searchPortManager:
    def __init__(self, start_port=10000, end_port=19999):
        self.start_port = start_port
        self.end_port = end_port
        self.used_ports = set()
        self.lock = threading.Lock()
    
    def get_port(self):
        with self.lock:
            for _ in range(100):
                port = random.randint(self.start_port, self.end_port)
                if port not in self.used_ports:
                    self.used_ports.add(port)
                    logger.info(f"[PORT] Allocated port {port}. Active ports: {len(self.used_ports)}")
                    return port
            
            for port in range(self.start_port, self.end_port + 1):
                if port not in self.used_ports:
                    self.used_ports.add(port)
                    logger.info(f"[PORT] Allocated port {port} (sequential). Active ports: {len(self.used_ports)}")
                    return port
            
            raise Exception(f"No available ports in range {self.start_port}-{self.end_port}")
    
    def release_port(self, port):
        with self.lock:
            if port in self.used_ports:
                self.used_ports.remove(port)
                logger.info(f"[PORT] Released port {port}. Active ports: {len(self.used_ports)}")
            else:
                logger.warning(f"[PORT] Attempted to release port {port} that wasn't tracked")
    
    def get_status(self):
        with self.lock:
            return {
                "active_ports": len(self.used_ports),
                "used_ports": list(self.used_ports),
                "available_range": f"{self.start_port}-{self.end_port}"
            }

