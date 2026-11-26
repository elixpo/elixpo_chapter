"""Over-the-air update client for FaleraOS.

Update model
============
A "release" is a versioned manifest file pinned to a GitHub release of
the FaleraOS repo. The manifest lists every file in the OS tree along
with its size and SHA-256, plus URLs to download each file.

CI publishes the release. The badge:

  1. Periodically (or on user request) hits the GitHub Releases API:
         GET https://api.github.com/repos/<OTA_REPO>/releases/latest
     and reads the asset called `manifest.json`.

  2. Compares manifest["version"] against oreoOS.config.VERSION.

  3. If newer, downloads every file whose local sha256 differs into the
     staging directory `/_ota/` on the badge's filesystem. Validates
     each file's hash. Writes the manifest itself last as a "ready"
     marker.

  4. Sets the OS settings flag `ota_pending=True`. The home screen
     surfaces an "Update ready, reboot to install" pill.

  5. On the next boot, `apply_pending()` runs BEFORE the launcher.
     If `/_ota/manifest.json` exists, every file under `/_ota/` is
     moved into its final location atomically (write-then-rename), the
     manifest is deleted, the staging directory removed, and the boot
     continues normally.

Why this shape
==============
* No partition swapping — the ESP32-S3 doesn't need OTA partitions for
  this, because we update files on the LittleFS filesystem rather than
  the MicroPython firmware itself. Bricking risk is bounded: if a file
  copy is interrupted, the manifest never lands and the OS keeps
  booting the old version.
* Manifest is JSON for human inspection and CI-side tooling. The
  badge's parser is the stdlib `json` module which MicroPython ships.
* Hash check on EVERY file before applying: a brownout during download
  can't corrupt the live OS because the bad bytes sit in the staging
  area until the manifest seals the deal.

Channels
========
A "channel" is a tag prefix on the GitHub release:
    stable/v1.3.0     -> stable channel
    beta/v1.4.0-rc1   -> beta channel
The OTA module fetches the latest release whose tag begins with the
channel name. Default is "stable" so badges don't auto-pick up rc
builds.
"""

import gc
import os as _os
import time

try:
    import urequests as _http
except ImportError:
    try:
        import requests as _http
    except ImportError:
        _http = None

try:
    import json as _json
except ImportError:
    _json = None

try:
    import hashlib as _hashlib
except ImportError:
    _hashlib = None


# ── tunables ────────────────────────────────────────────────────────────────

OTA_REPO       = "elixpo/falera"      # owner/repo on GitHub
STAGE_DIR      = "/_ota"
MANIFEST_NAME  = "manifest.json"
# The same release with modules precompiled to .mpy (tools/mpy_build.py)
# and a "remove" list of the .py files they replace. Only this ota.py and
# later ask for it; older ones keep installing manifest.json.
MPY_MANIFEST_NAME = "manifest-mpy.json"
PREFER_MPY     = True
DEFAULT_CHANNEL = "stable"
USER_AGENT     = "FaleraBadge-OTA"

# Chunk size for download writes. Big enough to amortise FS overhead but
# small enough not to OOM the heap when downloading a 100 KB sprite.
CHUNK_BYTES    = 4096

# Anything below this counts as a "small patch" — auto-staged without
# pestering the user. Above it we pop a confirmation dialog because the
# user is on metered WiFi at a hackathon and 2 MB of new icons is rude.
SMALL_PATCH_BYTES = 80 * 1024     # 80 KB

# Timeouts (seconds). Every HTTP call uses one of these — no unbounded
# blocking is allowed because the OS run loop polls OTA from the
# background_check tail of every frame. A hung GET freezes the whole UI
# (input events queue up but no transitions happen) so the API probe is
# kept short. Tuned down from 10s -> 4s after on-device reports of
# "press A, OS stuck" — every frame was potentially eating a 10 s GET
# while GitHub's edge throttled the badge's IP.
T_GH_API       = 8         # GitHub releases API listing (per_page=10 keeps
                           # the body in the low single-KB range; 8 s is
                           # the slow-WiFi + SSL handshake headroom)
T_MANIFEST     = 20        # manifest.json (~55 KB: two TLS handshakes,
                           # github.com then its asset CDN, plus the body;
                           # 4 s cut it short on a slow link)
