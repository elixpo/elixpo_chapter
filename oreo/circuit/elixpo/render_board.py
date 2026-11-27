#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Re-render the board images and the website's 3D model from elixpo.kicad_pcb.

    python3 circuit/elixpo/render_board.py            # renders and GLB
    python3 circuit/elixpo/render_board.py --renders  # renders only
    python3 circuit/elixpo/render_board.py --glb      # GLB only

    --card HANDLE         the name card on the front:
                          circuit/card/name-card/cards/HANDLE.html
                          (default Circuit-Overtime)
    --no-card             the bare board, no card
    --lanyard-theme NAME  the lanyard's print, circuit/card/lanyard/lanyard-print-NAME.svg:
                          paper, butter, blush or bamboo (default: the card
                          owner's "theme" in circuit/card/name-card/people.json,
                          else paper)
    --no-lanyard          no lanyard
    --no-battery          no battery and holder on the back

Renders: renders/front.jpg, back.jpg and top-angle.jpg, with the board
stackup colours (black mask, white silkscreen, HASL). Needs kicad-cli 10
and Pillow.

GLB: falera.elixpo/public/models/falera-badge.glb, the model the badge page's
3D viewer shows. kicad-cli exports the board with its component models; the
materials are retuned for a web viewer (opaque near-black mask with a satin
sheen, silver HASL pads), and `@gltf-transform/cli optimize` (fetched by npx)
dedups, welds and Draco-compresses it. Needs Node.js for npx.

The display module is J3's second 3D model, 3d/MSP2807.step (made by
3d/make_msp2807_model.py from the module's drawing), so KiCad draws it in
both outputs.

The name card, the lanyard and the battery are not KiCad parts; this
script adds them.

- Name card: a 0.3 mm photo-paper face cut to the card's outline (the path
  in circuit/card/name-card/template/name-card-mask.svg: lanyard slots, IR
  notch), 88 x 59.5 mm, its top-left corner on the board's (board x 40,
  y 30), and its 15 mm fold-back tab (x 2-86, corners r 1). The face's top
  edge rests on the board; the tab, folded under it along the fold line,
  stands straight down to the board and props the lower end up, so the face
  tilts until 59.5 sin(t) + 0.3 cos(t) = 15 (t = 14.3 degrees). The script
  checks the tilted face against every exported model inside its outline.
  Its picture is the card printed by headless Chromium (`?card`, one
  88 x 74.5 mm page: the face, then the tab) and rasterised with pdftoppm.
- Lanyard: a 12 mm, 1 mm thick strap through each lanyard slot. Each end
  (the first and last 25 mm of the 950 mm artwork, red) goes into the slot
  from the front, round the bar between the slot and the board's top edge,
  and back up behind the board, where it lies against the strap and is
  sewn 12 mm from the end; the artwork's x = 25 mm is where the strap
  leaves the slot on the front. Above the badge both sides turn 11 degrees
  in towards the neck and are cut off 100 mm along the strap from the slot
  (artwork x = 125 mm, and 825 mm on the other side), so the badge stays
  the subject. The printed face is outward; the back is plain white.
- Battery: a 603450 LiPo pouch (6 x 34 x 50 mm, rounded corners and edges)
  on the back silkscreen's outline, its lead to J2, and the 3D-printed
  L-shaped holder (README "Assembly"): foot through H5-H6, wall as tall as
  the cell, an 11 mm lip over it. The script reports any back part under
  them.

