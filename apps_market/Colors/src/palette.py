"""Palette maths for the Color app: a five-colour palette from one colour.

Pure functions on (r, g, b) tuples of 0..255, no oreoOS imports, so the
app runs on any FaleraOS release and the host tests load this file alone.

derive(rgb) builds a palette in the order of SLOTS:
  PRI   the picked colour
  BG    background: dark when the colour is very dark, cool white when it
        is very light, otherwise the badge's warm cream
  CARD  a card surface one step off the background
  SEC   secondary accent: hue + 160 degrees (near-complementary)
  ACC   highlight accent: hue + 50 degrees, kept bright

Text on any swatch uses contrast_text(), which picks dark or white by the
Rec. 601 luma Y = 0.299 R + 0.587 G + 0.114 B.
"""

SLOTS = ("PRI", "BG", "CARD", "SEC", "ACC")

# Luma at or above this reads better with dark text than white.
CONTRAST_LUMA = 170
DARK_TEXT = (24, 24, 32)
LIGHT_TEXT = (255, 255, 255)

# Below / above these lumas the palette switches to a dark / light base.
DARK_BELOW = 55
LIGHT_ABOVE = 215


def luma(rgb):
    """Rec. 601 perceived luminance, an int 0..255."""
    r, g, b = rgb
    return (299 * int(r) + 587 * int(g) + 114 * int(b)) // 1000


def contrast_text(rgb):
    """DARK_TEXT or LIGHT_TEXT, whichever reads better on `rgb`."""
    return DARK_TEXT if luma(rgb) >= CONTRAST_LUMA else LIGHT_TEXT


def rgb_to_hsv(r, g, b):
    """(h 0..360, s 0..1, v 0..1)."""
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    mx = max(rf, gf, bf)
    mn = min(rf, gf, bf)
    df = mx - mn
    if df == 0:
        h = 0.0
    elif mx == rf:
        h = (60 * ((gf - bf) / df) + 360) % 360
    elif mx == gf:
        h = 60 * ((bf - rf) / df) + 120
    else:
        h = 60 * ((rf - gf) / df) + 240
    s = 0.0 if mx == 0 else df / mx
    return h, s, mx


def hsv_to_rgb(h, s, v):
    """(r, g, b) 0..255 from h in degrees (any value), s and v 0..1."""
    h = (h % 360) / 60.0
    i = int(h)
    f = h - i
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    r, g, b = ((v, t, p), (q, v, p), (p, v, t),
               (p, q, v), (t, p, v), (v, p, q))[i % 6]
    return int(round(r * 255)), int(round(g * 255)), int(round(b * 255))


def _clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


def derive(rgb):
    """The SLOTS palette (a tuple of five (r, g, b)) for one colour."""
    r, g, b = (_clamp(int(c), 0, 255) for c in rgb)
    h, s, v = rgb_to_hsv(r, g, b)
    sec = hsv_to_rgb(h + 160, _clamp(s, 0.5, 0.9), _clamp(v, 0.6, 0.95))
    acc = hsv_to_rgb(h + 50, _clamp(s, 0.6, 0.85), _clamp(v, 0.8, 1.0))
    y = luma((r, g, b))
    if y < DARK_BELOW:
        bg, card = (18, 18, 26), (28, 28, 42)
    elif y > LIGHT_ABOVE:
        bg, card = (248, 250, 252), (235, 238, 244)
    else:
        bg, card = (255, 248, 235), (255, 240, 210)
    return ((r, g, b), bg, card, sec, acc)


# Curated palettes, in SLOTS order. "Falera" is the badge's own theme
# (oreoOS/theme.py: PRIMARY, BG, CARD, TEAL, GOLD); the others are the
# published colours of well-known open-source editor schemes.
PRESETS = (
    ("Falera", ((255, 93, 104), (255, 248, 235), (255, 240, 210),
                (0, 180, 165), (255, 190, 30))),
    ("Catppuccin Mocha", ((203, 166, 247), (30, 30, 46), (24, 24, 37),
                          (137, 220, 235), (249, 226, 175))),
    ("Catppuccin Latte", ((136, 57, 239), (239, 241, 245), (230, 233, 239),
                          (32, 159, 181), (223, 142, 29))),
    ("Tokyo Night", ((122, 162, 247), (26, 27, 38), (36, 40, 59),
                     (125, 207, 255), (224, 175, 104))),
    ("Gruvbox", ((254, 128, 25), (40, 40, 40), (50, 48, 47),
                 (142, 192, 124), (250, 189, 47))),
    ("Nord", ((136, 192, 208), (46, 52, 64), (59, 66, 82),
              (143, 188, 187), (235, 203, 139))),
    ("Rose Pine", ((235, 188, 186), (25, 23, 36), (31, 29, 46),
                   (156, 207, 216), (246, 193, 119))),
    ("Dracula", ((255, 121, 198), (40, 42, 54), (68, 71, 90),
                 (139, 233, 253), (241, 250, 140))),
    ("Kanagawa", ((126, 156, 216), (31, 31, 40), (42, 42, 55),
                  (122, 168, 159), (230, 195, 132))),
    ("Phosphor", ((0, 255, 102), (13, 17, 23), (22, 27, 34),
                  (57, 211, 83), (126, 231, 135))),
    ("Pocket LCD", ((48, 98, 48), (139, 172, 15), (155, 188, 15),
                    (15, 56, 15), (190, 210, 20))),
)
