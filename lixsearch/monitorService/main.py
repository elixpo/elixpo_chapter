"""
lixSearch Monitor Service — lightweight production monitoring.

Polls docker stats, IPC health, and request latency on intervals.
Exposes JSON endpoints for dashboards and alerting.
"""

import os
import sys
import json
import time
import asyncio
from loguru import logger
from aiohttp import web

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from monitorService.collectors.docker_stats import collect_docker_stats
from monitorService.collectors.ipc_health import collect_ipc_health
from monitorService.collectors.request_metrics import collect_request_metrics
from monitorService.alerting import check_alerts, get_recent_alerts

# Config
MONITOR_PORT = int(os.getenv("MONITOR_PORT", "9520"))
IPC_HOST = os.getenv("IPC_HOST", "ipc-service")
IPC_PORT = int(os.getenv("IPC_PORT", "9510"))
_IPC_AUTHKEY = os.getenv("IPC_AUTHKEY", "changeme_ipc_secret")
IPC_AUTHKEY = _IPC_AUTHKEY.encode() if isinstance(_IPC_AUTHKEY, str) else _IPC_AUTHKEY
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "9530"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None

DOCKER_POLL_INTERVAL = int(os.getenv("DOCKER_POLL_INTERVAL", "15"))
IPC_POLL_INTERVAL = int(os.getenv("IPC_POLL_INTERVAL", "10"))
LATENCY_POLL_INTERVAL = int(os.getenv("LATENCY_POLL_INTERVAL", "30"))

# Cached state
_state = {
    "containers": [],
    "ipc": {},
    "latency": {},
    "last_updated": {},
}


# --- Background collectors ---

async def _poll_docker():
    while True:
        try:
            _state["containers"] = await collect_docker_stats()
            _state["last_updated"]["containers"] = time.time()
        except Exception as e:
            logger.error(f"[Monitor] Docker poll error: {e}")
        await asyncio.sleep(DOCKER_POLL_INTERVAL)


async def _poll_ipc():
    while True:
        try:
            _state["ipc"] = await collect_ipc_health(IPC_HOST, IPC_PORT, IPC_AUTHKEY)
            _state["last_updated"]["ipc"] = time.time()
        except Exception as e:
            logger.error(f"[Monitor] IPC poll error: {e}")
        await asyncio.sleep(IPC_POLL_INTERVAL)


async def _poll_latency():
    while True:
        try:
            _state["latency"] = await collect_request_metrics(REDIS_HOST, REDIS_PORT, REDIS_PASSWORD)
            _state["last_updated"]["latency"] = time.time()
        except Exception as e:
            logger.error(f"[Monitor] Latency poll error: {e}")
        await asyncio.sleep(LATENCY_POLL_INTERVAL)


async def _poll_alerts():
    while True:
        try:
            check_alerts(_state["containers"], _state["ipc"], _state["latency"])
        except Exception as e:
            logger.error(f"[Monitor] Alert check error: {e}")
        await asyncio.sleep(IPC_POLL_INTERVAL)


# --- HTTP handlers ---

async def handle_monitor(request):
    return web.json_response({
        "containers": _state["containers"],
        "ipc": _state["ipc"],
        "latency": _state["latency"],
        "alerts": get_recent_alerts(),
        "last_updated": _state["last_updated"],
    })


async def handle_containers(request):
    return web.json_response({"containers": _state["containers"]})


async def handle_ipc(request):
    return web.json_response({"ipc": _state["ipc"]})


async def handle_latency(request):
    return web.json_response({"latency": _state["latency"]})


async def handle_alerts(request):
    return web.json_response({"alerts": get_recent_alerts()})


async def handle_health(request):
    return web.json_response({"status": "healthy", "timestamp": time.time()})


# --- Startup ---

async def start_background_tasks(app):
    app["docker_poller"] = asyncio.create_task(_poll_docker())
    app["ipc_poller"] = asyncio.create_task(_poll_ipc())
    app["latency_poller"] = asyncio.create_task(_poll_latency())
    app["alert_poller"] = asyncio.create_task(_poll_alerts())
    logger.info(f"[Monitor] Background collectors started (docker={DOCKER_POLL_INTERVAL}s, ipc={IPC_POLL_INTERVAL}s, latency={LATENCY_POLL_INTERVAL}s)")


async def cleanup_background_tasks(app):
    for task_name in ("docker_poller", "ipc_poller", "latency_poller", "alert_poller"):
        task = app.get(task_name)
        if task:
            task.cancel()


def create_app():
    app = web.Application()
    app.router.add_get("/api/monitor", handle_monitor)
    app.router.add_get("/api/monitor/containers", handle_containers)
    app.router.add_get("/api/monitor/ipc", handle_ipc)
    app.router.add_get("/api/monitor/latency", handle_latency)
    app.router.add_get("/api/monitor/alerts", handle_alerts)
    app.router.add_get("/api/health", handle_health)
    app.on_startup.append(start_background_tasks)
    app.on_cleanup.append(cleanup_background_tasks)
    return app


if __name__ == "__main__":
    logger.info(f"[Monitor] Starting monitor service on port {MONITOR_PORT}")
    logger.info(f"[Monitor] IPC: {IPC_HOST}:{IPC_PORT}, Redis: {REDIS_HOST}:{REDIS_PORT}")
    app = create_app()
    web.run_app(app, host="0.0.0.0", port=MONITOR_PORT, print=None)
