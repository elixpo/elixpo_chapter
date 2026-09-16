
import re
import json
import random
import asyncio
import requests
from loguru import logger
from commons.environment import load_local_environment

from pipeline.config import (
    LEAKED_TOOL_RE,
    LEAKED_XML_TAG_RE,
    FETCH_MIN_USEFUL_CHARS,
    INTERNAL_LEAK_PATTERNS,
    LLM_MODEL,
    POLLINATIONS_ENDPOINT,
    TOPIC_DECOMPOSITION_MAX_PARTS,
    TOPIC_DECOMPOSITION_TIMEOUT,
)
from pipeline.sse_messages import get_status_message

load_local_environment()

MODEL = LLM_MODEL
def _scrub_tool_names(text: str) -> str:
    if not text:
        return text
    # Strip hallucinated XML tags but keep the text content inside them
    # e.g. <parameter name="content">actual content</parameter> → actual content
    text = LEAKED_XML_TAG_RE.sub("", text)
    # Strip leaked tool/internal names
    text = LEAKED_TOOL_RE.sub("", text)
    return text.strip()


# Regex patterns for leaked tool call tokens from model APIs
_TOOL_CALL_TOKEN_RE = re.compile(
    r"<\|tool_call_argument_begin\|>"
    r"|<\|tool_call_argument_end\|>"
    r"|<\|tool_sep\|>"
    r"|<\|tool_call_begin\|>"
    r"|<\|tool_call_end\|>"
)

# Matches a tool name token like <|tool_call_name:export_to_pdf|>
_TOOL_NAME_TOKEN_RE = re.compile(r"<\|tool_call_name:(\w+)\|>")


_PLAIN_TOOL_CALL_RE = re.compile(
    r"^\s*(web_search|fetch_full_text|export_to_pdf|image_search|create_image|"
    r"get_local_time|deep_research|transcribe_audio|youtubeMetadata|"
    r"get_session_conversation_history|generate_prompt_from_image|replyFromImage)"
    r"\s*\n\s*\{",
    re.MULTILINE,
)


# Anthropic-style XML tool calls. Some Pollinations routes (notably kimi) return
# `<function_calls><invoke name="X"><parameter name="Y">val</parameter>…</invoke></function_calls>`
# in `delta.content` instead of OpenAI `delta.tool_calls`.
_ANTHROPIC_INVOKE_RE = re.compile(
    r"<invoke\s+name\s*=\s*[\"'](\w+)[\"']\s*>(.*?)</invoke\s*>",
    re.DOTALL | re.IGNORECASE,
)
_ANTHROPIC_PARAM_RE = re.compile(
    r"<parameter\s+name\s*=\s*[\"'](\w+)[\"']\s*>(.*?)</parameter\s*>",
    re.DOTALL | re.IGNORECASE,
)


def _coerce_param_value(raw: str):
    s = raw.strip()
    if not s:
        return ""
    # JSON-ish values: object, array, bool/null, number
    if (s[0] in "{[" or s in ("true", "false", "null")
            or (s[0] in "-0123456789" and re.fullmatch(r"-?\d+(?:\.\d+)?", s))):
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            pass
    return s


