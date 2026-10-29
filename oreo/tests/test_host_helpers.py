"""Hardware-free tests for pure OreoOS helpers.

Run from the repository root with only the standard library:

    python3 -m unittest discover -s tests -v

Modules are loaded straight from their files so that importing them does not
pull in the rest of the oreoOS package (the launcher expects a badge).
"""

import importlib.util
import os
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(relative_path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RgbTest(unittest.TestCase):
    def setUp(self):
        self.api = load("oreoOS/api.py", "oreo_api_under_test")

    def test_primary_colours_match_the_named_constants(self):
        api = self.api
        self.assertEqual(api.rgb(0, 0, 0), api.BLACK)
        self.assertEqual(api.rgb(255, 255, 255), api.WHITE)
        self.assertEqual(api.rgb(255, 0, 0), api.RED)
        self.assertEqual(api.rgb(0, 255, 0), api.GREEN)
        self.assertEqual(api.rgb(0, 0, 255), api.BLUE)

    def test_low_bits_are_dropped(self):
        # RGB565 keeps the top 5 bits of red and blue and 6 bits of green.
        self.assertEqual(self.api.rgb(7, 3, 7), 0)
        self.assertEqual(self.api.rgb(8, 4, 8), (1 << 11) | (1 << 5) | 1)


class ConfigEnvTest(unittest.TestCase):
    def load_config_with_env(self, text):
        previous = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, ".env").write_text(text)
            os.chdir(tmp)
            try:
                return load("oreoOS/config.py", "oreo_config_under_test")
            finally:
                os.chdir(previous)

    def test_sops_encrypted_values_are_treated_as_unset(self):
        config = self.load_config_with_env(
            "WIFI_SSID=ENC[AES256_GCM,data:abc,type:str]\n"
            "OWM_API_KEY=ENC[AES256_GCM,data:def,type:str]\n"
        )
        self.assertEqual(config.WIFI_SSID, "")
        self.assertEqual(config.WIFI_NETWORKS, [])
        self.assertEqual(config.OWM_API_KEY, "")

    def test_plain_values_are_read(self):
        config = self.load_config_with_env(
            "WIFI_SSID=home,office\nWIFI_PASSWORD=secret\nOWM_API_KEY=k\n"
        )
        self.assertEqual(config.WIFI_SSIDS, ["home", "office"])
        self.assertEqual(config.WIFI_SSID, "home")
        self.assertEqual(config.WIFI_NETWORKS[1]["password"], "")
        self.assertEqual(config.OWM_API_KEY, "k")


if __name__ == "__main__":
    unittest.main()
