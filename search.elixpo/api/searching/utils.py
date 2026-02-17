import random
import time
import asyncio
from playwright.async_api import async_playwright
from loguru import logger
from urllib.parse import urlparse
import ipaddress

search_service = None
_ipc_ready = False
_ipc_initialized = False


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
            print("[INFO] Accepted cookie/privacy popup.")
            await asyncio.sleep(1)
    except Exception as e:
        print(f"[WARN] No accept popup found: {e}")




async def warmup_playwright():
    print("[WARMUP] Starting playwright warmup...")
    warmup_start = time.perf_counter()
    try:
        playwright = await async_playwright().start()
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir="/tmp/chrome-warmup-temp",
            headless=True,
            args=[
                "--remote-debugging-port=10000",
                "--disable-blink-features=AutomationControlled",
                "--disable-web-security",
                "--no-first-run",
                "--disable-default-apps",
                "--disable-sync",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
            user_agent=get_random_user_agent(),
            viewport={'width': 1280, 'height': 720},
        )
        
        page = await context.new_page()
        await page.goto("about:blank", timeout=5000)
        await page.close()
        
        await context.close()
        await playwright.stop()
        
        warmup_end = time.perf_counter()
        print(f"[WARMUP] Playwright warmup completed in {warmup_end - warmup_start:.3f} seconds")
        return warmup_end - warmup_start
    except Exception as e:
        print(f"[WARN] Playwright warmup failed: {e}")
        return 0.0


def validate_url_for_fetch(url: str) -> bool:
    try:
        parsed = urlparse(url)
        
        if not parsed.scheme or parsed.scheme not in ['http', 'https']:
            logger.warning(f"[Fetch] Invalid URL scheme: {parsed.scheme}")
            return False
        
        if not parsed.netloc:
            logger.warning(f"[Fetch] No network location in URL")
            return False
        
        hostname = parsed.hostname
        if not hostname:
            logger.warning(f"[Fetch] No hostname in URL")
            return False
        
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                logger.warning(f"[Fetch] URL targets private/loopback IP: {hostname}")
                return False
        except ValueError:
            pass
        
        if hostname in ['localhost', '127.0.0.1', '0.0.0.0']:
            logger.warning(f"[Fetch] URL targets localhost: {hostname}")
            return False
        
        port = parsed.port
        if port and port in [22, 23, 25, 135, 139, 445, 1433, 3306, 5432, 5010]:
            logger.warning(f"[Fetch] URL targets restricted port: {port}")
            return False
        
        return True
    except Exception as e:
        logger.error(f"[Fetch] URL validation error: {e}")
        return False

