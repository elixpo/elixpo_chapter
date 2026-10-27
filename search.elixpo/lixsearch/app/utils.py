import re
import logging
import sys
import json
import uuid
from datetime import datetime, timezone
import tiktoken
from pipeline.config import REQUEST_ID_HEX_SLICE_SIZE, RESPONSE_MODEL

def setup_logger(name: str) -> logging.Logger:
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        stream=sys.stdout
    )
    return logging.getLogger(name)


def count_tokens(text: str, model: str = "gpt-5-") -> int:
    try:
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except Exception as e:
        logging.warning(f"tiktoken encoding failed for model {model}: {e}, using fallback")
        return len(text) // 4


def format_openai_response(content: str, request_id: str = None) -> str:
    completion_tokens = count_tokens(content)
    prompt_tokens = 0

    response = {
        "id": request_id or f"elixpo-{uuid.uuid4().hex[:REQUEST_ID_HEX_SLICE_SIZE]}",
        "object": "chat.completion",
        "created": int(datetime.now(timezone.utc).timestamp()),
        "model": RESPONSE_MODEL,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": content
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens
        }
    }
    return json.dumps(response, ensure_ascii=False)


def validate_query(query: str, max_length: int = 5000) -> bool:

    if not query or not isinstance(query, str):
        return False
    if len(query) > max_length:
        return False
    if len(query.strip()) == 0:
        return False
    return True


def validate_session_id(session_id: str, pattern: str = r'^[a-zA-Z0-9\-_]{4,64}$') -> bool:
    if not session_id or not isinstance(session_id, str):
        return False
    return bool(re.match(pattern, session_id))


def validate_url(url: str, max_length: int = 2048) -> bool:
    if not url or not isinstance(url, str):
        return False
    if len(url) > max_length:
        return False
    if not url.startswith(('http://', 'https://')):
        return False
    return True
