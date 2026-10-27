import os
import time
import json
import requests
from loguru import logger
from collections import deque

ALERT_WEBHOOK_URL = os.getenv("ALERT_WEBHOOK_URL", "")
ALERT_COOLDOWN_SECONDS = int(os.getenv("ALERT_COOLDOWN_SECONDS", "300"))

# Thresholds (configurable via env)
MEMORY_PCT_THRESHOLD = float(os.getenv("ALERT_MEMORY_PCT", "80"))
EMBEDDING_QUEUE_THRESHOLD = int(os.getenv("ALERT_EMBEDDING_QUEUE", "5"))
LATENCY_P95_THRESHOLD = float(os.getenv("ALERT_LATENCY_P95_MS", "30000"))

_recent_alerts = deque(maxlen=50)
_last_alert_time = {}


def check_alerts(containers: list, ipc_health: dict, latency: dict) -> list:
    """Evaluate thresholds and return new alerts."""
    alerts = []
    now = time.time()

    # Container memory alerts
    for c in containers:
        if isinstance(c, dict) and c.get("memory_pct", 0) > MEMORY_PCT_THRESHOLD:
            alerts.append({
                "level": "warning",
                "source": c["name"],
                "message": f"Memory at {c['memory_pct']}% ({c['memory_mb']}MB)",
                "timestamp": now,
            })

    # IPC agent pool exhaustion
    agent_pool = ipc_health.get("agents", {}).get("agent_pool", {})
    for agent_type in ("text_agents", "image_agents"):
        tabs = agent_pool.get(agent_type, {}).get("tabs", [])
        max_tabs = agent_pool.get("max_tabs_per_agent", 15)
        if tabs and all(t >= max_tabs for t in tabs):
            alerts.append({
                "level": "critical",
                "source": "ipc",
                "message": f"All {agent_type} at max tabs ({max_tabs})",
                "timestamp": now,
            })

    # Embedding queue depth
    core = ipc_health.get("core", {})
    queue_depth = core.get("embedding_queue_depth", 0)
    if queue_depth > EMBEDDING_QUEUE_THRESHOLD:
        alerts.append({
            "level": "warning",
            "source": "ipc",
            "message": f"Embedding queue depth: {queue_depth}",
            "timestamp": now,
        })

    # Latency alert
    p95 = latency.get("p95_ms", 0)
    if p95 > LATENCY_P95_THRESHOLD:
        alerts.append({
            "level": "warning",
            "source": "pipeline",
            "message": f"P95 latency: {p95}ms (threshold: {LATENCY_P95_THRESHOLD}ms)",
            "timestamp": now,
        })

    # Dedupe and cooldown
    new_alerts = []
    for alert in alerts:
        key = f"{alert['source']}:{alert['message'][:50]}"
        last = _last_alert_time.get(key, 0)
        if now - last > ALERT_COOLDOWN_SECONDS:
            _last_alert_time[key] = now
            _recent_alerts.append(alert)
            new_alerts.append(alert)
            logger.warning(f"[Alert] [{alert['level']}] {alert['source']}: {alert['message']}")

    # Send webhook if configured
    if new_alerts and ALERT_WEBHOOK_URL:
        _send_webhook(new_alerts)

    return new_alerts


def _send_webhook(alerts: list):
    try:
        payload = {
            "content": "\n".join(
                f"**[{a['level'].upper()}]** `{a['source']}`: {a['message']}"
                for a in alerts
            )
        }
        requests.post(ALERT_WEBHOOK_URL, json=payload, timeout=5)
    except Exception as e:
        logger.warning(f"[Alert] Webhook failed: {e}")


def get_recent_alerts() -> list:
    return list(_recent_alerts)
