from __future__ import annotations

import argparse
import asyncio
import json
import os

from agents.repository_standard.core import apply_settings, audit, load_policy


async def _run(repo: str, concurrency: int, apply: bool) -> int:
    from lib.config import settings
    from lib.github.api import GitHubAPI

    token = os.getenv("ELIXPOO_GITHUB_ROLLOUT_TOKEN", "").strip() or settings.github.token
    if not token:
        raise RuntimeError("ELIXPOO_GITHUB_ROLLOUT_TOKEN or GITHUB_TOKEN is required")
    root = settings.root
    policy = load_policy(root / "config/repository_standard.yaml")
    api = GitHubAPI.from_token(token)
    try:
        result = await audit(api, root, policy, only_repo=repo, concurrency=concurrency)
        if apply:
            applied = await apply_settings(api, policy, result)
            result = {**result, "read_only": False, "applied": applied}
    finally:
        await api.close()
    print(json.dumps(result, indent=2, sort_keys=True))
    failed = any(item.get("status") == "failed" for item in result["results"])
    return 1 if failed else 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit Elixpo repository settings and main-branch rulesets")
    parser.add_argument("--repo", default="", help="Audit one repository name or owner/name")
    parser.add_argument("--concurrency", type=int, default=5)
    parser.add_argument(
        "--apply-settings",
        action="store_true",
        help="Apply repository metadata drift; branch rulesets remain read-only",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(args.repo, args.concurrency, args.apply_settings)))


if __name__ == "__main__":
    main()

