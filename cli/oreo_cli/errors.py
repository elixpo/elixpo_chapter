"""Errors the CLI reports to the user (one line plus an optional hint).

Exit status (documented in docs/CLI.md, "Exit status"):

    0    success
    1    error (the command failed; the message says why)
    2    usage error (bad arguments, missing argument)
    3    no badge found, or more than one and no --port
    4    the badge could not be reached: port busy or missing, no answer,
         connection lost
    5    the badge is not running FaleraOS (or the FaleraOS on it is too old
         for this command)
    130  cancelled (Ctrl-C, or "no" at a confirmation)
"""

import contextlib

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_USAGE = 2
EXIT_NO_BADGE = 3
EXIT_LINK = 4
EXIT_NO_OREOOS = 5
EXIT_CANCELLED = 130


class OreoError(Exception):
    """A failure with a message meant for the user.

    `hint` says what to do about it; `code` is the process exit status.
    """

    code = EXIT_ERROR

    def __init__(self, message, hint=None):
        super().__init__(message)
        self.message = message
        self.hint = hint


class UsageError(OreoError):
    """The command line is incomplete or contradictory."""
    code = EXIT_USAGE


class NoBadge(OreoError):
    code = EXIT_NO_BADGE


class ManyBadges(OreoError):
    code = EXIT_NO_BADGE


class LinkError(OreoError):
    """The serial link failed: port busy or gone, no answer, unplugged."""
    code = EXIT_LINK


class BadgeError(OreoError):
    """Code running on the badge raised. `detail` is the badge traceback."""

    def __init__(self, message, detail="", hint=None):
        super().__init__(message, hint)
        self.detail = detail


class NoOreoOS(BadgeError):
    """The badge answers, but FaleraOS (or the part of it needed) is missing."""
    code = EXIT_NO_OREOOS


class Cancelled(OreoError):
    code = EXIT_CANCELLED


def is_serial_error(e):
    """pyserial's SerialException (an OSError), without importing pyserial
    eagerly. Other OSErrors come from files on this computer."""
    try:
        from serial import SerialException
    except ImportError:
        return False
    return isinstance(e, SerialException)


def local_error_message(e, path=None):
    """'<path>: <reason>' for an OSError about a file on this computer."""
    where = getattr(e, "filename", None) or path
    reason = getattr(e, "strerror", None) or str(e) or type(e).__name__
    return "%s: %s" % (where, reason) if where else reason


class LocalFileError(OreoError):
    """A file or folder on this computer could not be read or written."""

    def __init__(self, e, path=None):
        super().__init__(local_error_message(e, path))


@contextlib.contextmanager
def local_file(path=None):
    """Turn an OSError from reading or writing a file on this computer into
    a clear message (exit 1) instead of a lost-badge report."""
    try:
        yield
    except BrokenPipeError:
        raise
    except OSError as e:
        if is_serial_error(e):
            raise
        raise LocalFileError(e, path)


def redact(text, secrets):
    """Replace every secret (and its repr) in `text` with ***."""
    if not text:
        return text
    for s in secrets or ():
        if not s:
            continue
        escaped = s.replace("\\", "\\\\")
        forms = (repr(s), s.replace("\\", "\\\\").replace("'", "\\'"),
                 escaped.replace('"', '\\"'), repr(s)[1:-1], s)
        for form in forms:
            if form:
                text = text.replace(form, "***")
    return text
