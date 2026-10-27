import sys
from pathlib import Path
from types import ModuleType
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lixsearch"))

from ipcService.coreServiceManager import CoreServiceManager


class FakeCoreService:
    def __init__(self):
        self.closed = False

    def get_vector_store_stats(self):
        return {"chunks": 0}

    def close(self):
        self.closed = True


class FakeSearchAgents:
    def ping(self):
        return "pong"


class CoreServiceManagerTests(unittest.TestCase):
    def test_rejects_unknown_backend(self):
        with self.assertRaisesRegex(ValueError, "CORE_SERVICE_BACKEND"):
            CoreServiceManager(backend="unknown")

    def test_local_backend_owns_and_closes_services(self):
        core_module = ModuleType("ipcService.coreEmbeddingService")
        core_module.CoreEmbeddingService = FakeCoreService
        search_module = ModuleType("ipcService.searchPortManager")
        agents = FakeSearchAgents()
        shutdown_calls = []
        search_module.accessSearchAgents = lambda: agents
        search_module._ensure_background_loop = lambda: object()
        search_module.shutdown_graceful = lambda: shutdown_calls.append(True)

        with patch.dict(
            sys.modules,
            {
                "ipcService.coreEmbeddingService": core_module,
                "ipcService.searchPortManager": search_module,
            },
        ):
            manager = CoreServiceManager(backend="local")
            core = manager.get_core_service()
            self.assertTrue(manager.is_ready())
            self.assertEqual(manager.get_backend_name(), "local")
            self.assertIs(manager.get_search_agents(), agents)
            self.assertEqual(manager.call("search", "ping"), "pong")
            manager.invalidate("test")
            self.assertTrue(manager.is_ready())
            manager.shutdown()

        self.assertTrue(core.closed)
        self.assertEqual(shutdown_calls, [True])
        self.assertFalse(manager.is_ready())


if __name__ == "__main__":
    unittest.main()
