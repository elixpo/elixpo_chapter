"""Patakha drawing: pixel-art sprites as rect tables, pooled particles.

The launcher flushes the whole framebuffer every frame, so the cheapest
smooth path is: one memcpy of a pre-rendered background, then a few
dozen C-level fill_rect calls for everything that moves. Nothing here
allocates per frame except the small FrameBuffer wrapper inside
Display.blit (same as every other sprite game on the badge).
"""

from oreoOS import api, theme

from . import game as g

SW, SH = api.SCREEN_W, api.SCREEN_H
FP = g.FP

# ── colours (Falera festive palette on a Diwali night sky) ─────────────────
# The backdrop is kept dim (about half brightness) so the launcher, the
# falling targets and the fireworks are what the eye follows.
SKY = (api.rgb(8, 6, 22), api.rgb(11, 8, 28), api.rgb(15, 10, 34),
       api.rgb(20, 12, 40), api.rgb(26, 14, 44))
C_STAR    = api.rgb(150, 142, 124)
C_STAR_D  = api.rgb(64, 60, 78)
C_CITY    = api.rgb(14, 10, 26)
C_CITY_HI = api.rgb(20, 14, 34)
C_WINDOW  = api.rgb(110, 84, 40)
C_GROUND  = api.rgb(34, 18, 16)
C_GROUND2 = api.rgb(46, 26, 20)
C_CLAY    = api.rgb(98, 50, 28)
C_CLAY_D  = api.rgb(70, 34, 20)
BG_FLAME   = api.rgb(150, 136, 70)    # diya flames, dimmed
BG_FLAME_O = api.rgb(150, 82, 24)
C_FLAME   = api.rgb(255, 230, 110)
C_FLAME_O = api.rgb(255, 140, 40)
C_DARK    = theme.TEXT_BRIGHT
C_WOOD    = api.rgb(120, 70, 44)
C_SILVER  = api.rgb(200, 204, 214)
C_SILVER_D = api.rgb(130, 134, 150)
C_RED     = api.rgb(220, 50, 50)
C_RED_D   = api.rgb(160, 30, 40)
C_CREAM   = theme.BG
C_SHADOW  = api.rgb(12, 8, 30)
C_TEXT    = api.WHITE
C_DIM     = api.rgb(190, 170, 200)
C_CARD    = api.rgb(28, 18, 56)

# Index order must match game.C_* constants.
PALETTE = (
    theme.GOLD, theme.PRIMARY, theme.TEAL, theme.ORANGE, theme.PURPLE,
    theme.GREEN, api.WHITE, C_RED,
    api.rgb(255, 240, 150),   # spark
    api.rgb(255, 120, 40),    # ember
    api.rgb(120, 110, 130),   # smoke
)
BULB = (api.rgb(128, 96, 16), api.rgb(128, 46, 52), api.rgb(0, 90, 82),
        api.rgb(30, 100, 50), api.rgb(128, 70, 16))     # dimmed string lights