In the GLB the card and the strap are textured meshes added after KiCad's export (textures
stay at 2048 px or less, so optimize keeps them as they are). kicad-cli
cannot texture a model, so for the renders they (and the battery, in plain
colours) are VRML models made of
cells 0.1 mm (card) and 0.125 mm (strap) across, each cell one colour from
the picture, attached to a temporary copy of the board. Needs a headless
Chromium (CHROME, or Playwright's headless shell, chromium, google-chrome)
and pdftoppm for the card and the lanyard.
"""
import argparse
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PCB = HERE / "elixpo.kicad_pcb"
RENDERS = HERE / "renders"
GLB_OUT = ROOT / "falera.elixpo" / "public" / "models" / "falera-badge.glb"
GLTF_TRANSFORM = "@gltf-transform/cli@4.2.1"
CARD_DIR = HERE.parent / "card" / "name-card"
CARDS = CARD_DIR / "cards"
PEOPLE = CARD_DIR / "people.json"
CARD_MASK = CARD_DIR / "template" / "name-card-mask.svg"
LANYARD = HERE.parent / "card" / "lanyard"
LANYARD_THEMES = ("paper", "butter", "blush", "bamboo")

RENDER = ["kicad-cli", "pcb", "render", "--use-board-stackup-colors",
          "--quality", "high", "--background", "opaque"]

# Name card (mm). Its top-left corner is the board's top-left corner.
CARD_X0, CARD_Y0 = 40.0, 30.0
CARD_W, CARD_H = 88.0, 59.5       # the face
TAB, TAB_INSET, TAB_R = 15.0, 2.0, 1.0   # fold-back tab below the face (make_name_card.py)
CARD_PRINT_H = CARD_H + TAB        # the `?card` print: face and tab
CARD_T = 0.30                      # photo paper
CARD_DPI = 600                     # the printed card, rasterised
CARD_TEX_W = 2048                  # texture width in the GLB (23.3 px/mm)
CARD_CELL = 0.1                    # VRML cell for the renders

# Lanyard (mm): circuit/card/lanyard/README.md and make_lanyard.py.
STRAP_L, STRAP_W, STRAP_T = 950.0, 12.0, 1.0
STRAP_END = 25.0                   # folded through the slot; x = 25 leaves the slot
STRAP_SHOWN = 100.0                # strap kept above the slot exit, each side
STRAP_TILT = 11.0                  # degrees from vertical, each side, towards the neck
STRAP_BEND_R = 40.0                # radius of that turn, in the strap's plane
STRAP_PX_MM = 16                   # texture: px per mm
STRAP_CELL = 0.125                 # VRML cell for the renders
SLOT_CX = (50.0, 118.0)            # lanyard slot centres, board x (Edge.Cuts: 43.2-56.8, 111.2-124.8)
SLOT_TOP = 33.85                   # slot's upper edge, board y (slot y 33.85-37.15)
BOARD_TOP = 30.0
BOARD_T = 1.6
FOLD_R = 0.6                       # strap centre-line radius round the slot's edges
CROSS = 3.5                        # height over which the end crosses from behind the board

# Battery on the back (board mm; README "Assembly", BOM_ORDER.csv BT1/BH1,
# generate_badge_pcb.py BATTERY/HOLDER_*). The cell is a 603450 LiPo pouch,
# 6 x 34 x 50 mm, on the back silkscreen's outline; the holder's foot is the
# solid outline below it (H5-H6), its lip reaches to the dashed line.
CELL = (60.0, 104.0, 110.0, 138.0)  # x0, y0, x1, y1
CELL_T = 6.0
CELL_R = 1.0                       # plan corners
CELL_EDGE_R = 1.5                  # the pouch's rounded edges
HOLDER_Y = (138.3, 142.3)          # the foot, 4 mm deep, 0.3 mm below the cell
HOLDER_LIP = 11.0                  # over the cell (10-12 mm)
HOLDER_T = 1.5                     # printed wall: not specified anywhere; assumed
LEAD_Y = (110.0, 112.0)            # J2 pins 1 (+, red) and 2
LEAD_D = 1.0                       # 26 AWG lead
PLUG = (57.4, 58.6, 108.0, 114.0, 1.6, 4.6)   # JST PHR-2 back out of J2: x0 x1 y0 y1, depth below the back


# ------------------------------------------------------------------ helpers

def chrome():
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    found = sorted(Path.home().glob(".cache/ms-playwright/chromium_headless_shell-*/"
                                    "chrome-headless-shell-*/chrome-headless-shell"))
    if found:
        return str(found[-1])
    for name in ("chromium", "chromium-browser", "google-chrome", "chrome"):
        if shutil.which(name):
            return shutil.which(name)
    sys.exit("no headless Chromium for the card and the lanyard: set CHROME, or use --no-card --no-lanyard")


def headless(*args):
    subprocess.run([chrome(), "--headless", "--no-sandbox", "--hide-scrollbars",
                    "--allow-file-access-from-files", *args], capture_output=True, check=True)


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def unit(a):
    m = math.sqrt(dot(a, a))
    return (a[0] / m, a[1] / m, a[2] / m)


def add(a, b, k=1.0):
    return (a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2])


# Geometry is built in board millimetres: x right, y down the board, z up
# from the board's front face. world() is KiCad's GLB frame: metres, y up.
def world(p, front_y):
    return (p[0] / 1000.0, (p[2] + front_y) / 1000.0, p[1] / 1000.0)


class Mesh:
    """Triangles in board mm with per-vertex UVs, for one material."""

    def __init__(self):
        self.pos, self.uv, self.nrm, self.idx = [], [], [], []

    def tri(self, a, b, c, n, uv=((0, 0), (0, 0), (0, 0))):
        """Add triangle a b c facing n (board frame); winding fixed to match."""
        # The board frame is mirrored relative to the GLB frame (y and z
        # swap), so a triangle that faces n here is wound the other way there.
        if dot(cross(sub(b, a), sub(c, a)), n) > 0:
            b, c, uv = c, b, (uv[0], uv[2], uv[1])
        base = len(self.pos)
        for p, t in zip((a, b, c), uv):
            self.pos.append(p)
            self.uv.append(t)
            self.nrm.append(n)
        self.idx += [base, base + 1, base + 2]

    def quad(self, a, b, c, d, n, uv=((0, 0),) * 4):
        self.tri(a, b, c, n, (uv[0], uv[1], uv[2]))
        self.tri(a, c, d, n, (uv[0], uv[2], uv[3]))


# ------------------------------------------------------------- name card

def svg_loops(path_d, step=0.1):
    """The closed loops of an SVG path (M, H, V, L, A, Z, absolute), as
    polylines with arcs split into chords of at most `step` mm."""
    toks = re.findall(r"[MHVLAZ]|-?\d*\.?\d+(?:e-?\d+)?", path_d)
    loops, cur, i, cmd = [], [], 0, None
    x = y = 0.0

    def num():
        nonlocal i
        i += 1
        return float(toks[i - 1])
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
        if cmd == "M":
            if cur:
                loops.append(cur)
            x, y = num(), num()
            cur = [(x, y)]
            cmd = "L"
        elif cmd == "L":
            x, y = num(), num()
            cur.append((x, y))
        elif cmd == "H":
            x = num()
            cur.append((x, y))
        elif cmd == "V":
            y = num()
            cur.append((x, y))
        elif cmd == "A":
            r, _ry, _rot, large, sweep, x2, y2 = (num() for _ in range(7))
            x1p, y1p = (x - x2) / 2, (y - y2) / 2
            lam = (x1p ** 2 + y1p ** 2) / r ** 2
            if lam > 1:
                r *= math.sqrt(lam)
            k = math.sqrt(max(0.0, (r ** 4 - r ** 2 * (x1p ** 2 + y1p ** 2)) / (r ** 2 * (x1p ** 2 + y1p ** 2))))
            if large == sweep:
                k = -k
            cxp, cyp = k * y1p, -k * x1p
            cx, cy = cxp + (x + x2) / 2, cyp + (y + y2) / 2
            t1 = math.atan2((y1p - cyp) / r, (x1p - cxp) / r)
            dt = math.atan2((-y1p - cyp) / r, (-x1p - cxp) / r) - t1
            if sweep == 0 and dt > 0:
                dt -= 2 * math.pi
            elif sweep == 1 and dt < 0:
                dt += 2 * math.pi
            n = max(2, math.ceil(abs(dt) * r / step))
            for k_ in range(1, n + 1):
                t = t1 + dt * k_ / n
                cur.append((cx + r * math.cos(t), cy + r * math.sin(t)))
            x, y = x2, y2
        elif cmd == "Z":
            if cur:
                loops.append(cur)
            cur = []
            cmd = None
    if cur:
        loops.append(cur)
    out = []
    for lp in loops:
        if math.dist(lp[0], lp[-1]) < 1e-9:
            lp = lp[:-1]
        out.append(lp)
    return out


class Shape:
    """A filled outline with holes (even-odd), in card mm (y down)."""

    def __init__(self, loops):
        self.loops = loops
        self.edges = [(a, b) for lp in loops for a, b in zip(lp, lp[1:] + lp[:1]) if a[1] != b[1]]

    def crossings(self, y):
        xs = []
        for (x0, y0), (x1, y1) in self.edges:
            if (y0 <= y < y1) or (y1 <= y < y0):
                xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
        return sorted(xs)

    def inside(self, x, y):
        return sum(1 for c in self.crossings(y) if c < x) % 2 == 1

    def trapezoids(self):
        """Exact trapezoid decomposition: (ya, yb, xla, xlb, xra, xrb)."""
        ys = sorted({p[1] for lp in self.loops for p in lp})
        out = []
        for ya, yb in zip(ys, ys[1:]):
            ym = (ya + yb) / 2
            hits = []
            for (x0, y0), (x1, y1) in self.edges:
                if min(y0, y1) < ym < max(y0, y1):
                    f = lambda yy: x0 + (yy - y0) * (x1 - x0) / (y1 - y0)
                    hits.append((f(ym), f(ya), f(yb)))
            hits.sort()
            for l, r in zip(hits[0::2], hits[1::2]):
                out.append((ya, yb, l[1], l[2], r[1], r[2]))
        return out


def card_shape():
    d = re.search(r'\sd="([^"]+)"', CARD_MASK.read_text()).group(1)
    return Shape(svg_loops(d))


def owner_theme(handle):
    """The lanyard theme people.json gives the card's owner, else paper."""
    try:
        for p in json.loads(PEOPLE.read_text()):
            if p.get("handle") == handle and p.get("theme") in LANYARD_THEMES:
                return p["theme"]
    except (OSError, ValueError):
        pass
    return "paper"


def card_picture(handle, tmp):
    """The printed card at CARD_DPI, exactly 88 x 74.5 mm: the face
    (top 59.5 mm) and the fold-back tab (bottom 15 mm)."""
    from PIL import Image
    page = CARDS / f"{handle}.html"
    if not page.exists():
        sys.exit(f"no card {page}: run circuit/card/name-card/make_cards.py, or pass --no-card")
    pdf = tmp / "card.pdf"
    headless("--no-pdf-header-footer", f"--print-to-pdf={pdf}", page.as_uri() + "?card")
    subprocess.run(["pdftoppm", "-r", str(CARD_DPI), "-png", "-singlefile", str(pdf), str(tmp / "card")], check=True)
    im = Image.open(tmp / "card.png").convert("RGB")
    # Chromium rounds the page to whole CSS pixels (87.88 mm wide); the
    # card is laid out from the top-left corner at 1:1, so pad or crop there.
    w, h = round(CARD_W / 25.4 * CARD_DPI), round(CARD_PRINT_H / 25.4 * CARD_DPI)
    out = Image.new("RGB", (w, h), (255, 255, 255))
    out.paste(im.crop((0, 0, min(w, im.width), min(h, im.height))), (0, 0))
    return out


def board_front(j):
    """The GLB height (mm) of the board's front face, and the part nodes."""
    nodes = j["nodes"]
    roots = [c for r in j["scenes"][j.get("scene", 0)]["nodes"] for c in nodes[r].get("children", [])]
    parts = [i for i in roots if not nodes[i].get("name", "=>").startswith("=>")]
    # KiCad puts each front part's node on the board's front face (a part
    # with a raised model, like J3, sits higher): take the commonest height.
    hs = [round(nodes[i].get("translation", [0, 0, 0])[1] * 1000.0, 4) for i in parts]
    return max((h for h in hs if h > 0), key=hs.count), parts


def card_obstacles(raw_glb):
    """Model geometry above the board's front around the card:
    [(board x, board y, height above the front, part)], and the front's
    GLB height."""
    j, binb = read_glb(raw_glb)
    front, parts = board_front(j)
    nodes = j["nodes"]
    near = [i for i in parts
            if CARD_X0 - 15 < nodes[i].get("translation", [0, 0, 0])[0] * 1000.0 < CARD_X0 + CARD_W + 15
            and CARD_Y0 - 15 < nodes[i].get("translation", [0, 0, 0])[2] * 1000.0 < CARD_Y0 + CARD_H + 15]
    obst = []
    for i in near:
        for m, pts in node_points(j, binb, i):
            for x, h, y in pts:
                if h - front > 0.05 and CARD_X0 <= x <= CARD_X0 + CARD_W and y <= CARD_Y0 + CARD_H + 1:
                    obst.append((x, y, h - front, nodes[i].get("name")))
    return obst, front


class Card:
    """The card as it sits: the face is a flat sheet whose top edge rests on
    the board at its top edge (the lanyard holds it there) and whose lower
    end is propped up by the tab, folded back under it along the fold line
    and standing straight down to the board. The tab's 15 mm of paper,
    measured on its printed side from the face's top surface, sets the
    lift: 59.5 sin(t) + 0.3 cos(t) = 15, so the face tilts by t."""

    def __init__(self, shape, obstacles):
        self.shape = shape
        f = lambda t: CARD_H * math.sin(t) + CARD_T * math.cos(t) - TAB
        lo, hi = 0.0, math.pi / 2
        for _ in range(60):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if f(mid) < 0 else (lo, mid)
        self.t = lo
        self.c, self.s = math.cos(lo), math.sin(lo)
        self.z0 = 0.0                                   # the top edge's underside, on the board
        # Every model point under the face (projected square to it, so the
        # cut-outs are tested where they really are), against its underside.
        self.clear, self.on = 9.9, None
        for x, y, h, who in obstacles:
            cy = (y - CARD_Y0) * self.c + (h - self.z0) * self.s
            if 0 <= cy <= CARD_H and shape.inside(x - CARD_X0, cy):
                gap = (h - self.z0) * self.c - (y - CARD_Y0) * self.s
                if -gap < self.clear:
                    self.clear, self.on = -gap, who
        if self.clear < 0:
            sys.exit(f"the tilted card would cut {self.on} by {-self.clear:.2f} mm")
        self.y_end = CARD_Y0 + CARD_H * self.c          # the face's lower end (underside), board y
        self.lift = self.P(0, CARD_H, CARD_T)[2]        # its top surface, above the board

    def P(self, cx, cy, w=0.0):
        """Card point (cx, cy) on its face, w above the underside, in board mm."""
        return (CARD_X0 + cx, CARD_Y0 + cy * self.c - w * self.s, self.z0 + cy * self.s + w * self.c)

    def N(self, nx=0.0, ny=0.0, nw=1.0):
        return (nx, ny * self.c - nw * self.s, ny * self.s + nw * self.c)

    def under_z(self, y):
        return self.z0 + (y - CARD_Y0) * self.s / self.c

    def top_z(self, y):
        """Height of the face's top surface over board y."""
        return self.under_z(y) + CARD_T / self.c

    def T(self, cx, d, w=0.0):
        """Tab point: cx across, d down the tab from the fold, w in from its
        printed (outer) face, which faces down the board towards the screen."""
        y_out = CARD_Y0 + CARD_H * self.c + 0.005     # the face's cut end, a hair out
        return (CARD_X0 + cx, y_out - w, TAB - d)


def tab_shape():
    i, r, w, d = TAB_INSET, TAB_R, CARD_W, TAB
    return Shape(svg_loops(f"M{i},0 H{w - i} V{d - r} A{r},{r} 0 0 1 {w - i - r},{d} "
                           f"H{i + r} A{r},{r} 0 0 1 {i},{d - r} Z"))


def card_meshes(card):
    top, under = Mesh(), Mesh()
    shape, tab = card.shape, tab_shape()
    up, down = card.N(), card.N(nw=-1.0)

    def UV(x, y):
        return (x / CARD_W, y / CARD_PRINT_H)
    for ya, yb, xla, xlb, xra, xrb in shape.trapezoids():
        a, b, c, d = (xla, ya), (xra, ya), (xrb, yb), (xlb, yb)
        top.quad(*(card.P(*q, CARD_T) for q in (a, b, c, d)), up, tuple(UV(*q) for q in (a, b, c, d)))
        under.quad(*(card.P(*q) for q in (a, b, c, d)), down)
    for lp in shape.loops:
        for (xa, ya), (xb, yb) in zip(lp, lp[1:] + lp[:1]):
            L = math.hypot(xb - xa, yb - ya)
            n = ((yb - ya) / L, -(xb - xa) / L)
            if shape.inside((xa + xb) / 2 + n[0] * 0.01, (ya + yb) / 2 + n[1] * 0.01):
                n = (-n[0], -n[1])
            under.quad(card.P(xa, ya), card.P(xb, yb), card.P(xb, yb, CARD_T), card.P(xa, ya, CARD_T),
                       card.N(n[0], n[1], 0.0))
    out_n, in_n = (0, 1, 0), (0, -1, 0)
    for da, db, xla, xlb, xra, xrb in tab.trapezoids():
        a, b, c, d = (xla, da), (xra, da), (xrb, db), (xlb, db)
        top.quad(*(card.T(*q) for q in (a, b, c, d)), out_n,
                 tuple(UV(q[0], CARD_H + q[1]) for q in (a, b, c, d)))
        under.quad(*(card.T(*q, CARD_T) for q in (a, b, c, d)), in_n)
    for lp in tab.loops:
        for (xa, da), (xb, db) in zip(lp, lp[1:] + lp[:1]):
            L = math.hypot(xb - xa, db - da)
            n = ((db - da) / L, -(xb - xa) / L)
            if tab.inside((xa + xb) / 2 + n[0] * 0.01, (da + db) / 2 + n[1] * 0.01):
                n = (-n[0], -n[1])
            under.quad(card.T(xa, da), card.T(xb, db), card.T(xb, db, CARD_T), card.T(xa, da, CARD_T),
                       (n[0], 0.0, -n[1]))
    return top, under


def grid_cells(shape, w, h, px, x_off, y_off, point, normal):
    """Coloured cells, CARD_CELL across, of a picture over `shape` (w x h mm),
    merged along rows; px is the picture resized to one pixel per cell and
    (x_off, y_off) the cell offset of the shape's origin in it."""
    cells = []
    for j in range(round(h / CARD_CELL)):
        xs = shape.crossings((j + 0.5) * CARD_CELL)
        for xa, xb in zip(xs[0::2], xs[1::2]):
            i0, i1 = math.ceil(xa / CARD_CELL - 0.5), math.floor(xb / CARD_CELL - 0.5)
            if i0 > i1:
                continue
            y0, y1 = j * CARD_CELL, (j + 1) * CARD_CELL
            run, col = i0, px[i0 + x_off, j + y_off]
            for i in range(i0 + 1, i1 + 2):
                c = px[i + x_off, j + y_off] if i <= i1 else None
                if c is None or max(abs(c[k] - col[k]) for k in range(3)) > 4:
                    x0 = xa if run == i0 else run * CARD_CELL
                    x1 = xb if i > i1 else i * CARD_CELL
                    cells.append(([point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)], col, normal))
                    run, col = i, c
    return cells


