"""Load plaintext runtime configuration from the gitignored .env.local only."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
ENV_LOCAL = ROOT / ".env.local"


@lru_cache(maxsize=1)
def load_local_environment() -> bool:
    """Load .env.local without overriding explicitly supplied process variables."""
    if not ENV_LOCAL.is_file():
        return False
    return bool(load_dotenv(ENV_LOCAL, override=False))