T_FILE         = 20        # per file: each connect and each wait for data
MIN_RATE_BPS   = 4096      # a file's whole-request budget is
                           # T_FILE + size / MIN_RATE_BPS: the 400-490 KB
                           # assets needed 16-20 KB/s within a flat 25 s
FILE_TRIES     = 3         # attempts per file before the update gives up
SPACE_RESERVE  = 128 * 1024  # flash left free after staging (as falera-cli)

# Don't auto-probe in the first minute of boot — gives the UI time to
# settle, lets the user open the home screen / press a button without
# eating a synchronous HTTP round-trip. Manual "Check Update" from
# Settings is unaffected: it calls check() directly.
_OTA_BOOT_GRACE_S = 15 * 60   # 15 min — boot finishes in seconds, but
                              # the user wants a clean post-boot
                              # experience without a probe-driven spike
                              # for at least one drink-of-water window.
                              # Manual "Check Update" from Settings is
                              # unaffected.


# ── errors in plain words ───────────────────────────────────────────────────
#
# The Updates app (and falera-cli) used to say only "download failed". Every
# failing step now records what it was doing, on which file, and why (the
# host and reason come from oreoOS._http): last_error() for code,
# error_text() for a screen.

_err = None

STEP_WORDS = {
    "check":    "Checking for updates",
    "manifest": "Reading the release",
    "space":    "Not enough storage",
    "download": "Downloading",
    "seal":     "Saving the update",
    "apply":    "Installing",
}


def _fail(step, reason, path=""):
    global _err
    _err = {"step": step, "path": path or "", "reason": reason or "failed"}
    try:
        print("[ota] %s %s: %s" % (step, path, reason))
    except Exception:
        pass
    return None


def clear_error():
    global _err
    _err = None


def last_error():
    """{'step', 'path', 'reason'} of the last failure, or None."""
    return _err


def error_text(e=None):
    """The last failure as one plain line, e.g. 'Downloading
    oreoOS/splash.rv565: release-assets.githubusercontent.com: timed out'."""
    e = e or _err
    if not e:
        return ""
    head = STEP_WORDS.get(e.get("step"), e.get("step") or "Update")
    if e.get("path"):
        head += " " + e["path"]
    return head + ": " + (e.get("reason") or "failed")


def _http_mark(h):
    try:
        return h.error_mark()
    except Exception:
        return None


def _http_reason(h, mark, fallback):
    if mark is None:
        return fallback
    try:
        return h.error_since(mark) or fallback
    except Exception:
        return fallback


def _reason_of(e):
    try:
        from oreoOS import _http as _httpx
        return _httpx._reason(e)
    except Exception:
        return str(e) or repr(e)


def _free_bytes(path="/"):
    """Free bytes on the filesystem holding `path`; None if unknown."""
    try:
        st = _os.statvfs(path)
        return (st[1] or st[0]) * st[4]
    except Exception:
        return None


def _file_size(p):
    try:
        return _os.stat(p)[6]
    except OSError:
        return -1


# ── helpers ─────────────────────────────────────────────────────────────────

# One reusable buffer for hashing local files (peek) and the copy fallback
# in apply, instead of a fresh bytes object per 4 KB read.
_COPY_BUF = None

def _ensure_dir(path):
    """mkdir -p equivalent for MicroPython's tiny os module."""
    parts = path.split("/")
    cur   = ""
    for p in parts:
        if not p:
            continue
        cur = cur + "/" + p if cur else p
        try:
            _os.mkdir(cur)
        except OSError:
            pass


def _rm_tree(path):
    """Best-effort ``rm -rf`` for a file or directory tree.

    MicroPython raises ``OSError`` when ``listdir`` receives a regular file.
    The old implementation swallowed that exception inside the recursive
    call, so the parent never reached its file-removal fallback.  As a
    result, no staged OTA file was deleted and ``manifest.json`` caused the
    same update to run after every reboot.
    """
    try:
        entries = _os.listdir(path)
    except OSError:
        try:
            _os.remove(path)
        except OSError:
            pass
        return

    for name in entries:
        _rm_tree(path + "/" + name)
    try:
        _os.rmdir(path)
    except OSError:
        pass


