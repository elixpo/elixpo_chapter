"""Crash diagnostics: full tracebacks on the console and in /crash.log.

    from oreoOS import crashlog
    try:
        app.update(dt)
    except Exception as e:
        info = crashlog.record(e, "app racer")
        # info["where"] is "apps/racer/src/app.py:212" for the crash screen

record() prints the traceback over USB serial (what `falera logs` and
`mpremote repl` show), appends it to /crash.log with the context string,
and returns a short summary for drawing. /crash.log is capped at
MAX_BYTES; older entries are dropped from the front. Never raises.

The launcher calls it for every app that crashes (the crash screen) and,
with save=False, for the first frame error of a run of them (console
only, so a flaky frame does not write flash every time). Read the log
from a computer with `falera pull /crash.log`.
"""

import sys

try:
    import io
except ImportError:  # pragma: no cover
    import uio as io

try:
    import os as _os
except ImportError:  # pragma: no cover
    _os = None


PATH = "/crash.log"
MAX_BYTES = 8 * 1024


def format_exception(err):
    """The traceback of `err` as text, on MicroPython and CPython."""
    buf = io.StringIO()
    try:
        pe = getattr(sys, "print_exception", None)
        if pe is not None:          # MicroPython
            pe(err, buf)
        else:                       # CPython host tests
            import traceback
            traceback.print_exception(type(err), err, err.__traceback__,
                                      file=buf)
    except Exception:
        buf.write("%s: %s\n" % (type(err).__name__, err))
    return buf.getvalue()


def last_frame(text):
    """'path:line' of the innermost frame in a traceback, or ''.

    Paths are shortened to start at apps/ or oreoOS/ when they can be.
    """
    where = ""
    for line in text.split("\n"):
        line = line.strip()
        if not line.startswith('File "'):
            continue
        end = line.find('"', 6)
        if end < 0:
            continue
        path = line[6:end]
        rest = line[end + 1:]
        i = rest.find("line ")
        if i < 0:
            continue
        num = ""
        for ch in rest[i + 5:]:
            if "0" <= ch <= "9":
                num += ch
            else:
                break
        for root in ("apps/", "oreoOS/", "oreoWare/"):
            j = path.find(root)
            if j >= 0:
                path = path[j:]
                break
        where = path + ":" + num if num else path
    return where


def _ticks():
    try:
        import time
        return time.time()
    except Exception:
        return 0


def _trim(path, max_bytes):
    try:
        size = _os.stat(path)[6]
    except Exception:
        return
    if size <= max_bytes:
        return
    try:
        with open(path) as f:
            text = f.read()
        keep = text[-(max_bytes // 2):]
        nl = keep.find("\n")
        if nl >= 0:
            keep = keep[nl + 1:]
        with open(path, "w") as f:
            f.write(keep)
    except Exception:
        pass


def summary(err):
    """'TypeError: message', or just the type name when there is none."""
    try:
        text = str(err)
    except Exception:
        text = ""
    name = type(err).__name__
    return "%s: %s" % (name, text) if text else name


def record(err, context="", path=None, echo=True, save=True):
    """Log `err` and return {'message', 'where', 'traceback'}.

    echo prints the traceback on the USB console; save appends it to the
    log file. Neither can raise out of here."""
    path = path or PATH
    try:
        tb = format_exception(err)
    except Exception:               # MemoryError building the buffer
        tb = ""
    msg = summary(err)
    try:
        where = last_frame(tb)
    except Exception:
        where = ""
    if echo:
        try:
            print("=== crash%s ===" % (" in " + context if context else ""))
            print(tb, end="" if tb.endswith("\n") else "\n")
        except Exception:
            pass
    if not save:
        return {"message": msg, "where": where, "traceback": tb}
    try:
        with open(path, "a") as f:
            f.write("--- t=%d %s\n" % (_ticks(), context))
            f.write(tb)
            if not tb.endswith("\n"):
                f.write("\n")
        _trim(path, MAX_BYTES)
    except Exception:
        pass
    return {"message": msg, "where": where, "traceback": tb}


def read(path=None):
    """The whole /crash.log, or '' if there is none."""
    try:
        with open(path or PATH) as f:
            return f.read()
    except Exception:
        return ""


def clear(path=None):
    try:
        _os.remove(path or PATH)
    except Exception:
        pass
