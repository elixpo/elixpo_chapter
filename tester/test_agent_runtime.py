import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lixsearch"))

from agentRuntime import AgentRunner, route_request


class AgentRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runner = AgentRunner()

    def test_auto_routing_is_always_model_driven(self):
        self.assertEqual(route_request("Generate an image of a lunar city"), "decision")
        self.assertEqual(route_request("Debug this Python function"), "decision")
        self.assertEqual(route_request("Export this report as a PDF"), "decision")
        self.assertEqual(route_request("Find today's weather online"), "decision")
        self.assertEqual(route_request("Rewrite this email"), "decision")
        self.assertEqual(route_request("What did we discuss earlier?"), "decision")
        self.assertEqual(route_request("Explain entropy"), "decision")

    def test_web_agent_uses_cheapest_role_and_scoped_tools(self):
        run = self.runner.prepare("web-search", "Find current Python news")
        names = {tool["function"]["name"] for tool in run.tools}
        self.assertEqual(run.model, "nova-fast")
        self.assertEqual(
            names,
            {"web_search", "fetch_full_text", "get_local_time", "deep_research"},
        )

    def test_image_agent_receives_only_create_image(self):
        run = self.runner.prepare("image-maker", "Draw a blue fox")
        self.assertEqual(run.model, "nova-fast")
        self.assertEqual(
            [tool["function"]["name"] for tool in run.tools],
            ["create_image"],
        )

    def test_coding_agent_uses_qwen_coder(self):
        run = self.runner.prepare("coding", "Write a parser")
        self.assertEqual(run.model, "qwen-coder")
        self.assertEqual(run.tools, ())

    def test_literal_prompt_is_preserved(self):
        prompt = "Hard-coded prompt: write exactly three lines."
        run = self.runner.prepare("writing", prompt)
        self.assertEqual(run.messages[-1], {"role": "user", "content": prompt})

    def test_auto_always_uses_bounded_decision_agent(self):
        obvious = self.runner.prepare("auto", "Create an image of Saturn")
        ambiguous = self.runner.prepare("auto", "Explain entropy")
        self.assertEqual(obvious.agent, "decision")
        self.assertEqual(ambiguous.agent, "decision")
        self.assertEqual(ambiguous.max_tokens, 120)

    def test_search_depth_enforces_output_budget(self):
        quick = self.runner.prepare("web-search", "Weather", search_depth="quick")
        deep = self.runner.prepare("web-search", "Investigate", search_depth="deep")
        self.assertEqual(quick.max_tokens, 350)
        self.assertEqual(deep.max_tokens, 1800)
        self.assertIn("use quick search depth", quick.messages[0]["content"])


if __name__ == "__main__":
    unittest.main()
