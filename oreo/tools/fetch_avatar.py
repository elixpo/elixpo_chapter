"""Make a badge avatar file (/avatar.bin) for a GitHub user on this computer.

`falera setup` does this for you: it fetches the avatar of the profile's
GITHUB_USER and copies it to the badge over USB (`falera setup --avatar`
fetches it again). This script is the same conversion without a badge,
for checking the result or copying it by hand. The code is shared with
the CLI: cli/oreo_cli/avatar.py, loaded by path, so the two never drift.

The file is a 72x72 circular tile in big-endian RGB565 (corners magenta
0xF81F, transparent on the badge) with the GitHub user it was made for;
the Badge app shows it only while that user is the profile's GITHUB_USER.
It belongs to one person, so it is never committed or shipped
(.gitignore, tools/deploy.py and tools/build_release.py NEVER_SHIP).

Usage:
    python3 tools/fetch_avatar.py --user octocat              # ./avatar.bin
    python3 tools/fetch_avatar.py --user octocat --out a.bin
    python3 tools/fetch_avatar.py --from-image me.png --user octocat
    falera push avatar.bin /avatar.bin

Needs Pillow (pip install Pillow; falera-cli already depends on it).
"""

import argparse
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED = ROOT / "cli" / "oreo_cli" / "avatar.py"


def shared():
    """cli/oreo_cli/avatar.py, without importing the rest of the CLI."""
    spec = importlib.util.spec_from_file_location("oreo_avatar", SHARED)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main(argv=None):
    av = shared()
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--user", required=True,
                    help="the GitHub user the avatar is for (the badge's GITHUB_USER)")
    ap.add_argument("--out", default="avatar.bin",
                    help="where to write it (default: ./avatar.bin)")
    ap.add_argument("--from-image", metavar="FILE",
                    help="convert this picture instead of downloading the GitHub avatar")
    args = ap.parse_args(argv)
    user = args.user.strip().lstrip("@")
    try:
        if args.from_image:
            pixels = av.convert(Path(args.from_image).read_bytes())
        else:
            print("Fetching the GitHub avatar of @%s..." % user)
            pixels = av.convert(av.download(user))
        data = av.pack(user, pixels)
    except (av.AvatarError, OSError) as e:
        print("error: %s" % e, file=sys.stderr)
        return 1
    out = Path(args.out)
    out.write_bytes(data)
    print("Wrote %s (%d bytes, %dx%d, for @%s)" % (out, len(data), av.SIZE, av.SIZE, user))
    print("Copy it to the badge with: falera push %s %s" % (out, av.PATH))
    return 0


if __name__ == "__main__":
    sys.exit(main())
