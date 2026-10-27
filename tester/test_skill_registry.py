import sys
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lixsearch"))

from skillRegistry import SkillRegistry, SkillRegistryError, get_skill_registry


class SkillRegistryTests(unittest.TestCase):
    def test_loads_all_skills_and_tools(self):
        registry = SkillRegistry.load(ROOT / "skills")
        self.assertEqual(len(registry), 13)
        self.assertIn("optimize-search-runtime", registry.names())
        self.assertIn("oreolook-persona", registry.names())
        self.assertIn("communicate-naturally", registry.names())
        self.assertEqual(registry.for_tool("web_search").name, "research-web")
        self.assertEqual(registry.for_tool("create_image").name, "make-images")
        self.assertEqual(registry.for_tool("export_to_pdf").name, "export-documents")

    def test_filters_tool_catalog(self):
        registry = SkillRegistry.load(ROOT / "skills")
        catalog = registry.tool_catalog(["recall-memory", "handle-media"])
        names = {item["function"]["name"] for item in catalog}
        self.assertEqual(
            names,
            {
                "get_session_conversation_history",
                "image_search",
                "generate_prompt_from_image",
                "replyFromImage",
                "youtubeMetadata",
                "transcribe_audio",
            },
        )

    def test_resolves_static_dependencies_first(self):
        registry = SkillRegistry.load(ROOT / "skills")
        resolved = registry.resolve(["export-documents"])
        self.assertEqual(
            tuple(skill.name for skill in resolved),
            ("synthesize-answer", "export-documents"),
        )

    def test_web_research_resolves_runtime_policy_first(self):
        registry = SkillRegistry.load(ROOT / "skills")
        resolved = registry.resolve(["research-web"])
        self.assertEqual(
            tuple(skill.name for skill in resolved),
            ("optimize-search-runtime", "research-web"),
        )

    def test_registry_is_cached(self):
        get_skill_registry.cache_clear()
        self.assertIs(get_skill_registry(), get_skill_registry())

    def test_rejects_unknown_tool(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "bad-skill"
            skill_dir.mkdir()
            (skill_dir / "SKILL.md").write_text(
                """---
name: bad-skill
description: Invalid test skill used to verify validation.
---

# Bad Skill

## Runtime contract

    agent: test
    tools: [not_a_tool]
    timeout_seconds: 1
    max_concurrency: 1
    output: test
""",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(SkillRegistryError, "unknown tools"):
                SkillRegistry.load(temp_dir)


if __name__ == "__main__":
    unittest.main()
