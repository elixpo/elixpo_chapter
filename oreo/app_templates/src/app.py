"""Minimal counter app — demonstrates the FaleraOS app lifecycle.

Buttons:
    A (SELECT)  increment the counter
    B (BACK)    decrement the counter
    HOME        exit (intercepted by the OS, app never sees it)

The counter survives reboots and reinstalls: it is saved with
oreoOS.state in /state/<app id>.json when the app closes.

Keep this file focused on the lifecycle. As your app grows, split
pure logic into src/<feature>.py and drawing into src/render.py —
see apps_market/snake/ for the reference layout.
"""

import oreoOS
from oreoOS import api, state, theme, widgets

# "apps.my_app.src.app" -> "my_app": the state file follows the folder name.
APP_ID = state.app_id(__name__, "example")


class App(oreoOS.App):
    name         = "Example"
    SHOW_LOADING = False   # set True if on_enter takes > 200 ms

    # ── lifecycle ──────────────────────────────────────────────────

    def on_enter(self, os):
        super().on_enter(os)
        saved = state.load(APP_ID, {"counter": 0})
        self._counter = saved["counter"]
        self._dirty   = True

    def on_exit(self):
        # Save once on the way out, not every press: flash writes are slow
        # and wear the chip. See docs/APPS.md, "Saving state".
        state.save(APP_ID, {"counter": self._counter})

    def on_button_press(self, btn):
        if btn == api.BTN_SELECT:
            self._counter += 1
            self._dirty = True
        elif btn == api.BTN_BACK:
            self._counter -= 1
            self._dirty = True

    def update(self, dt):
        # Per-frame logic. dt = seconds since the last frame.
        pass

    def draw(self, d):
        # The framebuf flush is the most expensive thing per frame —
        # gate redraws on self._dirty so we skip the cost when
        # nothing visible has changed.
        if not self._dirty:
            return
        d.clear(theme.BG)
        widgets.draw_header(d, "EXAMPLE")
        widgets.draw_hint  (d, "A=+1  B=-1  HOME=back")

        msg = "Counter: %d" % self._counter
        mw  = len(msg) * 16
        d.text(msg,
               (api.SCREEN_W - mw) // 2,
               (api.SCREEN_H - 16) // 2,
               theme.PRIMARY, scale=2)

        self._dirty = False
