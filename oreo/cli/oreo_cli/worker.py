"""Badge jobs for the full-screen UI, without the UI toolkit.

The full-screen view (tui.py) runs every badge operation in a background
thread so the screen never freezes. This module holds the parts that do
not depend on Textual, so they can be tested on their own:

- `BadgeSession`: the one badge the view holds, with one lock. Every job
  takes the lock for as long as it talks to the badge, so two commands
  never share the serial port, whatever the person clicks meanwhile.
- `Job`: one operation, with a cancel flag. Cancelling is cooperative: the
  job stops at its next progress update, status step, prompt, or Transfer
  read (where a half-copied file is cleaned up, as for Ctrl-C), and jobs
  marked `interrupt` also get a Ctrl-C sent to the badge.
- `SinkUI`: a ui.UI whose output and prompts go to a sink (the app)
  instead of the terminal, so the command code in commands.py, owner.py,
  devtools.py, update.py and transfer.py runs unchanged inside the view.
"""

import contextlib
import threading
import time
import traceback

from . import discovery
from .badge import Badge
from .errors import Cancelled, LinkError, OreoError, is_serial_error, local_error_message
from .ui import UI, esc

try:
    from rich.rule import Rule
except ImportError:  # pragma: no cover - rich is a dependency
    Rule = None


class Job:
    """One operation on the badge. `cancellable=False` for steps that must
    not stop half way (installing a FaleraOS update)."""

    def __init__(self, title, cancellable=True, interrupt=False):
        self.title = title
        self.cancellable = cancellable
        self.interrupt = interrupt and cancellable
        self.cancel_event = threading.Event()
        self.started = False

    @property
    def cancelled(self):
        return self.cancel_event.is_set()

    def cancel(self):
        """Ask the job to stop. Returns False when it cannot be cancelled."""
        if not self.cancellable:
            return False
        self.cancel_event.set()
        return True

    def check(self):
        """Raise Cancelled if the job was asked to stop."""
        if self.cancel_event.is_set():
            raise Cancelled("stopped: %s" % self.title)


class BadgeSession:
    """The badge the view holds: FaleraOS stays paused while it is entered,
    and restarts when the session closes."""

    def __init__(self, ctx, on_text=None):
        self.ctx = ctx
        self.lock = threading.Lock()
        self.badge = None
        self.port = None
        self.serial = None
        self.job = None            # the job holding the lock
        self.on_text = on_text     # badge log lines (-v)

    @property
    def busy(self):
        return self.lock.locked()

    def attach(self, port):
        """Use the badge on `port` (no I/O: the port opens on first use)."""
        self.port = port
        self.serial = next((p.serial for p in discovery.find_badges(self.ctx.comports)
                            if p.device == port), None)
        b = Badge(self.ctx.link(port), on_text=self.on_text)
        b.port = port
        self.badge = b
        return b

    def run(self, job, fn, on_start=None):
        """Run fn(badge) holding the lock. Called in a worker thread."""
        job.check()
        with self.lock:
            job.check()           # cancelled while it waited for the badge
            self.job = job
            job.started = True
            try:
                if on_start is not None:
                    on_start()
                return fn(self.badge)
            finally:
                self.job = None

    def cancel(self):
        """Cancel the running job; returns it (None when there is none)."""
        job = self.job
        if job is None:
            return None
        if job.cancel() and job.interrupt and self.badge is not None:
            interrupt = getattr(self.badge.link, "interrupt", None)
            if interrupt is not None:
                try:
                    interrupt()       # Ctrl-C: the badge stops the snippet
                except Exception:
                    pass
        return job

    @property
    def paused(self):
        return bool(self.badge is not None and self.badge.entered)

    def close(self, mode="soft", wait=20.0):
        """Restart FaleraOS (unless mode is none) and let go of the port.
        Waits up to `wait` seconds for a running job to stop first."""
        b = self.badge
        if b is None:
            return
        job = self.job
        if job is not None:
            job.cancel()
        got = self.lock.acquire(timeout=wait)
        try:
            from .main import finish_shielded     # main imports this module lazily
            finish_shielded(b, mode)
        finally:
            self.badge = None
            if got:
                self.lock.release()

    def drop(self):
        """Forget the badge after the link failed (unplugged): close the
        port without trying to restart anything."""
        b, self.badge = self.badge, None
        if b is not None:
            try:
                b.link.close()
            except Exception:
                pass

    def still_plugged(self):
        try:
            return any(p.device == self.port for p in discovery.find_badges(self.ctx.comports))
        except OreoError:
            return False


