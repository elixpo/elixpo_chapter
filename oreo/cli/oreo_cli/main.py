"""`falera` entry point: argument parsing, help, and dispatch.

Nothing here opens a serial port. A command reaches the badge only through
Ctx.session(), after discovery has picked a port, so `--help`, `falera help`
and commands run with no badge plugged in never touch the hardware.
"""

import argparse
import contextlib
import os
import sys
import time

from . import __version__, commands, discovery
from . import transfer  # noqa: F401  registers `transfer` and `send`
from . import devtools, owner  # noqa: F401  register `new`, `app` and `setup`
from .badge import Badge
from .errors import (EXIT_CANCELLED, EXIT_ERROR, EXIT_LINK, Cancelled, OreoError, UsageError,
                     is_serial_error, local_error_message)
from .ui import UI, adapt_stdio, esc

HOME = "https://falera.elixpo.com/docs/cli/"

# name -> (one-line summary, long description with examples)
HELP = {
    "devs": ("List connected badges",
             "Lists badges found by their USB ID 303a:83ec, so nobody has to\n"
             "guess /dev/ttyACM* or COM ports. Never opens a port.\n\n"
             "  falera devs\n  falera devs --all      also show other USB serial devices"),
    "info": ("FaleraOS and firmware version, storage, Wi-Fi, battery",
             "Shows the FaleraOS and MicroPython versions, free space by category\n"
             "(system, apps, gallery, documents, misc), Wi-Fi, Bluetooth and battery.\n\n"
             "  falera info"),
    "shell": ("MicroPython REPL; FaleraOS restarts when you leave",
              "Stops FaleraOS and opens the badge's MicroPython REPL. Leave with\n"
              "Ctrl-] or Ctrl-X; FaleraOS starts again (unless --reset none).\n\n"
              "  falera shell"),
    "ls": ("List files on the badge",
           "  falera ls\n  falera ls /apps\n  falera ls :documents"),
    "push": ("Copy files to the badge",
             "Copies files (or folders with -r) to the badge with a progress bar.\n"
             "Each file is written to a temporary name, renamed into place and\n"
             "checked with SHA-256. Free space is checked first.\n\n"
             "  falera push notes.txt /documents/\n"
             "  falera push -r myapp /apps/myapp"),
    "pull": ("Copy files from the badge",
             "  falera pull /wifi_seen.json\n"
             "  falera pull -r /apps/pet ./pet-backup"),
    "screenshot": ("Save the badge's screen as a PNG",
                   "Reads the frame FaleraOS last drew, pixel for pixel, and saves it as\n"
                   "a PNG on this computer (320x240; --scale enlarges it without\n"
                   "smoothing). FaleraOS restarts after. Works on released FaleraOS\n"
                   "versions too (through oreoOS.busy when display.current() is missing).\n\n"
                   "  falera screenshot                  falera-screenshot-<date>-<time>.png here\n"
                   "  falera screenshot home.png\n"
                   "  falera screenshot docs/ --scale 2  640x480, into docs/"),
    "rm": ("Remove files from the badge",
           "Folders need -r. FaleraOS's own files and anything inside them\n"
           "(/oreoOS, /oreoWare, /assets, built-in apps, /main.py, /secrets.py,\n"
           "/wifi.json, ...) also need --force.\n\n"
           "  falera rm /documents/old.mdz\n  falera rm -r /apps/myapp"),
    "add": ("Add a photo, video or document (Gallery / Reader)",
            "Converts the file to the format FaleraOS reads, checks it fits, and\n"
            "copies it: photos and videos to the Gallery, .md/.txt to the Reader.\n"
            "Videos need ffmpeg on your PATH.\n\n"
            "  falera add holiday.jpg\n"
            "  falera add clip.mp4 --seconds 8\n"
            "  falera add talk-notes.md"),
    "transfer": ("Send files to the badge's Transfer app (code shown on the badge)",
                 "Open Transfer on the badge, run this, and type the code the badge\n"
                 "shows. Files are converted like `falera add`, sent over USB, checked\n"
                 "with SHA-256 and land in the Gallery or Reader. FaleraOS keeps running.\n\n"
                 "  falera transfer send holiday.jpg clip.mp4 notes.md\n"
                 "  falera transfer list\n"
                 "  falera transfer rm holiday.rz565"),
    "send": ("Same as `falera transfer send`",
             "  falera send holiday.jpg notes.md"),
    "apps": ("List, install, update and remove apps",
             "Uses the badge's App Store (oreoOS.store). Installing and updating\n"
             "download over the badge's Wi-Fi, so set that up first (`falera wifi`).\n\n"
             "  falera apps                 installed apps and the catalogue\n"
             "  falera apps refresh         fetch the latest catalogue\n"
             "  falera apps install snake\n"
             "  falera apps update          update every app with a newer version\n"
             "  falera apps remove snake"),
    "run": ("Run a script on the badge",
            "Stops FaleraOS, runs the file and streams its output. Ctrl-C stops it.\n\n"
            "  falera run blink.py"),
    "dev": ("Mount a folder for live editing in the REPL",
            "Stops FaleraOS, mounts a folder from your computer at /remote on the\n"
            "badge and opens the REPL there: `import mymodule` loads your local\n"
            "copy, so edits need no copying. A module is imported once; after an\n"
            "edit, `del sys.modules['mymodule']` and import it again. FaleraOS does\n"
            "not run meanwhile, and its drawer lists apps from /apps only, so to\n"
            "try an app in FaleraOS use `falera app install`. Leave with Ctrl-] or\n"
            "Ctrl-X (Ctrl-D starts FaleraOS and ends live editing).\n\n"
            "  falera dev ./scripts\n"
            "  falera dev ./scripts --run blink.py"),
    "logs": ("Follow the badge's console output",
             "Prints what FaleraOS writes to the console without stopping it.\n"
             "Ctrl-C to stop.\n\n"
             "  falera logs\n  falera logs --restart     restart FaleraOS to see boot logs"),
    "wifi": ("Scan, join, list and forget Wi-Fi networks",
             "Wi-Fi on the badge is only for the internet (App Store, updates,\n"
             "GitHub, weather, time). The password is asked for without echo,\n"
             "sent to the badge once, and never printed, logged or kept here.\n\n"
             "  falera wifi scan\n"
             "  falera wifi connect \"Home Net\"\n"
             "  falera wifi saved\n"
             "  falera wifi forget \"Old Net\""),
    "update": ("Update FaleraOS to the newest release",
               "Has the badge download the newest FaleraOS release from GitHub over\n"
               "its own Wi-Fi (the same update its Updates page does), shows the\n"
               "versions and the download size, asks, installs it, restarts the\n"
               "badge and checks the new version. Apps, photos, documents and\n"
               "saved Wi-Fi stay. Set up Wi-Fi first (`falera wifi`).\n\n"
               "  falera update                  newest stable release\n"
               "  falera update --check          only say whether there is one\n"
               "  falera update --channel beta   newest beta release\n\n"
               "Developers: --repo deploys from a FaleraOS checkout (./deploy --board)\n"
               "instead; --clean wipes the badge's files first and asks.\n\n"
               "  falera update --repo ~/src/oreo\n"
               "  falera update --repo ~/src/oreo --clean"),
    "flash": ("Reflash the firmware from a checkout",
              "Erases the badge, writes the MicroPython firmware and installs\n"
              "FaleraOS (./deploy --full). Asks before erasing. --build runs\n"
              "./build-firmware first (which never touches the badge).\n\n"
              "  falera flash --repo ~/src/oreo"),
    "doctor": ("Check cable, port, permissions and firmware",
               "Looks for the badge and explains what is wrong: wrong cable or\n"
               "port, missing serial permissions (Linux dialout), port busy, wrong\n"
               "firmware, FaleraOS missing. Ends with numbered next steps.\n"
               "Exit status 0 when nothing failed, 1 otherwise.\n\n"
               "  falera doctor"),
    "setup": ("Set the owner profile: GitHub user, name, timezone, weather",
              "Shows what the badge has now, asks for each value (Enter keeps it,\n"
              "- removes it) and writes /profile.json on the badge, which Badge,\n"
              "Commits, Weather and the clock read (docs/PROFILE.md).\n"
              "No .env.local or checkout needed. Values given as options are saved\n"
              "without prompting. The OpenWeatherMap key is asked without echo and\n"
              "never shown; an empty value removes a key. FaleraOS restarts after.\n"
              "It also copies GITHUB_USER's GitHub avatar to /avatar.bin for the\n"
              "Badge app: downloaded and converted on this computer, only when it\n"
              "is missing or made for another user (--avatar fetches it again).\n\n"
              "  falera setup\n"
              "  falera setup --show\n"
              "  falera setup --github-user octocat --name \"Mona Lisa\" --timezone 5.5\n"
              "  falera setup --lat 12.97 --lon 77.59 --weather-name Bengaluru\n"
              "  falera setup --owm-key-stdin < owm-key.txt\n"
              "  falera setup --designation \"\"     remove the title\n"
              "  falera setup --from-file .env.local   the profile keys from your .env.local\n"
              "  falera setup --set DISPLAY_NAME=\"Mona Lisa\" --set TIMEZONE_OFFSET=5.5\n"
              "  falera setup --avatar                 fetch your GitHub avatar again\n"
              "\n"
              "Keys: GITHUB_USER, DISPLAY_NAME, DISPLAY_DESIGNATION, TIMEZONE_OFFSET,\n"
              "OWM_API_KEY, and optionally WEATHER_LAT, WEATHER_LON, WEATHER_NAME.\n"
              "Without WEATHER_LAT/LON, Weather finds the badge's location itself."),
    "new": ("Make a new app folder from the app template",
            "Copies the FaleraOS app template (a counter: A adds, B subtracts) into\n"
            "./<id>, with your app's name, id, author and icon module filled in.\n"
            "The id comes from the name: \"My Game\" -> my_game.\n\n"
            "  falera new my_game\n"
            "  falera new \"My Game\" --author octocat --dir ~/oreo-apps\n"
            "  falera app install ./my_game      then try it on the badge"),
    "app": ("Install an app from a folder on this computer",
            "install checks the folder with the same rules as the repo's\n"
            "tools/validate_app.py, copies the files that belong on the badge\n"
            "to /apps/<id>/ (each one checked with SHA-256), removes files an\n"
            "earlier install left behind, and restarts FaleraOS so the Apps drawer\n"
            "lists it. Built-in apps are not replaced without --force.\n"
            "Saved data (/state/<id>.json) stays. Store apps: `falera apps`.\n\n"
            "  falera app install ./my_game\n"
            "  falera app list\n"
            "  falera app remove my_game"),
    "ui": ("The full-screen Falera view (also: `falera` alone)",
           "Opens a full-screen app for the badge: status, files, apps, Wi-Fi,\n"
           "Transfer, owner profile, app install, updates and the REPL shell,\n"
           "with progress and Cancel (Esc) for long operations. FaleraOS is paused\n"
           "while it is open and restarts when you quit (q or Ctrl-C).\n"
           "`falera` alone opens it too, or the numbered menu when the terminal\n"
           "cannot show it (set OREO_UI=menu to always get the menu).\n\n"
           "  falera ui\n  falera ui --port /dev/ttyACM1"),
    "menu": ("The numbered menu (the view for simple terminals)",
             "The line-by-line menu `falera` showed before the full-screen view:\n"
             "status, files, apps, Wi-Fi, media, Transfer, profile, app install,\n"
             "updates and the shell, one numbered choice at a time.\n\n"
             "  falera menu"),
    "help": ("Help for a command", "  falera help wifi"),
}

