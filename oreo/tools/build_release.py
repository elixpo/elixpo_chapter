"""Build a FaleraOS OTA release manifest + bundle for GitHub Releases.

Usage:
    python tools/build_release.py                  # builds the current VERSION
    python tools/build_release.py --version v1.3.0 # builds an explicit version

Output (default into ./dist/<version>/):
    manifest.json     - listing of every shipped file, with sha256 + size
                        (plain .py; what every FaleraOS release can install)
    manifest-mpy.json - the same release with the modules tools/mpy_build.py
                        selects precompiled to .mpy, and a "remove" list of
                        the .py files they replace (manifest_format 2; only
                        an ota.py that knows the format asks for it)
    files/<path>      - copy of each shipped file (mirrors device layout),
                        plus the compiled .mpy files
    bundle.tar        - everything in one tarball (alternative single-asset upload)

--mpy require (CI) fails the build unless mpy-cross is MicroPython 1.28.0's;
--mpy auto (default) builds manifest-mpy.json when it is, and warns and
skips it when not; --mpy off never builds it.

The CI workflow attaches `manifest.json` (and individually-named files,
or `bundle.tar`) to the GitHub Release. The badge's OTA client downloads
`manifest.json` first, then each individual file URL listed in it.

What goes in a release
======================
Everything `tools/deploy.py` would push to a badge EXCEPT:
  * secrets.py (generated on the fly from .env at deploy time)
  * any per-user caches (apps/*/cache.txt, apps/*/state.txt)
  * pycache, .deploy_hashes.json, raw assets
  * NEVER_SHIP: personal files a checkout may still hold, such as the
    avatar module older tools/fetch_avatar.py wrote (the owner's avatar
    is /avatar.bin on the badge, made by `falera setup`, #133)

i.e. exactly what the runtime needs to boot the next version cleanly.
"""

import argparse
import hashlib
import json
import shutil
import sys
import tarfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import mpy_build  # noqa: E402

MPY_MANIFEST_NAME = "manifest-mpy.json"


# Mirrors tools/deploy.py's DEPLOY list — these are the files that
# constitute a full FaleraOS install. Kept in sync by hand for now; in a
# future tidy we can have deploy.py import this module.
SHIP_PATTERNS = [
    # OS + drivers
    "oreoOS/__init__.py",
    "oreoOS/_http.py",
    "oreoOS/tls_roots.py",
    "oreoOS/config.py",
    "oreoOS/api.py",
    "oreoOS/app.py",
    "oreoOS/cache.py",
    "oreoOS/github.py",
    "oreoOS/font.py",
    "oreoOS/gestures.py",
    "oreoOS/home.py",
    "oreoOS/icons.py",
    "oreoOS/launcher.py",
    "oreoOS/ota.py",
    "oreoOS/storage.py",
    "oreoOS/store.py",
    "oreoOS/store_io.py",
    "oreoOS/notifications.py",
    "oreoOS/notif_panel.py",
    "oreoOS/pair_prompt.py",
    "oreoOS/pixelfont.py",
    "oreoOS/power.py",
    "oreoOS/splash.py",
    "oreoOS/splash.bin",
    "oreoOS/splash.rv565",
    "oreoOS/wallpaper.bin",
    "oreoOS/sprite.py",
    "oreoOS/theme.py",
    "oreoOS/timeutil.py",
    "oreoOS/widgets.py",
    "oreoOS/entry.py",
    "oreoOS/netsvc.py",
    "oreoOS/perf.py",
    "oreoOS/bonds.py",
    "oreoOS/state.py",
    "oreoOS/profile.py",
    "oreoOS/crashlog.py",
    "oreoOS/geo.py",
    "oreoOS/busy.py",
    "oreoOS/opening.py",
    "oreoOS/hostui.py",
    "oreoOS/usbhost.py",
    "oreoOS/mascot.png",
    "oreoWare/__init__.py",
    "oreoWare/_st7789.py",
    "oreoWare/battery.py",
    "oreoWare/bt.py",
    "oreoWare/buttons.py",
    "oreoWare/display.py",
    "oreoWare/imu.py",
    "oreoWare/ir.py",
    "oreoWare/os.py",
    "oreoWare/pins.py",
    "oreoWare/wifi.py",
]

# Glob-style trees that ship verbatim.
SHIP_GLOBS = [
    "assets/fonts/__init__.py",
    "assets/fonts/optimized/__init__.py",
    "assets/fonts/optimized/pixelify_*.py",
    "assets/icons/__init__.py",
    "assets/icons/optimized/__init__.py",
    "assets/icons/optimized/*.py",
    "assets/sprites/__init__.py",
    "assets/sprites/optimized/__init__.py",
    "assets/sprites/optimized/*.py",
    "assets/status/__init__.py",
    "assets/status/optimized/__init__.py",
    "assets/status/optimized/*.py",
    "assets/__init__.py",
    "apps/*/main.py",
    "apps/*/manifest.json",
    "apps/*/__init__.py",
    # Modular apps keep their code in src/ (main.py is only a shim), so an
    # OTA that skipped src/ would ship a new shim over stale code.
    "apps/*/src/**/*.py",
    "apps/*/src/**/*.mpy",
    "apps/reader/assets/*.md",
    "apps/reader/assets/*.txt",
    "apps/*/assets/__init__.py",
    "apps/*/assets/optimized/__init__.py",
    "apps/*/assets/optimized/*.py",
]


# Never in a release, even when a checkout still has them on disk.
NEVER_SHIP = frozenset((
    "apps/badge/assets/optimized/avatar.py",
))


