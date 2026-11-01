"""Check that every manifest declares the same RV565 version.

Usage: python3 tools/check_version.py [expected]

With `expected` (e.g. a release tag such as v1.0.0), also check that the
manifests match it.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def versions():
    props = (ROOT / "library.properties").read_text()
    idf = (ROOT / "idf_component.yml").read_text()
    header = (ROOT / "src" / "rv565.h").read_text()
    python = (ROOT / "python" / "src" / "rv565" / "__init__.py").read_text()
    platformio = json.loads((ROOT / "library.json").read_text())
    macro = {
        part: re.search(rf"#define RV565_VERSION_{part}\s+(\d+)", header).group(1)
        for part in ("MAJOR", "MINOR", "PATCH")
    }
    return {
        "library.properties": re.search(r"^version=(\S+)$", props, re.M).group(1),
        "idf_component.yml": re.search(r'^version:\s*"([^"]+)"', idf, re.M).group(1),
        "src/rv565.h": "{MAJOR}.{MINOR}.{PATCH}".format(**macro),
        "library.json": platformio["version"],
        "python/src/rv565/__init__.py": re.search(r'^__version__ = "([^"]+)"', python, re.M).group(1),
    }


def main():
    found = versions()
    for name, version in found.items():
        print(f"{name}: {version}")
    if len(set(found.values())) != 1:
        sys.exit("version mismatch between manifests")
    if len(sys.argv) > 1:
        expected = sys.argv[1].removeprefix("v")
        if expected not in found.values():
            sys.exit(f"manifests say {found['src/rv565.h']}, expected {expected}")


if __name__ == "__main__":
    main()