def extract_leaked_tool_call(content: str) -> tuple:

    if not content:
        return None, None

    # Anthropic XML format: <function_calls><invoke name="X">…</invoke></function_calls>
    invoke_match = _ANTHROPIC_INVOKE_RE.search(content)
    if invoke_match:
        function_name = invoke_match.group(1)
        body = invoke_match.group(2) or ""
        args = {
            param.group(1): _coerce_param_value(param.group(2))
            for param in _ANTHROPIC_PARAM_RE.finditer(body)
        }
        logger.info(f"[RECOVERY] Extracted Anthropic-XML tool call: {function_name}({list(args.keys())})")
        return function_name, args

    # Detect plain text tool calls: "export_to_pdf\n{ ... }"
    plain_match = _PLAIN_TOOL_CALL_RE.search(content)
    if plain_match:
        function_name = plain_match.group(1)
        json_start = content.find("{", plain_match.start())
        if json_start >= 0:
            json_str = content[json_start:]
            # Find matching closing brace
            depth, last_valid, in_string, escape_next = 0, -1, False, False
            for i, ch in enumerate(json_str):
                if escape_next:
                    escape_next = False
                    continue
                if ch == '\\' and in_string:
                    escape_next = True
                    continue
                if ch == '"' and not escape_next:
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        last_valid = i
                        break
            if last_valid > 0:
                try:
                    args = json.loads(json_str[:last_valid + 1])
                    if isinstance(args, dict):
                        logger.info(f"[RECOVERY] Extracted plain-text tool call: {function_name}({list(args.keys())})")
                        return function_name, args
                except json.JSONDecodeError:
                    pass

    if "<|tool_call" not in content:
        return None, None

    try:
        # Try to extract tool name from token
        name_match = _TOOL_NAME_TOKEN_RE.search(content)
        function_name = name_match.group(1) if name_match else None

        # Extract the JSON arguments between the tokens
        # Strip all special tokens to get the raw JSON
        json_str = _TOOL_CALL_TOKEN_RE.sub("", content)
        if name_match:
            json_str = _TOOL_NAME_TOKEN_RE.sub("", json_str)

        json_str = json_str.strip()
        if not json_str:
            return None, None

        # Try to parse the JSON — it may be truncated, so find the outermost {}
        brace_start = json_str.find("{")
        if brace_start == -1:
            return None, None

        json_str = json_str[brace_start:]

        # Try parsing as-is first
        try:
            args = json.loads(json_str)
        except json.JSONDecodeError:
            # JSON might be truncated — try to find the best closing brace
            # by counting brace depth
            depth = 0
            last_valid = -1
            in_string = False
            escape_next = False
            for i, ch in enumerate(json_str):
                if escape_next:
                    escape_next = False
                    continue
                if ch == '\\' and in_string:
                    escape_next = True
                    continue
                if ch == '"' and not escape_next:
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        last_valid = i
                        break

            if last_valid > 0:
                try:
                    args = json.loads(json_str[:last_valid + 1])
                except json.JSONDecodeError:
                    return None, None
            else:
                return None, None

        if not isinstance(args, dict):
            return None, None

        # Infer tool name from args if not found in tokens
        if not function_name:
            if "content" in args and ("title" in args or len(args) <= 2):
                function_name = "export_to_pdf"
            elif "query" in args and len(args) == 1:
                function_name = "web_search"
            elif "image_query" in args:
                function_name = "image_search"
            elif "prompt" in args and len(args) == 1:
                function_name = "create_image"
            else:
                return None, None

        logger.info(f"[RECOVERY] Extracted leaked tool call: {function_name}({list(args.keys())})")
        return function_name, args

    except Exception as e:
        logger.debug(f"[RECOVERY] Failed to parse leaked tool call: {e}")
        return None, None


_XML_LEAK_HINTS = (
    "<function_calls", "</function_calls",
    "<invoke", "</invoke",
    "<parameter", "</parameter",
    "<|tool_call",
)

_REASONING_BLOCK_RE = re.compile(
    r"<(?P<tag>thinking|reasoning|analysis)\b[^>]*>.*?</(?P=tag)\s*>",
    re.IGNORECASE | re.DOTALL,
)


def strip_internal_reasoning_blocks(content: str) -> str:
    """Remove complete model reasoning blocks without touching normal markup."""
    return _REASONING_BLOCK_RE.sub("", content or "").strip()