def card_vrml_cells(card, picture):
    """Coloured cells of the card's face and of the tab's printed side."""
    from PIL import Image
    nx, ny = round(CARD_W / CARD_CELL), round(CARD_PRINT_H / CARD_CELL)
    px = picture.resize((nx, ny), Image.LANCZOS).load()
    cells = grid_cells(card.shape, CARD_W, CARD_H, px, 0, 0, lambda x, y: card.P(x, y, CARD_T), card.N())
    cells += grid_cells(tab_shape(), CARD_W, TAB, px, 0, round(CARD_H / CARD_CELL),
                        lambda x, d: card.T(x, d), (0, 1, 0))
    return cells


# ----------------------------------------------------------------- lanyard

def lanyard_picture(theme, tmp):
    """An atlas of the strap's two ends at STRAP_PX_MM: the top half is the
    artwork's x 0..125 mm (the left strap), the bottom half x 825..950 mm."""
    from PIL import Image
    svg = LANYARD / f"lanyard-print-{theme}.svg"
    if not svg.exists():
        sys.exit(f"no lanyard artwork {svg}")
    art = svg.read_text()
    inner = art[art.index(">") + 1:art.rindex("</svg>")]
    span = STRAP_END + STRAP_SHOWN
    w, h = round(span * STRAP_PX_MM), round(STRAP_W * STRAP_PX_MM)
    rows = "".join(f'<svg viewBox="{x0} 0 {span} {STRAP_W}" width="{w}" height="{h}" '
                   f'preserveAspectRatio="none">{inner}</svg>'
                   for x0 in (0.0, STRAP_L - span))
    page = tmp / "strap.html"
    page.write_text(f'<!doctype html><style>body{{margin:0}} svg{{display:block}}</style>{rows}')
    png = tmp / "strap.png"
    headless(f"--window-size={w},{2 * h}", f"--screenshot={png}", page.as_uri())
    return Image.open(png).convert("RGB").crop((0, 0, w, 2 * h))


