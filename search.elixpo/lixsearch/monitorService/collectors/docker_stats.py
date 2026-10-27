import json
import asyncio
from loguru import logger


async def collect_docker_stats() -> list:
    """Collect container stats via the Docker socket."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "curl", "-s", "--unix-socket", "/var/run/docker.sock",
            "http://localhost/containers/json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        containers = json.loads(stdout.decode())

        results = []
        # Fetch stats for each lixsearch container in parallel
        tasks = []
        for c in containers:
            name = (c.get("Names") or [""])[0].lstrip("/")
            if "lixsearch" not in name and "redis" not in name and "chroma" not in name:
                continue
            tasks.append(_fetch_container_stats(c["Id"], name))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            results = [r for r in results if isinstance(r, dict)]

        return results
    except Exception as e:
        logger.warning(f"[Monitor] Docker stats collection failed: {e}")
        return []


async def _fetch_container_stats(container_id: str, name: str) -> dict:
    try:
        proc = await asyncio.create_subprocess_exec(
            "curl", "-s", "--unix-socket", "/var/run/docker.sock",
            f"http://localhost/containers/{container_id}/stats?stream=false",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        stats = json.loads(stdout.decode())

        # Parse memory
        mem_usage = stats.get("memory_stats", {}).get("usage", 0)
        mem_limit = stats.get("memory_stats", {}).get("limit", 1)
        mem_mb = round(mem_usage / 1024 / 1024, 1)
        mem_pct = round((mem_usage / mem_limit) * 100, 1) if mem_limit else 0

        # Parse CPU
        cpu_delta = stats.get("cpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0) - \
                    stats.get("precpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
        system_delta = stats.get("cpu_stats", {}).get("system_cpu_usage", 0) - \
                       stats.get("precpu_stats", {}).get("system_cpu_usage", 0)
        num_cpus = stats.get("cpu_stats", {}).get("online_cpus", 1)
        cpu_pct = round((cpu_delta / system_delta) * num_cpus * 100, 2) if system_delta > 0 else 0

        # Parse network
        net_rx = sum(v.get("rx_bytes", 0) for v in (stats.get("networks") or {}).values())
        net_tx = sum(v.get("tx_bytes", 0) for v in (stats.get("networks") or {}).values())

        return {
            "name": name,
            "cpu_pct": cpu_pct,
            "memory_mb": mem_mb,
            "memory_pct": mem_pct,
            "memory_limit_mb": round(mem_limit / 1024 / 1024, 1),
            "net_rx_mb": round(net_rx / 1024 / 1024, 2),
            "net_tx_mb": round(net_tx / 1024 / 1024, 2),
        }
    except Exception as e:
        logger.warning(f"[Monitor] Stats for {name} failed: {e}")
        return {"name": name, "error": str(e)}
