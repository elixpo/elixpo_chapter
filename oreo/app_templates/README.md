# App template

The minimal skeleton for a new FaleraOS app. Copy this directory, rename
it, and start editing. Everything here is intentionally tiny — the
full reference (lifecycle hooks, input, drawing, saving state, the
network, the PR checklist) is in the repo:

➡ **[`docs/APPS.md`](../docs/APPS.md)** (also on the website:
<https://falera.elixpo.com/docs/apps/>)

---

## Quick start

```bash
# From the repo root:
cp -r app_templates apps/my_app
python3 tools/app_icon.py apps/my_app        # after replacing icon.png
python3 tools/validate_app.py apps/my_app
# With the badge connected over USB:
python tools/deploy.py /dev/ttyACM0
```

Open the **Apps** drawer on the badge and you'll see *Example*. Press
**A** to increment the counter, **B** to decrement, **HOME** to exit.
The counter is still there after a reboot: `src/app.py` saves it with
`oreoOS.state` when the app closes.

To rename it: edit `name` and `description` in `manifest.json` and
`name =` on the `App` class in `src/app.py`. The on-device tile updates
after the next deploy. For your own icon, replace `icon.png` (any size)
and re-run `tools/app_icon.py`; set `"icon"` in the manifest first if you
want the module named after your app.

---

## What's in the box

```
app_templates/
├── __init__.py            empty — makes the folder a Python package
├── manifest.json          name, version, description, author, icon
├── main.py                3-line entry shim — re-exports App
├── icon.png               source icon (stays on your computer)
├── assets/optimized/
│   └── example_icon.py    the icon the badge draws (tools/app_icon.py)
└── src/                   all real code lives here
    ├── __init__.py
    └── app.py             the App class — lifecycle + saved counter
```

Add a `README.md` of your own (what it does, the controls, a screenshot)
when you copy the template; `tools/validate_app.py` reminds you.

`main.py` is a shim because the launcher imports it by convention.
Real code goes in `src/`. As your app grows, split it:

```
src/
├── app.py                 lifecycle hooks (on_enter/update/draw/input)
├── game.py                pure logic + constants
├── render.py              drawing functions
└── persistence.py         file/settings I/O
```

There's no rule about *how* to split — pick what makes the file you're
reading right now under 200 lines. `apps_market/snake/` is the reference for
a fully-split app; `apps_market/bt/` is the reference for an app that's
small enough to live as a single `src/app.py`.

---

## The contract (TL;DR)

Your app subclasses `oreoOS.App` and implements a few methods, all
optional except `draw`:

```python
class App(oreoOS.App):
    name = "My App"

    def on_enter(self, os):       # once, when the app is opened
        ...

    def update(self, dt):         # per-frame logic
        ...

    def draw(self, d):            # per-frame render
        ...

    def on_button_press(self, btn):  # api.BTN_SELECT (A), BTN_BACK (B), BTN_UP, ...
        ...

    def on_exit(self):            # once, when the app closes: save here
        ...
```

Set `self._dirty = True` when something visible changes and gate
`draw()` on it — re-flushing the framebuffer is the most expensive
thing per frame.

---

## Where do I put my app?

| Location | What it means |
|---|---|
| `apps/<name>/` | **Default-installed.** Tile appears in the drawer on every fresh deploy. Use for core OS tools + apps every badge owner should have. |
| `apps_market/<name>/` | **Opt-in.** Listed in the catalogue (`apps_market/index.json`, regenerate with `python3 tools/build_store_index.py`) but not in the drawer until the user installs it from the on-device **App Store**. Use for games, sketches, hackathon entries, themed extras. |

Both trees have the exact same shape — `tools/deploy.py` walks both.
When in doubt, ship to `apps_market/` so the drawer stays curated.

---

## Common gotchas

- **Don't call `d.present()`** — the OS does it once per frame.
- **Don't import `pygame` / `pillow`** — none of that ships on the device.
- **Network calls block the run loop.** Hide them behind
  `SHOW_LOADING = True` so the user sees the loading panel while
  `on_enter` runs.
- **Framebuf is RGB565 big-endian.** Use `oreoOS.api.rgb(r, g, b)` to
  pack colours — don't construct the integer by hand.
- **C opens the notification panel** from any app. If C is one of your
  controls, set `CAPTURES_C = True` on the `App` class (or on the
  instance while it matters, e.g. only during play) and C reaches
  `on_button_press` instead.
- **Partial redraws.** If `draw()` repaints only part of the screen,
  set `self._present_region = (x, y, w, h)` in that frame and the OS
  flushes just that rectangle. Override `invalidate()` to schedule a
  full repaint; the OS calls it after an overlay (the panel) covered
  you. `widgets.Scroller` gives an eased, frame-rate independent
  scroll offset for lists and grids.
- **Themed colours over raw RGB.** Prefer `theme.PRIMARY`, `theme.BG`,
  `theme.TEAL` etc. — your app stays consistent if the brand palette
  shifts.

- **Save with `oreoOS.state`**, not files in your app folder:
  `state.load("my_app", {"hi": 0})` / `state.save("my_app", data)`. Saves
  live in `/state/` and survive updates and reinstalls.
- **The owner's details** (GitHub user, name, timezone) come from
  `oreoOS.profile.get(...)`; see [`docs/PROFILE.md`](../docs/PROFILE.md).

For everything else: **[`docs/APPS.md`](../docs/APPS.md)**.
