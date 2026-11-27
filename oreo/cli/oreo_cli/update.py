"""`falera update` without a checkout: drive the badge's own OTA over USB.

The badge already knows how to update itself (oreoOS/ota.py, used by its
Updates page). This module steers it from the computer, so the person sees
versions, sizes and progress in the terminal:

    1. read the version on the badge (and any update already downloaded)
    2. bring up the badge's Wi-Fi from its saved networks
    3. ask GitHub (from the badge) for the newest release on the channel
    4. work out which files change, and how much will be downloaded
    5. confirm, check the free space, download into /_ota on the badge
    6. move the files into place (apply_pending, as the boot does)
    7. hardware-reset the badge, wait for it to come back on USB
    8. read the version again and report it

Ctrl-C is honoured until the files start moving into place (step 6). From
then on it is deferred until the step is done, so an interrupted copy
cannot leave FaleraOS half old and half new. Even then, FaleraOS's own design
covers a power cut: the staged manifest stays until every file is in place,
and the next boot finishes the job.
"""

import contextlib
import signal
import threading

from . import discovery
from .errors import Cancelled, LinkError, NoOreoOS, OreoError
from .ui import esc, human

CHANNELS = ("stable", "beta")
REBOOT_TIMEOUT = 90      # seconds for the badge to come back on USB
RECONNECT_TRIES = 4      # banner attempts once the port is back
OTA_RESERVE = 128 * 1024  # keep this much flash free after staging

OLD_OREOOS_HINT = ("the FaleraOS on this badge is too old to be updated from the CLI. "
                   "Update it once from the badge (Settings > Updates) or with "
                   "`falera update --repo <checkout>`")


@contextlib.contextmanager
def deferred_interrupt(ui):
    """Hold Ctrl-C until the block ends (main thread only), then raise it."""
    if threading.current_thread() is not threading.main_thread():
        yield
        return
    hit = []

    def handler(signum, frame):
        if not hit:
            ui.warn("finishing the update first; Ctrl-C again when it is done")
        hit.append(signum)
    try:
        old = signal.signal(signal.SIGINT, handler)
    except (ValueError, OSError):     # not allowed here (embedded use)
        yield
        return
    try:
        yield
    finally:
        signal.signal(signal.SIGINT, old)
    if hit:
        raise KeyboardInterrupt


def wait_for_badge(ctx, device, serial, timeout=REBOOT_TIMEOUT):
    """The badge's port once it is back on USB after a reset, else None."""
    sleep, clock = ctx.sleep, ctx.monotonic
    sleep(2.0)                         # let it drop off the bus first
    deadline = clock() + timeout
    while True:
        port = discovery.find_again(device, serial, ctx.comports)
        if port:
            return port
        if clock() >= deadline:
            return None
        sleep(0.5)


def read_version_after_reboot(ctx, port):
    """FaleraOS version from a freshly booted badge (retries while it boots)."""
    last = None
    for attempt in range(RECONNECT_TRIES):
        if attempt:
            ctx.sleep(2.0)
        b = ctx.badge(port)
        try:
            return b.banner().get("os")
        except OreoError as e:
            last = e
        finally:
            b.finish("soft")
    raise LinkError("the badge came back on %s but did not answer" % port,
                    hint=(last.hint if last else None) or "run `falera info` in a moment")


def _badge_serial(ctx, device):
    for p in discovery.find_badges(ctx.comports):
        if p.device == device:
            return p.serial
    return None


def _ota(call, *a, **kw):
    try:
        return call(*a, **kw)
    except NoOreoOS as e:
        raise NoOreoOS(e.message, detail=e.detail, hint=OLD_OREOOS_HINT)


def run_update(ctx, b, channel="stable", check_only=False):
    """The whole flow on an open session `b`. Returns an exit code.

    After a successful install the badge has been reset and `b` is closed;
    the session's own restart then does nothing. The badge's screen shows
    each step (oreoOS/hostui.py, when the FaleraOS on it has it)."""
    if channel not in CHANNELS:
        raise OreoError("unknown channel %r" % channel, hint="use stable or beta")
    with b.showing():
        return _run_update(ctx, b, channel, check_only)