# OREO_UI values that ask for the numbered menu instead of the full-screen view
MENU_VALUES = ("menu", "plain", "0", "no", "off")


class Formatter(argparse.RawDescriptionHelpFormatter):
    def __init__(self, prog):
        super().__init__(prog, max_help_position=30)


def _sub(subs, name, **kw):
    summary, desc = HELP[name]
    return subs.add_parser(name, help=summary, description=summary + "\n\n" + desc,
                           formatter_class=Formatter, **kw)


def build_parser():
    p = argparse.ArgumentParser(
        prog="falera", formatter_class=Formatter,
        description="falera %s: control the Elixpo Falera Badge over USB.\n\n"
                    "Run `falera` with no command to find the badge and open the\n"
                    "full-screen view (`falera menu`: the numbered menu). Docs: %s"
                    % (__version__, HOME),
        epilog="`falera help <command>` shows details and examples.\n"
               "Exit status: 0 ok, 1 error, 2 usage, 3 no badge (or several),\n"
               "4 badge unreachable or busy, 5 FaleraOS missing, 130 cancelled.")
    p.add_argument("--version", action="version", version="falera-cli " + __version__)
    p.add_argument("-p", "--port", help="serial port (default: the one badge found; $OREO_PORT)")
    p.add_argument("--reset", choices=("soft", "hard", "none"), default="soft",
                   help="how to restart FaleraOS after a command (default: soft)")
    p.add_argument("-y", "--yes", action="store_true", help="answer yes to confirmations")
    p.add_argument("--no-color", action="store_true", help="plain output")
    p.add_argument("-v", "--verbose", action="store_true", help="show the badge's log lines")

    subs = p.add_subparsers(dest="cmd", metavar="<command>")

    s = _sub(subs, "devs")
    s.add_argument("--all", action="store_true", help="show every USB serial device")

    _sub(subs, "info")
    _sub(subs, "shell")

    s = _sub(subs, "ls")
    s.add_argument("path", nargs="?", default="/")

    s = _sub(subs, "push")
    s.add_argument("sources", nargs="+", metavar="local")
    s.add_argument("dest", metavar="badge-path")
    s.add_argument("-r", "--recursive", action="store_true", help="copy folders")
    s.add_argument("--no-verify", action="store_true", help="skip the SHA-256 check")

    s = _sub(subs, "pull")
    s.add_argument("source", metavar="badge-path")
    s.add_argument("dest", nargs="?", default=".", metavar="local")
    s.add_argument("-r", "--recursive", action="store_true", help="copy folders")

    s = _sub(subs, "screenshot")
    s.add_argument("file", nargs="?", metavar="FILE",
                   help="PNG to write, or a folder (default: falera-screenshot-<date>-<time>.png)")
    s.add_argument("--scale", type=int, default=1, metavar="N",
                   help="enlarge N times, nearest neighbour (1-8, default 1)")

    s = _sub(subs, "rm")
    s.add_argument("paths", nargs="+", metavar="badge-path")
    s.add_argument("-r", "--recursive", action="store_true", help="remove folders")
    s.add_argument("--force", action="store_true", help="allow removing FaleraOS files")

    s = _sub(subs, "add")
    s.add_argument("files", nargs="+", metavar="file")
    s.add_argument("--kind", choices=("image", "video", "document"), help="override detection")
    s.add_argument("--seconds", type=float, default=10.0, help="video length (default 10)")
    s.add_argument("--fps", type=int, default=24, help="video frame rate (default 24)")
    s.add_argument("--width", type=int, default=180, help="video width (default 180)")
    s.add_argument("--height", type=int, default=135, help="video height (default 135)")
    s.add_argument("--photo-max", type=int, default=240, help="longest photo side (default 240)")
    s.add_argument("--save", metavar="DIR", help="also keep the converted files here")

    transfer.add_arguments(_sub(subs, "transfer"))
    transfer.add_send_arguments(_sub(subs, "send"))

    s = _sub(subs, "apps")
    s.add_argument("action", nargs="?", default="list",
                   choices=("list", "refresh", "install", "update", "remove"))
    s.add_argument("app", nargs="?", help="app id (see `falera apps`)")

    s = _sub(subs, "setup")
    s.add_argument("--show", action="store_true", help="only print the profile (key hidden)")
    s.add_argument("--from-file", metavar="FILE",
                   help="take the profile keys from an .env-style file, e.g. .env.local "
                        "(other keys in it are left alone)")
    s.add_argument("--set", action="append", metavar="KEY=VALUE",
                   help="set one key by its .env name (repeatable; KEY= removes it)")
    s.add_argument("--github-user", metavar="LOGIN", help="GitHub user for Badge and Commits")
    s.add_argument("--name", metavar="TEXT", help="name on the Badge card")
    s.add_argument("--designation", metavar="TEXT", help="title under the name")
    s.add_argument("--timezone", metavar="HOURS",
                   help="hours from UTC, -12 to +14: 5.5, -4, +05:30")
    s.add_argument("--lat", metavar="DEG", help="weather latitude, -90 to 90")
    s.add_argument("--lon", metavar="DEG", help="weather longitude, -180 to 180")
    s.add_argument("--weather-name", metavar="TEXT", help="place name shown by Weather")
    s.add_argument("--owm-key", metavar="KEY", help="OpenWeatherMap API key (prefer the prompt)")
    s.add_argument("--owm-key-stdin", action="store_true",
                   help="read the OpenWeatherMap key from standard input")
    s.add_argument("--avatar", action="store_true",
                   help="fetch GITHUB_USER's GitHub avatar again and copy it to the badge "
                        "(alone: only that)")
    s.add_argument("--no-avatar", action="store_true",
                   help="leave /avatar.bin alone (no download)")

    s = _sub(subs, "new")
    s.add_argument("name", help="app name or id, e.g. my_game or \"My Game\"")
    s.add_argument("--name", dest="display_name", metavar="TEXT",
                   help="name shown on the badge (default: from the id)")
    s.add_argument("--author", help="your GitHub handle (default: from git config)")
    s.add_argument("--dir", metavar="PATH", help="where to create it (default: here)")

    s = _sub(subs, "app")
    s.add_argument("action", choices=("install", "list", "remove"))
    s.add_argument("target", nargs="?", metavar="folder|id",
                   help="install: the app folder; remove: the app id")
    s.add_argument("--force", action="store_true", help="install over a built-in app")
    s.add_argument("--no-verify", action="store_true", help="skip the SHA-256 check")

    s = _sub(subs, "run")
    s.add_argument("file")

    s = _sub(subs, "dev")
    s.add_argument("folder")
    s.add_argument("--run", metavar="FILE", help="run this file from the folder after mounting")

    s = _sub(subs, "logs")
    s.add_argument("--restart", action="store_true", help="restart FaleraOS to show boot logs")

    s = _sub(subs, "wifi")
    s.add_argument("action", nargs="?", default="saved",
                   choices=("scan", "connect", "saved", "forget"))
    s.add_argument("ssid", nargs="?")
    s.add_argument("--no-save", action="store_true", help="connect without saving the network")
    s.add_argument("--save-only", action="store_true",
                   help="save the network without trying it now")
    s.add_argument("--open", action="store_true", help="the network has no password")
    s.add_argument("--password-stdin", action="store_true",
                   help="read the password from standard input (for scripts)")
    s.add_argument("--timeout", type=float, default=15.0, help="seconds to wait (default 15)")

    s = _sub(subs, "update")
    s.add_argument("--check", action="store_true", help="only check for a newer release")
    s.add_argument("--channel", choices=("stable", "beta"), default="stable",
                   help="release channel (default: stable)")
    s.add_argument("--repo", help="developers: deploy from this FaleraOS checkout instead")
    s.add_argument("--clean", action="store_true", help="with --repo: wipe the badge's files first")
    s.add_argument("--force", action="store_true", help="with --repo: upload every file")
    s.add_argument("--no-bump", action="store_true", help="with --repo: keep the FaleraOS version")
    s.add_argument("--override", metavar="APPS", help="with --repo: replace these app folders")

    s = _sub(subs, "flash")
    s.add_argument("--repo", help="path to a FaleraOS checkout (required)")
    s.add_argument("--build", action="store_true", help="build the firmware first")

    _sub(subs, "doctor")
    _sub(subs, "ui")
    _sub(subs, "menu")

    s = _sub(subs, "help")
    s.add_argument("topic", nargs="?")
    return p


