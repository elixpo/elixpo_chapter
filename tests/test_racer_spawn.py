"""Host tests for the Racer traffic spawner (apps/racer/src/spawn.py)."""

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(relative_path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


spawn = load("apps_market/racer/src/spawn.py", "racer_spawn_under_test")

# Mirrors apps/racer/src/app.py: road 60..260, cars 32 px wide, 14 px slack.
LO, HI = 64, 224
HALF = 32 - 14
NEED = 24


class RacerSpawnTest(unittest.TestCase):
    def test_every_player_position_can_be_hit(self):
        """No x the player can drive at (kerbs included) is permanently safe."""
        rng = spawn.Rng(1234)
        for px in range(LO, HI + 1, 4):
            hit = False
            for _ in range(200):
                x = spawn.choose_x(rng, px, [], LO, HI, HALF, NEED)
                if x is not None and abs(x - px) < HALF:
                    hit = True
                    break
            self.assertTrue(hit, "player at x=%d is never threatened" % px)

    def test_kerbs_are_reachable_by_traffic(self):
        rng = spawn.Rng(99)
        xs = [spawn.choose_x(rng, 144, [], LO, HI, HALF, NEED) for _ in range(2000)]
        self.assertIn(LO, xs)
        self.assertIn(HI, xs)

    def test_never_builds_a_wall(self):
        rng = spawn.Rng(7)
        for _ in range(500):
            recent = []
            for _ in range(4):
                x = spawn.choose_x(rng, rng.below(HI - LO) + LO, recent,
                                   LO, HI, HALF, NEED)
                if x is not None:
                    recent.append(x)
                    self.assertTrue(spawn.leaves_gap(recent, LO, HI, HALF, NEED))

    def test_leaves_gap_detects_a_closed_road(self):
        # Cars every 30 px block every player position.
        wall = list(range(LO, HI + 1, 30))
        self.assertFalse(spawn.leaves_gap(wall, LO, HI, HALF, NEED))
        self.assertTrue(spawn.leaves_gap([LO, HI], LO, HI, HALF, NEED))
        self.assertTrue(spawn.leaves_gap([], LO, HI, HALF, NEED))

    def test_rng_stays_16_bit(self):
        rng = spawn.Rng(1)
        seen = set()
        for _ in range(5000):
            v = rng.next()
            self.assertTrue(0 < v < 65536)
            seen.add(v)
        self.assertGreater(len(seen), 4000)


if __name__ == "__main__":
    unittest.main()
