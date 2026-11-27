# Writing apps for FaleraOS

This is the in-repo guide to building an app for the Falera badge: the
folder layout, the lifecycle, input, drawing, saving state, the network,
and how to check and ship an app. The website page
(<https://falera.elixpo.com/docs/apps/>) covers the same ground with more
pictures; when the two disagree, this file and the code win.

## The shortest path

```bash
cp -r app_templates apps_market/my_app        # or apps/my_app for a built-in
$EDITOR apps_market/my_app/manifest.json      # name, description, author
$EDITOR apps_market/my_app/src/app.py         # your code
python3 tools/app_icon.py apps_market/my_app  # icon.png -> the badge's icon module
python3 tools/validate_app.py apps_market/my_app
```

Then put it on a badge over USB (see [CLI.md](CLI.md) for the `falera`
tool, or `python tools/deploy.py` for the whole OS) and open it from the
Apps drawer. For the App Store, also run `python3 tools/build_store_index.py`
(see [`apps_market/README.md`](../apps_market/README.md)).

## Folder layout

```
my_app/
├── __init__.py          empty; makes the folder a package
├── main.py              one line: from .src.app import App
├── manifest.json        name, version, description, icon, author
├── icon.png             any size; tools/app_icon.py converts it
├── README.md            what it does, the controls, a screenshot
├── src/
│   ├── __init__.py
│   └── app.py           class App(oreoOS.App)
└── assets/
    ├── raw/             source art (stays in the repo)
    └── optimized/       generated .py modules (go to the badge)
```

The launcher imports `apps.<id>.main` and reads `App` from it. The app
id is the manifest `"slug"` if there is one, else the folder name, and
it must be an importable name: lower-case ASCII letters, digits and `_`,
starting with a letter. A folder name with a space (like
`apps_market/Lumi`) needs a `"slug"`.

Only these files go to the badge: `__init__.py`, `main.py`,
`manifest.json`, `src/**/*.py` (and `.mpy`), and `assets/optimized/*.py`.
PNGs and READMEs stay on your computer.

### manifest.json

```json
{
  "name":        "My App",
  "slug":        "my_app",
  "type":        "app",
  "version":     "0.1.0",
  "description": "One sentence: what it does and how to use it.",
  "icon":        "my_app_icon.png",
  "author":      "your-github-handle"
}
```

`name` and `version` are required. Bump `version` when you change an
App Store app: badges only offer the update when it goes up.

### Icons

The badge cannot decode PNG, so tiles use a 32x32 RGB565 Python module.
Put any `icon.png` in the app folder and run:

```bash
python3 tools/app_icon.py apps_market/my_app
```

It writes `assets/optimized/<icon stem>.py`, fitting the image into
32x32 on the theme background. Without it the tile shows the app's first
letter. Needs Pillow on your computer (`pip install pillow`).

## The lifecycle

```python
import oreoOS
from oreoOS import api, state, theme, widgets

class App(oreoOS.App):
    name = "My App"

    def on_enter(self, os):        # once, when the app opens
        self.os = os
        self._dirty = True

    def update(self, dt):          # every frame; dt = seconds since the last
        ...

    def draw(self, d):             # every frame, after update()
        if not self._dirty:
            return
        d.clear(theme.BG)
        widgets.draw_header(d, "MY APP")
        self._dirty = False

    def on_button_press(self, btn):
        ...

    def on_exit(self):             # once, when the app closes (also after a crash)
        ...
```

The OS runs one loop: read buttons, call `on_button_press` /
`on_button_release`, then `update(dt)`, then `draw(d)`, then presents the
frame. Rules that keep the badge responsive:

- **Never call `d.present()`.** The OS presents once per frame.
- **Never block.** Anything slower than a few milliseconds in `update` or
  `draw` freezes input. Split long work across frames, or use the network
  helpers below, which already run off the UI thread.
- **Move by time, not frames.** Multiply speeds by `dt` so the app runs
  the same at 20 or 60 frames per second.
- **Redraw only when something changed.** Keep a `self._dirty` flag. A
  full-screen flush is the most expensive thing in a frame. To flush only
  part of the screen, set `self._present_region = (x, y, w, h)` in
  `draw()`; the OS calls `invalidate()` after an overlay (the
  notification panel) covered the app, so override it if you need a full
  repaint then.

### Class attributes the OS reads

| Attribute | Default | Meaning |
|---|---|---|
| `name` | `"unnamed"` | Shown in headers and crash screens. |
| `SHOW_LOADING` | `False` | Only read by FaleraOS releases before the open feedback below: show the loading slide while `on_enter` runs. Keep it if `on_enter` is slow, for badges that have not updated; newer releases cover every slow open by themselves. |
| `CAPTURES_C` | `False` | Deliver C to the app instead of opening the notification panel. A double-tap of C still opens the panel. May be changed on the instance at runtime, for example only during play. See [The C key](#the-c-key). |
| `BLOCK_IDLE` | `False` | Keep the badge from auto-sleeping while the app is open (video, a timer). |
| `realtime_mode()` | `False` | Return True only while playing media or capturing; the OS then defers its housekeeping for lower latency. |
| `on_home_press()` | not set | Return True to handle HOME yourself (for example to close a dialog). Otherwise HOME goes back to the Apps drawer. |

### What the user sees while your app opens

Opening an app is not free on the badge: MicroPython reads and compiles
your `.py` files when the app is imported (on every open: an app's
modules are unloaded when it exits), then `on_enter` runs, then your
first `draw`. The OS gives feedback for all of it:

1. On the frame of the press, an "Opening <name>" chip over the bottom
   of the screen.
2. If the open is not finished after 120 ms, the LOADING panel (your
   app's name, its author, a spinner) slides over the screen and stays
   until your first frame is presented. An app that took longer than
   250 ms the last time it opened gets the panel at once. HOME pressed
   while the panel is up cancels the open before `on_enter`.
3. If the import or `on_enter` raises, the crash screen shows the error.

The spinner turns while Python code runs, but stops while MicroPython
compiles a big file (the compiler holds the interpreter lock), so a fast
open still matters. To keep yours fast:

- Do little in `on_enter`: set state and mark the screen dirty. Load
  saved data with `oreoOS.state` (small JSON), and start anything slow
  (network, scanning files, decoding large images) on a worker with
  `oreoOS.cache.Refresh`, drawing a loading state meanwhile.
- Keep big data out of module-level imports: import a large sprite or
  bitmap module when it is first needed, not at the top of `app.py`.
  Every kilobyte of `.py` source is compiled on each open.
- Split a very large `app.py` only if parts of it are rarely used; the
  compile cost is per byte of source the open imports.
- Measure on a badge with `falera run tools/app_open_probe.py` (below).

The launcher prints one line per open on the USB console, for example
`[open] store: 840 ms (import 610, on_enter 150, first frame 80)`.

`tools/app_open_probe.py` imports, enters and draws each installed app
once and prints per app the import time (and how much of it is compiling
the source), the modules the import pulled in, `on_enter`, the first
`update` + `draw`, the flush, and the heap used:

```bash
falera run tools/app_open_probe.py
```

It closes each app with `on_exit` and unloads it again, writes nothing to
flash, and FaleraOS restarts when the CLI finishes. Edit `ONLY` or `SKIP`
at the top of the script to choose apps.

## Input

`btn` values are in `oreoOS.api`. The logical names say what a button
means across the OS; they are the same numbers as the physical names.

| Logical | Physical | Meaning |
|---|---|---|
| `BTN_SELECT` | `BTN_A` | confirm, open, fire, jump |
| `BTN_BACK` | `BTN_B` | cancel, up one level, close |
| `BTN_PANEL` | `BTN_C` | notification panel, unless `CAPTURES_C` |
| `BTN_HOME` | `BTN_HOME` | leaves the app; the OS handles it |
| `BTN_UP/DOWN/LEFT/RIGHT` | same | D-pad; the OS auto-repeats held D-pad presses |

### The C key

C opens the notification panel from every app. If C is one of your app's
controls (a fire button, a mode switch, a button tester):

- set `CAPTURES_C = True` on the `App` class (or on the instance while C
  is in use, for example only during play);
- a single C then reaches `on_button_press`, and a quick double-tap of C
  (two presses within 350 ms) opens the panel. The first press of the pair
  has already reached your app; the second does not. Make a C action cheap
  to repeat, or ignore a second C that follows within that time;
- the double-tap cannot be turned off, so the panel is always reachable.
  The old `C_DOUBLE_TAP = False` opt-out is ignored.

`tests/test_c_key_rule.py` fails when an app under `apps/`,
`apps_market/` or `app_templates/` mentions `BTN_C` or `BTN_PANEL` in its
code without setting `CAPTURES_C = True`, or sets `C_DOUBLE_TAP`.

For held buttons (steering, charging a jump) poll in `update()`:

```python
if self.os.buttons.is_pressed(api.BTN_LEFT):
    self.x -= SPEED * dt
```

`os.buttons` also has `just_pressed(btn)` and `just_released(btn)`.
Buttons are physical and fixed: the display does not rotate.

## Drawing

`d` is a 320x240 RGB565 framebuffer (`api.SCREEN_W`, `api.SCREEN_H`):

| Call | |
|---|---|
| `d.clear(color)` | fill the screen |
| `d.rect(x, y, w, h, color, fill=False)` | rectangle |
| `d.line(x0, y0, x1, y1, color)` / `d.pixel(x, y, color)` | |
| `d.text(s, x, y, color, scale=1)` | 8x8 font; scale 2 gives 16 px |
| `d.blit(data, x, y, w, h)` | RGB565 sprite; magenta `0xF81F` is transparent |
| `d.blit_2x(...)`, `d.blit_scale(...)` | scaled sprites |

Colours: `api.rgb(r, g, b)` packs 8-bit values; prefer the theme names
(`theme.BG`, `theme.PRIMARY`, `theme.TEXT_BRIGHT`, `theme.CARD`) so the
app matches the OS. `widgets.draw_header(d, title)` and
`widgets.draw_hint(d, "A=go  B=back")` give the standard top and bottom
bars; `widgets.play_area()` returns the space between them.
`oreoOS.pixelfont` draws the Pixelify Sans title font, and
`widgets.Scroller` gives eased, frame-rate independent scrolling.

Sprites: put PNGs in `assets/raw/` and run
`python tools/optimize_assets.py --app my_app` to make
`assets/optimized/*.py` modules, then load them with
`__import__("apps.my_app.assets.optimized.hero", None, None, ["DATA", "W", "H"])`.

## Slow work: the loading animation

Everything that makes the badge wait must show that it is working. Work
that can run on a worker thread (network fetches) should: use
`oreoOS.cache.Refresh` and draw a loading state from `update()`/`draw()`
while it runs (Commits, Weather and the Store's catalogue do this). Work
that has to block the UI thread (an install that holds the only TLS
session, an OTA download, decoding a large photo inside `draw()`) goes
under `oreoOS.busy`:

```python
from oreoOS import busy

with busy.show("Installing Racer", "Starting", 0.0,
               display=self.os.display) as b:
    for i, path in enumerate(files):
        fetch(path)
        b.progress((i + 1) / len(files), path)   # bar and detail line
self._dirty = True                                # repaint afterwards
```

`busy.start(title, detail, progress)` returns the same object without
`with`; `progress(frac, detail=None)`, `detail(text)` and
`stop(restore=True)` act on it (or, as module functions, on the one on
screen). `progress=None` means "unknown length": spinner only.
`delay_ms=200` shows nothing if the work ends sooner, so quick cases do
not flash a card.

How it animates while your code blocks: a small `_thread` task draws the
card (spinner, title, detail, optional bar) into its own buffer and writes
it straight to the panel with `Display.push_buffer()`; it never touches
the framebuffer, so it cannot tear or leave pixels in your frame. While it
runs, `display.present()` and `present_rect()` are wrapped: if your code
presents, the animator is stopped first (stop waits on the lock it holds
for each draw), so the two never write to the panel at once. `stop()`
flushes the framebuffer once to put the screen back; pass
`restore=False` when a full frame follows anyway (inside `draw()`, or
before a reset). Network waits release the GIL, so the spinner keeps
turning; a long C call that holds it (the TLS key exchange) can pause it
for a moment. Without `_thread`, or on an OS whose display has no
`push_buffer()`, the card is drawn by your thread instead and moves on
`progress()`, `detail()` and `pump()` calls.

A C call that holds the GIL for its whole duration stops the animator
too: `wlan.active()`, `ble.active()`, `wlan.connect()`, a large flash
erase. For those, answer the press first: draw the control's pending
state ("turning on...", a spinner frame), call `display.present()`, and
only then make the call; afterwards show the real state, or say in words
that it failed. A press latched while the call ran reaches your app in
the next frame, so drop a repeat of the same toggle in that frame. The
notification panel's WiFi/BT tiles and the WiFi app work this way.

Rules: do not draw or present from another thread while a card is up,
and repaint your app after it (`self._dirty = True`). App Store apps
should import `oreoOS.busy` inside `try: ... except ImportError:` (older
OS versions do not have it).

The OS uses it for App Store install, update and uninstall, the Updates
check and download, Gallery photos that take long to decode, the Wi-Fi
speed test and ping, and the LOADING panel while an app opens (`oreoOS.opening`, which extends
`busy`), and the Reader and Storage when a document or the file count
takes long.

### The screen while a computer drives the badge

While the `falera` CLI works over the raw REPL (FaleraOS is stopped), it can
show progress with `oreoOS.hostui`: `hostui.show(title, detail="",
progress=None)` draws a "Connected to computer" frame (title, detail, a
bar for 0.0-1.0 or a static busy glyph for None) and `hostui.clear()`
blanks it. It sets up the panel itself without a reset, sends only the
parts that changed (cheap enough for every chunk), keeps one 12.8 KB strip
buffer, and never raises. It is for the raw REPL only; apps use `busy`.

## Saving state

Use `oreoOS.state` for scores, settings and progress:

```python
from oreoOS import state

APP_ID = state.app_id(__name__, "my_app")   # "apps.my_app.src.app" -> "my_app"

def on_enter(self, os):
    self.save = state.load(APP_ID, {"hi": 0, "level": 1})   # defaults on first run

def on_exit(self):
    state.save(APP_ID, self.save)
```

- Saves are JSON in `/state/<app id>.json`, outside the app folder, so
  they survive App Store updates and an uninstall and reinstall.
- Writes are atomic: a power cut during a save keeps the previous copy.
- `load()` never raises; a missing or corrupt file gives the defaults.
  `save()` returns False instead of raising (for example, flash full).
- Save on exit or at a checkpoint, not every frame: flash writes are slow.
- Values go through JSON, so tuples come back as lists.
- App Store apps: the Store serves the newest version to every badge and
  does not check the OS version, and badges on stable/v2.0.5 or older
  have no `oreoOS.state` or `oreoOS.profile`. Import them inside
  `try: ... except ImportError:` and keep a fallback (Racer, Snake and
  Weather show how), so an update cannot break the app on an older OS.

For small OS-wide preferences, `os.settings_get(key, default)` and
`os.settings_set(key, value)` persist too (in `/state/os.json`). Keys
starting with `ota_` are kept for the current boot only.

## The owner's profile

Apps that need to know who owns the badge read `oreoOS.profile`, never
`secrets.py` directly:

```python
from oreoOS import profile
login = profile.get("GITHUB_USER", "octocat")
tz = profile.get("TIMEZONE_OFFSET", 0)      # numbers come back as float
```

See [PROFILE.md](PROFILE.md) for the keys and how an owner sets them.

## The network

Wi-Fi is for the internet: the App Store, updates, GitHub data, weather
and the clock. The OS connects in the background (`oreoOS.netsvc`); an
app never connects or scans by itself.

- Check `oreoWare.wifi.is_connected()` (or `oreoOS.github.online()`)
  before a request, and show an offline state when it is False.
- Make requests with `oreoOS._http.get_url(url, timeout_s=...)`, which
  honours its timeout, rather than `urequests`.
- For anything that can take more than a moment, use
  `oreoOS.cache.Refresh` to run it on a worker thread and show cached data
  meanwhile; `oreoOS/github.py` is the reference.
- Never wait for data in `on_enter`: the OS shows a LOADING panel for a
  slow open, but the user cannot do anything until it is gone. Show what
  you have and fill in the rest from a `Refresh`.

## When it crashes

An exception from your app (in `on_enter`, a frame, or an import)
shows the crash screen with the error and the innermost `file:line`,
then returns to the drawer. Before that, the launcher records the full
traceback with `oreoOS.crashlog`:

- it prints on the USB console (`falera logs` shows it), and
- it is appended to `/crash.log` on the badge, capped at 8 KB (the
  oldest entries go first). Copy it to the computer with
  `falera pull /crash.log`.

A single bad frame does not crash the app: the OS prints the traceback
of the first bad frame in a run on the console only (no flash write; later
bad frames print one line) and carries on, and shows
the crash screen after 8 bad frames in a row. An error in `on_exit` is
logged too, without hiding the crash that led to it. Crashes during boot
go to the same log. `oreoOS.crashlog.record(err, "context")` does the
same from your own `except` blocks.

## Reloading and the dev loop

When an app exits, the launcher removes `apps.<name>` and its submodules
from `sys.modules` and runs `gc.collect()`. The next launch imports the
files again, so an app installed or updated from the App Store while
FaleraOS runs, or a file you edit under a running `falera dev` mount, runs the
next time you open the app, without a reboot. (`falera push` and
`falera app install` already restart FaleraOS when they finish, so their files
are loaded fresh either way.) OS modules (`oreoOS`, `oreoWare`) and other apps are never
unloaded; the drawer (`apps/launcher`) stays loaded because it opens on
every HOME press. A copy of `oreoOS/` itself still needs a reboot.

If your app leaves something running after `on_exit` (a thread, a
`machine.Timer` or pin IRQ callback, a module-level job that the next
visit picks up), stop it in `on_exit`, or keep the app loaded:

```python
class App(oreoOS.App):
    KEEP_LOADED = True            # never unload this app

    def keep_loaded(self):        # or decide at exit (the App Store does
        return _job is not None   # this while a download runs)
```

Unloading an app with a live thread does not crash anything (the thread
keeps its module alive), but the next launch would get a second copy
with its own globals.

### Live editing with `falera dev`

`falera dev <folder>` mounts a folder from the computer at `/remote` and
opens the REPL; FaleraOS is not running then. If the folder contains
`apps/<name>/` with `manifest.json` and `main.py`, start FaleraOS from the
REPL and that app loads from the computer instead of `/apps/<name>`:

```bash
mkdir -p ~/work/apps && cp -r apps_market/my_app ~/work/apps/my_app
falera dev ~/work
```

```python
>>> import os; os.chdir("/"); exec(open("/main.py").read())
```

`os.chdir("/")` matters: the mount makes `/remote` the current folder,
and MicroPython looks for modules there first, so without it `oreoOS`
is not found. Mounted apps appear in the drawer (one that is also
installed is replaced by the mounted copy), the console prints
`[dev] my_app from /remote/apps`, and each launch reads the files again,
so save on the computer, press HOME, and open the app. Loading over USB
is slower than from flash. Leaving `falera dev` resets the badge, and the
installed apps are used again. Without a mount, the launcher's only cost
is one failed `stat` per listing and per launch.

## Check it

```bash
python3 tools/validate_app.py apps_market/my_app        # or no argument for every app
```

Errors mean the app will not load (bad manifest, `main.py` without
`App`, an id that cannot be imported, a syntax error, a committed
secret). Warnings are worth fixing: no icon, no README, direct
`oreoWare` / `machine` imports (prefer the `os` object, #67), calling
`present()`. CI runs it on every pull request.

Host tests for pure logic go in `tests/` and run with
`python3 -m unittest discover -s tests`. Badge code runs on MicroPython
1.28: no `abc`, `typing`, f-string `=` debugging, `str.isalnum()`, or
large libraries. Compile-check with `mpy-cross` if you have it.

## Pull request checklist

- [ ] `python3 tools/validate_app.py <your app>` passes with no errors.
- [ ] `README.md` in the app folder: one sentence on what it does, the
      controls, and a screenshot or photo of the badge. With your app
      open on the badge, `falera screenshot --scale 2` saves its screen
      as a PNG.
- [ ] Controls follow the table above (A selects, B goes back, HOME exits).
- [ ] Movement uses `dt`; `draw()` skips frames when nothing changed.
- [ ] State goes through `oreoOS.state`; no files written into the app folder.
- [ ] No secrets, tokens or personal data in the code.
- [ ] App Store apps: `tools/build_store_index.py` run, `index.json`
      entry filled in, `version` bumped on changes.