def strap_path(side, zf, ds):
    """Samples (s, point, tangent, width direction) along one strap, s from
    its sewn end. side 0 is the left slot, 1 the right. zf = (at the slot,
    at the board's top edge): the height of the strap's centre where it lies
    on the card (which slopes up towards the screen)."""
    zf, zf_top = zf
    cx = SLOT_CX[side]
    inward = 1.0 if side == 0 else -1.0
    zb = -BOARD_T - STRAP_T / 2                 # behind the board
    zm = zf_top - STRAP_T                       # the end, behind the strap above the badge
    ys = SLOT_TOP + 0.25 + STRAP_T / 2          # through the slot, clear of its upper edge
    yc = ys - FOLD_R                            # where the strap turns into the slot
    # The fold, as a (y, z) polyline from the slot exit back towards the end.
    prof = []

    def arc(c, r, a0, a1, n=24):
        for k in range(n + 1):
            a = a0 + (a1 - a0) * k / n
            prof.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a)))
    # slot exit on the front, round into the slot, down through it, round
    # behind the board, up the back to the top edge, across to the strap.
    arc((yc, zf - FOLD_R), FOLD_R, math.pi / 2, 0)
    arc((yc, zb + FOLD_R), FOLD_R, 0, -math.pi / 2)
    prof.append((BOARD_TOP, zb))
    for k in range(1, 41):
        t = k / 40
        prof.append((BOARD_TOP - CROSS * t, zb + (zm - zb) * (1 - math.cos(math.pi * t)) / 2))
    length = sum(math.dist(a, b) for a, b in zip(prof, prof[1:]))
    flat = STRAP_END - length                   # the end, lying flat behind the strap
    y_end = BOARD_TOP - CROSS - flat
    prof.append((y_end, zm))
    prof.reverse()                              # from the sewn end to the slot exit
    pts = [(cx, y, z) for y, z in prof]
    # Up from the slot exit on the front, then the turn towards the neck.
    y_bend = y_end - 1.0
    pts.append((cx, BOARD_TOP, zf_top))
    pts.append((cx, y_bend, zf_top))
    th = math.radians(STRAP_TILT)
    for k in range(1, 25):
        a = th * k / 24
        pts.append((cx + inward * STRAP_BEND_R * (1 - math.cos(a)), y_bend - STRAP_BEND_R * math.sin(a), zf_top))
    # Resample the polyline every ds mm (keeping its corners) up to s_max.
    s_max = STRAP_END + STRAP_SHOWN
    out, s = [], 0.0
    seg = []
    for a, b in zip(pts, pts[1:]):
        seg.append((a, b, math.dist(a, b)))
    end = pts[-1]
    lastdir = unit(sub(pts[-1], pts[-2]))
    total = sum(L for *_, L in seg)
    if total < s_max:
        seg.append((end, add(end, lastdir, s_max - total), s_max - total))
    samples = []
    acc = 0.0
    for a, b, L in seg:
        n = max(1, math.ceil(L / ds))
        for k in range(n):
            samples.append((acc + L * k / n, add(a, sub(b, a), k / n)))
        acc += L
    samples.append((acc, seg[-1][1]))
    samples = [(s, p) for s, p in samples if s <= s_max + 1e-9]
    for k, (s, p) in enumerate(samples):
        q0 = samples[max(0, k - 1)][1]
        q1 = samples[min(len(samples) - 1, k + 1)][1]
        t = unit(sub(q1, q0))
        if abs(t[2]) < 1e-6 and p[1] < y_bend + 1e-6:
            w = (-t[1] * inward, t[0] * inward, 0.0)      # in the board's plane, outer edge to inner
        else:
            w = (inward, 0.0, 0.0)
        out.append((s, p, t, unit(w)))
    return out


