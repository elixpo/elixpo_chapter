"""Persistent app state: one small JSON file per app under /state.

    from oreoOS import state

    data = state.load("racer", {"hi": 0})    # defaults on first run
    data["hi"] = 42
    state.save("racer", data)

Why a shared helper instead of each app writing apps/<id>/hi.txt:

  * /state lives outside apps/, so uninstalling and reinstalling an app
    from the App Store keeps its high scores and settings;
  * writes are atomic (write a temp file, then rename), so a power cut in
    the middle of a save leaves the previous version readable;
  * every app uses the same format, so a USB tool can back the files up.

Values go through JSON: tuples come back as lists, dict keys as strings.
Keep state small (a few hundred bytes). This is for scores, settings and
progress, not for media or caches. Never raises: a missing, corrupt or
unwritable file falls back to the defaults and save() returns False.
"""

try:
    import json
except ImportError:  # pragma: no cover
    import ujson as json

try:
    import os as _os
except ImportError:  # pragma: no cover
    _os = None


STATE_DIR = "/state"

_OK = "abcdefghijklmnopqrstuvwxyz0123456789_-"


def _valid(name):
    if not isinstance(name, str) or not name or len(name) > 32:
        return False
    for ch in name:
        if ch not in _OK:
            return False
    return True


def path(app):
    """The file that holds `app`'s state (app ids are lower-case names)."""
    name = app.lower() if isinstance(app, str) else app
    if not _valid(name):
        raise ValueError("bad state name: %r" % (app,))
    return STATE_DIR + "/" + name + ".json"


def app_id(module_name, default="app"):
    """The app id from a module's __name__ ("apps.racer.src.app" gives
    "racer"), so a copied template saves under its own name."""
    parts = module_name.split(".") if isinstance(module_name, str) else ()
    if len(parts) >= 2 and parts[0] == "apps" and _valid(parts[1].lower()):
        return parts[1].lower()
    return default


def read_json(p):
    """Parse the JSON object at p, or its temp copy if a save was cut
    short between the remove and the rename. None when neither parses."""
    for candidate in (p, p + ".tmp"):
        try:
            with open(candidate) as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return None


def write_json(p, data):
    """Write a JSON object to p atomically. Returns True on success."""
    tmp = p + ".tmp"
    try:
        text = json.dumps(data)   # fail before touching flash
        _ensure_dir(p.rsplit("/", 1)[0])
        with open(tmp, "w") as f:
            f.write(text)
        # FAT and LittleFS on MicroPython refuse to rename onto an existing
        # file, so remove first. read_json() covers the gap with the .tmp.
        try:
            _os.remove(p)
        except OSError:
            pass
        _os.rename(tmp, p)
        return True
    except Exception:
        return False


def _ensure_dir(d):
    if not d:
        return
    try:
        _os.stat(d)
    except OSError:
        _os.mkdir(d)


def load(app, defaults=None):
    """Return `defaults` (a dict) updated with whatever `app` saved.

    A fresh dict every call, so callers can mutate it freely. Keys that
    are in the saved file but not in defaults are kept too.
    """
    out = dict(defaults or {})
    saved = read_json(path(app))
    if saved:
        out.update(saved)
    return out


def exists(app):
    return read_json(path(app)) is not None


def save(app, data):
    """Persist a dict for `app`. Returns False (never raises) on failure."""
    if not isinstance(data, dict):
        return False
    try:
        p = path(app)
    except ValueError:
        return False
    return write_json(p, data)


def delete(app):
    """Remove `app`'s state, e.g. for a "reset progress" option."""
    p = path(app)
    for f in (p, p + ".tmp"):
        try:
            _os.remove(f)
        except OSError:
            pass


def legacy_ints(p):
    """Read a pre-/state save file of comma-separated ints ("42" or
    "80,60,100") so apps can migrate old saves. None if absent or bad."""
    try:
        with open(p) as f:
            text = f.read().strip()
        return [int(x) for x in text.split(",")] if text else None
    except Exception:
        return None


def load_migrating(app, defaults, legacy_path, keys):
    """load(), but on the first run after an update import the old
    comma-separated save at legacy_path into `keys`, save it under
    /state and delete the old file."""
    if exists(app):
        return load(app, defaults)
    out = dict(defaults or {})
    old = legacy_ints(legacy_path)
    if old and len(old) == len(keys):
        for k, v in zip(keys, old):
            out[k] = v
        if save(app, out):
            try:
                _os.remove(legacy_path)
            except OSError:
                pass
    return out