def _run_update(ctx, b, channel, check_only):
    ui = ctx.ui
    title = "Checking for updates" if check_only else "Updating FaleraOS"
    with ui.status("reading the badge"):
        st = _ota(b.ota_status)
    current = st.get("current") or "?"
    ui.step("FaleraOS on the badge: [title]%s[/]" % esc(current))

    if st.get("pending") and not check_only:
        target = st.get("pending_version") or "a new version"
        ui.step("an update to %s is already downloaded on the badge" % esc(target))
        if not ui.confirm("Install %s now? The badge restarts." % esc(target)):
            raise Cancelled("nothing changed; the badge installs it at its next restart")
        return _apply_and_reboot(ctx, b, target)

    b.screen(title, "connecting to Wi-Fi")
    with ui.status("bringing up Wi-Fi on the badge"):
        r = b.wifi_online()
    if not r.get("online"):
        raise OreoError("the badge could not get online, so it cannot download the update",
                        hint="add a network: `falera wifi scan`, then `falera wifi connect <name>`")
    b.screen(title, "asking GitHub for the newest %s release" % channel)
    with ui.status("asking GitHub for the newest %s release" % channel):
        rel = _ota(b.ota_check, channel)
    if rel.get("error"):
        raise OreoError("the badge could not reach GitHub (%s)" % rel["error"],
                        hint="check the network with `falera info`; GitHub limits "
                             "unauthenticated requests to 60 an hour per network, "
                             "so try again later if many badges share it")
    latest = rel.get("latest")
    if not rel.get("newer"):
        ui.ok("FaleraOS %s is up to date (newest %s release: %s)"
              % (esc(current), channel, esc(latest)))
        return 0
    ui.step("new %s release: [title]%s[/]%s" % (
        channel, esc(latest), "  [warn](major version: apps or settings may change)[/]"
        if rel.get("major") else ""))

    b.screen(title, "comparing files with %s" % latest)
    with ui.status("comparing the badge's files with the release"):
        pk = _ota(b.ota_peek)
    if pk.get("error"):
        raise OreoError("%s for %s" % (pk["error"], latest),
                        hint="the release may still be publishing; try again in a few minutes")
    ui.step("%d file(s) change, %s to download (%d unchanged)"
            % (pk["files"], human(pk["bytes"]), pk["unchanged"]))
    if check_only:
        ui.note("install it with `falera update`")
        return 0
    if pk["files"] == 0:
        ui.ok("every file already matches %s" % esc(latest))
        return 0

    free, _ = b.free()
    if pk["bytes"] + OTA_RESERVE > free:
        raise OreoError("not enough space to download the update: %s needed, %s free"
                        % (human(pk["bytes"] + OTA_RESERVE), human(free)),
                        hint="free some space (`falera info`, `falera rm`, `falera apps remove`)")
    if not ui.confirm("Update FaleraOS %s -> %s? Your apps, photos, documents and Wi-Fi stay. "
                      "The badge restarts at the end." % (esc(current), esc(latest))):
        raise Cancelled("nothing changed")

    with ui.progress("downloading %s" % esc(latest), total=pk["files"], unit="files") as update:
        ok = b.ota_download(progress=lambda i, t, p: update(i, t or None),
                            screen="Downloading FaleraOS %s" % latest,
                            size=pk["bytes"], files=pk["files"])
    if not ok:
        why = getattr(b, "ota_error", "")
        raise OreoError("the download failed%s; nothing was changed on the badge"
                        % ((" (%s)" % why) if why else ""),
                        hint="check the Wi-Fi signal and run `falera update` again")
    ui.ok("downloaded and checked (SHA-256) on the badge")
    return _apply_and_reboot(ctx, b, latest)


def _apply_and_reboot(ctx, b, target):
    ui = ctx.ui
    device = b.port
    serial = _badge_serial(ctx, device)
    applied = None
    with deferred_interrupt(ui):
        with ui.status("installing %s (do not unplug the badge)" % esc(target)):
            try:
                applied = _ota(b.ota_apply, screen="Installing FaleraOS %s" % target)
            except LinkError:
                raise LinkError("the badge disconnected while installing",
                                hint="plug it back in: FaleraOS finishes the update when it "
                                     "starts, then check with `falera info`")
        ui.step("restarting the badge")
        b.link.restart("hard")
        b.entered = False
    if not applied:
        ui.warn("the badge could not move every file into place; it retries at boot")

    with ui.status("waiting for the badge to come back on USB"):
        port = wait_for_badge(ctx, device, serial)
    if not port:
        raise LinkError("the badge did not come back on USB within %ds" % REBOOT_TIMEOUT,
                        hint="it may still be installing; wait, then run `falera info`. "
                             "If the screen stays dark, press RESET")
    with ui.status("reading the new version"):
        now = read_version_after_reboot(ctx, port)
    if now and target and now == target:
        ui.ok("FaleraOS %s is installed and running" % esc(now))
        return 0
    if now and applied and now == applied:
        ui.ok("FaleraOS %s is installed and running" % esc(now))
        return 0
    raise OreoError("the badge restarted with FaleraOS %s, expected %s"
                    % (now or "?", target or "?"),
                    hint="run `falera update` again; if it repeats, `falera logs --restart` "
                         "shows the boot log")
