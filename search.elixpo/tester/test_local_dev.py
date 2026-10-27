import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import local_dev


class LocalDevTests(unittest.TestCase):
    def test_environment_forces_single_worker_local_backend(self):
        env = local_dev.load_environment()
        self.assertEqual(env["CORE_SERVICE_BACKEND"], "local")
        self.assertEqual(env["WORKERS"], "1")
        self.assertEqual(env["REDIS_HOST"], "127.0.0.1")
        self.assertEqual(env["QDRANT_MODE"], "local")

    def test_redis_configuration_is_local_and_persistent(self):
        config = local_dev.redis_config(
            {"REDIS_PASSWORD": "test-secret", "REDIS_PORT": "9530"}
        )
        self.assertIn("bind 127.0.0.1", config)
        self.assertIn(f"dir {local_dev.REDIS_DIR}", config)
        self.assertIn("appendonly yes", config)
        self.assertIn("requirepass test-secret", config)

    def test_blank_redis_password_is_rejected(self):
        with self.assertRaises(local_dev.LocalStackError):
            local_dev.redis_config({"REDIS_PASSWORD": "", "REDIS_PORT": "9530"})


if __name__ == "__main__":
    unittest.main()