def strap_frames(side, zf, ds):
    """Per sample: s, the artwork's x, the four corners (printed face y=0,
    y=12; back face y=0, y=12) and the printed face's normal."""
    path = strap_path(side, zf, ds)
    # Printed face outward: away from the board where the strap lies on the card.
    s0, p0, t0, w0 = next(f for f in path if f[0] > STRAP_END + 1)
    sgn = 1.0 if cross(t0, w0)[2] > 0 else -1.0
    out = []
    for s, p, t, w in path:
        n = unit(cross(t, w))
        n = (n[0] * sgn, n[1] * sgn, n[2] * sgn)
        e0, e1 = add(p, w, -STRAP_W / 2), add(p, w, STRAP_W / 2)
        h = STRAP_T / 2
        art_x = s if side == 0 else STRAP_L - s
        out.append((s, art_x, (add(e0, n, h), add(e1, n, h), add(e0, n, -h), add(e1, n, -h)), n, w))
    return out


def strap_uv(side, art_x, t):
    span = STRAP_END + STRAP_SHOWN
    x0 = 0.0 if side == 0 else STRAP_L - span
    return ((art_x - x0) / span, (t / STRAP_W) * 0.5 + 0.5 * side)


def lanyard_meshes(zf):
    face, plain = Mesh(), Mesh()
    for side in (0, 1):
        fr = strap_frames(side, zf, 0.25)
        for a, b in zip(fr, fr[1:]):
            (fa0, fa1, ba0, ba1), (fb0, fb1, bb0, bb1) = a[2], b[2]
            n = unit(add(a[3], b[3]))
            face.quad(fa0, fa1, fb1, fb0, n, (strap_uv(side, a[1], 0), strap_uv(side, a[1], STRAP_W),
                                             strap_uv(side, b[1], STRAP_W), strap_uv(side, b[1], 0)))
            plain.quad(ba0, ba1, bb1, bb0, (-n[0], -n[1], -n[2]))
            w = unit(add(a[4], b[4]))
            plain.quad(fa1, ba1, bb1, fb1, w)
            plain.quad(fa0, ba0, bb0, fb0, (-w[0], -w[1], -w[2]))
        for f, g in ((fr[0], fr[1]), (fr[-1], fr[-2])):
            # the cut ends, facing away from the strap
            c0, c1, c2, c3 = f[2]
            t = unit(sub(f[2][0], g[2][0]))
            plain.quad(c0, c1, c3, c2, t)
    return face, plain


def lanyard_vrml_cells(picture, zf):
    px = picture.load()
    cells = []
    nt = round(STRAP_W / STRAP_CELL)
    for side in (0, 1):
        fr = strap_frames(side, zf, STRAP_CELL)
        for a, b in zip(fr, fr[1:]):
            um = (strap_uv(side, a[1], 0)[0] + strap_uv(side, b[1], 0)[0]) / 2
            (fa0, fa1, *_), (fb0, fb1, *_) = a[2], b[2]
            run, col = 0, None
            for k in range(nt + 1):
                if k < nt:
                    v = strap_uv(side, 0, (k + 0.5) * STRAP_CELL)[1]
                    c = px[min(picture.width - 1, int(um * picture.width)),
                           min(picture.height - 1, int(v * picture.height))]
                else:
                    c = None
                if col is None:
                    col = c
                    continue
                if c is None or max(abs(c[i] - col[i]) for i in range(3)) > 4:
                    t0, t1 = run / nt, k / nt
                    cells.append(([add(fa0, sub(fa1, fa0), t0), add(fa0, sub(fa1, fa0), t1),
                                   add(fb0, sub(fb1, fb0), t1), add(fb0, sub(fb1, fb0), t0)], col, a[3]))
                    run, col = k, c
    return cells


# ---------------------------------------------------------------- battery

def battery_obstacles(raw_glb):
    """Back-side model geometry inside the cell's and the holder's outline:
    {part: depth below the back face}. Should be empty."""
    j, binb = read_glb(raw_glb)
    front, parts = board_front(j)
    back = front - BOARD_T
    nodes = j["nodes"]
    x0, y0, x1, y1 = CELL
    hit = {}
    for i in parts:
        tx, _, ty = (v * 1000.0 for v in nodes[i].get("translation", [0, 0, 0]))
        if not (x0 - 20 < tx < x1 + 20 and y0 - 20 < ty < HOLDER_Y[1] + 20):
            continue
        for m, pts in node_points(j, binb, i):
            for x, h, y in pts:
                if h < back - 0.05 and x0 < x < x1 and y0 < y < HOLDER_Y[1]:
                    who = nodes[i].get("name")
                    hit[who] = max(hit.get(who, 0.0), back - h)
    return hit


def rounded_rect(x0, y0, x1, y1, r, n=6):
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def battery_meshes():
    """The pouch cell, the L-shaped holder and the lead to J2, on the back
    (z below -1.6), as {material name: Mesh}."""
    pouch, holder, red, black, plug = Mesh(), Mesh(), Mesh(), Mesh(), Mesh()
    x0, y0, x1, y1 = CELL
    zb = -BOARD_T
    # The pouch: its plan rounded r CELL_R, its edges rounded r CELL_EDGE_R.
    rings = []
    steps = 8
    ss = [CELL_EDGE_R * (1 - math.cos(math.pi / 2 * k / steps)) for k in range(steps + 1)]
    for s in ss + [CELL_T - v for v in reversed(ss)]:
        e = min(s, CELL_T - s)
        inset = CELL_EDGE_R - math.sqrt(max(0.0, CELL_EDGE_R ** 2 - (CELL_EDGE_R - e) ** 2)) if e < CELL_EDGE_R else 0.0
        rings.append([(x, y, zb - s) for x, y in rounded_rect(x0 + inset, y0 + inset, x1 - inset, y1 - inset,
                                                              max(0.3, CELL_R - inset / 2))])
    cxm, cym = (x0 + x1) / 2, (y0 + y1) / 2
    for ra, rb in zip(rings, rings[1:]):
        for k in range(len(ra)):
            a, b, c, d = ra[k], ra[(k + 1) % len(ra)], rb[(k + 1) % len(rb)], rb[k]
            n = unit(cross(sub(b, a), sub(d, a)))
            mid = ((a[0] + c[0]) / 2 - cxm, (a[1] + c[1]) / 2 - cym, 0.0)
            if dot(n, mid) < 0 and abs(n[2]) < 0.99:
                n = (-n[0], -n[1], -n[2])
            pouch.quad(a, b, c, d, n)
    for ring, nz in ((rings[0], 1.0), (rings[-1], -1.0)):
        c = (cxm, cym, ring[0][2])
        for k in range(len(ring)):
            pouch.tri(c, ring[k], ring[(k + 1) % len(ring)], (0, 0, nz))
    # The holder: an L section (foot on the board, wall along the cell's
    # lower edge, lip over the cell) run along the cell's 50 mm edge.
    hy0, hy1 = HOLDER_Y
    t = HOLDER_T
    lip = y1 - HOLDER_LIP
    sec = Shape([[(lip, CELL_T), (hy0, CELL_T), (hy0, 0.0), (hy1, 0.0), (hy1, t),
                  (hy0 + t, t), (hy0 + t, CELL_T + t), (lip, CELL_T + t)]])

    def H(x, y, d):
        return (x, y, zb - d)
    for da, db, yla, ylb, yra, yrb in sec.trapezoids():
        for x, nx in ((x0, -1.0), (x1, 1.0)):
            holder.quad(H(x, yla, da), H(x, yra, da), H(x, yrb, db), H(x, ylb, db), (nx, 0, 0))
    lp = sec.loops[0]
    for (ya, da), (yb, db) in zip(lp, lp[1:] + lp[:1]):
        L = math.hypot(yb - ya, db - da)
        n = ((db - da) / L, -(yb - ya) / L)
        if sec.inside((ya + yb) / 2 + n[0] * 0.01, (da + db) / 2 + n[1] * 0.01):
            n = (-n[0], -n[1])
        holder.quad(H(x0, ya, da), H(x1, ya, da), H(x1, yb, db), H(x0, yb, db), (0, n[0], -n[1]))

    # The lead: the plug's back standing out of J2, and two wires to the cell.
    px0, px1, py0, py1, pz0, pz1 = PLUG
    box(plug, (px0, py0, zb - pz0), (px1, py1, zb - pz1))
    for mesh, y in ((red, LEAD_Y[0]), (black, LEAD_Y[1])):
        rod(mesh, (px1, y, zb - (pz0 + pz1) / 2), (x0 + 0.3, y, zb - CELL_T / 2), LEAD_D / 2)
    return {"pouch": pouch, "holder": holder, "red": red, "black": black, "plug": plug}


