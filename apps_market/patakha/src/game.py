"""Patakha game logic: pure integer simulation, no badge imports.

Everything here is host-testable (tests/test_patakha_game.py) and runs
unchanged on the badge. Design rules for the render loop:

  * Integer fixed point only (positions and speeds in 1/256 px). On the
    ESP32 port every float is a heap object, so float maths in the loop
    would allocate on every frame.
  * Fixed-size pools as parallel int lists, allocated once in __init__.
    Bullets, targets and rockets reuse free slots; particles live in a
    ring buffer that overwrites the oldest spark when full.
  * One call to step() is one fixed 20 ms tick, independent of frame
    rate. The app runs as many ticks as real time demands.

Colours are stored as palette indices (see render.PALETTE) so this
module never needs the display API.
"""

import math

FP  = 8
ONE = 1 << FP

SW, SH = 320, 240
TICK_MS     = 20
TICKS_PER_S = 1000 // TICK_MS

# ── player ───────────────────────────────────────────────────────────────
GROUND_Y     = 226                 # a target whose bottom reaches this landed
PLAYER_W     = 36
PLAYER_H     = 27
PLAYER_Y     = GROUND_Y - PLAYER_H
PLAYER_SPEED = ONE * 7 // 2        # 3.5 px/tick = 175 px/s
PLAYER_ACCEL = ONE * 3 // 8        # roll-on to full speed in ~9 ticks
X_MAX        = (SW - PLAYER_W) << FP

# ── firecrackers (player bullets) ────────────────────────────────────────
N_BULLETS      = 16
BULLET_W       = 3
BULLET_H       = 8
BULLET_VY      = -7 * ONE
FIRE_COOLDOWN  = 11                # held A: ~4.5 shots/s
UFO_COOLDOWN   = 4                 # UFO auto fire: 12.5 shots/s

