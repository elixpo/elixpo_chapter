"""Client for the jev typed classifier (TypeSafe API via Pollinations).

jev answers structured questions about a piece of text; it does not chat.
Request: last user message = JSON {"state": text, "questions": {name: spec}}.
Reply: JSON {name: {"type": "choice", "choice", "confidence", ...} |
                    {"type": "noul", "noul": <0..1 probability of "yes">}}.
"""
import json

import requests
from loguru import logger

from commons.auth_context import pollinations_auth_headers
from pipeline.config import (
    JEV_MIN_CONFIDENCE,
    JEV_MODEL,
    LLM_HTTP_TIMEOUT,
    POLLINATIONS_ENDPOINT,
)


def choice_question(instructions: str, criteria: dict) -> dict:
    return {"type": "choice", "instructions": instructions, "criteria": criteria}


def yes_no_question(instructions: str) -> dict:
    return {"type": "noul", "instructions": instructions}


def build_request(state: str, questions: dict) -> dict:
    return {
        "model": JEV_MODEL,
        "messages": [
            {"role": "user", "content": json.dumps({"state": state, "questions": questions})}
        ],
    }


def parse_reply(content: str, questions: dict, min_confidence: float):
    """Return {name: (answer, confidence)}; None if any answer is missing or unsure.

    choice -> (option, confidence); noul -> (bool, max(p, 1 - p)).
    """
    data = json.loads(content)
    out = {}
    for name, spec in questions.items():
        item = data[name]
        if spec["type"] == "choice":
            answer, confidence = item["choice"], float(item["confidence"])
            if answer not in spec["criteria"]:
                return None
        else:
            p = float(item["noul"])
            if not 0.0 <= p <= 1.0:
                return None
            answer, confidence = p >= 0.5, max(p, 1.0 - p)
        if confidence < min_confidence:
            logger.info(f"[Pipeline] jev low confidence for {name}: {answer} ({confidence:.2f})")
            return None
        out[name] = (answer, confidence)
    return out


def classify(state: str, questions: dict, *, label: str = "jev",
             min_confidence: float | None = None, headers: dict | None = None):
    """Blocking jev call. Returns {name: (answer, confidence)} or None to fall back."""
    threshold = JEV_MIN_CONFIDENCE if min_confidence is None else min_confidence
    try:
        response = requests.post(
            POLLINATIONS_ENDPOINT,
            json=build_request(state, questions),
            headers=headers or pollinations_auth_headers(),
            timeout=LLM_HTTP_TIMEOUT,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        result = parse_reply(content, questions, threshold)
    except Exception as exc:
        logger.warning(f"[Pipeline] jev {label} failed ({exc}); falling back to LLM")
        return None
    if result is not None:
        logger.info(f"[Pipeline] jev {label}: {result}")
    return result
