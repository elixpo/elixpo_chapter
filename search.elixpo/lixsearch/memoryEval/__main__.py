"""Command-line entry point for OreoLook memory release gates."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from .live import run_compose
from .local import run_local


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run OreoLook memory release gates")
    commands = parser.add_subparsers(dest="mode", required=True)
    local = commands.add_parser("local", help="deterministic CPU-only gate")
    local.add_argument("--output-dir", default="data/evals/memory")
    local.add_argument("--repeats", type=int, default=100)
    compose = commands.add_parser("compose", help="live two-replica gate")
    compose.add_argument("--base-url", action="append", required=True)
    compose.add_argument("--token-env", default="OREOLOOK_EVAL_TOKEN_A")
    compose.add_argument("--second-token-env", default="OREOLOOK_EVAL_TOKEN_B")
    compose.add_argument("--timeout", type=float, default=45.0)
    compose.add_argument("--output-dir", default="data/evals/memory")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.mode == "local":
        report = run_local(repeats=max(1, args.repeats))
    else:
        token = os.getenv(args.token_env, "").strip()
        if not token:
            raise SystemExit(f"Set {args.token_env} before running the live gate")
        second = os.getenv(args.second_token_env, "").strip() or None
        report = run_compose(
            base_urls=args.base_url, token=token, second_token=second, timeout=args.timeout,
        )
    json_path, markdown_path = report.write(Path(args.output_dir))
    print(f"{'PASS' if report.passed else 'FAIL'}: {json_path}")
    print(f"Report: {markdown_path}")
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
