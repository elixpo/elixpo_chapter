import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lixsearch"))

from pipeline.instruction import synthesis_instruction
from pipeline.helpers import _looks_like_internal_reasoning, strip_internal_reasoning_blocks
from pipeline.response_builder import is_placeholder_or_fallback


class GroundedSynthesisTests(unittest.TestCase):
    def test_rejects_unresolved_weather_placeholders(self):
        draft = "Temperature: [Accurate temperature details]\nHumidity: [Accurate humidity level]"
        self.assertTrue(is_placeholder_or_fallback(draft))

    def test_accepts_concrete_weather_values(self):
        answer = "New Delhi is 31°C with 62% humidity."
        self.assertFalse(is_placeholder_or_fallback(answer))

    def test_synthesis_prompt_forbids_guessed_or_template_values(self):
        prompt = synthesis_instruction("What is the weather?")
        self.assertIn("Never emit bracketed placeholders", prompt)
        self.assertIn("could not be verified", prompt)

    def test_detects_and_removes_complete_thinking_block(self):
        draft = "<thinking>I should answer directly.</thinking>Hello! How can I help?"
        self.assertTrue(_looks_like_internal_reasoning(draft))
        self.assertEqual(
            strip_internal_reasoning_blocks(draft),
            "Hello! How can I help?",
        )

    def test_thinking_only_requires_rewrite(self):
        draft = '<thinking>The user simply said "hello".</thinking>'
        self.assertTrue(_looks_like_internal_reasoning(draft))
        self.assertEqual(strip_internal_reasoning_blocks(draft), "")


if __name__ == "__main__":
    unittest.main()