def _sha256_file(path):
    """SHA-256 of a file, hex-encoded. None if the file is missing."""
    if _hashlib is None:
        return None
    global _COPY_BUF
    if _COPY_BUF is None:
        _COPY_BUF = bytearray(CHUNK_BYTES * 2)
    mv = memoryview(_COPY_BUF)
    try:
        h = _hashlib.sha256()
        with open(path, "rb") as f:
            while True:
                n = f.readinto(_COPY_BUF)
                if not n:
                    break
                h.update(mv[:n])
        return _hex(h.digest())
    except OSError:
        return None


def _hex(b):
    """Compatible hex encoding (some MP builds lack bytes.hex())."""
    try:
        return b.hex()
    except AttributeError:
        return "".join("%02x" % x for x in b)


def _current_version():
    try:
        from oreoOS.config import VERSION
        return VERSION
    except Exception:
        return "v0.0.0"


def _parse_version(s):
    """'v1.2.3' -> (1, 2, 3). Bad input -> (0, 0, 0)."""
    if not s:
        return (0, 0, 0)
    if s.startswith("v"):
        s = s[1:]
    try:
        parts = [int(x) for x in s.split(".")]
        while len(parts) < 3:
            parts.append(0)
        return tuple(parts[:3])
    except (TypeError, ValueError):
        return (0, 0, 0)


def _newer(a, b):
    """True iff version `a` (string) is strictly newer than `b`."""
    return _parse_version(a) > _parse_version(b)


def compare_version(a, b):
    """Public version-compare. Returns -1 / 0 / +1 (a vs b).
    Same semantics as cmp() on the parsed (maj, min, patch) tuples."""
    pa, pb = _parse_version(a), _parse_version(b)
    if pa == pb: return 0
    return 1 if pa > pb else -1


def latest_version(channel=DEFAULT_CHANNEL, on_progress=None):
    """Return (version_str, release_dict) for the most recent release
    on `channel`, regardless of whether it's newer than the device's
    current VERSION. (None, None) on network failure.

    Uses the lightweight /tags endpoint (~2 KB for 10 tags) to discover
    the version. The release dict is returned with `manifest_url=None`
    and empty `notes` — the heavy `/releases/latest` body is only
    fetched lazily by `check()` when the user actually wants to
    install or view the changelog. This keeps the version probe cheap
    enough to complete inside our 8 s API budget even on slow WiFi.

    Used by the Updates page to decide BETA / LTS / OUTDATED.
    """
    clear_error()
    if _json is None:
        return None, None
    try:
        from oreoOS import _http as _httpx
    except Exception:
        _fail("check", "network module missing")
        return None, None
    mark = _http_mark(_httpx)
    body = _httpx.get_url(
        "https://api.github.com/repos/%s/tags?per_page=10" % OTA_REPO,
        accept="application/vnd.github+json", timeout_s=T_GH_API,
        on_progress=on_progress)
    if body is None:
        _fail("check", _http_reason(_httpx, mark, "no answer from GitHub"))
        return None, None
    try:
        data = _json.loads(body.decode("utf-8"))
    except Exception:
        _fail("check", "GitHub sent an unreadable answer")
        return None, None
    if not isinstance(data, list):
        _fail("check", "GitHub sent an unexpected answer")
        return None, None
    # The newest version on the channel, by number: GitHub's own order is
    # not a promise (a string sort puts v2.0.9 above v2.0.13).
    prefix = channel + "/"
    best = None
    for t in data:
        tag = t.get("name", "") if isinstance(t, dict) else ""
        if not tag.startswith(prefix):
            continue
        ver = tag[len(prefix):]
        if _parse_version(ver) == (0, 0, 0):
            continue
        if best is None or _parse_version(ver) > _parse_version(best[0]):
            best = (ver, tag)
    if best is None:
        _fail("check", "no %s release found" % channel)
        return None, None
    ver, tag = best
    manifest_url = (
        "https://github.com/%s/releases/download/%s/%s"
        % (OTA_REPO, tag, MANIFEST_NAME))
    return ver, {
        "version":      ver,
        "notes":        "",
        "manifest_url": manifest_url,
        "tag":          tag,
        "major":        _is_major_bump(ver, _current_version()),
    }


def _is_major_bump(new_ver, cur_ver):
    """True when the MAJOR component changed (v1.x.x -> v2.x.x).

    Used to flag a release as a "breaking" update so the UI can warn the
    user. We treat a minor bump (1.2 -> 1.3) the same as a patch — the
    decision is binary because anything above patch can introduce new
    apps or change file layout.
    """
    a = _parse_version(new_ver)
    b = _parse_version(cur_ver)
    return a[0] != b[0]


