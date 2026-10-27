import asyncio
from loguru import logger


async def collect_ipc_health(ipc_host: str, ipc_port: int, ipc_authkey: bytes) -> dict:
    """Connect to IPC service and collect health metrics."""
    try:
        from multiprocessing.managers import BaseManager

        class _Client(BaseManager):
            pass

        _Client.register("CoreEmbeddingService")
        _Client.register("accessSearchAgents")

        def _blocking_collect():
            mgr = _Client(address=(ipc_host, ipc_port), authkey=ipc_authkey)
            mgr.connect()

            core = mgr.CoreEmbeddingService()
            agents = mgr.accessSearchAgents()

            core_health = core.get_health()
            agent_health = agents.health_check()

            return {
                "status": "connected",
                "core": dict(core_health) if core_health else {},
                "agents": dict(agent_health) if agent_health else {},
            }

        result = await asyncio.wait_for(
            asyncio.to_thread(_blocking_collect),
            timeout=15.0,
        )
        return result
    except asyncio.TimeoutError:
        logger.warning("[Monitor] IPC health check timed out")
        return {"status": "timeout"}
    except Exception as e:
        logger.warning(f"[Monitor] IPC health check failed: {e}")
        return {"status": "error", "detail": str(e)}
