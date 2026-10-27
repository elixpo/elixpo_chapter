"""Core service backend manager.

Supports the legacy BaseManager IPC transport and a zero-serialization local
backend for single-worker Python deployments.
"""

from __future__ import annotations

from multiprocessing.managers import BaseManager, RemoteError
import os
import threading
from typing import Optional

from loguru import logger

from pipeline.config import CORE_SERVICE_BACKEND, IPC_AUTHKEY, IPC_HOST, IPC_PORT, IPC_TIMEOUT

RECONNECT_ERRORS = (
    BrokenPipeError,
    ConnectionResetError,
    ConnectionAbortedError,
    ConnectionRefusedError,
    EOFError,
    RemoteError,
)
_VALID_BACKENDS = {"ipc", "local"}


class ModelServerClient(BaseManager):
    pass


ModelServerClient.register("CoreEmbeddingService")
ModelServerClient.register("accessSearchAgents")


class CoreServiceManager:
    """Own exactly one core/search backend instance per application process."""

    _instance = None
    _lock = threading.Lock()

    def __init__(self, backend: str | None = None):
        configured = backend or CORE_SERVICE_BACKEND
        self.backend = configured.strip().lower()
        if self.backend not in _VALID_BACKENDS:
            raise ValueError(
                f"CORE_SERVICE_BACKEND must be one of {sorted(_VALID_BACKENDS)}, got '{configured}'"
            )
        self._connect_lock = threading.RLock()
        self._manager: Optional[ModelServerClient] = None
        self._core_service = None
        self._search_agents = None
        self._connection_ready = False
        self._closed = False
        self._connect()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @classmethod
    def shutdown_instance(cls) -> None:
        with cls._lock:
            instance = cls._instance
            cls._instance = None
        if instance is not None:
            instance.shutdown()

    def _connect(self) -> None:
        with self._connect_lock:
            if self._closed:
                raise RuntimeError("CoreServiceManager is closed")
            if self._connection_ready:
                return
            if self.backend == "local":
                self._connect_local()
            else:
                self._connect_ipc()

    def _connect_local(self) -> None:
        logger.info("[CoreServiceManager] Initializing local core backend")
        try:
            from ipcService.coreEmbeddingService import CoreEmbeddingService
            from ipcService.searchPortManager import accessSearchAgents, _ensure_background_loop

            self._core_service = CoreEmbeddingService()
            self._search_agents = accessSearchAgents()
            _ensure_background_loop()
            self._connection_ready = True
            logger.info(
                "[CoreServiceManager] Local backend ready. Vector store: {}",
                self._core_service.get_vector_store_stats(),
            )
        except Exception:
            self._clear_references()
            logger.exception("[CoreServiceManager] Local backend initialization failed")
            raise

    def _connect_ipc(self) -> None:
        logger.info(
            "[CoreServiceManager] Connecting to IPC at {}:{} (timeout: {}s)",
            IPC_HOST,
            IPC_PORT,
            IPC_TIMEOUT,
        )
        try:
            self._manager = ModelServerClient(
                address=(IPC_HOST, IPC_PORT),
                authkey=IPC_AUTHKEY,
            )
            self._manager.connect()
            self._core_service = self._manager.CoreEmbeddingService()
            self._search_agents = self._manager.accessSearchAgents()
            self._connection_ready = True
            logger.info(
                "[CoreServiceManager] IPC backend ready. Vector store: {}",
                self._core_service.get_vector_store_stats(),
            )
        except Exception:
            self._clear_references()
            logger.exception(
                "[CoreServiceManager] IPC connection failed at {}:{}",
                IPC_HOST,
                IPC_PORT,
            )
            raise

    def _clear_references(self) -> None:
        self._connection_ready = False
        self._core_service = None
        self._search_agents = None
        self._manager = None

    def invalidate(self, reason: str = "") -> None:
        """Invalidate stale IPC proxies; local objects remain process-owned."""
        with self._connect_lock:
            if self.backend == "local":
                logger.warning(
                    "[CoreServiceManager] Ignoring local backend invalidation{}",
                    f" ({reason})" if reason else "",
                )
                return
            if self._connection_ready:
                logger.warning(
                    "[CoreServiceManager] Invalidating IPC proxies{}",
                    f" ({reason})" if reason else "",
                )
            self._clear_references()

    def _ensure_ready(self) -> None:
        if not self._connection_ready:
            self._connect()

    def get_core_service(self):
        self._ensure_ready()
        return self._core_service

    def get_search_agents(self):
        self._ensure_ready()
        return self._search_agents

    def is_ready(self) -> bool:
        return self._connection_ready and not self._closed

    def get_backend_name(self) -> str:
        return self.backend

    def call(self, target: str, method: str, *args, **kwargs):
        attempts = (1,) if self.backend == "local" else (1, 2)
        for attempt in attempts:
            try:
                service = self.get_core_service() if target == "core" else self.get_search_agents()
                return getattr(service, method)(*args, **kwargs)
            except RECONNECT_ERRORS as exc:
                if self.backend == "local":
                    raise
                self.invalidate(f"{target}.{method}: {type(exc).__name__}")
                if attempt == attempts[-1]:
                    raise

    def get_vector_store_stats(self):
        try:
            return self.call("core", "get_vector_store_stats")
        except Exception as exc:
            logger.error("[CoreServiceManager] Failed to get stats: {}", exc)
            return {}

    def shutdown(self) -> None:
        with self._connect_lock:
            if self._closed:
                return
            self._closed = True
            if self.backend == "local":
                core_service = self._core_service
                if core_service is not None and hasattr(core_service, "close"):
                    try:
                        core_service.close()
                    except Exception as exc:
                        logger.warning("[CoreServiceManager] Core shutdown failed: {}", exc)
                try:
                    from ipcService.searchPortManager import shutdown_graceful

                    shutdown_graceful()
                except Exception as exc:
                    logger.warning("[CoreServiceManager] Browser shutdown failed: {}", exc)
            self._clear_references()
            logger.info("[CoreServiceManager] {} backend stopped", self.backend)


def get_core_embedding_service():
    return CoreServiceManager.get_instance().get_core_service()


def is_core_service_ready() -> bool:
    try:
        return CoreServiceManager.get_instance().is_ready()
    except Exception:
        return False


def is_ipc_ready() -> bool:
    """Compatibility alias retained for existing health checks."""
    return is_core_service_ready()