class Ctx:
    """What a command needs: options, UI, and a lazily opened badge."""

    def __init__(self, args, ui, comports=None, link_factory=None, runner=None,
                 sleep=None, monotonic=None):
        self.args = args
        self.ui = ui
        self.comports = comports
        self._link_factory = link_factory
        self.runner = runner
        self.sleep = sleep or time.sleep          # injectable for tests
        self.monotonic = monotonic or time.monotonic

    def port(self):
        return discovery.pick(self.args.port, self.comports)

    def link(self, port):
        if self._link_factory:
            return self._link_factory(port)
        from .transport import SerialLink
        return SerialLink(port)

    def badge(self, port=None):
        on_text = (lambda s: self.ui.note("badge: " + esc(s))) if self.args.verbose else None
        return Badge(self.link(port or self.port()), on_text=on_text)

    @contextlib.contextmanager
    def session(self, reset=None):
        """A connected badge; FaleraOS is restarted on the way out."""
        port = self.port()
        b = self.badge(port)
        b.port = port
        try:
            yield b
        finally:
            finish_shielded(b, reset or self.args.reset)


def finish_shielded(b, mode):
    """Restart FaleraOS; a second Ctrl-C must not cut that short and leave
    the badge at the MicroPython prompt."""
    try:
        b.finish(mode)
    except KeyboardInterrupt:
        b.finish(mode)


