"""One look for every command: headers, tables, progress, errors, prompts.

Everything the CLI prints goes through a UI object so the style stays
consistent and tests can capture output. `rich` draws it; if rich is not
installed (a bare test environment) a plain-text fallback keeps working.
"""

import contextlib
import getpass
import re
import sys

try:
    from rich import box
    from rich.console import Console
    from rich.markup import escape as _rich_escape
    from rich.panel import Panel
    from rich.progress import (BarColumn, DownloadColumn, Progress,
                               TextColumn, TimeRemainingColumn,
                               TransferSpeedColumn)
    from rich.table import Table
    from rich.theme import Theme
    HAVE_RICH = True
except ImportError:  # pragma: no cover - exercised only without rich
    HAVE_RICH = False


# Falera palette: cookie brown for the brand, cream accents, plain status
# colours so the meaning reads in any terminal theme.
STYLES = {
    "brand":  "bold #c58b5b",
    "accent": "#e8c9a0",
    "title":  "bold",
    "ok":     "bold green",
    "warn":   "bold yellow",
    "err":    "bold red",
    "dim":    "grey58",
    "key":    "grey66",
    "th":     "bold #e8c9a0",
    "rule":   "#7a5236",
}

MARK_OK = "✓"     # check mark
MARK_ERR = "✗"    # ballot x
MARK_STEP = "→"   # right arrow
MARK_BRAND = "◆"  # black diamond

# Every kind of non-ASCII character the CLI prints (marks, rich's rules and
# boxes, the Wi-Fi signal bars, separators). If stdout cannot encode these it
# is not UTF-8: a Windows pipe or redirect uses the ANSI code page (cp1252).
_PROBE = "✓✗→◆─│╭▂▄▆█·…"
SEP = "·"         # middle dot, between "falera" and the command in headers
BARS = ("▂▄▆█", "·")  # Wi-Fi signal: filled levels, empty level
_ASCII_MARKS = {"MARK_OK": "+", "MARK_ERR": "x", "MARK_STEP": ">", "MARK_BRAND": "*",
                "SEP": "-", "BARS": ("||||", ".")}


def _can_encode(stream, text=_PROBE):
    enc = getattr(stream, "encoding", None) or "ascii"
    try:
        text.encode(enc)
        return True
    except (UnicodeError, LookupError):
        return False


def adapt_stdio(streams=None):
    """Make output safe on a terminal or pipe that is not UTF-8.

    Without this, printing a mark raises UnicodeEncodeError and the command
    dies (`falera devs > out.txt` on Windows). A stream that cannot encode the
    marks gets errors="replace", so no character can crash a command, and
    if stdout is one of them the marks switch to ASCII so ok/error lines
    still read. Returns True if it changed anything.
    """
    if streams is None:
        streams = (sys.stdout, sys.stderr)
    changed = False
    for i, stream in enumerate(streams):
        if stream is None or _can_encode(stream):
            continue
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(errors="replace")
            except Exception:
                pass
        if i == 0:
            use_ascii_marks()
        changed = True
    return changed


def use_ascii_marks():
    globals().update(_ASCII_MARKS)

_TAG = re.compile(r"\[/?[a-zA-Z#][^\[\]]*\]")


def strip_markup(text):
    return _TAG.sub("", str(text)).replace("\\[", "[")


def esc(value):
    """Escape user data (file names, SSIDs) before it goes into markup."""
    text = str(value)
    if HAVE_RICH:
        return _rich_escape(text)
    return text.replace("[", "\\[")


def human(size):
    if size is None:
        return "?"
    size = float(size)
    for unit in ("B", "KiB", "MiB", "GiB"):
        if size < 1024 or unit == "GiB":
            return ("%d %s" % (size, unit)) if unit == "B" else ("%.1f %s" % (size, unit))
        size /= 1024.0
    return "?"


class _PlainConsole:
    """Minimal stand-in for rich.Console."""

    def __init__(self, file=None):
        self.file = file or sys.stdout

    def print(self, *parts, **_kw):
        self.file.write(" ".join(strip_markup(p) for p in parts) + "\n")
        self.file.flush()


