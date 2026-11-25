#!/usr/bin/env python3
"""End-to-end evaluation of Crumb's agent against real tasks.

Each scenario in evals/scenarios/*.json runs the real `crumb` binary in a
fresh temporary workspace through `crumb exec --json`, then grades the
outcome only by checks: files and their content, commands that must
succeed, text the answer must contain, files that must not appear, and a
token budget. Scenarios call the configured model provider (Pollinations by
default) with your credential, so a run spends real tokens; once the run has
spent --max-total-tokens, the remaining scenarios are skipped and fail.

Usage:
    python3 evals/run.py [--crumb PATH] [--only NAME ...] [--timeout SECONDS]
                         [--max-total-tokens N]

Writes evals/results/<timestamp>.json and prints a summary table.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
DEFAULT_CONFIG = REPO / "crates/crumb-cli/assets/default-agent.json"


def workspace_config() -> dict:
    """The built-in default config with full tool access, safe only because
    every scenario runs in a throwaway folder."""
    config = json.loads(DEFAULT_CONFIG.read_text())
    # Crumb defines the built-in packs only when no config file exists, so a
    # written config names no pack and routes through `models` directly.
    config.pop("active_model_pack", None)
    config["permissions"] = {"mode": "full-access"}
    return config


def prepare(scenario: dict, folder: Path) -> None:
    for relative, content in scenario.get("files", {}).items():
        path = folder / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        if relative.endswith(".sh"):
            path.chmod(0o755)
    (folder / ".crumb").mkdir(exist_ok=True)
    (folder / ".crumb/agent.json").write_text(json.dumps(workspace_config(), indent=2))
    subprocess.run(["git", "init", "-q"], cwd=folder, check=True)
    subprocess.run(["git", "add", "-A"], cwd=folder, check=True)
    subprocess.run(
        ["git", "-c", "user.name=eval", "-c", "user.email=eval@example.invalid",
         "commit", "-qm", "seed"],
        cwd=folder, check=True,
    )


def run_crumb(crumb: str, folder: Path, prompt: str, timeout: int) -> tuple[dict | None, str, float]:
    started = time.monotonic()
    try:
        completed = subprocess.run(
            [crumb, "exec", "--json", "--", prompt],
            cwd=folder, capture_output=True, text=True, timeout=timeout,
            env={**os.environ, "NO_COLOR": "1"},
        )
    except subprocess.TimeoutExpired:
        return None, f"timed out after {timeout}s", time.monotonic() - started
    elapsed = time.monotonic() - started
    for line in reversed(completed.stdout.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line), completed.stderr[-2000:], elapsed
            except json.JSONDecodeError:
                break
    return None, (completed.stderr or completed.stdout)[-2000:], elapsed


def grade(scenario: dict, folder: Path, result: dict | None) -> list[str]:
    """Failed checks, empty when the scenario passed."""
    if result is None:
        return ["crumb exec produced no JSON result"]
    failures = []
    answer = result.get("response", "")
    lowered = answer.lower()
    for text in scenario.get("answer_contains", []):
        if text.lower() not in lowered:
            failures.append(f"answer lacks {text!r}")
    for pattern in scenario.get("answer_matches", []):
        if not re.search(pattern, answer, re.IGNORECASE | re.MULTILINE):
            failures.append(f"answer does not match /{pattern}/")
    for text in scenario.get("answer_excludes", []):
        if text.lower() in lowered:
            failures.append(f"answer contains {text!r}")
    for relative, expected in scenario.get("file_contains", {}).items():
        path = folder / relative
        if not path.is_file():
            failures.append(f"{relative} is missing")
        elif expected not in path.read_text(errors="replace"):
            failures.append(f"{relative} lacks {expected!r}")
    for relative in scenario.get("files_absent", []):
        if (folder / relative).exists():
            failures.append(f"{relative} should not exist")
    if scenario.get("no_new_files"):
        status = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=all"],
            cwd=folder, capture_output=True, text=True,
        ).stdout
        created = [line[3:] for line in status.splitlines()
                   if line.startswith("??") and not line[3:].startswith(".crumb/")]
        if created:
            failures.append(f"created files in the workspace: {', '.join(created)}")
    for command in scenario.get("commands_succeed", []):
        check = subprocess.run(command, cwd=folder, shell=True, capture_output=True, text=True)
        if check.returncode != 0:
            failures.append(f"`{command}` failed: {(check.stdout + check.stderr).strip()[-300:]}")
    usage = result.get("usage", {})
    spent = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
    budget = scenario.get("max_tokens")
    if budget and spent > budget:
        failures.append(f"used {spent} tokens, budget {budget}")
    if result.get("finish_reason") not in ("stop", None):
        failures.append(f"finished with {result.get('finish_reason')}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    # The repo's own build first: an installed `crumb` may be an older release.
    built = REPO / "target/release/crumb"
    parser.add_argument("--crumb", default=str(built) if built.exists() else shutil.which("crumb"))
    parser.add_argument("--only", nargs="*", default=[])
    parser.add_argument("--timeout", type=int, default=600)
    # A full run uses about 430k tokens; this stops a misbehaving model from
    # draining the credential.
    parser.add_argument("--max-total-tokens", type=int, default=600_000)
    parser.add_argument("--keep", action="store_true", help="keep workspaces for inspection")
    arguments = parser.parse_args()
    arguments.crumb = str(Path(arguments.crumb).resolve())
    if not Path(arguments.crumb).exists():
        print(f"crumb binary not found: {arguments.crumb} (build with cargo build --release -p crumb-cli)")
        return 2
    scenarios = sorted((ROOT / "scenarios").glob("*.json"))
    if arguments.only:
        scenarios = [path for path in scenarios if path.stem in arguments.only]
    results = []
    for path in scenarios:
        spent = sum(result["tokens"] for result in results)
        if spent >= arguments.max_total_tokens:
            failure = f"skipped: run budget of {arguments.max_total_tokens} tokens spent"
            results.append({"scenario": path.stem, "passed": False, "failures": [failure], "tokens": 0})
            print(f"SKIP  {path.stem:<28} {failure}", flush=True)
            continue
        scenario = json.loads(path.read_text())
        folder = Path(tempfile.mkdtemp(prefix=f"crumb-eval-{path.stem}-"))
        try:
            prepare(scenario, folder)
            result, log, elapsed = run_crumb(arguments.crumb, folder, scenario["prompt"], arguments.timeout)
            failures = grade(scenario, folder, result)
        finally:
            if not arguments.keep:
                shutil.rmtree(folder, ignore_errors=True)
        usage = (result or {}).get("usage", {})
        tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
        results.append({
            "scenario": path.stem,
            "category": scenario.get("category", ""),
            "passed": not failures,
            "failures": failures,
            "tokens": tokens,
            "cached_tokens": usage.get("cached_input_tokens", 0),
            "seconds": round(elapsed, 1),
            "answer": (result or {}).get("response", "")[:2000],
            "log": "" if result else log,
            "workspace": str(folder) if arguments.keep else None,
        })
        mark = "PASS" if not failures else "FAIL"
        print(f"{mark}  {path.stem:<28} {tokens:>8} tok  {elapsed:6.1f}s  {'; '.join(failures)}", flush=True)
    passed = sum(result["passed"] for result in results)
    print(f"\n{passed}/{len(results)} passed · {sum(r['tokens'] for r in results)} tokens")
    output = ROOT / "results"
    output.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    (output / f"{stamp}.json").write_text(json.dumps(results, indent=2))
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