def box(mesh, a, b):
    (xa, ya, za), (xb, yb, zb_) = a, b
    x0, x1, y0, y1, z0, z1 = min(xa, xb), max(xa, xb), min(ya, yb), max(ya, yb), min(za, zb_), max(za, zb_)
    P = lambda i, j, k: ((x0, x1)[i], (y0, y1)[j], (z0, z1)[k])
    mesh.quad(P(0, 0, 0), P(0, 1, 0), P(0, 1, 1), P(0, 0, 1), (-1, 0, 0))
    mesh.quad(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1), (1, 0, 0))
    mesh.quad(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1), (0, -1, 0))
    mesh.quad(P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1), (0, 1, 0))
    mesh.quad(P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0), (0, 0, -1))
    mesh.quad(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1), (0, 0, 1))


def rod(mesh, a, b, r, n=10):
    ax = unit(sub(b, a))
    u = unit(cross(ax, (0, 0, 1) if abs(ax[2]) < 0.9 else (1, 0, 0)))
    v = cross(ax, u)
    ring = lambda c: [add(add(c, u, r * math.cos(2 * math.pi * k / n)), v, r * math.sin(2 * math.pi * k / n))
                      for k in range(n)]
    ra, rb = ring(a), ring(b)
    for k in range(n):
        p, q = ra[k], ra[(k + 1) % n]
        nn = unit(sub(add(p, q), add(a, a)))
        mesh.quad(p, q, rb[(k + 1) % n], rb[k], nn)
    for c, rr, s in ((a, ra, -1), (b, rb, 1)):
        for k in range(n):
            mesh.tri(c, rr[k], rr[(k + 1) % n], (ax[0] * s, ax[1] * s, ax[2] * s))


# ------------------------------------------------------------------- VRML

def write_vrml(path, cells, plain_meshes, origin):
    """KiCad VRML: 1 unit = 0.1 in, y up; coordinates relative to `origin`
    (the board position of the footprint the model hangs on)."""
    def v(p):
        return f"{(p[0] - origin[0]) / 2.54:.5f} {-(p[1] - origin[1]) / 2.54:.5f} {p[2] / 2.54:.5f}"
    with open(path, "w") as f:
        f.write("#VRML V2.0 utf8\n")
        if cells:
            f.write("Shape { appearance Appearance { material Material { diffuseColor 1 1 1 "
                    "specularColor 0 0 0 shininess 0 } }\n geometry IndexedFaceSet { solid FALSE\n"
                    "  coord Coordinate { point [\n")
            for quad, _, n in cells:
                # KiCad's renderer culls back faces: wind each cell to face n
                # (the VRML frame mirrors the board frame, as the GLB's does).
                if dot(cross(sub(quad[1], quad[0]), sub(quad[2], quad[0])), n) > 0:
                    quad = quad[::-1]
                f.write(",".join(v(p) for p in quad) + ",\n")
            f.write("] }\n  color Color { color [\n")
            for _, c, _n in cells:
                s = f"{c[0] / 255:.3f} {c[1] / 255:.3f} {c[2] / 255:.3f}"
                f.write(",".join([s] * 4) + ",\n")
            f.write("] }\n  colorPerVertex TRUE\n  coordIndex [\n")
            for k in range(len(cells)):
                f.write(f"{4 * k} {4 * k + 1} {4 * k + 2} {4 * k + 3} -1,\n")
            f.write("] } }\n")
        for mesh, rgb in plain_meshes:
            f.write("Shape { appearance Appearance { material Material { diffuseColor "
                    f"{rgb[0]} {rgb[1]} {rgb[2]} specularColor 0 0 0 shininess 0 }} }}\n"
                    " geometry IndexedFaceSet { solid FALSE\n  coord Coordinate { point [\n")
            f.write(",\n".join(v(p) for p in mesh.pos))
            f.write("] }\n  coordIndex [\n")
            f.write(",\n".join(f"{mesh.idx[k]} {mesh.idx[k + 1]} {mesh.idx[k + 2]} -1"
                               for k in range(0, len(mesh.idx), 3)))
            f.write("] } }\n")


def board_with_extras(tmp, models):
    """A copy of the board for kicad-cli render, project paths made absolute
    and `models` (VRML files in board coordinates) hung on G1."""
    src = PCB.read_text().replace("${KIPRJMOD}", str(HERE))
    if models:
        k = src.index('(property "Reference" "G1"')
        s = src.rindex("(footprint", 0, k)
        depth = 0
        for e in range(s, len(src)):
            depth += {"(": 1, ")": -1}.get(src[e], 0)
            if depth == 0:
                break
        add_ = "".join(f'\t\t(model "{m}"\n\t\t\t(offset\n\t\t\t\t(xyz 0 0 0)\n\t\t\t)\n\t\t\t(scale\n'
                       f'\t\t\t\t(xyz 1 1 1)\n\t\t\t)\n\t\t\t(rotate\n\t\t\t\t(xyz 0 0 0)\n\t\t\t)\n\t\t)\n'
                       for m in models)
        src = src[:e] + add_ + "\t" + src[e:]
    out = tmp / "render.kicad_pcb"
    out.write_text(src)
    shutil.copy(PCB.with_suffix(".kicad_pro"), out.with_suffix(".kicad_pro"))
    return out


def g1_origin():
    src = PCB.read_text()
    k = src.index('(property "Reference" "G1"')
    s = src.rindex("(footprint", 0, k)
    m = re.search(r"\(at ([-\d.]+) ([-\d.]+)(?: ([-\d.]+))?\)", src[s:k])
    if m.group(3) not in (None, "0"):
        sys.exit("G1 is rotated; the extras assume it is not")
    return float(m.group(1)), float(m.group(2))


# ---------------------------------------------------------------- renders