# ── targets ──────────────────────────────────────────────────────────────
N_TARGETS = 12
K_MATCHBOX, K_ANAR, K_CHAKRI, K_UFO = 0, 1, 2, 3
T_W      = (14, 10, 12, 20)
T_H      = (9, 14, 12, 10)
T_SPEED  = (ONE * 5 // 4, ONE * 13 // 8, ONE * 9 // 8, ONE * 2 // 5)   # level 0
T_POINTS = (5, 10, 15, 0)
UFO_PCT  = 5                       # % of spawns that are the UFO power-up

SPAWN_BASE = 56 * ONE              # spawn interval at level 0, 1/256 ticks
SPAWN_MIN  = 12 * ONE
MULT_ONE   = 4096
LEVEL_PCT  = 14                    # every level: +14 % fall, +14 % spawn rate
LEVEL_POINTS = 100
MAX_LEVEL  = 15                    # cap: ~7x the starting speed (1.14^15)

MILESTONES = (250, 500, 1000)

LIVES      = 3
HURT_TICKS = 75                    # 1.5 s of blink after losing a life
UFO_TICKS  = 8 * TICKS_PER_S       # 8 s UFO power-up

# ── milestone barrage rockets ────────────────────────────────────────────
N_ROCKETS     = 3
ROCKET_X      = (56, 160, 264)     # centre x of each rocket
ROCKET_W      = 12
ROCKET_H      = 30
ROCKET_VY     = -(ONE * 3 // 2)    # 75 px/s: slow and big
ROCKET_PATH_W = 44                 # width of the column one rocket clears
ROCKET_POP_Y  = 26                 # rockets burst when their nose gets here

# ── particles ────────────────────────────────────────────────────────────
N_PARTICLES = 128
GRAVITY     = 8                    # 1/256 px per tick^2

# Palette indices (render.PALETTE maps these to RGB565).
C_GOLD, C_PINK, C_TEAL, C_ORANGE, C_PURPLE, C_GREEN, C_WHITE, C_RED = 0, 1, 2, 3, 4, 5, 6, 7
C_SPARK, C_EMBER, C_SMOKE = 8, 9, 10
BURST_COLOURS = 8                  # indices 0..7 are firework colours

# Banners the renderer shows for a moment.
B_NONE, B_FASTER, B_BARRAGE, B_UFO = 0, 1, 2, 3
BANNER_TICKS = 60


def _build_mults():
    out = []
    m = MULT_ONE
    for _ in range(MAX_LEVEL + 1):
        out.append(m)
        m = m * (100 + LEVEL_PCT) // 100
    return tuple(out)


_MULTS = _build_mults()

# 16 unit vectors, 1/256 px, for radial bursts.
DIR_X = tuple(int(math.cos(i * math.pi / 8) * ONE) for i in range(16))
DIR_Y = tuple(int(math.sin(i * math.pi / 8) * ONE) for i in range(16))


def level_for(score):
    lv = score // LEVEL_POINTS
    return MAX_LEVEL if lv > MAX_LEVEL else lv


def fall_speed(kind, level):
    """Fall speed of a target kind at a level, in 1/256 px per tick."""
    if kind == K_UFO:
        return T_SPEED[K_UFO]          # the power-up always drifts slowly
    return T_SPEED[kind] * _MULTS[level] // MULT_ONE


def spawn_interval(level):
    """Ticks between spawns at a level, in 1/256 ticks."""
    v = SPAWN_BASE * MULT_ONE // _MULTS[level]
    return SPAWN_MIN if v < SPAWN_MIN else v


def milestones_crossed(old, new):
    """Bitmask of MILESTONES with old < m <= new (bit i = MILESTONES[i])."""
    mask = 0
    for i in range(len(MILESTONES)):
        m = MILESTONES[i]
        if old < m <= new:
            mask |= 1 << i
    return mask


def _popcount(v):
    n = 0
    while v:
        n += v & 1
        v >>= 1
    return n


class Rng:
    """16-bit xorshift; every intermediate is a small int (no allocation)."""

    def __init__(self, seed=0xBEEF):
        self.s = (seed & 0xFFFF) or 0xBEEF

    def next(self):
        x = self.s
        x ^= (x << 7) & 0xFFFF
        x ^= x >> 9
        x ^= (x << 8) & 0xFFFF
        self.s = x
        return x

    def below(self, n):
        return self.next() % n if n > 0 else 0


class World:
    def __init__(self, seed=1):
        self.rng = Rng(seed)
        n = N_BULLETS
        self.bx = [0] * n
        self.by = [0] * n
        self.bon = [0] * n
        n = N_TARGETS
        self.tx = [0] * n
        self.ty = [0] * n
        self.tvx = [0] * n
        self.tk = [0] * n
        self.ton = [0] * n
        n = N_ROCKETS
        self.rx = [0] * n
        self.ry = [0] * n
        self.ron = [0] * n
        n = N_PARTICLES
        self.px = [0] * n
        self.py = [0] * n
        self.pvx = [0] * n
        self.pvy = [0] * n
        self.pl = [0] * n
        self.pc = [0] * n
        self.pi = 0
        self.spd = [0, 0, 0, 0]        # fall speed per kind at current level
        self.hi_dirty = False
        self.reset()

    # ── lifecycle ────────────────────────────────────────────────────────
    def reset(self):
        for i in range(N_BULLETS):
            self.bon[i] = 0
        for i in range(N_TARGETS):
            self.ton[i] = 0
        for i in range(N_ROCKETS):
            self.ron[i] = 0
        for i in range(N_PARTICLES):
            self.pl[i] = 0
        self.player_x = ((SW - PLAYER_W) // 2) << FP
        self.pvel = 0
        self.score = 0
        self.lives = LIVES
        self.over = False
        self.tick = 0
        self.fire_cd = 0
        self.hurt = 0
        self.ufo = 0
        self.fired = 0                 # milestone bits already used this run
        self.pending = 0               # barrages waiting to launch
        self.banner = B_NONE
        self.banner_t = 0
        self.spawn_left = SPAWN_BASE // 2
        self._set_level(0)

    def _set_level(self, lv):
        self.level = lv
        for k in range(4):
            self.spd[k] = fall_speed(k, lv)

    def _show(self, banner):
        self.banner = banner
        self.banner_t = BANNER_TICKS

    # ── scoring ──────────────────────────────────────────────────────────
    def add_score(self, pts):
        old = self.score
        new = old + pts
        self.score = new
        lv = level_for(new)
        if lv > self.level:
            self._set_level(lv)
            self._show(B_FASTER)
        mask = milestones_crossed(old, new) & ~self.fired
        if mask:
            self.fired |= mask
            self.pending += _popcount(mask)

    # ── particles ────────────────────────────────────────────────────────
    def emit(self, x, y, vx, vy, life, col):
        i = self.pi
        self.px[i] = x
        self.py[i] = y
        self.pvx[i] = vx
        self.pvy[i] = vy
        self.pl[i] = life
        self.pc[i] = col
        i += 1
        self.pi = 0 if i >= N_PARTICLES else i

    def burst(self, cx, cy, n, power):
        """Multi-coloured firework at pixel (cx, cy). power: 1 small, 2 big."""
        rng = self.rng
        c0 = rng.below(BURST_COLOURS)
        c1 = (c0 + 3) % BURST_COLOURS
        c2 = (c0 + 5) % BURST_COLOURS
        x = cx << FP
        y = cy << FP
        for j in range(n):
            d = (j * 16 // n + rng.below(2)) & 15
            spd = ONE // 2 + rng.below(ONE * 3 // 2)
            if power > 1:
                spd += spd // 2 + ONE // 2
            vx = (DIR_X[d] * spd) >> FP
            vy = ((DIR_Y[d] * spd) >> FP) - ONE // 3
            m = j % 3
            col = c0 if m == 0 else (c1 if m == 1 else c2)
            self.emit(x, y, vx, vy, 24 + rng.below(18), col)

    def fizzle(self, cx, cy):
        """Grey puff where a target hits the ground."""
        rng = self.rng
        x = cx << FP
        y = cy << FP
        for _ in range(6):
            self.emit(x, y, rng.below(ONE * 2) - ONE, -rng.below(ONE * 3 // 2),
                      10 + rng.below(8), C_SMOKE if rng.next() & 1 else C_EMBER)

    def _step_particles(self):
        px = self.px
        py = self.py
        pvx = self.pvx
        pvy = self.pvy
        pl = self.pl
        floor = SH << FP
        for i in range(N_PARTICLES):
            life = pl[i]
            if life:
                vy = pvy[i] + GRAVITY
                pvy[i] = vy
                y = py[i] + vy
                py[i] = y
                px[i] += pvx[i]
                pl[i] = 0 if y > floor else life - 1

    def step_fx(self):
        """Ambient fireworks behind the title / game-over screens."""
        self.tick += 1
        if self.banner_t:
            self.banner_t -= 1
        rng = self.rng
        if rng.below(28) == 0:
            self.burst(30 + rng.below(SW - 60), 30 + rng.below(110),
                       14, 1 + (rng.next() & 1))
        self._step_particles()

    # ── one simulation tick ──────────────────────────────────────────────
    def step(self, move, fire):
        """Advance one tick. move: -256..256 (left..right), fire: bool."""
        if self.over:
            self._step_particles()
            return
        self.tick += 1
        rng = self.rng

        # Player: ease toward the target velocity for smooth movement.
        ufo = self.ufo
        maxv = PLAYER_SPEED * 2 if ufo else PLAYER_SPEED
        acc = PLAYER_ACCEL * 2 if ufo else PLAYER_ACCEL
        target = move * maxv // 256
        v = self.pvel
        if v < target:
            v = v + acc if v + acc < target else target
        elif v > target:
            v = v - acc if v - acc > target else target
        x = self.player_x + v
        if x < 0:
            x = 0
            v = 0
        elif x > X_MAX:
            x = X_MAX
            v = 0
        self.player_x = x
        self.pvel = v
        pxl = x >> FP

        if self.hurt:
            self.hurt -= 1
        if ufo:
            self.ufo = ufo - 1
        if self.banner_t:
            self.banner_t -= 1

        # Firing.
        if self.fire_cd:
            self.fire_cd -= 1
        if self.fire_cd == 0:
            if ufo:
                off = 4 if self.tick & 4 else PLAYER_W - 4 - BULLET_W
                self._shoot(pxl + off)
                self.fire_cd = UFO_COOLDOWN
            elif fire:
                self._shoot(pxl + (PLAYER_W - BULLET_W) // 2)
                self.fire_cd = FIRE_COOLDOWN

        # Firecrackers fly up, leaving a spark trail.
        bx = self.bx
        by = self.by
        bon = self.bon
        top = -BULLET_H << FP
        for i in range(N_BULLETS):
            if bon[i]:
                y = by[i] + BULLET_VY
                if y < top:
                    bon[i] = 0
                else:
                    by[i] = y
                    if self.tick & 1:
                        self.emit(bx[i] + rng.below(3 * ONE) - ONE,
                                  y + (BULLET_H << FP),
                                  rng.below(ONE // 2) - ONE // 4, ONE // 4,
                                  6 + rng.below(5),
                                  C_SPARK if rng.next() & 1 else C_EMBER)

        # Spawning.
        self.spawn_left -= ONE
        if self.spawn_left <= 0:
            self.spawn_left += spawn_interval(self.level)
            self._spawn()

        # Barrage launches once the previous one has finished.
        if self.pending and not (self.ron[0] or self.ron[1] or self.ron[2]):
            self.pending -= 1
            for i in range(N_ROCKETS):
                self.rx[i] = ROCKET_X[i]
                self.ry[i] = SH << FP
                self.ron[i] = 1
            self._show(B_BARRAGE)

        self._step_targets(pxl)
        if not self.over:
            self._step_rockets()
        self._step_particles()

    def _shoot(self, x):
        for i in range(N_BULLETS):
            if not self.bon[i]:
                self.bon[i] = 1
                self.bx[i] = x << FP
                self.by[i] = (PLAYER_Y - BULLET_H + 2) << FP
                return

    def _spawn(self):
        slot = -1
        ufo_out = False
        for i in range(N_TARGETS):
            if self.ton[i]:
                if self.tk[i] == K_UFO:
                    ufo_out = True
            elif slot < 0:
                slot = i
        if slot < 0:
            return
        rng = self.rng
        if rng.below(100) < UFO_PCT and not ufo_out and not self.ufo:
            kind = K_UFO
        else:
            r = rng.below(100)
            kind = K_MATCHBOX if r < 55 else (K_ANAR if r < 80 else K_CHAKRI)
        w = T_W[kind]
        self.tk[slot] = kind
        self.tx[slot] = (4 + rng.below(SW - w - 8)) << FP
        self.ty[slot] = -T_H[kind] << FP
        if kind == K_CHAKRI:
            vx = ONE // 2 + rng.below(ONE // 2)
        elif kind == K_UFO:
            vx = ONE + rng.below(ONE // 2)
        else:
            vx = 0
        self.tvx[slot] = -vx if rng.next() & 1 else vx
        self.ton[slot] = 1

    def _kill_target(self, i):
        """Destroy target i in a firework (or collect it if it's the UFO)."""
        self.ton[i] = 0
        k = self.tk[i]
        cx = (self.tx[i] >> FP) + T_W[k] // 2
        cy = (self.ty[i] >> FP) + T_H[k] // 2
        if k == K_UFO:
            self.ufo = UFO_TICKS
            self._show(B_UFO)
            self.burst(cx, cy, 16, 2)
        else:
            self.burst(cx, cy, 14, 1)
            self.add_score(T_POINTS[k])

    def _lose_life(self):
        self.lives -= 1
        self.hurt = HURT_TICKS
        if self.lives <= 0:
            self.lives = 0
            self.over = True
            self.burst((self.player_x >> FP) + PLAYER_W // 2, PLAYER_Y, 16, 2)

    def _step_targets(self, pxl):
        tx = self.tx
        ty = self.ty
        tvx = self.tvx
        tk = self.tk
        ton = self.ton
        spd = self.spd
        bx = self.bx
        by = self.by
        bon = self.bon
        for i in range(N_TARGETS):
            if not ton[i]:
                continue
            k = tk[i]
            w = T_W[k]
            h = T_H[k]
            y = ty[i] + spd[k]
            ty[i] = y
            vx = tvx[i]
            if vx:
                x = tx[i] + vx
                if x < 0 or x > (SW - w) << FP:
                    tvx[i] = -vx
                    x = tx[i]
                tx[i] = x
            x0 = tx[i] >> FP
            y0 = y >> FP

            # Firecracker hits.
            hit = False
            for b in range(N_BULLETS):
                if bon[b]:
                    bx0 = bx[b] >> FP
                    by0 = by[b] >> FP
                    if (bx0 < x0 + w and bx0 + BULLET_W > x0
                            and by0 < y0 + h and by0 + BULLET_H > y0):
                        bon[b] = 0
                        hit = True
                        break
            if hit:
                self._kill_target(i)
                continue

            # Touching the launcher.
            if (y0 + h > PLAYER_Y + 4 and y0 < PLAYER_Y + PLAYER_H
                    and x0 < pxl + PLAYER_W - 3 and x0 + w > pxl + 3):
                if k == K_UFO or self.ufo:
                    self._kill_target(i)
                else:
                    ton[i] = 0
                    self.burst(x0 + w // 2, y0 + h // 2, 10, 1)
                    if not self.hurt:
                        self._lose_life()
                        if self.over:
                            return
                continue

            # Landed.
            if y0 + h >= GROUND_Y:
                ton[i] = 0
                self.fizzle(x0 + w // 2, GROUND_Y - 1)
                if k != K_UFO and not self.ufo:
                    self._lose_life()
                    if self.over:
                        return

    def _step_rockets(self):
        rx = self.rx
        ry = self.ry
        ron = self.ron
        rng = self.rng
        half = ROCKET_PATH_W // 2
        for r in range(N_ROCKETS):
            if not ron[r]:
                continue
            y = ry[r] + ROCKET_VY
            ry[r] = y
            cx = rx[r]
            top = y >> FP
            # Thick golden exhaust.
            self.emit((cx - 3 + rng.below(7)) << FP, y + (ROCKET_H << FP),
                      rng.below(ONE) - ONE // 2, ONE // 2 + rng.below(ONE // 2),
                      8 + rng.below(8), C_SPARK if rng.next() & 1 else C_ORANGE)
            # Every target in this rocket's column goes up in a chain.
            for i in range(N_TARGETS):
                if self.ton[i]:
                    k = self.tk[i]
                    w = T_W[k]
                    x0 = self.tx[i] >> FP
                    y0 = self.ty[i] >> FP
                    if (x0 < cx + half and x0 + w > cx - half
                            and y0 + T_H[k] > top and y0 < top + ROCKET_H):
                        self._kill_target(i)
            if top <= ROCKET_POP_Y:
                ron[r] = 0
                self.burst(cx, top, 16, 2)
                self.burst(cx, top, 12, 1)