# ── public API ──────────────────────────────────────────────────────────────

def check(channel=DEFAULT_CHANNEL):
    """Stage 1 — fast version probe. Hits GitHub's releases API and
    returns a thin dict iff a newer release exists.

    Result shape:
        {
            "version":      "v1.3.0",
            "notes":        "...",
            "manifest_url": "https://...",
            "tag":          "stable/v1.3.0",
            "major":        True/False,    # major-version bump?
        }

    Returns None on no-network / no-release / already-on-latest. Bounded
    to T_GH_API seconds so the caller can never hang on it.
    """
    # Delegate to the cheap /tags helper. `latest_version()` already
    # constructs the manifest_url from the tag, so we don't need a
    # second API call to read the full release body — which on this
    # repo can hit 3 MB and time out.
    cur = _current_version()
    ver, rel = latest_version(channel)
    if not ver or not rel:
        return None
    if not _newer(ver, cur):
        return None
    if not rel.get("manifest_url"):
        return None
    return rel


def peek(release, on_progress=None):
    """Stage 2 — fetch the manifest and compute a SHA-based diff.

    For every file in the manifest, compare the published SHA-256 to the
    hash of the local file at the same path. Files that match are
    skipped during the eventual download. The function returns the diff
    along with the total bytes the badge would need to fetch.

    Result shape:
        {
            "manifest":   {... full manifest dict ...},
            "changed":    [{path, url, sha256, size}, ...],
            "unchanged":  N,
            "bytes":      total bytes to download (size sum of `changed`),
            "small":      True iff bytes <= SMALL_PATCH_BYTES,
            "major":      True iff this is a major-version bump,
        }

    Returns None on any network / parse failure. Cheap to call — the
    manifest itself is a few KB. The expensive part (file-by-file
    download) lives in download().
    """
    clear_error()
    if not release or _json is None:
        return None
    try:
        from oreoOS import _http as _httpx
    except Exception:
        return _fail("manifest", "network module missing")
    url = release["manifest_url"]
    manifest = None
    # The precompiled (.mpy) variant first, when this firmware loads it;
    # a release without one (or an unreadable one) falls back to the
    # plain .py manifest every FaleraOS can install.
    if PREFER_MPY and url.endswith("/" + MANIFEST_NAME) and _mpy_ok("6"):
        murl = url[:-len(MANIFEST_NAME)] + MPY_MANIFEST_NAME
        manifest, _r = _get_manifest(_httpx, murl, on_progress)
        if manifest is not None and not _mpy_ok(manifest.get("mpy", "")):
            manifest = None
    if manifest is None:
        manifest, reason = _get_manifest(_httpx, url, on_progress)
        if manifest is None:
            return _fail("manifest", reason)
    gc.collect()

    changed   = []
    unchanged = 0
    total_b   = 0
    for entry in manifest.get("files", ()):
        path = entry.get("path", "")
        want = entry.get("sha256", "")
        size = int(entry.get("size", 0) or 0)
        if not path:
            continue
        local_sha = _sha256_file(path)   # None when file is missing
        if want and local_sha == want:
            unchanged += 1
        else:
            changed.append(entry)
            total_b  += size

    return {
        "manifest":  manifest,
        "notes":     manifest.get("notes", "") or "",
        "changed":   changed,
        "unchanged": unchanged,
        "bytes":     total_b,
        "small":     total_b <= SMALL_PATCH_BYTES,
        "major":     release.get("major", False) or _is_major_bump(
                        manifest.get("version", ""), _current_version()),
    }


_dl_active = False


def _get_manifest(h, url, on_progress=None, tries=2):
    """(manifest dict, None) or (None, reason). A 404 is not retried."""
    reason = "no answer"
    for _try in range(tries):
        mark = _http_mark(h)
        body = h.get_url(url, timeout_s=T_MANIFEST, on_progress=on_progress)
        if body is None:
            reason = _http_reason(h, mark, "no answer")
            if "HTTP 404" in reason:
                break
            continue
        try:
            m = _json.loads(body.decode("utf-8"))
        except Exception:
            reason = "release manifest unreadable"
            continue
        if isinstance(m, dict):
            return m, None
        reason = "release manifest unreadable"
    return None, reason


