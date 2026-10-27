import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
import importlib.util

_spec = importlib.util.spec_from_file_location("streaming", ROOT / "lixsearch" / "pipeline" / "streaming.py")
_streaming = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_streaming)
TaskAwareChunkBuffer = _streaming.TaskAwareChunkBuffer


class TaskAwareChunkBufferTests(unittest.TestCase):
    def test_coalesces_text_and_keeps_fragmented_task_atomic(self):
        buffer = TaskAwareChunkBuffer(16)
        events = []
        for fragment in ("hello ", "world<TA", "SK>working", "</TA", "SK>after text here"):
            events.extend(buffer.feed(fragment))
        events.extend(buffer.flush())
        tasks = [value for kind, value in events if kind == "task"]
        text = "".join(value for kind, value in events if kind == "text")
        self.assertEqual(tasks, ["<TASK>working</TASK>"])
        self.assertEqual(text, "hello worldafter text here")
        self.assertNotIn("<TASK>", text)

    def test_unfinished_task_is_not_leaked(self):
        buffer = TaskAwareChunkBuffer(16)
        events = buffer.feed("visible<TASK>secret") + buffer.flush()
        self.assertEqual(events, [("text", "visible")])

    def test_partial_open_token_is_plain_text_at_eof(self):
        buffer = TaskAwareChunkBuffer(16)
        self.assertEqual(buffer.feed("text<TA") + buffer.flush(), [("text", "text<TA")])


if __name__ == "__main__":
    unittest.main()