class StreamingTagFilter:
    """Remove internal protocol and reasoning markup before SSE emission.

    Tool-call XML silences the remaining stream so it can be recovered by the
    structured-call parser. Reasoning blocks are discarded, including when
    their opening or closing tags are split across provider chunks; ordinary
    answer text after a reasoning block continues streaming.
    """

    __slots__ = ("_buffer", "_silenced", "_reasoning_close")

    _REASONING_TAGS = ("thinking", "reasoning", "analysis")

    def __init__(self) -> None:
        self._buffer = ""
        self._silenced = False
        self._reasoning_close = None

    def feed(self, chunk: str) -> str:
        if self._silenced or not chunk:
            return ""
        self._buffer += chunk
        output = []

        while self._buffer:
            if self._reasoning_close:
                lower = self._buffer.lower()
                closing = lower.find(self._reasoning_close)
                if closing < 0:
                    # Discard reasoning while retaining only enough suffix to
                    # recognize a closing tag split across chunks.
                    keep = min(len(self._buffer), len(self._reasoning_close) - 1)
                    self._buffer = self._buffer[-keep:] if keep else ""
                    break
                self._buffer = self._buffer[closing + len(self._reasoning_close):]
                self._reasoning_close = None
                continue

            opening = self._buffer.find("<")
            if opening < 0:
                output.append(self._buffer)
                self._buffer = ""
                break
            if opening > 0:
                output.append(self._buffer[:opening])
                self._buffer = self._buffer[opening:]
                continue

            lower = self._buffer.lower()
            if any(lower.startswith(h.lower()) for h in _XML_LEAK_HINTS):
                self._silenced = True
                self._buffer = ""
                break
            if any(h.lower().startswith(lower) for h in _XML_LEAK_HINTS):
                break

            reasoning_match = re.match(
                r"^<(thinking|reasoning|analysis)\b[^>]*>",
                self._buffer,
                re.IGNORECASE,
            )
            if reasoning_match:
                tag = reasoning_match.group(1).lower()
                self._reasoning_close = f"</{tag}>"
                self._buffer = self._buffer[reasoning_match.end():]
                continue

            possible_reasoning = tuple(f"<{tag}" for tag in self._REASONING_TAGS)
            if any(prefix.startswith(lower) for prefix in possible_reasoning):
                break

            output.append("<")
            self._buffer = self._buffer[1:]

        return "".join(output)

    def flush(self) -> str:
        if self._silenced or self._reasoning_close:
            self._buffer = ""
            return ""
        output = self._buffer
        self._buffer = ""
        return output


def get_user_message(operation: str) -> str:
    return get_status_message(operation)


def _looks_like_internal_reasoning(content: str) -> bool:
    if not content:
        return False
    if re.search(r"</?(?:thinking|reasoning|analysis)\b", content, re.IGNORECASE):
        return True
    probe = content[:2500].lower()
    matches = sum(1 for p in INTERNAL_LEAK_PATTERNS if re.search(p, probe, re.MULTILINE))
    if matches >= 2:
        return True
    first_line = content.strip().split("\n")[0].lower()
    strong_starts = (
        "the user wants", "the user is asking", "i should", "i need to",
        "let me", "based on the", "step 1", "first,",
    )
    if any(first_line.startswith(s) for s in strong_starts):
        return True
    return False


def _strip_internal_lines(content: str) -> str:
    if not content:
        return ""
    cleaned = []
    for line in content.splitlines():
        low = line.strip().lower()
        if (
            low.startswith("the user wants")
            or low.startswith("the user is asking")
            or low.startswith("i should")
            or low.startswith("i need to")
            or low.startswith("i will search")
            or low.startswith("i will fetch")
            or low.startswith("i will look")
            or low.startswith("let me")
            or low.startswith("based on the rag")
            or low.startswith("based on the web search")
            or low.startswith("based on the search results")
            or re.match(r"^\d+\.\s+(first|second|third|then|next|finally)\b", low)
            or re.match(r"^(first,|second,|next,|finally,|step \d+)", low)
        ):
            continue
        cleaned.append(line)
    return "\n".join(cleaned).strip()


_FETCH_FAIL_PATTERNS = re.compile(
    r"^\[(?:TIMEOUT|ERROR|CACHED)\]|^No result$|^\[No content fetched",
    re.IGNORECASE,
)


def _evaluate_fetch_quality(tool_outputs: list) -> tuple[int, int]:
    total = 0
    good = 0
    for out in tool_outputs:
        if out.get("name") != "fetch_full_text":
            continue
        total += 1
        content = out.get("content", "")
        if not content or _FETCH_FAIL_PATTERNS.match(content) or len(content) < FETCH_MIN_USEFUL_CHARS:
            continue
        good += 1
    return good, total