def explain(e):
    """(level, message, hint, detail, link_lost) for an error a job raised,
    worded as main.main() words it for a command."""
    if isinstance(e, Cancelled):
        return "warn", e.message, None, None, False
    if isinstance(e, KeyboardInterrupt):
        return "warn", "stopped", None, None, False
    if isinstance(e, OreoError):
        return ("error", e.message, e.hint, getattr(e, "detail", None),
                isinstance(e, LinkError))
    if isinstance(e, OSError):
        if is_serial_error(e):
            return ("error", "lost the connection to the badge (%s)" % esc(e),
                    "plug it back in and choose it again", None, True)
        return "error", esc(local_error_message(e)), None, None, False
    if type(e).__name__ == "TransportError":
        return ("error", "the badge did not answer (%s)" % esc(e),
                "unplug and replug the badge, then run `falera doctor`", None, True)
    return ("error", "unexpected error: %s: %s" % (type(e).__name__, esc(e)),
            "this is a bug in falera; please report it at https://github.com/elixpo/falera/issues",
            traceback.format_exc(), False)


class _SinkConsole:
    """What ui.UI calls on its console, forwarded to sink.sink_log()."""

    is_terminal = False

    def __init__(self, sink):
        self.sink = sink

    def print(self, *objects, end="\n", **_kw):
        for obj in objects:
            if isinstance(obj, str) and not obj.strip() and end == "":
                continue
            self.sink.sink_log(obj)

    def rule(self, title="", align="left", style="rule", **_kw):
        self.sink.sink_log(Rule(title, align=align, style=style) if Rule else title)


class Sink:
    """What a SinkUI needs from its host. tui.OreoApp implements it with
    thread-safe calls into the screen; tests use a recording one."""

    def sink_log(self, renderable):
        raise NotImplementedError

    def sink_progress(self, label, done, total, unit):
        """label None: the progress bar is finished."""
        raise NotImplementedError

    def sink_status(self, message):
        """message None: the spinner is finished."""
        raise NotImplementedError

    def sink_ask(self, kind, prompt, default, job):
        """kind: confirm | text | secret. Blocks the worker thread until the
        person answers; returns None when they dismiss the question."""
        raise NotImplementedError


class SinkUI(UI):
    """ui.UI for command code running in a job: same calls, shown in the
    full-screen view. Prompts are dialogs; Escape cancels the job."""

    PROGRESS_EVERY = 0.1      # seconds between progress updates sent to the screen

    def __init__(self, sink, job=None, assume_yes=False, clock=time.monotonic):
        super().__init__(console=_SinkConsole(sink), assume_yes=assume_yes,
                         interactive=True)
        self.rich = Rule is not None
        self.sink = sink
        self.job = job
        self.clock = clock

    def _check(self):
        if self.job is not None:
            self.job.check()

    def _ask(self, kind, prompt, default):
        self._check()
        answer = self.sink.sink_ask(kind, prompt, default, self.job)
        self._check()
        return answer

    def confirm(self, question, default=False):
        if self.assume_yes:
            self.console.print("[warn]?[/] %s [dim](yes: --yes)[/]" % question)
            return True
        answer = self._ask("confirm", question, default)
        if answer is None:
            answer = False
        self.console.print("[warn]?[/] %s [dim]%s[/]" % (question, "yes" if answer else "no"))
        return bool(answer)

    def ask(self, prompt, default=None):
        answer = self._ask("text", prompt, default)
        if answer is None:
            raise Cancelled("cancelled")
        answer = answer.strip()
        return answer or (default if default is not None else "")

    def secret(self, prompt):
        answer = self._ask("secret", prompt, None)
        if answer is None:
            raise Cancelled("cancelled")
        return answer

    @contextlib.contextmanager
    def progress(self, label, total=None, unit="bytes"):
        self._check()
        state = {"last": 0.0, "done": 0, "total": total, "label": label}
        self.sink.sink_progress(label, 0, total, unit)

        def update(done, new_total=None, new_label=None):
            self._check()        # Cancel stops here, between two chunks
            state["done"] = done
            if new_total is not None:
                state["total"] = new_total
            if new_label is not None:
                state["label"] = new_label
            now = self.clock()
            finished = state["total"] is not None and done >= state["total"]
            if finished or now - state["last"] >= self.PROGRESS_EVERY:
                state["last"] = now
                self.sink.sink_progress(state["label"], done, state["total"], unit)
        try:
            yield update
        finally:
            self.sink.sink_progress(None, state["done"], state["total"], unit)

    @contextlib.contextmanager
    def status(self, msg):
        self._check()
        self.sink.sink_status(msg)
        try:
            yield
        finally:
            self.sink.sink_status(None)
        self._check()


class RenderUI(UI):
    """ui.UI that collects what a command would print, for a pane to show
    (the Status, Profile and Wi-Fi panes reuse the commands' own tables)."""

    def __init__(self):
        self.items = []
        super().__init__(console=_SinkConsole(self), interactive=False)
        self.rich = Rule is not None

    def sink_log(self, renderable):
        self.items.append(renderable)

    def renderable(self):
        from rich.console import Group
        from rich.text import Text
        return Group(*[Text.from_markup(x) if isinstance(x, str) else x for x in self.items])