def _mpy_ok(abi):
    """True when this firmware loads bytecode .mpy files of `abi`
    ('6' or '6.3'): the major mpy version must match; a bytecode-only
    .mpy does not depend on the sub-version."""
    try:
        import sys
        v = sys.implementation._mpy
    except Exception:
        return False        # not MicroPython, or a build without .mpy
    try:
        return (v & 0xFF) == int(str(abi).split(".")[0])
    except (TypeError, ValueError):
        return False


# Paths a release may remove (never anything outside the OS and the
# built-in apps, and never the boot files).
_REMOVABLE = ("oreoOS/", "oreoWare/", "apps/")


def _removals(manifest):
    """Files to delete once a release's files are in place: its "remove"
    list (the .py files its .mpy replace), plus, for every module it
    ships, the other form left by an earlier release (x.py next to a new
    x.mpy would win the import; a stale x.mpy next to a new x.py is dead
    weight). Never a path the release itself ships."""
    paths = set()
    for e in manifest.get("files", ()):
        p = e.get("path", "")
        if p:
            paths.add(p)
    out = []
    for p in manifest.get("remove", ()) or ():
        if isinstance(p, str):
            out.append(p)
    for p in paths:
        if p.endswith(".mpy"):
            out.append(p[:-4] + ".py")
        elif p.endswith(".py"):
            out.append(p[:-3] + ".mpy")
    res = []
    for p in out:
        if (p and p not in paths and p not in res and ".." not in p
                and not p.startswith("/") and p.startswith(_REMOVABLE)
                and not p.endswith("/main.py")):
            res.append(p)
    return res


def _apply_removals(manifest):
    n = 0
    for p in _removals(manifest):
        try:
            _os.remove(p)
            n += 1
        except OSError:
            pass            # already gone
    return n


def download_busy():
    """True while download() runs (e.g. on a worker the Updates app left)."""
    return _dl_active


def download(peeked, on_progress=None, on_bytes=None, cancel=None):
    """See _download(): the same, with download_busy() True meanwhile."""
    global _dl_active
    if _dl_active:
        _fail("download", "another download is still running")
        return False
    _dl_active = True
    try:
        return _download(peeked, on_progress, on_bytes, cancel)
    finally:
        _dl_active = False


