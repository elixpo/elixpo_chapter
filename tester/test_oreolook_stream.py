import unittest

from tester.oreolook_stream import iter_sse_data, split_content


class FakeStreamingResponse:
    def __init__(self, lines):
        self.lines = lines

    def iter_lines(self, *, chunk_size, decode_unicode):
        assert chunk_size == 1
        assert decode_unicode is True
        return iter(self.lines)


class OreoLookStreamTests(unittest.TestCase):
    def test_task_event_is_hidden(self):
        tasks, visible = split_content("<TASK>Searching</TASK>", info_event=True)
        self.assertEqual(tasks, ["Searching"])
        self.assertEqual(visible, "")

    def test_answer_is_preserved(self):
        tasks, visible = split_content("The answer is 2.", info_event=False)
        self.assertEqual(tasks, [])
        self.assertEqual(visible, "The answer is 2.")

    def test_embedded_task_is_removed_from_answer(self):
        tasks, visible = split_content("Hi<TASKS>Done</TASKS> there", info_event=False)
        self.assertEqual(tasks, ["Done"])
        self.assertEqual(visible, "Hi there")

    def test_harness_reads_each_sse_line_without_buffering(self):
        response = FakeStreamingResponse([
            "data: first",
            "",
            "data: second",
            "",
        ])
        self.assertEqual(list(iter_sse_data(response)), ["first", "second"])


if __name__ == "__main__":
    unittest.main()