def render_images(tmp, board):
    from PIL import Image

    def run(name, *args):
        out = tmp / f"{name}.png"
        subprocess.run(RENDER + list(args) + ["-o", str(out), str(board)],
                       check=True, stdout=subprocess.DEVNULL)
        return Image.open(out).convert("RGB")

    RENDERS.mkdir(exist_ok=True)
    for name, side in (("front", "top"), ("back", "bottom")):
        im = run(name, "-w", "1400", "-h", "2000", "--side", side)
        im = im.crop((36, 14, 1340, 1978))          # the board plus a thin margin
        im = im.resize((round(im.width * 0.62), round(im.height * 0.62)), Image.LANCZOS)
        im.save(RENDERS / f"{name}.jpg", quality=88, optimize=True, progressive=True)
    im = run("top-angle", "-w", "1800", "-h", "1800", "--perspective",
             "--rotate", "-40,0,30", "--zoom", "0.72")
    im.resize((1000, 1000), Image.LANCZOS).save(
        RENDERS / "top-angle.jpg", quality=88, optimize=True, progressive=True)
    print(f"renders -> {RENDERS}")


# -------------------------------------------------------------------- GLB

def read_glb(path):
    b = Path(path).read_bytes()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n
    bl = struct.unpack("<I", b[off:off + 4])[0]
    return j, bytearray(b[off + 8:off + 8 + bl])


def write_glb(path, j, binb):
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    binb = bytes(binb) + b"\0" * (-len(binb) % 4)
    j_len = 20 + len(js) + 8 + len(binb)
    Path(path).write_bytes(b"glTF" + struct.pack("<II", 2, j_len) + struct.pack("<I", len(js)) + b"JSON" + js
                           + struct.pack("<I", len(binb)) + b"BIN\0" + binb)


def _mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def _local(nd):
    if "matrix" in nd:
        m = nd["matrix"]
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    x, y, z, w = nd.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = nd.get("scale", [1, 1, 1])
    tx, ty, tz = nd.get("translation", [0, 0, 0])
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[r[0][0] * sx, r[0][1] * sy, r[0][2] * sz, tx], [r[1][0] * sx, r[1][1] * sy, r[1][2] * sz, ty],
            [r[2][0] * sx, r[2][1] * sy, r[2][2] * sz, tz], [0, 0, 0, 1]]


def node_points(j, binb, i, m=None):
    """(mesh, [(x, h, y) mm]) for node i and its children, in the GLB frame."""
    nd = j["nodes"][i]
    m = _mat_mul(m or [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], _local(nd))
    out = []
    if "mesh" in nd:
        for prim in j["meshes"][nd["mesh"]]["primitives"]:
            a = j["accessors"][prim["attributes"]["POSITION"]]
            bv = j["bufferViews"][a["bufferView"]]
            o = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
            st = bv.get("byteStride", 12)
            pts = []
            for k in range(a["count"]):
                x, y, z = struct.unpack_from("<3f", binb, o + k * st)
                pts.append(tuple(1000.0 * (m[r][0] * x + m[r][1] * y + m[r][2] * z + m[r][3]) for r in range(3)))
            out.append((nd["mesh"], pts))
    for c in nd.get("children", []):
        out += node_points(j, binb, c, m)
    return out


def tune_materials(src, dst):
    """Rewrite the PBR factors KiCad gives the board's own meshes."""
    j, binb = read_glb(src)
    looks = {
        "_soldermask": ([0.006, 0.006, 0.007, 1.0], 0.0, 0.38),
        "_pad":        ([0.80, 0.80, 0.82, 1.0], 1.0, 0.28),
        "_PCB":        ([0.42, 0.45, 0.29, 1.0], 0.0, 0.80),
    }
    for mesh in j["meshes"]:
        for suffix, (base, metal, rough) in looks.items():
            if mesh.get("name", "").endswith(suffix):
                for prim in mesh["primitives"]:
                    mat = j["materials"][prim["material"]]
                    mat.setdefault("pbrMetallicRoughness", {}).update(
                        baseColorFactor=base, metallicFactor=metal, roughnessFactor=rough)
                    mat.pop("alphaMode", None)
    write_glb(dst, j, binb)