class UI:
    def __init__(self, console=None, input_fn=None, secret_fn=None,
                 color=True, assume_yes=False, interactive=None, file=None, width=None):
        if console is None:
            if HAVE_RICH:
                console = Console(theme=Theme(STYLES), highlight=False,
                                  no_color=not color, file=file, width=width)
            else:
                console = _PlainConsole(file)
        self.console = console
        self.rich = HAVE_RICH and not isinstance(console, _PlainConsole)
        self._input = input_fn or input
        self._secret = secret_fn or getpass.getpass
        self.assume_yes = assume_yes
        if interactive is None:
            try:
                interactive = sys.stdin.isatty()
            except Exception:
                interactive = False
        self.interactive = interactive

    # ── text ─────────────────────────────────────────────────────────
    def print(self, text=""):
        self.console.print(text)

    def header(self, title, subtitle=None):
        line = "[brand]%s falera[/] [dim]%s[/] [title]%s[/]" % (MARK_BRAND, SEP, title)
        if self.rich:
            self.console.rule(line, align="left", style="rule")
        else:
            self.console.print(line)
        if subtitle:
            self.console.print("[dim]%s[/]" % subtitle)

    def step(self, msg):
        self.console.print("[accent]%s[/] %s" % (MARK_STEP, msg))

    def ok(self, msg):
        self.console.print("[ok]%s[/] %s" % (MARK_OK, msg))

    def warn(self, msg):
        self.console.print("[warn]![/] %s" % msg)

    def note(self, msg):
        self.console.print("[dim]%s[/]" % msg)

    def error(self, msg, hint=None, detail=None):
        self.console.print("[err]%s %s[/]" % (MARK_ERR, msg))
        if detail:
            for line in str(detail).strip().splitlines()[-6:]:
                self.console.print("  [dim]%s[/]" % esc(line))
        if hint:
            self.console.print("  [key]hint:[/] %s" % hint)

    # ── structured output ────────────────────────────────────────────
    def kv(self, rows, title=None):
        """Aligned key/value block. rows: [(key, value), ...]."""
        if self.rich:
            grid = Table.grid(padding=(0, 2))
            grid.add_column(style="key", justify="right")
            grid.add_column()
            for k, v in rows:
                grid.add_row(str(k), str(v))
            if title:
                self.console.print(Panel(grid, title="[th]%s[/]" % title,
                                         title_align="left", border_style="rule",
                                         box=box.ROUNDED, expand=False))
            else:
                self.console.print(grid)
            return
        if title:
            self.console.print(title)
        width = max([len(str(k)) for k, _ in rows] or [0])
        for k, v in rows:
            self.console.print("  %s  %s" % (str(k).rjust(width), v))

    def table(self, columns, rows, title=None, empty="nothing here"):
        """columns: list of names (a leading '>' right-aligns)."""
        if not rows:
            self.note(empty)
            return
        if self.rich:
            t = Table(box=box.SIMPLE_HEAD, header_style="th", title=title,
                      title_style="th", title_justify="left", pad_edge=False)
            for c in columns:
                if c.startswith(">"):
                    t.add_column(c[1:], justify="right")
                else:
                    t.add_column(c)
            for r in rows:
                t.add_row(*[str(x) for x in r])
            self.console.print(t)
            return
        names = [c.lstrip(">") for c in columns]
        if title:
            self.console.print(title)
        self.console.print("  ".join(names))
        for r in rows:
            self.console.print("  ".join(strip_markup(x) for x in r))

    # ── prompts ──────────────────────────────────────────────────────
    def confirm(self, question, default=False):
        """Yes/no. --yes answers yes; with no terminal it answers the default."""
        if self.assume_yes:
            self.console.print("[warn]?[/] %s [dim](yes: --yes)[/]" % question)
            return True
        if not self.interactive:
            self.console.print("[warn]?[/] %s [dim](no terminal; pass --yes)[/]" % question)
            return default
        suffix = esc("[Y/n]" if default else "[y/N]")
        if self.rich:
            self.console.print("[warn]?[/] %s [dim]%s[/] " % (question, suffix), end="")
        else:
            self.console.print("? %s %s" % (question, suffix))
        try:
            answer = self._input("").strip().lower()
        except EOFError:
            return default
        if not answer:
            return default
        return answer in ("y", "yes")

    def ask(self, prompt, default=None):
        shown = " [dim](%s)[/]" % esc(default) if default not in (None, "") else ""
        if self.rich:
            self.console.print("[accent]%s[/] %s%s: " % (MARK_STEP, prompt, shown), end="")
        else:
            self.console.print("%s%s:" % (strip_markup(prompt), strip_markup(shown)))
        try:
            answer = self._input("").strip()
        except EOFError:
            answer = ""
        return answer or (default if default is not None else "")

    def secret(self, prompt):
        """Read a secret without echo. Never stored or printed."""
        return self._secret("%s %s: " % (MARK_STEP, strip_markup(prompt)))

    # ── progress ─────────────────────────────────────────────────────
    @contextlib.contextmanager
    def progress(self, label, total=None, unit="bytes"):
        """Yields update(done, total=None, label=None)."""
        if not self.rich:
            state = {"done": 0}

            def update(done, new_total=None, new_label=None):
                state["done"] = done
            yield update
            self.console.print("%s %s (%s)" % (MARK_OK, strip_markup(label),
                                               human(state["done"]) if unit == "bytes"
                                               else state["done"]))
            return
        columns = [TextColumn("[accent]{task.description}[/]"),
                   BarColumn(bar_width=28, style="rule",
                             complete_style="brand", finished_style="ok")]
        if unit == "bytes":
            columns += [DownloadColumn(), TransferSpeedColumn()]
        else:
            columns += [TextColumn("{task.completed:.0f}/{task.total:.0f}")]
        columns.append(TimeRemainingColumn())
        with Progress(*columns, console=self.console, transient=False) as bar:
            task = bar.add_task(label, total=total)

            def update(done, new_total=None, new_label=None):
                kw = {"completed": done}
                if new_total is not None:
                    kw["total"] = new_total
                if new_label is not None:
                    kw["description"] = new_label
                bar.update(task, **kw)
            yield update

    @contextlib.contextmanager
    def status(self, msg):
        if self.rich and getattr(self.console, "is_terminal", False):
            with self.console.status("[accent]%s[/]" % msg, spinner="dots"):
                yield
        else:
            self.step(msg)
            yield