def tui_problem(embedded=False, stdin=None, stdout=None, env=None, find_spec=None):
    """Why the full-screen view cannot run here, or None when it can.

    It needs a real terminal on both ends (not a pipe, not TERM=dumb) and
    Textual installed. `embedded`: main() was given a UI (tests, or a
    program embedding falera), which the view would not draw into."""
    import importlib.util
    env = os.environ if env is None else env
    stdin = sys.stdin if stdin is None else stdin
    stdout = sys.stdout if stdout is None else stdout
    find_spec = find_spec or importlib.util.find_spec
    if embedded:
        return "falera is embedded with its own UI"
    if env.get("OREO_UI", "").strip().lower() in MENU_VALUES:
        return "OREO_UI=%s asks for the menu" % env.get("OREO_UI")
    for stream in (stdin, stdout):
        try:
            tty = stream.isatty()
        except Exception:
            tty = False
        if not tty:
            return "standard input and output must be a terminal"
    if env.get("TERM", "") == "dumb":
        return "TERM=dumb: this terminal cannot draw it"
    try:
        if find_spec("textual") is None:
            return "Textual is not installed"
    except (ImportError, ValueError):
        return "Textual is not installed"
    return None


def run_view(ctx, explicit, embedded):
    """`falera` alone and `falera ui`: the full-screen view, or the numbered
    menu where it cannot run (`falera ui` says why instead)."""
    problem = tui_problem(embedded)
    if problem is None:
        from . import tui
        return tui.run(ctx)
    if explicit:
        if "Textual" in problem:
            raise OreoError("the full-screen view needs Textual, which is not installed",
                            hint="reinstall falera-cli (it depends on textual), or pip install "
                                 "'textual>=8.2,<9'; `falera menu` works without it")
        raise UsageError("`falera ui` cannot run here: %s" % problem,
                         hint="run it in a terminal window, or use `falera menu`")
    if "Textual" in problem:
        ctx.ui.note("Textual is not installed, so this is the numbered menu "
                    "(reinstall falera-cli for the full-screen view)")
    from .interactive import run as interactive
    return interactive(ctx)


