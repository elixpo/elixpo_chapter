#!/usr/bin/env python3
"""Verify Crumb's Debian feature graph against Debian unstable."""

from __future__ import annotations

import json
import subprocess
import sys

EXPECTED_MISSING: set[tuple[str, str]] = set()


def main() -> int:
    command = [
        "cargo",
        "debstatus",
        "-p",
        "crumb-cli",
        "--no-default-features",
        "--features",
        "debian",
        "--no-dev-dependencies",
        "--no-indent",
        "--json",
    ]
    result = subprocess.run(command, check=True, text=True, capture_output=True)
    records = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]

    external: dict[str, dict[str, object]] = {}
    for record in records:
        name = str(record["name"])
        if name == "crumb-cli" or name.startswith("crumb-"):
            continue
        external[name] = record

    missing = {
        (name, str(record["cargo_lock_version"]))
        for name, record in external.items()
        if not bool(record["debian"]["in_unstable"])
    }
    incompatible = {
        (name, str(record["cargo_lock_version"]), str(record["debian"]["version"]))
        for name, record in external.items()
        if bool(record["debian"]["in_unstable"])
        and not bool(record["debian"]["exact_match"])
        and not bool(record["debian"]["compatible"])
    }

    print(f"Debian profile: {len(external)} external crates")
    print(f"Expected missing crates: {sorted(EXPECTED_MISSING)}")
    print(f"Observed missing crates: {sorted(missing)}")

    if missing != EXPECTED_MISSING:
        print("Dependency boundary changed; update the package plan intentionally.", file=sys.stderr)
        return 1
    if incompatible:
        print(f"Incompatible Debian crate versions: {sorted(incompatible)}", file=sys.stderr)
        return 1

    print("Every external crate is packaged in Debian at a compatible version.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
