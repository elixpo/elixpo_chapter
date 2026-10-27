import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lixsearch"))

from pipeline.instruction import direct_system_instruction, format_human_date, system_instruction, user_instruction
from pipeline.lixsearch import _parse_context_mode, _parse_decision_mode


def test_human_date_ordinals():
    expected = {
        1: "August 1st 2026",
        2: "August 2nd 2026",
        3: "August 3rd 2026",
        4: "August 4th 2026",
        11: "August 11th 2026",
        12: "August 12th 2026",
        13: "August 13th 2026",
        21: "August 21st 2026",
        22: "August 22nd 2026",
        23: "August 23rd 2026",
    }
    for day, rendered in expected.items():
        value = datetime(2026, 8, day, tzinfo=timezone.utc)
        assert format_human_date(value) == rendered


def test_decision_mode_parser_is_strict_and_safe():
    assert _parse_decision_mode("DIRECT") == "direct"
    assert _parse_decision_mode("tools") == "tools"
    assert _parse_decision_mode("unknown") == "tools"


def test_context_mode_defaults_to_session_isolation():
    assert _parse_context_mode('{"mode":"TOOLS","context":"STANDALONE"}') == "standalone"
    assert _parse_context_mode('{"mode":"DIRECT","context":"CONTINUATION"}') == "continuation"
    assert _parse_context_mode("malformed router output") == "standalone"

def test_full_prompt_asks_one_clarification_before_tools():
    prompt = system_instruction("", datetime(2026, 8, 8, tzinfo=timezone.utc))
    assert "ask exactly one concise clarification question" in prompt
    assert "call no tools" in prompt
    assert "never guess" in prompt


def test_direct_prompt_requires_explicit_continuity_carrier():
    prompt = direct_system_instruction(datetime(2026, 8, 8, tzinfo=timezone.utc))
    assert "ask exactly one concise clarification question" in prompt
    assert "same session, a previous response, or client-supplied message history" in prompt


def test_user_instruction_allows_clarification_without_tool_call():
    prompt = user_instruction("compare them", None)
    assert "ask one concise clarification question and call no tools" in prompt
