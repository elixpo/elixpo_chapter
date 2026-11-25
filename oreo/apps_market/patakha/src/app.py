"""Patakha - a Diwali night shooter for the Falera Badge.

Pop the matchboxes, anars and chakris falling over the city with
firecrackers from your launcher. Every 100 points the sky gets busier;
at 250, 500 and 1000 a barrage of big rockets clears the sky. Catch or
shoot the rare UFO to become a glowing saucer for 8 seconds.

Controls:
  LEFT / RIGHT  move (or tilt the badge in TILT mode)
  A (or UP)     fire, hold for repeat
  B             pause in game; swap BUTTONS / TILT on the menus
  HOME          back

Code layout: game.py is the pure integer simulation (host tested),
render.py draws, this file owns lifecycle, input and the fixed timestep.
High score persists in /state/patakha.json (oreoOS.state).
"""

import time

import oreoOS
from oreoOS import api, theme
try:
    from oreoOS import state
except ImportError:   # OS before the /state helper: keep the old file save
    state = None

from . import game as g
from . import render as r

TITLE, PLAY, PAUSE, OVER = 1, 2, 3, 4

LEGACY_HI_PATH = "apps/patakha/hi.txt"   # pre-/state save, migrated once
MAX_TICKS_PER_FRAME = 5        # after a stall, catch up at most 100 ms
OVER_LOCK_TICKS = 40           # ignore A for 0.8 s so held fire can't skip it

TILT_DEADZONE_DEG = 3.0
TILT_FULL_DEG = 15.0


def _load_hi():
    if state is None:
        return _legacy_read_int(LEGACY_HI_PATH)
    return int(state.load_migrating("patakha", {"hi": 0},
                                    LEGACY_HI_PATH, ("hi",))["hi"])


def _save_hi(v):
    if state is None:
        _legacy_write(LEGACY_HI_PATH, str(int(v)))
        return
    state.save("patakha", {"hi": int(v)})


def _legacy_read_int(p):
    try:
        with open(p) as f:
            return int(f.read().strip() or "0")
    except Exception:
        return 0


def _legacy_write(p, text):
    try:
        with open(p, "w") as f:
            f.write(text)
    except Exception:
        pass


