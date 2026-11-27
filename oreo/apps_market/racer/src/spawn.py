"""Racer traffic spawning: pure logic, no badge imports (host-testable).

Why this exists: the old spawner only used three fixed lanes whose cars
sat 28 px in from each kerb. With the 14 px hit slack a player hugging
either kerb was never inside any car's hitbox, so driving along the edge
made the game unloseable. Traffic now spawns at ANY x the player can
reach (kerb to kerb), and some spawns aim at the player's current
position, so there is no permanently safe spot anywhere on the road.

Fairness: a new car is only accepted if, together with the cars that are
still near the top of the screen (they reach the player at roughly the
same time), it leaves a free gap at least `need` px wide that the
player's car can sit in. So the spawner never builds a wall.
"""


class Rng:
    """16-bit xorshift. Every intermediate stays a MicroPython small int,
    so drawing a number never allocates (unlike a 32-bit LCG)."""

    __slots__ = ("s",)

    def __init__(self, seed=0xACE1):
        self.s = (seed & 0xFFFF) or 0xACE1

    def next(self):
        x = self.s
        x ^= (x << 7) & 0xFFFF
        x ^= x >> 9
        x ^= (x << 8) & 0xFFFF
        self.s = x
        return x

    def below(self, n):
        """Uniform-ish int in [0, n)."""
        return self.next() % n if n > 0 else 0


def leaves_gap(xs, lo, hi, half, need):
    """True if cars at left-x positions `xs` leave a free run of player
    left-x positions at least `need` px long inside [lo, hi].

    A car at ex blocks every player position px with |ex - px| < half.
    """
    spans = []
    for ex in xs:
        a = ex - half + 1
        b = ex + half - 1
        if b < lo or a > hi:
            continue
        spans.append((a if a > lo else lo, b if b < hi else hi))
    spans.sort()
    cur = lo                       # first position not yet known blocked
    for a, b in spans:
        if a - cur >= need:
            return True
        if b + 1 > cur:
            cur = b + 1
    return hi + 1 - cur >= need


def choose_x(rng, player_x, recent_xs, lo, hi, half, need,
             aim_pct=35, jitter=10, tries=4):
    """Pick a spawn x in [lo, hi] or return None (caller retries later).

    `aim_pct` percent of attempts drop the car near the player's current
    x, the rest are uniform across the whole road, kerbs included.
    """
    span = hi - lo + 1
    for _ in range(tries):
        if rng.below(100) < aim_pct:
            x = int(player_x) + rng.below(2 * jitter + 1) - jitter
        else:
            x = lo + rng.below(span)
        if x < lo:
            x = lo
        elif x > hi:
            x = hi
        if leaves_gap(list(recent_xs) + [x], lo, hi, half, need):
            return x
    return None
