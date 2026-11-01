#!/usr/bin/env python3
"""rv565: encode, inspect, verify and export RV565 video files.

Runs the `rv565` command from this checkout without installing it; with the
package installed (`pip install rv565`) the same command is just `rv565`.
See `python -m rv565.cli --help` or python/src/rv565/cli.py.
"""

import sys
from pathlib import Path

# Put the package ahead of this file's own directory, which would otherwise
# make `import rv565` load this script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "python" / "src"))

from rv565.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