def _transport_error(e):
    """mpremote's TransportError, without importing mpremote eagerly."""
    return type(e).__name__ == "TransportError"


def main(argv=None, ui=None, comports=None, link_factory=None, runner=None,
         sleep=None, monotonic=None):
    embedded = ui is not None
    if ui is None:
        adapt_stdio()   # a non-UTF-8 pipe (Windows) must not crash on the marks
    parser = build_parser()
    argv = sys.argv[1:] if argv is None else list(argv)
    args = parser.parse_args(argv)
    if ui is None:
        ui = UI(color=not args.no_color, assume_yes=args.yes)
    else:
        ui.assume_yes = ui.assume_yes or args.yes
    if args.cmd == "help":
        topic = args.topic
        if not topic:
            parser.print_help()
            return 0
        if topic not in HELP:
            ui.error("no command called %r" % topic, hint="commands: " + ", ".join(sorted(HELP)))
            return 2
        build_parser().parse_args([topic, "--help"])  # prints and exits 0
    ctx = Ctx(args, ui, comports=comports, link_factory=link_factory, runner=runner,
              sleep=sleep, monotonic=monotonic)
    handler = commands.HANDLERS.get(args.cmd or "")
    try:
        if handler is None and args.cmd == "menu":
            from .interactive import run as interactive
            return interactive(ctx) or 0
        if handler is None:
            return run_view(ctx, explicit=args.cmd == "ui", embedded=embedded) or 0
        return handler(ctx) or 0
    except Cancelled as e:
        ui.warn(e.message)
        return e.code
    except KeyboardInterrupt:
        ui.warn("stopped")
        return EXIT_CANCELLED
    except OreoError as e:
        ui.error(e.message, hint=e.hint, detail=getattr(e, "detail", None) if args.verbose else None)
        return e.code
    except BrokenPipeError:
        # stdout closed early (`falera cat ... | head`): nothing left to tell.
        return EXIT_ERROR
    except OSError as e:
        if is_serial_error(e):
            # a port that vanished outside the places that already explain it
            ui.error("lost the connection to the badge (%s)" % esc(e),
                     hint="plug it back in, check with `falera devs`, then run the command again")
            return EXIT_LINK
        # anything else is a file or folder on this computer
        ui.error(esc(local_error_message(e)))
        return EXIT_ERROR
    except Exception as e:   # never a bare traceback for the person
        if _transport_error(e):
            ui.error("the badge did not answer (%s)" % esc(e),
                     hint="unplug and replug the badge, then run `falera doctor`")
            return EXIT_LINK
        import traceback
        ui.error("unexpected error: %s: %s" % (type(e).__name__, esc(e)),
                 hint="this is a bug in falera; please report it with `falera -v ...` output "
                      "at https://github.com/elixpo/falera/issues",
                 detail=traceback.format_exc() if args.verbose else None)
        return EXIT_ERROR