async def sanitize_final_response(content: str, query: str, sources: list[str], headers: dict) -> str:
    if not _looks_like_internal_reasoning(content):
        return content

    without_blocks = strip_internal_reasoning_blocks(content)
    if without_blocks and not _looks_like_internal_reasoning(without_blocks):
        logger.warning("[FINAL] Removed internal reasoning block locally")
        return without_blocks

    logger.warning("[FINAL] Detected internal reasoning leakage; rewriting final response")
    rewrite_prompt = [
        {
            "role": "system",
            "content": (
                "You are OreoLook. Rewrite drafts into final user-facing answers only. "
                "Never reveal internal reasoning, planning, tool strategy, cache logic, or step-by-step deliberation."
            ),
        },
        {
            "role": "user",
            "content": (
                f"User query: {query}\n\n"
                "Draft response (contains internal notes, remove them):\n"
                f"{content}\n\n"
                "Return only the final answer in markdown."
            ),
        },
    ]
    if sources:
        rewrite_prompt.append({
            "role": "user",
            "content": "Optional sources:\n" + "\n".join(sources[:5])
        })

    payload = {
        "model": MODEL,
        "messages": rewrite_prompt,
        "seed": random.randint(1000, 9999),
        "max_tokens": 1600,
        "stream": False,
    }
    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                requests.post,
                POLLINATIONS_ENDPOINT,
                json=payload,
                headers=headers,
                timeout=10
            ),
            timeout=12.0
        )
        response.raise_for_status()
        response_data = response.json()
        rewritten = response_data["choices"][0]["message"].get("content", "").strip()
        if rewritten and not _looks_like_internal_reasoning(rewritten):
            return rewritten
    except Exception as e:
        logger.warning(f"[FINAL] Rewrite failed, applying local sanitization fallback: {e}")

    stripped = _strip_internal_lines(content)
    if stripped and not _looks_like_internal_reasoning(stripped):
        return stripped

    fallback = f"Here is a concise update on '{query}'."
    if sources:
        from pipeline.utils import clean_source_list
        from urllib.parse import urlparse
        cleaned = clean_source_list(sources)[:3]
        if cleaned:
            fallback += "\n\n**Sources:**\n" + "\n".join(
                [f"- [{urlparse(s).netloc.replace('www.', '')}]({s})" for s in cleaned]
            )
    return fallback


def _decompose_query(query: str) -> list[str]:
    if not query or len(query) < 50:
        return [query]

    parts = re.split(r'\s+(?:and|or|also|additionally|furthermore)\s+', query, maxsplit=2)
    if len(parts) > 1:
        logger.info(f"[DECOMPOSITION] Split query into {len(parts)} parts")
        return [p.strip() for p in parts if p.strip()]

    if '?' in query:
        parts = query.split('?')
        if len(parts) > 1:
            questions = [p.strip() + '?' for p in parts[:-1] if p.strip()]
            if len(questions) > 1:
                logger.info(f"[DECOMPOSITION] Found {len(questions)} questions in query")
                return questions

    return [query]