class GlbAdder:
    """Appends textured meshes to a GLB read with read_glb."""

    def __init__(self, j, binb, front_y):
        self.j, self.bin, self.front = j, binb, front_y
        for k in ("bufferViews", "accessors", "meshes", "nodes", "materials", "images", "textures", "samplers"):
            j.setdefault(k, [])

    def _view(self, data, target=None):
        self.bin += b"\0" * (-len(self.bin) % 4)
        bv = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            bv["target"] = target
        self.bin += data
        self.j["bufferViews"].append(bv)
        self.j["buffers"][0]["byteLength"] = len(self.bin)
        return len(self.j["bufferViews"]) - 1

    def _acc(self, values, kind, ctype, target):
        fmt = {5126: "f", 5125: "I"}[ctype]
        n = {"VEC3": 3, "VEC2": 2, "SCALAR": 1}[kind]
        flat = [c for v in values for c in (v if n > 1 else (v,))]
        a = {"bufferView": self._view(struct.pack(f"<{len(flat)}{fmt}", *flat), target),
             "componentType": ctype, "count": len(values), "type": kind}
        if kind == "VEC3" and ctype == 5126:
            a["min"] = [min(v[i] for v in values) for i in range(3)]
            a["max"] = [max(v[i] for v in values) for i in range(3)]
        self.j["accessors"].append(a)
        return len(self.j["accessors"]) - 1

    def texture(self, image, name):
        import io
        buf = io.BytesIO()
        image.save(buf, "JPEG", quality=92, optimize=True)
        self.j["images"].append({"name": name, "mimeType": "image/jpeg", "bufferView": self._view(buf.getvalue())})
        if not self.j["samplers"]:
            self.j["samplers"].append({"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071})
        self.j["textures"].append({"source": len(self.j["images"]) - 1, "sampler": 0})
        return len(self.j["textures"]) - 1

    def material(self, name, rgb=(1, 1, 1), texture=None, rough=0.6):
        pbr = {"baseColorFactor": [*rgb, 1.0], "metallicFactor": 0.0, "roughnessFactor": rough}
        if texture is not None:
            pbr["baseColorTexture"] = {"index": texture}
        self.j["materials"].append({"name": name, "pbrMetallicRoughness": pbr})
        return len(self.j["materials"]) - 1

    def node(self, name, parts):
        """parts: [(Mesh, material index)]"""
        prims = []
        for mesh, mat in parts:
            if not mesh.idx:
                continue
            pos = [world(p, self.front) for p in mesh.pos]
            nrm = [(n[0], n[2], n[1]) for n in mesh.nrm]
            prim = {"attributes": {"POSITION": self._acc(pos, "VEC3", 5126, 34962),
                                   "NORMAL": self._acc(nrm, "VEC3", 5126, 34962)},
                    "indices": self._acc(mesh.idx, "SCALAR", 5125, 34963), "material": mat, "mode": 4}
            if any(t != (0, 0) for t in mesh.uv):
                prim["attributes"]["TEXCOORD_0"] = self._acc(mesh.uv, "VEC2", 5126, 34962)
            prims.append(prim)
        self.j["meshes"].append({"name": name, "primitives": prims})
        self.j["nodes"].append({"name": name, "mesh": len(self.j["meshes"]) - 1})
        scene = self.j["scenes"][self.j.get("scene", 0)]
        root = scene["nodes"][0]
        self.j["nodes"][root].setdefault("children", []).append(len(self.j["nodes"]) - 1)


def export_raw(tmp):
    raw = tmp / "raw.glb"
    res = subprocess.run(
        ["kicad-cli", "pcb", "export", "glb", "-f", "--subst-models",
         "--include-pads", "--include-silkscreen", "--include-soldermask",
         "-o", str(raw), str(PCB)],
        check=True, capture_output=True, text=True)
    missing = sorted({line for line in (res.stdout + res.stderr).splitlines()
                      if line.startswith("Could not add 3D model")})
    for line in missing:
        print("  " + line)
    return raw


BATTERY_LOOKS = {          # GLB material: base colour, metallic, roughness; VRML colour
    "pouch": ((0.74, 0.75, 0.77), 0.6, 0.35),       # aluminium-laminate pouch
    "holder": ((0.10, 0.10, 0.11), 0.0, 0.7),       # printed holder
    "red": ((0.70, 0.06, 0.05), 0.0, 0.5),
    "black": ((0.03, 0.03, 0.03), 0.0, 0.5),
    "plug": ((0.92, 0.90, 0.82), 0.0, 0.6),         # natural nylon
}


def export_glb(tmp, raw, extras):
    tuned = tmp / "tuned.glb"
    tune_materials(raw, tuned)
    if extras:
        j, binb = read_glb(tuned)
        g = GlbAdder(j, binb, extras["front"])
        if "card" in extras:
            top, under = extras["card"]
            tex = g.texture(extras["card_picture"].resize(
                (CARD_TEX_W, round(CARD_TEX_W * CARD_PRINT_H / CARD_W))), "name card")
            g.node(f"name card ({extras['card_handle']})",
                   [(top, g.material("name card print", texture=tex, rough=0.35)),
                    (under, g.material("photo paper", (0.92, 0.92, 0.90), rough=0.8))])
        if "lanyard" in extras:
            face, plain = extras["lanyard"]
            tex = g.texture(extras["lanyard_picture"], "lanyard")
            g.node(f"lanyard ({extras['lanyard_theme']})",
                   [(face, g.material("lanyard print", texture=tex, rough=0.85)),
                    (plain, g.material("lanyard back", (0.93, 0.93, 0.91), rough=0.9))])
        if "battery" in extras:
            parts = []
            for name, mesh in extras["battery"].items():
                rgb, metal, rough = BATTERY_LOOKS[name]
                m = g.material(f"battery {name}", rgb, rough=rough)
                g.j["materials"][m]["pbrMetallicRoughness"]["metallicFactor"] = metal
                parts.append((mesh, m))
            g.node("battery and holder", parts)
        write_glb(tuned, j, g.bin)
    GLB_OUT.parent.mkdir(parents=True, exist_ok=True)
    # Instancing is off: it confuses bounding boxes in some viewers.
    # Simplification is off, to keep the full detail of the KiCad models.
    subprocess.run(["npx", "-y", GLTF_TRANSFORM, "optimize", str(tuned), str(GLB_OUT),
                    "--compress", "draco", "--texture-compress", "false", "--texture-size", "2048",
                    "--instance", "false", "--simplify", "false"],
                   check=True, cwd=tmp)
    print(f"GLB {raw.stat().st_size / 1e6:.1f} MB -> {GLB_OUT} "
          f"{GLB_OUT.stat().st_size / 1e3:.0f} kB")


def build_extras(a, raw, tmp):
    extras = {}
    if not (a.card or a.lanyard or a.battery):
        return extras
    j, _ = read_glb(raw)
    extras["front"] = board_front(j)[0]
    if a.card or a.lanyard:
        shape = card_shape()
        obst, _ = card_obstacles(raw)
        if a.card:
            card = Card(shape, obst)
            print(f"name card {a.card}: tilted {math.degrees(card.t):.1f} deg on its {TAB:g} mm tab; "
                  f"lower edge {card.lift:.2f} mm above the board at y {card.y_end:.2f}; "
                  f"{card.clear:.2f} mm over {card.on}")
            extras.update(card=card_meshes(card), card_obj=card, card_handle=a.card,
                          card_picture=card_picture(a.card, tmp))
            ys = SLOT_TOP + 0.25 + STRAP_T / 2 - FOLD_R
            zf = (card.top_z(ys) + STRAP_T / 2, card.top_z(BOARD_TOP) + STRAP_T / 2)
        else:
            h = max((o[2] for o in obst if shape.inside(o[0] - CARD_X0, o[1] - CARD_Y0)), default=0.0)
            zf = (h + STRAP_T / 2, h + STRAP_T / 2)
        if a.lanyard:
            extras.update(lanyard=lanyard_meshes(zf), zf=zf, lanyard_theme=a.lanyard_theme,
                          lanyard_picture=lanyard_picture(a.lanyard_theme, tmp))
    if a.battery:
        hit = battery_obstacles(raw)
        for who, depth in sorted(hit.items()):
            print(f"  battery or holder overlaps {who} ({depth:.2f} mm deep)")
        extras["battery"] = battery_meshes()
    return extras


def render_extras(tmp, extras):
    models = []
    if not extras:
        return models
    origin = g1_origin()
    if "card" in extras:
        write_vrml(tmp / "card.wrl", card_vrml_cells(extras["card_obj"], extras["card_picture"]),
                   [(extras["card"][1], (0.92, 0.92, 0.90))], origin)
        models.append(tmp / "card.wrl")
    if "lanyard" in extras:
        write_vrml(tmp / "lanyard.wrl", lanyard_vrml_cells(extras["lanyard_picture"], extras["zf"]),
                   [(extras["lanyard"][1], (0.93, 0.93, 0.91))], origin)
        models.append(tmp / "lanyard.wrl")
    if "battery" in extras:
        write_vrml(tmp / "battery.wrl", [],
                   [(m, BATTERY_LOOKS[k][0]) for k, m in extras["battery"].items()], origin)
        models.append(tmp / "battery.wrl")
    return models


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--renders", action="store_true", help="only the JPEG renders")
    ap.add_argument("--glb", action="store_true", help="only the web GLB")
    ap.add_argument("--card", default="Circuit-Overtime", metavar="HANDLE",
                    help="name card on the front, circuit/card/name-card/cards/HANDLE.html (default %(default)s)")
    ap.add_argument("--no-card", dest="card", action="store_const", const=None, help="no name card")
    ap.add_argument("--lanyard", action=argparse.BooleanOptionalAction, default=True,
                    help="the lanyard through both slots (default on)")
    ap.add_argument("--lanyard-theme", choices=LANYARD_THEMES,
                    help="lanyard print, circuit/card/lanyard/lanyard-print-THEME.svg (default: the card "
                         "owner's theme in circuit/card/name-card/people.json, else paper)")
    ap.add_argument("--battery", action=argparse.BooleanOptionalAction, default=True,
                    help="the LiPo cell, its holder and lead on the back (default on)")
    a = ap.parse_args()
    if a.lanyard_theme is None:
        a.lanyard_theme = owner_theme(a.card)
    both = not (a.renders or a.glb)
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        raw = export_raw(tmp)
        extras = build_extras(a, raw, tmp)
        if both or a.renders:
            render_images(tmp, board_with_extras(tmp, render_extras(tmp, extras)))
        if both or a.glb:
            export_glb(tmp, raw, extras)
    return 0


if __name__ == "__main__":
    sys.exit(main())