# ── sprites: (dx, dy, w, h, colour) ──────────────────────────────────────
SPR_MATCHBOX = (
    (0, 0, 14, 9, C_RED),
    (0, 0, 14, 1, C_RED_D),
    (2, 2, 10, 5, C_CREAM),
    (5, 4, 4, 2, theme.PRIMARY),
    (6, 3, 2, 1, theme.GOLD),
    (12, 1, 1, 7, C_WOOD),
)
SPR_ANAR = (
    (3, 2, 4, 3, theme.ORANGE),
    (2, 5, 6, 3, theme.GOLD),
    (1, 8, 8, 3, theme.ORANGE),
    (0, 11, 10, 3, C_RED_D),
    (4, 5, 2, 9, C_CREAM),
)
SPR_UFO = (
    (7, 0, 6, 3, theme.TEAL),
    (8, 0, 2, 1, api.WHITE),
    (2, 3, 16, 3, C_SILVER),
    (0, 6, 20, 2, theme.PRIMARY),
    (4, 8, 12, 2, C_SILVER_D),
)
# 36 x 27 (game.PLAYER_W x PLAYER_H).
SPR_LAUNCHER = (
    (3, 22, 8, 5, C_DARK),
    (25, 22, 8, 5, C_DARK),
    (5, 24, 4, 2, C_SILVER_D),
    (27, 24, 4, 2, C_SILVER_D),
    (0, 15, 36, 8, C_WOOD),
    (0, 15, 36, 2, theme.GOLD),
    (13, 1, 10, 15, theme.PRIMARY),
    (13, 5, 10, 2, theme.GOLD),
    (13, 10, 10, 2, theme.GOLD),
    (15, 2, 2, 12, api.rgb(255, 170, 180)),
    (12, 0, 12, 3, C_DARK),
)
SPR_SAUCER = (
    (9, 21, 18, 6, api.rgb(40, 110, 120)),
    (0, 12, 36, 8, C_SILVER),
    (10, 3, 16, 9, theme.TEAL),
    (13, 4, 5, 3, api.WHITE),
    (-3, 18, 42, 3, theme.PRIMARY),
)
SPR_BULLET = (
    (0, 0, 3, 2, theme.GOLD),
    (0, 2, 3, 6, C_RED),
    (1, 3, 1, 4, C_CREAM),
)
SPR_ROCKET = (
    (5, 0, 2, 2, api.WHITE),
    (4, 2, 4, 2, theme.PRIMARY),
    (3, 4, 6, 2, theme.PRIMARY),
    (2, 6, 8, 2, theme.PRIMARY),
    (2, 8, 8, 16, theme.GOLD),
    (2, 12, 8, 2, C_RED),
    (2, 18, 8, 2, C_RED),
    (0, 19, 2, 7, theme.PURPLE),
    (10, 19, 2, 7, theme.PURPLE),
    (3, 24, 6, 2, C_DARK),
)
# Chakri: spinning ring of 8 sparks around a gold hub.
CHAKRI_RING = ((5, 0), (8, 1), (10, 5), (8, 8), (5, 10), (1, 8), (0, 5), (1, 1))

# ── background layout ────────────────────────────────────────────────────
STARS = ((14, 18), (40, 44), (66, 12), (92, 60), (118, 28), (150, 8),
         (176, 50), (204, 22), (230, 66), (258, 14), (284, 40), (308, 24),
         (24, 86), (78, 96), (134, 82), (190, 100), (246, 90), (300, 104),
         (56, 130), (170, 124), (270, 136), (110, 140), (8, 120), (214, 30))
TWINKLE = ((30, 30), (100, 16), (160, 36), (222, 10), (290, 58), (60, 70),
           (140, 112), (250, 120), (196, 72), (12, 58))
# Skyline buildings: (x, w, h) standing on the ground line.
CITY = ((0, 28, 52), (26, 22, 76), (46, 34, 44), (78, 18, 92), (94, 30, 60),
        (122, 26, 38), (146, 20, 84), (164, 36, 54), (198, 24, 70),
        (220, 30, 46), (248, 18, 96), (264, 32, 58), (294, 26, 80))