def _download(peeked, on_progress=None, on_bytes=None, cancel=None):
    """Stage 3 — download only the changed files into /_ota.

    `peeked` is the dict returned by peek(). Pre-passing it means the
    expensive SHA scan only happens once (during peek), not again here.

    on_progress(file_index, total_files, path) after each file;
    on_bytes(bytes_done, bytes_total, path) as data arrives. Every request
    is bounded (T_FILE per stall, plus a size-based budget per file); a
    file that fails is retried (FILE_TRIES) on fresh connections before
    the update gives up. Free space is checked first. On failure
    last_error() / error_text() say which file, host and reason. Returns
    True when the update is staged and sealed (manifest written last).
    cancel() is asked between files; True stops the download (nothing is
    sealed, so nothing is installed).
    """
    if not peeked:
        return False
    clear_error()
    _rm_tree(STAGE_DIR)

    changed = peeked["changed"]
    total_b = int(peeked.get("bytes", 0) or 0)
    need = total_b + SPACE_RESERVE
    free = _free_bytes("/")
    if free is not None and free < need:
        _fail("space", "need %d KB, %d KB free"
              % (need // 1024, free // 1024))
        return False

    try:
        _os.mkdir(STAGE_DIR)
    except OSError:
        pass

    total = len(changed)
    done_b = 0
    try:
        for i, entry in enumerate(changed):
            path = entry.get("path", "")
            if cancel is not None and cancel():
                _fail("download", "stopped", path)
                return False
            if not (path and entry.get("url", "")):
                _fail("download", "release lists a file without a URL", path)
                return False
            cb = None
            if on_bytes is not None:
                def cb(got, _exp, _base=done_b, _path=path):
                    try:
                        on_bytes(_base + got, total_b, _path)
                    except Exception:
                        pass
            if not fetch_file(entry, STAGE_DIR, cb):
                return False
            done_b += int(entry.get("size", 0) or 0)
            if on_progress:
                try:
                    on_progress(i + 1, total, path)
                except Exception:
                    pass
    finally:
        # Files above reuse one kept-alive TLS connection per host.
        try:
            from oreoOS import _http as _httpx
            _httpx.close_pool()
        except Exception:
            pass

    # Manifest written LAST as the all-good marker. Until this file
    # exists, apply_pending() won't promote anything from staging. It is
    # written beside its real name and renamed, so a power cut mid-write
    # cannot leave a half-written marker.
    final = STAGE_DIR + "/" + MANIFEST_NAME
    tmp = final + ".tmp"
    try:
        with open(tmp, "w") as f:
            _json.dump(peeked["manifest"], f)
        _os.rename(tmp, final)
    except Exception as e:
        _fail("seal", _reason_of(e))
        return False
    return True


def fetch_file(entry, stage=STAGE_DIR, on_data=None, tries=FILE_TRIES):
    """Download one manifest entry to <stage>/<path>, verified against its
    SHA-256 and size, retrying on fresh connections. True on success; on
    failure last_error() names the file, host and reason. Also used by
    tools/ota_probe.py with a scratch `stage`."""
    path = entry.get("path", "")
    url = entry.get("url", "")
    want = entry.get("sha256", "") or None
    size = int(entry.get("size", 0) or 0)
    try:
        from oreoOS import _http as _httpx
    except Exception:
        _fail("download", "network module missing", path)
        return False
    reason = "failed"
    for attempt in range(max(1, tries)):
        if attempt:
            # A fresh start: drop kept-alive connections (one may be what
            # broke) and give the link a moment.
            _httpx.close_pool()
            gc.collect()
            try:
                time.sleep_ms(300 * attempt)
            except AttributeError:
                time.sleep(0.3 * attempt)
        mark = _http_mark(_httpx)
        try:
            ok = _download_file(url, path, want, size, stage, on_data)
        except Exception as e:      # e.g. the flash filling up mid-write
            ok = False
            reason = _reason_of(e)
        else:
            if not ok:
                reason = _http_reason(_httpx, mark, "failed")
        if ok:
            if size and _file_size(stage + "/" + path) != size:
                reason = "size mismatch"
            else:
                return True
        if "TLS:" in reason or "HTTP 404" in reason:
            break               # retrying cannot fix these
    _fail("download", reason, path)
    return False


def _download_file(url, dest_remote, expected_sha=None, size=0,
                   stage=STAGE_DIR, on_data=None):
    """Download into the staging area mirroring the eventual remote path.

    Streams to flash through _http.download_to_file: flat RAM use, SHA-256
    checked on the fly, and the TLS connections to github.com and its
    asset CDN are reused across every file of the patch instead of two
    fresh handshakes per file. A file that fails the hash is removed.
    """
    stage_path = stage + "/" + dest_remote
    parent = stage_path.rsplit("/", 1)[0]
    _ensure_dir(parent)
    try:
        from oreoOS import _http as _httpx
    except Exception:
        return False
    cap = (size + 64 * 1024) if size else 4 * 1024 * 1024
    budget = T_FILE + size // MIN_RATE_BPS
    try:
        return _httpx.download_to_file(url, stage_path,
                                       expected_sha or None,
                                       timeout_s=T_FILE, max_bytes=cap,
                                       total_s=budget, on_data=on_data)
    except TypeError:
        # An oreoOS._http from before total_s / on_data (mixed install).
        return _httpx.download_to_file(url, stage_path,
                                       expected_sha or None,
                                       timeout_s=budget, max_bytes=cap)


def is_pending():
    """True iff a complete staged update is sitting in /_ota."""
    try:
        _os.stat(STAGE_DIR + "/" + MANIFEST_NAME)
        return True
    except OSError:
        return False


def apply_pending(on_progress=None):
    """Promote files from /_ota into their real locations. Returns the
    applied version string, or None if nothing was applied.

    SAFE to call on every boot: when no manifest is present it's a no-op.
    Called from launcher.boot() BEFORE anything else.
    """
    if _json is None:
        return None
    manifest_path = STAGE_DIR + "/" + MANIFEST_NAME
    try:
        with open(manifest_path) as f:
            manifest = _json.load(f)
    except Exception:
        return None

    files = manifest.get("files", ())
    total = len(files)
    for index, entry in enumerate(files):
        path = entry.get("path", "")
        if not path:
            continue
        src = STAGE_DIR + "/" + path
        dst = path
        try:
            _os.stat(src)
        except OSError:
            continue       # this file was skipped earlier (already up-to-date)
        # Write-then-rename style: ensure dst's parent exists, then copy.
        parent = dst.rsplit("/", 1)[0] if "/" in dst else ""
        if parent:
            _ensure_dir(parent)
        try:
            _copy_file(src, dst)
        except Exception as e:
            # Half-applied state is the worst case; the manifest still
            # exists so apply_pending() will retry on the next boot.
            _fail("apply", _reason_of(e), path)
            return None
        if on_progress:
            try:
                on_progress(index + 1, path)
            except Exception:
                pass

    # Every new file is in place: now delete the files they replace (an
    # x.py would shadow the new x.mpy). Before the marker is retired, so
    # a power cut here repeats this step at the next boot.
    _apply_removals(manifest)

    # All files are in place. Retire the ready marker first so even an
    # unexpected failure while removing the remaining staging tree cannot
    # make the next boot apply this release again.
    retired_path = STAGE_DIR + "/manifest.applied"
    try:
        _os.rename(manifest_path, retired_path)
    except OSError:
        try:
            _os.remove(manifest_path)
        except OSError:
            # Do not report success (and therefore do not reboot) while the
            # ready marker can still trigger another apply cycle.
            return None

    # The marker is gone; removing the payload is now best-effort and cannot
    # cause an update loop.
    _rm_tree(STAGE_DIR)
    gc.collect()
    return manifest.get("version", None)


def _copy_file(src, dst):
    """Move a staged file into place.

    /_ota lives on the same littlefs volume, so a rename is a metadata
    update: no data is copied and no flash pages are rewritten. If the
    destination blocks the rename it is removed first; a power cut in
    between leaves the staged file and the manifest, so the next boot
    finishes the job. Falls back to a buffered copy if rename fails.
    """
    try:
        _os.rename(src, dst)
        return
    except OSError:
        pass
    try:
        _os.remove(dst)
        _os.rename(src, dst)
        return
    except OSError:
        pass
    global _COPY_BUF
    if _COPY_BUF is None:
        _COPY_BUF = bytearray(CHUNK_BYTES * 2)
    mv = memoryview(_COPY_BUF)
    with open(src, "rb") as fi, open(dst, "wb") as fo:
        while True:
            n = fi.readinto(_COPY_BUF)
            if not n:
                break
            fo.write(mv[:n])


def discard_pending():
    """Forget any staged update without applying it.

    Used by the Settings 'cancel update' action so the badge doesn't
    apply a download the user changed their mind about.
    """
    _rm_tree(STAGE_DIR)


# The background probe's network part runs on its own thread (a
# cache.Refresh job): check() is a DNS lookup, a TLS handshake and a
# GitHub GET, up to T_GH_API plus DNS. The run loop only starts the job
# and, on a later frame, applies the result. Settings and notifications
# are written on the UI thread only, in _bg_apply().
_bg_job = None
# Foreground apps that already use the network (or the radio) heavily:
# a probe does not start while one is open. The other direction is held
# by the apps: their automatic fetches and the Updates app's check wait
# while netsvc.fetch_busy() (this probe, or the clock sync) is True. A
# user's A press in Commits, Weather or the Store does not wait, so a
# manual fetch can still overlap a probe that started on Home.
BG_SKIP_APPS = ("Updates", "App Store", "Commits", "Weather", "WiFi")
# A probe result that lands while one of these is in the foreground is
# dropped: the Updates app ran its own, newer check and owns ota_status.
BG_DROP_APPS = ("Updates",)


def _bg_gate(os_obj, min_interval_s):
    """Cheap UI-thread checks. Returns the wall-clock now (int) when a
    probe may start, else None."""
    # Opt-out gate. Default ON; users on a flaky GitHub edge can turn it
    # off from Settings.
    try:
        if not os_obj.settings_get("ota_bg_check", True):
            return None
    except Exception:
        return None
    last = 0
    try:
        last = int(os_obj.settings_get("ota_last_check_s", 0) or 0)
    except Exception:
        pass
    try:
        now = int(time.time())
    except Exception:
        return None

    # Boot-grace: never probe in the first _OTA_BOOT_GRACE_S of uptime.
    # Wall-clock, so the launcher also gates on netsvc.background_ok()
    # (ticks), which a first clock sync cannot cut short.
    try:
        boot_ts = getattr(os_obj, "_boot_ts_s", None)
        if boot_ts is not None and (now - boot_ts) < _OTA_BOOT_GRACE_S:
            return None
    except Exception:
        pass

    if now - last < min_interval_s:
        return None

    # Only probe on a working link, and never on a metered one (a phone
    # hotspot isn't billed for background traffic).
    try:
        from oreoWare import wifi
        if not wifi.is_connected():
            return None
        try:
            if wifi.is_metered():
                return None
        except Exception:
            pass
    except Exception:
        return None
    return now


def _bg_apply(os_obj, rel):
    """UI thread: record a finished probe. True iff it found a release."""
    if not rel:
        try:
            os_obj.settings_set("ota_status", "up-to-date")
        except Exception:
            pass
        return False
    # New release found: the home-screen and launcher tile dot render off
    # these flags; the warn popup fires once per `version`.
    try:
        os_obj.settings_set("ota_status",            "needs-confirm")
        os_obj.settings_set("ota_pending_version",   rel.get("version", ""))
        os_obj.settings_set("ota_pending_major",     bool(rel.get("major")))
        # Reset the "have we already warned the user about THIS version"
        # flag so the popup fires once when the user sees a new dot.
        prev_warn_for = os_obj.settings_get("ota_warned_for_version", "")
        if prev_warn_for != rel.get("version", ""):
            os_obj.settings_set("ota_pending_warn_seen", False)
    except Exception:
        pass
    push_update_notification(rel.get("version", ""))
    return True


def background_busy():
    """True while a background probe's GET is in flight."""
    return _bg_job is not None and _bg_job.busy()


def background_check(os_obj, min_interval_s=6 * 3600, foreground=None):
    """Periodic version probe, called from the OS run-loop tail every
    frame. Never blocks on the network (#118 follow-up):

      * a finished probe is collected and applied first (UI thread),
        unless Updates is open (BG_DROP_APPS): that app's own check is
        newer, so the probe's result is dropped;
      * otherwise the cheap gates run: the `ota_bg_check` setting, the
        boot grace, the 6 h rate limit, Wi-Fi up and not metered, no
        network-heavy app in the foreground, the clock-sync worker idle;
      * then check() starts on its own thread and this returns at once.

    The manual "Check Update" flow in the Updates app calls check()
    directly and is unaffected.

    Returns True on the frame that applies a probe which found a new
    release.
    """
    global _bg_job
    job = _bg_job
    if job is not None:
        if job.busy():
            return False
        if job.poll():
            _bg_job = None
            if foreground in BG_DROP_APPS:
                return False
            return _bg_apply(os_obj, job.result)
        _bg_job = None

    if foreground in BG_SKIP_APPS:
        return False
    now = _bg_gate(os_obj, min_interval_s)
    if now is None:
        return False
    try:
        from oreoOS import netsvc
        if netsvc.worker_busy():
            return False            # one network thread at a time
        if not netsvc.has_threads():
            # The job would run inline and freeze a frame for the GET:
            # leave the probe to the Updates app's manual check.
            return False
    except Exception:
        pass
    try:
        from oreoOS import cache
        from oreoOS import _http    # noqa: F401  import here, not on the thread
    except Exception:
        return False

    # Stamp before the GET so a probe that fails is not retried every
    # frame; a failure waits for the next interval like a success.
    try:
        os_obj.settings_set("ota_last_check_s", now)
    except Exception:
        pass
    job = cache.Refresh(_bg_fetch)
    if not job.start() or not job.threaded:
        # No thread could be created: the job would run inside poll() on
        # the UI thread. Drop it; the next interval tries again.
        return False
    _bg_job = job
    return False


def _bg_fetch():
    # Worker thread: network only, no settings, no drawing.
    try:
        return check()
    except Exception:
        return None


def push_update_notification(version):
    """De-duped 'Update available' push into the notification ring.

    Shared by background_check + the manual Check Update flow in
    Settings so both surfaces produce the same notif. Idempotent on
    version: if there's already a card for vX.Y.Z, this is a no-op.
    """
    if not version:
        return
    try:
        from oreoOS import notifications
        already = any(n.get("kind") == "ota" and n.get("body") == version
                      for n in notifications.items())
        if not already:
            notifications.push("ota", "Update available",
                               version, target="updates")
    except Exception:
        pass


def has_attention():
    """Single-call helper for the launcher: True iff the user should see a
    notification dot on the Settings tile + a one-shot warn popup."""
    return False    # populated by the launcher via os.settings_get()