def _collect_paths():
    """Return [(local_path, remote_path)] for every shipping file, sorted."""
    seen = set()
    out  = []
    def _add(p):
        rel = p.relative_to(REPO_ROOT).as_posix()
        if rel in seen or rel in NEVER_SHIP:
            return
        seen.add(rel)
        out.append((p, rel))

    for s in SHIP_PATTERNS:
        p = REPO_ROOT / s
        if p.exists():
            _add(p)

    for g in SHIP_GLOBS:
        for p in sorted(REPO_ROOT.glob(g)):
            if p.is_file() and "__pycache__" not in p.parts \
                    and "tests" not in p.parts[2:]:
                _add(p)

    out.sort(key=lambda t: t[1])
    return out


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _read_version():
    """Pull the live VERSION constant from oreoOS/config.py."""
    sys.path.insert(0, str(REPO_ROOT))
    if "oreoOS.config" in sys.modules:
        del sys.modules["oreoOS.config"]
    from oreoOS.config import VERSION
    return VERSION


def _entry(dest, remote, base_url):
    """Manifest entry for the file at `dest` shipped as `remote`."""
    # GitHub Releases assets are stored at one URL per file, named to
    # avoid path collisions. We flatten slashes to '_' for the download
    # URL while keeping the original `path` in the manifest.
    flat_name = remote.replace("/", "_")
    return {
        "path":   remote,
        "url":    (base_url + flat_name) if base_url else flat_name,
        "size":   dest.stat().st_size,
        "sha256": _sha256(dest),
    }


def build_mpy_manifest(manifest, files_dir, mpy_cross, base_url=""):
    """manifest-mpy.json's dict: `manifest` with every module
    mpy_build.should_compile() picks replaced by its .mpy (compiled into
    files_dir), and the replaced .py paths under "remove"."""
    files = []
    remove = []
    for e in manifest["files"]:
        remote = e["path"]
        if not mpy_build.should_compile(remote):
            files.append(dict(e))
            continue
        mremote = mpy_build.mpy_path(remote)
        dest = mpy_build.compile_file(mpy_cross, files_dir / remote,
                                      files_dir / mremote, remote)
        files.append(_entry(dest, mremote, base_url))
        remove.append(remote)
    out = dict(manifest)
    out["files"] = files
    out["remove"] = remove
    out["manifest_format"] = 2
    out["mpy"] = mpy_build.MPY_ABI
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", help="override the version string (default: read config.py)")
    ap.add_argument("--channel", default="stable",
                    help="release channel; tag will be <channel>/<version> (default: stable)")
    ap.add_argument("--notes",   default="",
                    help="release notes (free text; usually filled in by CI from the commit msg)")
    ap.add_argument("--asset-base-url", default="",
                    help="prefix prepended to each file's url field in the manifest. "
                         "GitHub Releases assets land at "
                         "https://github.com/<owner>/<repo>/releases/download/<tag>/<name>; "
                         "set this so OTA clients can find them. Empty = placeholder.")
    ap.add_argument("--out",     default="dist",
                    help="output directory root (default: dist/)")
    ap.add_argument("--mpy", choices=("auto", "require", "off"), default="auto",
                    help="build manifest-mpy.json with precompiled modules "
                         "(require: fail without MicroPython 1.28.0's mpy-cross)")
    ap.add_argument("--mpy-cross", default=None,
                    help="path to mpy-cross (default: $MPY_CROSS, PATH, ~/esp)")
    args = ap.parse_args(argv)

    version  = args.version or _read_version()
    out_root = REPO_ROOT / args.out / version
    out_root.mkdir(parents=True, exist_ok=True)
    files_dir = out_root / "files"
    if files_dir.exists():
        shutil.rmtree(files_dir)
    files_dir.mkdir()

    files = []
    for local, remote in _collect_paths():
        # Copy into ./files/<remote>
        dest = files_dir / remote
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(local, dest)

        # GitHub's release-assets upload endpoint rejects zero-byte files
        # with `HTTP 400: Bad Content-Length`. We have a lot of empty
        # __init__.py markers in the tree, so pad them to a single newline
        # in the COPY. The byte is semantically identical to an empty
        # __init__.py for MicroPython's import machinery, and re-hashing
        # the copy keeps the manifest in lockstep with what gh uploads.
        if dest.stat().st_size == 0:
            dest.write_bytes(b"\n")

        files.append(_entry(dest, remote, args.asset_base_url))

    manifest = {
        "version":  version,
        "channel":  args.channel,
        "tag":      "%s/%s" % (args.channel, version),
        "notes":    args.notes,
        "files":    files,
        "manifest_format": 1,
    }

    manifest_path = out_root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    mpy_path = out_root / MPY_MANIFEST_NAME
    if mpy_path.exists():
        mpy_path.unlink()
    if args.mpy != "off":
        tool = args.mpy_cross or mpy_build.find_mpy_cross()
        try:
            print("mpy-cross:", mpy_build.check(tool))
            mpy_manifest = build_mpy_manifest(manifest, files_dir, tool,
                                              args.asset_base_url)
        except mpy_build.MpyError as e:
            if args.mpy == "require":
                sys.exit("build_release: %s" % e)
            print("warning: %s; %s not built (badges install the .py "
                  "release)" % (e, MPY_MANIFEST_NAME))
        else:
            mpy_path.write_text(json.dumps(mpy_manifest, indent=2))
            print("  %s: %d modules precompiled"
                  % (MPY_MANIFEST_NAME, len(mpy_manifest["remove"])))

    # Convenience tarball.
    bundle_path = out_root / "bundle.tar"
    with tarfile.open(bundle_path, "w") as tf:
        for local, remote in _collect_paths():
            tf.add(local, arcname=remote)

    print("Built release", version)
    print("  manifest:", manifest_path)
    print("  bundle:  ", bundle_path)
    print("  files:   ", len(files), "in", files_dir)


if __name__ == "__main__":
    main()
