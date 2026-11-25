"""Unit tests for oreoOS/cache.py round-trip persistence and freshness.

Covers:
- Value survival across round trips with '=', newlines, backslashes, escape sequences,
  non-ASCII Unicode, empty strings, numbers, booleans, and dicts.
- fresh() evaluation against fake clocks for fresh, boundary, stale, and missing states.
- Error handling for malformed headers, clock skew, and file invalidation.
"""

import importlib.util
import os
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(relative_path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CacheRoundTripTest(unittest.TestCase):
    def setUp(self):
        self.cache = load("oreoOS/cache.py", "oreo_cache_roundtrip_test")
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.path = os.path.join(self.tmp, "cache.txt")

    def test_round_trip_special_characters(self):
        """Values survive unchanged with '=', newlines, backslashes, and escape sequences."""
        payload = {
            "equals": "a=b=c",
            "equation": "x=1&y=2=3",
            "newlines": "line1\nline2\nline3",
            "trailing_newline": "single_line\n",
            "backslashes": "C:\\Program Files\\oreo\\app",
            "double_backslashes": "\\\\host\\share\\path",
            "literal_escape": "\\n not a newline",
            "escaped_backslash_and_n": "\\\\n literal backslash and n",
            "complex_mix": "key=val\nwith\\nested=tokens\\\\and\\nnewlines",
        }
        self.assertTrue(self.cache.save(self.path, payload))
        loaded, age = self.cache.load(self.path)
        self.assertEqual(loaded, payload)
        self.assertIsNotNone(age)
        self.assertLessEqual(age, 2)

    def test_escape_character_roundtrip_unaffected_by_ordering(self):
        """Verifies that literal '\\n' and '\\\\' do not collide or produce spurious newlines."""
        payload = {
            "just_backslash": "\\",
            "two_backslashes": "\\\\",
            "three_backslashes": "\\\\\\",
            "four_backslashes": "\\\\\\\\",
            "escaped_n": "\\n",
            "real_nl": "\n",
            "esc_then_nl": "\\n\n",
            "nl_then_esc": "\n\\n",
            "mixed": "start\\\\n\\n\nend",
        }
        self.assertTrue(self.cache.save(self.path, payload))
        loaded, _ = self.cache.load(self.path)
        self.assertEqual(loaded, payload)

    def test_round_trip_non_ascii_unicode(self):
        """Values survive unchanged with non-ASCII text, accented Latin, Devanagari, and emoji."""
        payload = {
            "city_zurich": "Zürich",
            "city_mumbai": "मुंबई",
            "emojis": "🚀 ✨ 🎉 🎮",
            "cjk": "你好世界",
            "mixed_multilingual": "Badge from Zürich to मुंबई with 🚀!",
        }
        self.assertTrue(self.cache.save(self.path, payload))
        loaded, _ = self.cache.load(self.path)
        self.assertEqual(loaded, payload)

    def test_round_trip_empty_strings_numbers_and_booleans(self):
        """_ser coerces scalars to strings; empty strings, booleans, and numbers round-trip."""
        payload = {
            "empty": "",
            "zero": 0,
            "int_val": 42,
            "negative_int": -100,
            "float_val": 3.14159,
            "bool_true": True,
            "bool_false": False,
        }
        self.assertTrue(self.cache.save(self.path, payload))
        loaded, _ = self.cache.load(self.path)
        expected = {
            "empty": "",
            "zero": "0",
            "int_val": "42",
            "negative_int": "-100",
            "float_val": "3.14159",
            "bool_true": "True",
            "bool_false": "False",
        }
        self.assertEqual(loaded, expected)

    def test_round_trip_scalar_values(self):
        """Scalar payloads round-trip correctly."""
        scalars = [
            "plain string",
            "string with \\ backslash and \\n literal",
            "multiline\nscalar\nvalue",
            "Zürich / मुंबई 🚀",
            "",
            42,
            True,
        ]
        for val in scalars:
            p = os.path.join(self.tmp, "scalar.txt")
            self.assertTrue(self.cache.save(p, val))
            loaded, _ = self.cache.load(p)
            self.assertEqual(loaded, str(val))

    def test_fresh_with_fake_clock(self):
        """fresh() reports True inside TTL, False when expired, and False for missing file."""
        fake_time = 1_000_000
        original_now = self.cache._now_s

        def fake_now_s():
            return fake_time

        self.cache._now_s = fake_now_s
        try:
            # 1. Missing file is always stale
            missing_path = os.path.join(self.tmp, "does_not_exist.txt")
            self.assertFalse(self.cache.fresh(missing_path, ttl_s=60))

            # 2. Save file at fake_time = 1_000_000
            self.assertTrue(self.cache.save(self.path, {"key": "val"}))

            # Inside TTL (age 30s <= 60s) -> fresh
            fake_time = 1_000_030
            self.assertTrue(self.cache.fresh(self.path, ttl_s=60))

            # At exact TTL boundary (age 60s <= 60s) -> fresh
            fake_time = 1_000_060
            self.assertTrue(self.cache.fresh(self.path, ttl_s=60))

            # Past TTL boundary (age 61s > 60s) -> stale
            fake_time = 1_000_061
            self.assertFalse(self.cache.fresh(self.path, ttl_s=60))

            # Long past TTL -> stale
            fake_time = 1_001_000
            self.assertFalse(self.cache.fresh(self.path, ttl_s=60))

            # Clock behind save time (RTC unsynced) reports UNKNOWN_AGE -> stale
            fake_time = 999_900
            self.assertFalse(self.cache.fresh(self.path, ttl_s=60))
        finally:
            self.cache._now_s = original_now

    def test_invalidate_removes_cache_file(self):
        """invalidate() deletes the file and returns True; subsequent load fails."""
        self.assertTrue(self.cache.save(self.path, {"foo": "bar"}))
        self.assertTrue(os.path.exists(self.path))
        self.assertTrue(self.cache.invalidate(self.path))
        self.assertFalse(os.path.exists(self.path))
        data, age = self.cache.load(self.path)
        self.assertIsNone(data)
        self.assertIsNone(age)

    def test_corrupt_or_malformed_cache_files(self):
        """Files without __ts header or invalid timestamp are treated as unreadable."""
        # Non-existent file
        data, age = self.cache.load(os.path.join(self.tmp, "missing.txt"))
        self.assertIsNone(data)
        self.assertIsNone(age)

        # Missing __ts header
        with open(self.path, "w") as f:
            f.write("key=val\nwithout=header\n")
        data, age = self.cache.load(self.path)
        self.assertIsNone(data)
        self.assertIsNone(age)

        # Corrupt non-numeric timestamp
        with open(self.path, "w") as f:
            f.write("__ts=invalid_timestamp\nkey=val\n")
        data, age = self.cache.load(self.path)
        self.assertIsNone(data)
        self.assertIsNone(age)


if __name__ == "__main__":
    unittest.main()