# Toran (string of lights) sagging between the two tallest rooftops.
TORAN = tuple((88 + i * 11, 150 - (2 * i - 15) * (2 * i - 15) * 14 // 225)
              for i in range(16))
DIYA_X = tuple(12 + i * 42 for i in range(8))


def _swap(c):
    return ((c & 0xFF) << 8) | ((c >> 8) & 0xFF)


def _paint_bg(fill):
    """Static backdrop through fill(x, y, w, h, colour)."""
    band = g.GROUND_Y // len(SKY)
    for i in range(len(SKY)):
        fill(0, i * band, SW, band + 1, SKY[i])
    for x, y in STARS:
        fill(x, y, 1, 1, C_STAR_D)
    gy = g.GROUND_Y
    for x, w, h in CITY:
        fill(x, gy - h, w, h, C_CITY)
        fill(x, gy - h, w, 2, C_CITY_HI)
        wy = gy - h + 6
        n = 0
        while wy < gy - 8:
            wx = x + 4
            while wx < x + w - 4:
                n += 1
                if (n * 7 + x) % 5 < 2:
                    fill(wx, wy, 2, 3, C_WINDOW)
                wx += 6
            wy += 9
    fill(0, gy, SW, SH - gy, C_GROUND)
    fill(0, gy, SW, 2, C_GROUND2)
    for x in DIYA_X:
        fill(x, gy + 6, 9, 3, C_CLAY)
        fill(x + 1, gy + 9, 7, 2, C_CLAY_D)


def build_background():
    """Pre-render the backdrop into a native 320x240 frame, or None."""
    try:
        import framebuf
        buf = bytearray(SW * SH * 2)
        fb = framebuf.FrameBuffer(buf, SW, SH, framebuf.RGB565)
    except Exception:
        return None

    def fill(x, y, w, h, c):
        fb.fill_rect(x, y, w, h, _swap(c))

    _paint_bg(fill)
    return buf


def make_text(s, colour, scale, shadow=C_SHADOW):
    """Render shadowed text once into a chroma-keyed sprite (buf, w, h).

    Display.text(scale>1) loops over pixels in Python every call; a
    pre-rendered sprite is one framebuf blit. Returns None off-device.
    """
    try:
        import framebuf
    except ImportError:
        return None
    cw = 8 * len(s)
    mask = bytearray(((cw + 7) // 8) * 8)
    m = framebuf.FrameBuffer(mask, cw, 8, framebuf.MONO_HLSB)
    m.text(s, 0, 0, 1)
    off = scale // 2 if scale > 1 else 1
    w = cw * scale + off
    h = 8 * scale + off
    buf = bytearray(w * h * 2)
    fb = framebuf.FrameBuffer(buf, w, h, framebuf.RGB565)
    fb.fill(_swap(0xF81F))
    for o, c in ((off, shadow), (0, colour)):
        sc = _swap(c)
        for py in range(8):
            for px in range(cw):
                if m.pixel(px, py):
                    fb.fill_rect(px * scale + o, py * scale + o, scale, scale, sc)
    return (buf, w, h)


def blit_center(d, spr, y, fallback=None, colour=C_TEXT, scale=1):
    if spr is not None:
        buf, w, h = spr
        d.blit(buf, (SW - w) // 2, y, w, h)
    elif fallback:
        d.text(fallback, (SW - len(fallback) * 8 * scale) // 2, y, colour, scale)


def center_text(d, s, y, colour):
    """Scale-1 text with a shadow (cheap: two C calls)."""
    x = (SW - len(s) * 8) // 2
    d.text(s, x + 1, y + 1, C_SHADOW)
    d.text(s, x, y, colour)


def _spr(rect, rects, x, y):
    for dx, dy, w, h, c in rects:
        rect(x + dx, y + dy, w, h, c, True)


# ── frame ────────────────────────────────────────────────────────────────
def draw_background(d, bg, tick):
    if bg is not None:
        d.blit_fullscreen(bg)
    else:
        rect = d.rect
        _paint_bg(lambda x, y, w, h, c: rect(x, y, w, h, c, True))
    rect = d.rect
    t = tick >> 3
    i = 0
    for x, y in TWINKLE:
        k = (t + i) & 3
        if k:
            rect(x, y, 1, 1, C_STAR, True)
            if k == 2:
                rect(x - 1, y, 3, 1, C_STAR, True)
                rect(x, y - 1, 1, 3, C_STAR, True)
        i += 1
    t = tick >> 4
    i = 0
    nb = len(BULB)
    for x, y in TORAN:
        rect(x, y, 2, 2, BULB[(t + i) % nb], True)
        i += 1
    gy = g.GROUND_Y
    i = 0
    for x in DIYA_X:
        fl = ((tick >> 2) + i * 3) & 3
        rect(x + 3, gy + 1 + (fl & 1), 3, 5 - (fl & 1), BG_FLAME_O, True)
        rect(x + 4, gy + 3, 1, 3, BG_FLAME, True)
        i += 1


def draw_world(d, w):
    rect = d.rect
    tick = w.tick

    # Targets.
    tx = w.tx
    ty = w.ty
    tk = w.tk
    ton = w.ton
    for i in range(g.N_TARGETS):
        if not ton[i]:
            continue
        x = tx[i] >> FP
        y = ty[i] >> FP
        k = tk[i]
        if k == g.K_MATCHBOX:
            _spr(rect, SPR_MATCHBOX, x, y)
        elif k == g.K_ANAR:
            _spr(rect, SPR_ANAR, x, y)
            rect(x + 4, y, 2, 2, PALETTE[8 + ((tick >> 1) & 1)], True)
        elif k == g.K_CHAKRI:
            rect(x + 5, y + 5, 2, 2, theme.GOLD, True)
            r = tick >> 1
            j = 0
            for ox, oy in CHAKRI_RING:
                rect(x + ox, y + oy, 2, 2,
                     theme.PRIMARY if (j + r) & 1 else theme.GREEN, True)
                j += 1
        else:
            _spr(rect, SPR_UFO, x, y)
            lit = (tick >> 2) % 3
            for j in range(3):
                rect(x + 3 + j * 6, y + 6, 2, 1,
                     api.WHITE if j == lit else theme.GOLD, True)

    # Barrage rockets.
    for r in range(g.N_ROCKETS):
        if w.ron[r]:
            x = w.rx[r] - g.ROCKET_W // 2
            y = w.ry[r] >> FP
            _spr(rect, SPR_ROCKET, x, y)
            rect(x + 4, y + 26, 4, 3 + (tick & 1) * 2,
                 PALETTE[8] if tick & 2 else theme.ORANGE, True)

    # Firecrackers.
    bx = w.bx
    by = w.by
    bon = w.bon
    for i in range(g.N_BULLETS):
        if bon[i]:
            _spr(rect, SPR_BULLET, bx[i] >> FP, by[i] >> FP)

    # Player.
    if not w.over and not (w.hurt and tick & 4):
        x = w.player_x >> FP
        y = g.PLAYER_Y
        if w.ufo:
            glow = theme.TEAL if tick & 2 else api.rgb(120, 255, 230)
            # Blink faster in the last two seconds so the end is readable.
            if w.ufo > 2 * g.TICKS_PER_S or tick & 4:
                d.rect(x - 6, y + 6, 48, 21, glow, False)
                d.rect(x - 5, y + 7, 46, 19, glow, False)
            _spr(rect, SPR_SAUCER, x, y)
            lit = (tick >> 1) & 3
            for j in range(4):
                rect(x + 2 + j * 10, y + 18, 3, 3,
                     api.WHITE if j == lit else theme.GOLD, True)
        else:
            _spr(rect, SPR_LAUNCHER, x, y)

    # Particles (sparks and firework bursts).
    px = w.px
    py = w.py
    pl = w.pl
    pc = w.pc
    pal = PALETTE
    for i in range(g.N_PARTICLES):
        life = pl[i]
        if life:
            x = px[i] >> FP
            y = py[i] >> FP
            if 0 <= x < SW and 0 <= y < SH:
                if life > 8:
                    rect(x, y, 2, 2, pal[pc[i]], True)
                else:
                    rect(x, y, 1, 1, pal[pc[i]], True)


def draw_hud(d, w, score_s, hi_s, lv_s):
    d.text(score_s, 7, 5, C_SHADOW)
    d.text(score_s, 6, 4, theme.GOLD)
    d.text(hi_s, 7, 15, C_SHADOW)
    d.text(hi_s, 6, 14, C_DIM)
    x = (SW - len(lv_s) * 8) // 2
    d.text(lv_s, x, 4, C_DIM)
    # Lives as little pink hearts, top right.
    rect = d.rect
    for i in range(g.LIVES):
        x = SW - 14 - i * 12
        c = theme.PRIMARY if i < w.lives else C_CITY_HI
        rect(x, 5, 3, 2, c, True)
        rect(x + 4, 5, 3, 2, c, True)
        rect(x - 1, 6, 9, 2, c, True)
        rect(x, 8, 7, 1, c, True)
        rect(x + 1, 9, 5, 1, c, True)
        rect(x + 2, 10, 3, 1, c, True)
    if w.ufo:
        full = 80
        bw = w.ufo * full // g.UFO_TICKS
        x = (SW - full) // 2
        rect(x, 15, full, 3, C_CITY_HI, True)
        rect(x, 15, bw, 3, theme.TEAL, True)
