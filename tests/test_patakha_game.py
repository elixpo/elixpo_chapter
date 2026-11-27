"""Host tests for Patakha (apps_market/patakha).

game.py is pure integer logic, so it is loaded straight from its file.
The last test drives the whole App (game + render) against a fake
display to catch crashes in the draw path without a badge.
"""

import importlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(relative_path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


g = load("apps_market/patakha/src/game.py", "patakha_game_under_test")


def run_ticks(w, n, move=0, fire=False):
    for _ in range(n):
        w.step(move, fire)


class ScalingTest(unittest.TestCase):
    def test_level_every_100_points(self):
        self.assertEqual(g.level_for(0), 0)
        self.assertEqual(g.level_for(99), 0)
        self.assertEqual(g.level_for(100), 1)
        self.assertEqual(g.level_for(250), 2)
        self.assertEqual(g.level_for(10 ** 6), g.MAX_LEVEL)

    def test_fall_speed_grows_10_to_15_percent_per_level(self):
        for kind in (g.K_MATCHBOX, g.K_ANAR, g.K_CHAKRI):
            for lv in range(g.MAX_LEVEL):
                ratio = g.fall_speed(kind, lv + 1) / g.fall_speed(kind, lv)
                self.assertTrue(1.10 <= ratio <= 1.15,
                                "kind %d level %d ratio %.3f" % (kind, lv, ratio))

    def test_spawn_rate_grows_10_to_15_percent_per_level(self):
        for lv in range(g.MAX_LEVEL):
            a = g.spawn_interval(lv)
            b = g.spawn_interval(lv + 1)
            if b == g.SPAWN_MIN:
                break
            ratio = a / b
            self.assertTrue(1.10 <= ratio <= 1.15,
                            "level %d ratio %.3f" % (lv, ratio))

    def test_ufo_speed_does_not_scale(self):
        self.assertEqual(g.fall_speed(g.K_UFO, 0), g.fall_speed(g.K_UFO, 9))

    def test_world_applies_level_on_score(self):
        w = g.World(3)
        before = w.spd[g.K_MATCHBOX]
        w.add_score(100)
        self.assertEqual(w.level, 1)
        self.assertGreater(w.spd[g.K_MATCHBOX], before)
        self.assertEqual(w.banner, g.B_FASTER)


class MilestoneTest(unittest.TestCase):
    def test_crossing_mask(self):
        self.assertEqual(g.milestones_crossed(240, 250), 0b001)
        self.assertEqual(g.milestones_crossed(245, 255), 0b001)
        self.assertEqual(g.milestones_crossed(250, 260), 0)
        self.assertEqual(g.milestones_crossed(495, 500), 0b010)
        self.assertEqual(g.milestones_crossed(990, 1005), 0b100)
        self.assertEqual(g.milestones_crossed(490, 1010), 0b110)
        self.assertEqual(g.milestones_crossed(0, 249), 0)

    def test_each_milestone_fires_one_barrage(self):
        w = g.World(5)
        score_pending = []
        for _ in range(250):          # 5 points at a time up to 1250
            w.add_score(5)
            score_pending.append((w.score, w.pending))
        self.assertEqual(w.pending, 3)
        first = [s for s, p in score_pending if p >= 1][0]
        self.assertEqual(first, 250)
        self.assertEqual(w.fired, 0b111)

    def test_barrage_clears_its_columns(self):
        w = g.World(9)
        w.spawn_left = 10 ** 9            # no random spawns during the test
        # One matchbox in each rocket column, mid-screen.
        for i, cx in enumerate(g.ROCKET_X):
            w.tk[i] = g.K_MATCHBOX
            w.tx[i] = (cx - 7) << g.FP
            w.ty[i] = 60 << g.FP
            w.tvx[i] = 0
            w.ton[i] = 1
        w.add_score(250 - w.score)
        self.assertEqual(w.pending, 1)
        w.step(0, False)
        self.assertEqual(sum(w.ron), 3)
        self.assertEqual(w.banner, g.B_BARRAGE)
        lives = w.lives
        run_ticks(w, 400)
        self.assertEqual(sum(w.ron), 0)
        self.assertEqual(sum(w.ton[:3]), 0)
        self.assertEqual(w.score, 250 + 3 * g.T_POINTS[g.K_MATCHBOX])
        self.assertEqual(w.lives, lives)


class GameplayTest(unittest.TestCase):
    def test_ufo_is_about_five_percent_of_spawns(self):
        w = g.World(11)
        n = 20000
        ufos = 0
        for _ in range(n):
            for i in range(g.N_TARGETS):
                w.ton[i] = 0
            w._spawn()
            for i in range(g.N_TARGETS):
                if w.ton[i] and w.tk[i] == g.K_UFO:
                    ufos += 1
        pct = 100.0 * ufos / n
        self.assertTrue(3.5 <= pct <= 6.5, "UFO share %.2f%%" % pct)

    def test_landing_costs_a_life(self):
        w = g.World(2)
        w.spawn_left = 10 ** 9
        w.tk[0] = g.K_MATCHBOX
        w.tx[0] = 10 << g.FP              # far from the launcher
        w.ty[0] = (g.GROUND_Y - 10) << g.FP
        w.ton[0] = 1
        run_ticks(w, 5)
        self.assertEqual(w.ton[0], 0)
        self.assertEqual(w.lives, g.LIVES - 1)

    def test_ufo_power_up(self):
        w = g.World(4)
        w.spawn_left = 10 ** 9
        w.tk[0] = g.K_UFO
        w.tx[0] = w.player_x
        w.ty[0] = (g.PLAYER_Y - 4) << g.FP
        w.tvx[0] = 0
        w.ton[0] = 1
        w.step(0, False)
        self.assertGreater(w.ufo, g.UFO_TICKS - 5)
        self.assertEqual(w.banner, g.B_UFO)
        # Double speed.
        run_ticks(w, 30, move=256)
        self.assertEqual(w.pvel, 0 if w.player_x == g.X_MAX
                         else 2 * g.PLAYER_SPEED)
        # Invincible: a landing target costs nothing, auto fire is on.
        w.tk[1] = g.K_MATCHBOX
        w.tx[1] = 0
        w.ty[1] = (g.GROUND_Y - 10) << g.FP
        w.ton[1] = 1
        lives = w.lives
        run_ticks(w, 10)
        self.assertEqual(w.lives, lives)
        self.assertGreater(sum(w.bon), 0)
        # Wears off after 8 seconds.
        run_ticks(w, g.UFO_TICKS)
        self.assertEqual(w.ufo, 0)

    def test_shooting_scores(self):
        w = g.World(6)
        w.spawn_left = 10 ** 9
        cx = (w.player_x >> g.FP) + g.PLAYER_W // 2
        w.tk[0] = g.K_ANAR
        w.tx[0] = (cx - 5) << g.FP
        w.ty[0] = 40 << g.FP
        w.ton[0] = 1
        run_ticks(w, 40, fire=True)
        self.assertEqual(w.ton[0], 0)
        self.assertEqual(w.score, g.T_POINTS[g.K_ANAR])

    def test_idle_player_eventually_loses_and_pools_stay_fixed(self):
        w = g.World(8)
        sizes = (len(w.bx), len(w.tx), len(w.rx), len(w.px))
        for t in range(60 * g.TICKS_PER_S):
            w.step(256 if (t // 90) & 1 else -256, (t & 15) == 0)
            if w.over:
                break
        self.assertTrue(w.over)
        self.assertEqual(w.lives, 0)
        self.assertEqual(sizes, (len(w.bx), len(w.tx), len(w.rx), len(w.px)))


class _FakeDisplay:
    def __init__(self):
        self.calls = 0

    def _c(self, *a, **k):
        self.calls += 1

    clear = pixel = line = rect = text = blit = blit_fullscreen = _c


class _FakeButtons:
    def __init__(self):
        self.held = set()

    def is_pressed(self, b):
        return b in self.held


class _FakeOS:
    def __init__(self):
        self.buttons = _FakeButtons()
        self._imu = None
        self.settings = {}

    def settings_get(self, k, d=None):
        return self.settings.get(k, d)

    def settings_set(self, k, v):
        self.settings[k] = v


class _FakeTime:
    def __init__(self):
        self.now = 0

    def ticks_ms(self):
        return self.now

    def ticks_diff(self, a, b):
        return a - b


class AppSmokeTest(unittest.TestCase):
    def test_full_round_draws_without_errors(self):
        # Other tests leave stub "oreoOS" packages in sys.modules; load the
        # real package for this test and put theirs back afterwards.
        saved = {k: v for k, v in sys.modules.items()
                 if k == "oreoOS" or k.startswith("oreoOS.")}
        for k in saved:
            del sys.modules[k]

        def restore():
            for k in [k for k in sys.modules
                      if k == "oreoOS" or k.startswith("oreoOS.")]:
                del sys.modules[k]
            sys.modules.update(saved)
        self.addCleanup(restore)
        sys.path.insert(0, str(ROOT))
        try:
            mod = importlib.import_module("apps_market.patakha.src.app")
        finally:
            sys.path.remove(str(ROOT))
        api = importlib.import_module("oreoOS.api")
        clock = _FakeTime()
        mod.time = clock
        # Keep the high score out of the real filesystem.
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        saved_dir = mod.state.STATE_DIR
        mod.state.STATE_DIR = tmp.name + "/state"
        self.addCleanup(setattr, mod.state, "STATE_DIR", saved_dir)
        mod.LEGACY_HI_PATH = tmp.name + "/hi.txt"
        os_ = _FakeOS()
        app = mod.App()
        app.on_enter(os_)
        d = _FakeDisplay()

        def frame(ms=33):
            clock.now += ms
            app.update(ms / 1000)
            app.draw(d)

        for _ in range(30):
            frame()
        app.on_button_press(api.BTN_A)
        self.assertEqual(app._state, mod.PLAY)
        self.assertTrue(app.realtime_mode())
        os_.buttons.held = {api.BTN_A, api.BTN_RIGHT}
        for i in range(6000):
            if i % 120 == 0:
                os_.buttons.held ^= {api.BTN_LEFT, api.BTN_RIGHT}
            frame()
            if app._state == mod.OVER:
                break
        self.assertEqual(app._state, mod.OVER)
        self.assertFalse(app.realtime_mode())
        for _ in range(60):
            frame()
        app.on_button_press(api.BTN_A)
        self.assertEqual(app._state, mod.PLAY)
        app.on_button_press(api.BTN_B)
        self.assertEqual(app._state, mod.PAUSE)
        frame(5000)
        app.on_exit()
        self.assertGreater(d.calls, 1000)


if __name__ == "__main__":
    unittest.main()