class App(oreoOS.App):
    name         = "Patakha"
    SHOW_LOADING = True
    BLOCK_IDLE   = True

    def on_enter(self, os):
        self._os = os
        self._state = TITLE
        self._hi = _load_hi()
        self._new_hi = False
        self._dirty = True
        self._world = g.World(time.ticks_ms() & 0xFFFF)
        self._acc = 0
        self._t = time.ticks_ms()
        self._over_t = 0
        self._last_score = -1
        self._last_level = -1
        self._score_s = ""
        self._lv_s = ""
        self._hi_s = "HI %d" % self._hi

        self._bg = r.build_background()
        mk = r.make_text
        self._t_title = mk("PATAKHA", theme.PRIMARY, 4)
        self._t_press = mk("PRESS A", api.WHITE, 2)
        self._t_over = mk("GAME OVER", theme.PRIMARY, 3)
        self._t_pause = mk("PAUSED", theme.PRIMARY, 3)
        self._t_newhi = mk("NEW HIGH!", theme.GOLD, 2)
        # Action hints at double size so they read at arm's length.
        self._t_resume = mk("A or B to resume", api.WHITE, 2)
        self._t_quit = mk("HOME = quit", r.C_DIM, 2)
        self._t_again = mk("A = play again", api.WHITE, 2)
        self._t_back = mk("HOME = back", r.C_DIM, 2)
        self._t_banner = (
            None,
            mk("FASTER!", theme.ORANGE, 2),
            mk("ROCKET BARRAGE!", theme.GOLD, 2),
            mk("UFO POWER!", theme.TEAL, 2),
        )
        self._banner_fb = (None, "FASTER!", "ROCKET BARRAGE!", "UFO POWER!")
        self._t_best = None
        self._t_final = None
        self._make_best()

        self._imu = getattr(os, "_imu", None)
        if self._imu is None:
            try:
                from oreoWare import imu as _imu_mod
                self._imu = _imu_mod.detect()
            except Exception:
                self._imu = None
            if self._imu is not None:
                try:
                    os._imu = self._imu
                except Exception:
                    pass
        if self._imu is not None:
            try:
                self._imu.wake()
                self._imu.calibrate(samples=60)
            except Exception:
                pass
        saved = os.settings_get("patakha_mode", None)
        # Tilt by default when the badge has a gyro, as in Racer.
        self._mode = saved if saved in ("IMU", "BTN") else (
            "IMU" if self._imu is not None else "BTN")

    def on_exit(self):
        if self._imu is not None:
            try:
                self._imu.sleep()
            except Exception:
                pass
        self._bg = None

    def realtime_mode(self):
        # Defer OS housekeeping only while a round is actually running.
        return self._state == PLAY

    # ── helpers ──────────────────────────────────────────────────────────
    def _make_best(self):
        self._t_best = (r.make_text("BEST %d" % self._hi, theme.GOLD, 2)
                        if self._hi else None)

    def _start(self):
        self._world.reset()
        self._state = PLAY
        self._acc = 0
        self._t = time.ticks_ms()
        self._last_score = -1
        self._last_level = -1

    def _game_over(self):
        w = self._world
        self._new_hi = w.score > self._hi
        if self._new_hi:
            self._hi = w.score
            _save_hi(self._hi)
            self._hi_s = "HI %d" % self._hi
            self._make_best()
        self._t_final = r.make_text("SCORE %d" % w.score, api.WHITE, 2)
        self._over_t = 0
        self._state = OVER

    def _mode_label(self):
        if self._mode == "IMU":
            return "TILT" if self._imu else "TILT (no IMU)"
        return "BUTTONS"

    # ── input ────────────────────────────────────────────────────────────
    def on_button_press(self, btn):
        s = self._state
        if btn == api.BTN_A:
            if s == TITLE:
                self._start()
            elif s == OVER and self._over_t >= OVER_LOCK_TICKS:
                self._start()
            elif s == PAUSE:
                self._state = PLAY
                self._t = time.ticks_ms()
        elif btn == api.BTN_B:
            if s == PLAY:
                self._state = PAUSE
            elif s == PAUSE:
                self._state = PLAY
                self._t = time.ticks_ms()
            else:
                self._mode = "BTN" if self._mode == "IMU" else "IMU"
                try:
                    self._os.settings_set("patakha_mode", self._mode)
                except Exception:
                    pass
        self._dirty = True

    def _read_move(self):
        """-256..256 steering for this frame."""
        if self._mode == "IMU" and self._imu is not None:
            try:
                roll = self._imu.tilt_deg()[1]
                a = roll if roll >= 0 else -roll
                if a < TILT_DEADZONE_DEG:
                    return 0
                m = int((a - TILT_DEADZONE_DEG) * 256
                        / (TILT_FULL_DEG - TILT_DEADZONE_DEG))
                if m > 256:
                    m = 256
                return m if roll > 0 else -m
            except Exception:
                pass
        b = self._os.buttons
        try:
            m = 0
            if b.is_pressed(api.BTN_LEFT):
                m -= 256
            if b.is_pressed(api.BTN_RIGHT):
                m += 256
            return m
        except Exception:
            return 0

    def _fire_held(self):
        b = self._os.buttons
        try:
            return b.is_pressed(api.BTN_A) or b.is_pressed(api.BTN_UP)
        except Exception:
            return False

    # ── fixed timestep ───────────────────────────────────────────────────
    def update(self, dt):
        now = time.ticks_ms()
        el = time.ticks_diff(now, self._t)
        self._t = now
        if self._state == PAUSE:
            return
        if el > MAX_TICKS_PER_FRAME * g.TICK_MS:
            el = MAX_TICKS_PER_FRAME * g.TICK_MS
        acc = self._acc + el
        w = self._world
        if self._state == PLAY:
            move = self._read_move()
            fire = self._fire_held()
            while acc >= g.TICK_MS:
                acc -= g.TICK_MS
                w.step(move, fire)
            if w.over:
                self._game_over()
        else:
            while acc >= g.TICK_MS:
                acc -= g.TICK_MS
                if self._state == OVER:
                    self._over_t += 1
                w.step_fx()                # ambient fireworks + bursts in flight
        self._acc = acc
        self._dirty = True

    # ── render ───────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False
        w = self._world
        r.draw_background(d, self._bg, w.tick)
        s = self._state

        if s == TITLE:
            r.draw_world(d, w)
            self._draw_title(d)
            return

        r.draw_world(d, w)
        if w.score != self._last_score:
            self._last_score = w.score
            self._score_s = "SCORE %d" % w.score
        if w.level != self._last_level:
            self._last_level = w.level
            self._lv_s = "LV %d" % (w.level + 1)
        r.draw_hud(d, w, self._score_s, self._hi_s, self._lv_s)

        if s == PLAY:
            if w.banner_t and w.banner_t & 8:
                r.blit_center(d, self._t_banner[w.banner], 92,
                              self._banner_fb[w.banner], api.WHITE, 2)
        elif s == PAUSE:
            # One block centred on the screen: title, then two hint lines.
            d.rect(20, 66, 280, 110, r.C_CARD, True)
            d.rect(20, 66, 280, 110, theme.PRIMARY, False)
            r.blit_center(d, self._t_pause, 80, "PAUSED", theme.PRIMARY, 3)
            r.blit_center(d, self._t_resume, 118, "A or B to resume",
                          api.WHITE, 2)
            r.blit_center(d, self._t_quit, 144, "HOME = quit", r.C_DIM, 2)
        else:
            self._draw_over(d)

    def _draw_title(self, d):
        r.blit_center(d, self._t_title, 34, "PATAKHA", theme.PRIMARY, 4)
        r.center_text(d, "a Diwali night shooter", 74, theme.GOLD)
        r.blit_center(d, self._t_best, 92, None)
        if (self._world.tick >> 4) & 1 == 0:
            r.blit_center(d, self._t_press, 120, "PRESS A", api.WHITE, 2)
        r.center_text(d, "Mode: %s  (B = swap)" % self._mode_label(),
                      150, theme.PRIMARY)
        if self._mode == "IMU":
            r.center_text(d, "tilt = move   A = fire", 166, r.C_DIM)
        else:
            r.center_text(d, "L/R = move   A = fire", 166, r.C_DIM)
        r.center_text(d, "B = pause   HOME = back", 180, r.C_DIM)

    def _draw_over(self, d):
        d.rect(24, 30, 272, 180, r.C_CARD, True)
        d.rect(24, 30, 272, 180, theme.PRIMARY, False)
        d.rect(25, 31, 270, 178, theme.PRIMARY, False)
        r.blit_center(d, self._t_over, 42, "GAME OVER", theme.PRIMARY, 3)
        r.blit_center(d, self._t_final, 78, "SCORE %d" % self._world.score,
                      api.WHITE, 2)
        if self._new_hi:
            r.blit_center(d, self._t_newhi, 102, "NEW HIGH!", theme.GOLD, 2)
        else:
            r.center_text(d, "BEST %d" % self._hi, 106, theme.GOLD)
        if self._over_t >= OVER_LOCK_TICKS and (self._world.tick >> 4) & 1 == 0:
            r.blit_center(d, self._t_again, 130, "A = play again", api.WHITE, 2)
        r.blit_center(d, self._t_back, 156, "HOME = back", r.C_DIM, 2)
        r.center_text(d, "Mode: %s  (B = swap)" % self._mode_label(),
                      186, r.C_DIM)
