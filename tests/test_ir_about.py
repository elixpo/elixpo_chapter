"""Host tests for the ir-about stream: IR Quest text, About helpers, cache.

Modules are loaded straight from their files so nothing pulls in the badge
runtime.
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


class QuestWrapTest(unittest.TestCase):
    def setUp(self):
        self.text = load("apps_market/quest/src/text.py", "quest_text_under_test")

    def test_full_error_survives_wrapping(self):
        msg = ("RX start: RMT RX arm failed: ESP_ERR_INVALID_ARG "
               "(dma=1, filter=3000ns)")
        lines = self.text.wrap(msg, 34)
        self.assertTrue(all(len(line) <= 34 for line in lines))
        self.assertEqual("".join(lines).replace(" ", ""), msg.replace(" ", ""))
        self.assertIn("ESP_ERR_INVALID_ARG", " ".join(lines))

    def test_long_token_is_hard_broken(self):
        lines = self.text.wrap("X" * 80, 34)
        self.assertEqual([len(line) for line in lines], [34, 34, 12])

    def test_max_lines_marks_the_cut(self):
        lines = self.text.wrap("word " * 50, 20, 3)
        self.assertEqual(len(lines), 3)
        self.assertTrue(lines[-1].endswith("..."))
        self.assertLessEqual(len(lines[-1]), 20)

    def test_hex32(self):
        self.assertEqual(self.text.hex32(0xCAFEBABE), "0xCAFEBABE")
        self.assertEqual(self.text.hex32(-1), "0xFFFFFFFF")


class AboutInfoTest(unittest.TestCase):
    def setUp(self):
        self.info = load("apps/about/src/info.py", "about_info_under_test")

    def test_sizes(self):
        self.assertEqual(self.info.fmt_size(812 * 1024), "812 kB")
        self.assertEqual(self.info.fmt_size(int(3.45 * 1024 * 1024)), "3.4 MB")
        self.assertEqual(self.info.fmt_size(None), "-")

    def test_uptime(self):
        self.assertEqual(self.info.fmt_uptime(3725), "01:02:05")
        self.assertEqual(self.info.fmt_uptime(90061), "1d 01:01:01")

    def test_mac(self):
        self.assertEqual(self.info.fmt_mac(b"\x01\xab\x00\xff\x10\x20"),
                         "01:AB:00:FF:10:20")


class CacheTest(unittest.TestCase):
    def setUp(self):
        self.cache = load("oreoOS/cache.py", "oreo_cache_ir_about_test")
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "cache.txt")

    def tearDown(self):
        self.dir.cleanup()

    def test_round_trip_and_overwrite(self):
        self.assertTrue(self.cache.save(self.path, {"ip": "10.0.0.2", "a": "x=y"}))
        self.assertTrue(self.cache.save(self.path, {"ip": "10.0.0.3", "a": "x=y"}))
        data, age = self.cache.load(self.path)
        self.assertEqual(data, {"ip": "10.0.0.3", "a": "x=y"})
        self.assertLessEqual(age, 2)
        self.assertFalse(os.path.exists(self.path + ".tmp"))

    def test_clock_behind_save_reports_unknown_age(self):
        with open(self.path, "w") as f:
            f.write("__ts=%d\nk=v" % (2 ** 40))
        data, age = self.cache.load(self.path)
        self.assertEqual(data, {"k": "v"})
        self.assertEqual(age, self.cache.UNKNOWN_AGE)

    def test_refresh_deferred_runs_after_a_frame(self):
        calls = []
        job = self.cache.Refresh(lambda: calls.append(1) or {"ok": 1})
        job.start(use_thread=False)
        self.assertTrue(job.busy())
        self.assertFalse(job.poll())       # first frame: still drawing cache
        self.assertEqual(calls, [])
        self.assertTrue(job.poll())
        self.assertEqual(job.result, {"ok": 1})
        self.assertFalse(job.poll())       # reported once only

    def test_refresh_captures_errors(self):
        def boom():
            raise OSError("no route")
        job = self.cache.Refresh(boom)
        job.start(use_thread=False)
        job.poll()
        self.assertTrue(job.poll() or job.result is None)
        self.assertIsNone(job.result)
        self.assertEqual(job.error, "no route")


if __name__ == "__main__":
    unittest.main()