async def _decompose_query_with_llm(query: str, headers: dict, max_parts: int = TOPIC_DECOMPOSITION_MAX_PARTS) -> list[str]:
    # Extract the core subject from the query (strip filler like "do a deep research on")
    _subject_clean = re.sub(
        r"^(?:do (?:a )?)?(?:deep |detailed |comprehensive |thorough )?(?:research|search|dive|analysis|investigation)?\s*(?:on|about|into|for|regarding)?\s*",
        "", query, flags=re.IGNORECASE
    ).strip() or query

    decomposition_prompt = [
        {
            "role": "system",
            "content": (
                f"You are a query decomposition engine. The user wants to research: \"{_subject_clean}\"\n\n"
                f"Break this into {max_parts} specific, DISTINCT research angles.\n\n"
                f"STRICT RULES:\n"
                f"1. Every sub-question MUST contain the subject \"{_subject_clean}\" (or its key terms).\n"
                f"2. Each sub-question must explore a DIFFERENT angle — no duplicates or overlapping questions.\n"
                f"3. Sub-questions must be concrete and web-searchable.\n"
                f"4. Never generate generic filler like \"history of AI\" or \"future trends in technology\".\n"
                f"5. Return ONLY a JSON array of {max_parts} strings.\n\n"
                f'Example for subject "elixpo_chapter":\n'
                f'["What is elixpo_chapter and who created it?", '
                f'"What are the main projects and repositories under elixpo_chapter?", '
                f'"How has elixpo_chapter grown as an open source community — contributors, stars, forks?", '
                f'"What technology stack does elixpo_chapter use and what problems does it solve?"]\n\n'
                f'Example for subject "Rust programming language":\n'
                f'["What are Rust\'s key features and advantages over C/C++?", '
                f'"Which major companies and projects use Rust in production?", '
                f'"What is the current state of Rust\'s ecosystem — crates, tooling, community size?"]\n\n'
                f"BAD — these are all generic and don't mention the subject:\n"
                f'["What is open source?", "History of programming", "Future of AI"]'
            )
        },
        {
            "role": "user",
            "content": f"Decompose research on: {_subject_clean}"
        }
    ]

    payload = {
        "model": MODEL,
        "messages": decomposition_prompt,
        "seed": random.randint(1000, 9999),
        "max_tokens": 500,
        "stream": False,
    }

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                requests.post,
                POLLINATIONS_ENDPOINT,
                json=payload,
                headers=headers,
                timeout=12
            ),
            timeout=15.0
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()

        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        parts = json.loads(content)
        if isinstance(parts, list) and all(isinstance(p, str) for p in parts):
            valid = [p.strip() for p in parts if 10 <= len(p.strip()) <= 200]

            # Deduplicate: remove sub-queries that are too similar to each other
            if valid:
                deduped = [valid[0]]
                for sq in valid[1:]:
                    sq_lower = sq.lower()
                    is_dup = False
                    for existing in deduped:
                        # Check word overlap — if >70% of words match, it's a duplicate
                        sq_words = set(sq_lower.split())
                        ex_words = set(existing.lower().split())
                        if sq_words and ex_words:
                            overlap = len(sq_words & ex_words) / min(len(sq_words), len(ex_words))
                            if overlap > 0.7:
                                is_dup = True
                                break
                    if not is_dup:
                        deduped.append(sq)

                if len(deduped) < len(valid):
                    logger.info(f"[DECOMPOSITION] Deduped {len(valid)} → {len(deduped)} sub-queries")
                valid = deduped

            if valid:
                logger.info(f"[DECOMPOSITION] LLM decomposed query into {len(valid)} sub-topics: {valid}")
                return valid[:max_parts]
    except Exception as e:
        logger.warning(f"[DECOMPOSITION] LLM decomposition failed: {e}")

    return [query]


async def _synthesize_subtopic(
    subtopic: str,
    original_query: str,
    messages_context: list,
    headers: dict,
    max_tokens: int,
    rag_context: str = "",
) -> str:
    # Keep system message + all tool results (the actual fetched content)
    synthesis_messages = list(messages_context)

    focused_prompt = {
        "role": "user",
        "content": (
            f"Using the information gathered above, write a focused response about this aspect of '{original_query}':\n\n"
            f"Sub-topic: {subtopic}\n\n"
            f"Synthesize the fetched content into a detailed answer for this specific aspect. "
            f"Use markdown formatting. Cite sources as [Title](URL). "
            f"Do not repeat information that would belong to other sub-topics. "
            f"Be thorough but concise for this specific angle.\n"
            f"NEVER mention internal tool names, function calls, or cache operations."
        )
    }
    synthesis_messages.append(focused_prompt)

    payload = {
        "model": MODEL,
        "messages": synthesis_messages,
        "seed": random.randint(1000, 9999),
        "max_tokens": max_tokens,
        "stream": False,
    }

    response = await asyncio.wait_for(
        asyncio.to_thread(
            requests.post,
            POLLINATIONS_ENDPOINT,
            json=payload,
            headers=headers,
            timeout=15
        ),
        timeout=18.0
    )
    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"]["content"].strip()
    return content
