#!/usr/bin/env python3
"""Turn an app's PNG icon into the 32x32 module the badge draws.

The badge cannot decode PNG (no PIL on MicroPython), so the launcher
loads icons as pre-baked Python modules of RGB565 bytes. This tool makes
that module for one app folder:

    python3 tools/app_icon.py apps_market/my_app
    python3 tools/app_icon.py apps_market/my_app --png ~/art/robot.png

Source, first that exists:
  1. --png PATH
  2. <app>/icon.png                       (the Universe-badge convention)
  3. <app>/assets/raw/<manifest icon>     (the FaleraOS convention)

Output: <app>/assets/optimized/<stem>.py, where <stem> is the manifest's
"icon" name without ".png" (manifest "icon" defaults to "<folder>_icon.png"
and is written back if it was missing). Transparent pixels become the
theme background, matching tools/optimize_assets.py. Any size or aspect
works; the image is fitted into 32x32 without distortion.

Needs Pillow on the host: pip install pillow
"""

import argparse
import json
import struct
import sys
from pathlib import Path

ICON_SIZE = 32
BG = (255, 248, 235)   # oreoOS/theme.py BG_R/G/B


def icon_stem(manifest, folder_name):
    icon = manifest.get("icon") or "%s_icon.png" % folder_name.lower()
    return icon.rsplit(".", 1)[0].replace("-", "_").replace(" ", "_")


def find_source(app, manifest):
    for p in (app / "icon.png",
              app / "assets" / "raw" / (manifest.get("icon") or "")):
        if p.is_file():
            return p
    return None


def png_to_rgb565(src, size=ICON_SIZE, bg=BG):
    from PIL import Image
    img = Image.open(src).convert("RGBA")
    img.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), bg + (255,))
    # Hard alpha edge, as optimize_assets does, so edges do not halo.
    alpha = img.split()[3].point(lambda v: 255 if v >= 128 else 0)
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2),
                 mask=alpha)
    rgb = canvas.convert("RGB")
    px = rgb.load()
    words = []
    for y in range(size):
        for x in range(size):
            r, g, b = px[x, y]
            words.append(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3))
    return struct.pack(">%dH" % len(words), *words)


def module_text(data, w, h):
    words = struct.unpack_from(">%dH" % (len(data) // 2), data)
    lines = ['"""Auto-generated bitmap — do not edit. Re-run tools/app_icon.py."""',
             "W = %d" % w, "H = %d" % h, "DATA = ("]
    for i in range(0, len(words), 16):
        lines.append("    b'" + "".join(
            "\\x%02x\\x%02x" % (v >> 8, v & 0xFF) for v in words[i:i + 16]) + "'")
    lines.append(")")
    return "\n".join(lines) + "\n"


def build(app, png=None):
    """Write the icon module for `app`. Returns the output path."""
    app = Path(app)
    mpath = app / "manifest.json"
    manifest = json.loads(mpath.read_text())
    stem = icon_stem(manifest, app.name)
    if not manifest.get("icon"):
        manifest["icon"] = stem + ".png"
        mpath.write_text(json.dumps(manifest, indent=2) + "\n")
    src = Path(png) if png else find_source(app, manifest)
    if src is None or not src.is_file():
        raise FileNotFoundError(
            "no icon PNG: add %s/icon.png or pass --png" % app)
    out_dir = app / "assets" / "optimized"
    out_dir.mkdir(parents=True, exist_ok=True)
    for pkg in (app / "assets", out_dir):
        init = pkg / "__init__.py"
        if not init.exists():
            init.write_text("")
    out = out_dir / (stem + ".py")
    out.write_text(module_text(png_to_rgb565(src), ICON_SIZE, ICON_SIZE))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("app", help="app folder, e.g. apps_market/my_app")
    ap.add_argument("--png", help="source image (default: icon.png in the app)")
    args = ap.parse_args(argv)
    try:
        out = build(args.app, args.png)
    except ImportError:
        print("error: needs Pillow (pip install pillow)", file=sys.stderr)
        return 2
    except (OSError, ValueError) as e:
        print("error: %s" % e, file=sys.stderr)
        return 1
    print("wrote %s" % out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
