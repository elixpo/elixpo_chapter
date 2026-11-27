#!/usr/bin/python3
"""Generate the Oreo badge PCB (elixpo.kicad_pcb) from the schematic netlist.

Run with the Python that ships KiCad's pcbnew module (on Ubuntu,
/usr/bin/python3), after generate_badge_schematic.py:

    kicad-cli sch export netlist --format kicadsexpr -o build/elixpo.net elixpo.kicad_sch
    /usr/bin/python3 circuit/elixpo/generate_badge_pcb.py

It places every footprint, draws the outline, the lanyard slots and the
speaker grille, pours the ground and power
planes, and writes the net classes. Routing is done afterwards (see
README.md); this script never touches tracks, so a routed board is kept by
running it only when placement changes.

Board coordinates below are millimetres from the board's top-left corner,
looking at the front (the display side). Parts on the back are given in
the same front-view coordinates.
"""

import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, "/usr/lib/python3/dist-packages")
import pcbnew  # noqa: E402

HERE = Path(__file__).resolve().parent
FP_ROOT = Path("/usr/share/kicad/footprints")
NETLIST = HERE / "build" / "elixpo.net"
BOARD_FILE = HERE / "elixpo.kicad_pcb"
PROJECT_FILE = HERE / "elixpo.kicad_pro"

W, H, CORNER = 88.0, 133.5, 6.0           # board outline, mm
COPPER_LAYERS = 4                         # F signal / In1 GND / In2 signal / B signal
ORIGIN = (40.0, 30.0)                     # where the board sits on the page

# Front-face features.
# The 2.8" ILI9341 SPI module (MSP2807 type, 86 x 50 mm), landscape on the
# front with its 14-pin header on the right; top at 60 mm, under the name card.
PANEL = (1.0, 60.0, 86.0, 50.0)           # x, y, w, h
BATTERY = (20.0, 74.0, 50.0, 34.0)        # 603450 cell on the back, low for a low centre of gravity
# 3D-printed L-shaped holder along the battery's lower 50 mm edge: its foot
# is screwed to the board below the cell, its wall is as tall as the cell
# (6 mm) and its lip reaches HOLDER_LIP over the cell.
HOLDER_FOOT = 4.0                         # depth of the foot on the board, mm
HOLDER_LIP = 11.0                         # how far the lip reaches over the cell (10-12 mm)
SPEAKER = (70.5, 9.0, 15.0, 11.0)         # 1511 speaker on the back, under the right clip slot
SLOTS = ((10.0, 5.5), (78.0, 5.5))        # ID-card clip slot centres
SLOT_LEN, SLOT_W = 13.5, 3.2               # the standard badge-clip slot
ART = HERE / "art"
PANDA = (-10.0, 6.0, 54.0)                # front, under the name card: x, y, height (runs off the left edge)
HEART = (79.0, 35.5, 11.0)                # front, far right, where the panda is looking: centre x, y, width
# Back: "Elixpo" alone in the middle; the OSHW mark and the badge's details
# in the free column beside the ESP32-S3 module, under the clip slot.
BACK_ROW_Y = 47.5                          # centre line of "Elixpo"
BACK_COLUMN = (15.0, 9.0)                  # front-view centre x and top of the column
REPO_URL = "github.com/elixpo/falera"            # under "Elixpo"
JLC_MARK = None                                 # no JLCPCB order number ("Remove Mark")
OSHW_H = 12.0                              # height of the OSHWA certification mark


def mm(v):
    return pcbnew.FromMM(v)


def pt(x, y):
    return pcbnew.VECTOR2I(mm(ORIGIN[0] + x), mm(ORIGIN[1] + y))


def module_xy(u, v):
    """Board position of a point on the display module, given in the module
    drawing's front view (portrait, header at the bottom): u across its
    50 mm width from the left edge, v down its 86 mm length. Landscape on
    the badge, the drawing's bottom (the header) is on the right."""
    px, py, pw, ph = PANEL
    return px + v, py + (ph - u)


# The MSP2807 drawing: header pin 1 is 8.49 mm from the left edge and the
# row is 2.00 mm in from the bottom edge; the M3 holes are 3.00 mm in from
# the long edges, 44.00 mm apart across and 78.08 mm apart along.
HEADER_PIN1 = module_xy(8.49, 86.0 - 2.0)
MODULE_HOLES = tuple(module_xy(u, v) for v in (3.0, 3.0 + 78.08) for u in (3.0, 47.0))
# The module's 3D model (3d/make_msp2807_model.py) hangs on J3, the header
# socket: its origin is header pin 1, and its back face stands on the 11 mm
# standoffs.
MODULE_MODEL = "${KIPRJMOD}/3d/MSP2807.step"
MODULE_STANDOFF = 11.0
# The buttons are SHOU HAN TS665CJ, 5.0 mm tall to the top of the plunger;
# KiCad's SW_PUSH_6mm model is 4.3 mm, so it is stretched to match.
BUTTON_MODEL_Z = 5.0 / 4.3


# ---------------------------------------------------------------- netlist

def parse_sexpr(text):
    tokens = re.findall(r'\(|\)|"(?:[^"\\]|\\.)*"|[^\s()]+', text)
    stack = [[]]
    for tok in tokens:
        if tok == "(":
            stack.append([])
        elif tok == ")":
            item = stack.pop()
            stack[-1].append(item)
        else:
            stack[-1].append(tok[1:-1] if tok.startswith('"') else tok)
    return stack[0][0]


def children(node, key):
    return [c for c in node if isinstance(c, list) and c and c[0] == key]


def value(node, key):
    found = children(node, key)
    return found[0][1] if found else None


def read_netlist():
    tree = parse_sexpr(NETLIST.read_text())
    comps = {}
    for comp in children(children(tree, "components")[0], "comp"):
        ref = value(comp, "ref")
        sheet = children(comp, "sheetpath")[0]
        comps[ref] = dict(value=value(comp, "value"), footprint=value(comp, "footprint"),
                          description=value(comp, "description") or "",
                          path=value(sheet, "tstamps") + value(comp, "tstamps"))
    pads = {}
    for net in children(children(tree, "nets")[0], "net"):
        name = value(net, "name")
        for node in children(net, "node"):
            pads[(value(node, "ref"), value(node, "pin"))] = name
    return comps, pads


# --------------------------------------------------------------- placement
# ref: (x, y, rotation in degrees, side). Rotation is as seen from the front.

F, B = "F", "B"
DPAD = (75.0, 121.5)                       # centre of the D-pad, bottom-right
DPAD_STEP = 7.6                            # 6 mm THT switches: the closest their courtyards allow
PLACE = {
    # ---- Front: HOME A B C side by side from the left, D-pad bottom-right ----
    "SW11": (DPAD[0], DPAD[1] - DPAD_STEP, 0, F),    # UP
    "SW12": (DPAD[0], DPAD[1] + DPAD_STEP, 0, F),    # DOWN
    "SW13": (DPAD[0] - DPAD_STEP, DPAD[1], 0, F),    # LEFT
    "SW14": (DPAD[0] + DPAD_STEP, DPAD[1], 0, F),    # RIGHT
    "SW18": (8.0, DPAD[1], 0, F),             # HOME (6 mm THT switches: centre of the four pins)
    "SW15": (22.0, DPAD[1], 0, F),             # A
    "SW16": (36.0, DPAD[1], 0, F),             # B
    "SW17": (50.0, DPAD[1], 0, F),             # C
    "D20": (59.0, DPAD[1] - 2.0, 0, F), "D21": (59.0, DPAD[1] + 2.0, 0, F),
    # The four corner LEDs sit in the board's corners (the top two under the
    # clip slots); the back edge lights follow the corner curves (below).
    "D1": (3.6, 11.0, 90, F), "D2": (86.4, 9.0, 90, F),
    "D3": (3.6, 130.0, 0, F), "D4": (84.4, 130.0, 0, F),
    "U9": (76.0, 44.0, 0, B),               # status LED on the back, beside the power switch
    # ---- Back: module and RTC at the top, display/expander/IMU behind the top of the
    # screen, battery low, microSD and USB-C at the bottom ----
    "U1": (44, 12.8, 0, B),
    "R1": (56.5, 20, 90, B),
    "C3": (58.5, 20, 90, B),
    "R2": (58.5, 24, 90, B),
    "SW1": (34, 30, 0, B),
    "SW2": (54, 30, 0, B),
    "TP1": (60, 37, 0, B),
    "TP2": (64, 37, 0, B),
    "TP3": (68, 37, 0, B),
    "TP4": (72, 37, 0, B),
    "R17": (31.5, 10, 0, B),
    "R18": (31.5, 12.5, 0, B),
    "C22": (31.5, 15, 0, B),
    "J7": (65, 21, 270, B),
    "U12": (66, 28, 0, B),
    "C60": (66, 32.5, 0, B),
    "C61": (70.5, 28, 90, B),
    "R60": (61.5, 28, 90, B),
    "Q1": (78, 28.5, 0, B),
    "R71": (81.5, 28.5, 90, B),
    "R72": (74.5, 28.5, 90, B),
    "R73": (78, 33, 0, B),
    "R70": (79, 21.5, 90, B),
    "C70": (76.5, 21.5, 90, B),
    "J3": (HEADER_PIN1[0], HEADER_PIN1[1], 180, F),   # module header socket; pin 1 at the bottom
    "C30": (81.5, HEADER_PIN1[1], 90, B),
    "R74": (76.0, 47.2, 0, B),
    # 5 V boost for the display, on the back beside J3's power pin
    "U6": (77.0, 96.0, 180, B), "L2": (77.0, 92.0, 180, B),   # VIN and L2 input on the left, SW straight up to L2 on the right
    "C31": (73.6, 96.0, 90, B), "C32": (80.4, 96.0, 90, B),
    "R20": (75.6, 99.6, 180, B), "R21": (78.4, 99.6, 180, B),   # FB ends inboard, under U6 pin 1
    "Q4": (72.3, 44.5, 0, B),              # switches +3V3_AUX (IR receiver, status LED)
    "R46": (72.3, 41.4, 0, B),
    "J6": (7.0, 40.0, 0, B),              # expansion header: a column on the back's right edge (seen from the
                                          # back), under the badge details, above H2; pin 1 (3V3) at the top
    "C71": (76.0, 40.8, 0, B),
    "U11": (34, 66, 0, B),
    "C40": (38.5, 66, 90, B),
    "R40": (40, 61, 90, B),
    "R41": (42, 61, 90, B),
    "R42": (22, 69.5, 90, B),
    "R43": (24.2, 69.5, 90, B),
    "R45": (28.6, 69.5, 90, B),
    "TP6": (40, 72, 0, B),
    "U7": (48, 66, 0, B),
    "C62": (52.5, 69.5, 0, B),
    "C63": (48, 70.5, 0, B),
    "C64": (44, 61, 90, B),
    "TP5": (7.5, 70, 0, B),
    "Q3": (13, 74, 0, B), "R27": (8.5, 74, 90, B),     # reverse-battery protection by J2
    "J2": (13, 81, 270, B),
    "J4": (9, 94.5, 90, B),
    "C67": (13, 108.8, 0, B),
    "C68": (9.5, 104.0, 90, B),
    "R62": (11.7, 104.0, 90, B),
    "R63": (13.9, 104.0, 90, B),
    "R64": (16.1, 104.0, 90, B),
    "R65": (9.5, 106.5, 90, B),
    "R66": (11.7, 106.5, 90, B),
    "R67": (13.9, 106.5, 90, B),
    "J1": (44, 129.9, 0, B),
    "U3": (43, 121.5, 0, B),
    "R10": (50.5, 125.5, 90, B),
    "R11": (37.5, 125.5, 90, B),
    "R12": (44.5, 116.5, 90, B),
    "R13": (41.5, 116.5, 90, B),
    "R19": (52, 130, 90, B),
    "C23": (36, 130, 90, B),
    "R23": (49.5, 116.5, 0, B),
    "R24": (38.5, 116.5, 0, B),
    "U4": (60, 124.5, 180, B),            # turned so ISET/TMR/ITERM/VBUS face their parts below
    "R14": (58, 129.5, 90, B),            # ISET, left of C24 under pin 16
    "R15": (62, 129.5, 90, B),
    "R22": (64, 129.5, 90, B),            # TMR, right of C24
    "R25": (56, 129.5, 90, B),
    "R16": (60, 119.5, 0, B),
    "C24": (60.5, 127.6, 0, B),
    "C25": (55.5, 124.5, 90, B),
    "C26": (56, 119.5, 90, B),
    "U5": (28, 127.5, 180, B),
    "L1": (24, 127.5, 270, B),
    "R26": (31.3, 126.3, 0, B),
    "C27": (31.3, 127.6, 180, B),
    "C20": (28.5, 124.6, 0, B),
    "C21": (27, 130.6, 180, B),
    "C28": (23.3, 131.3, 0, B),
    "SW3": (84, 44, 270, B),
    "J5": (13, 129.5, 0, B),
    "U8": (86, 21.5, 270, F),
    "D10": (77.5, 25.0, 0, F),
}
# Back edge lights: two per corner on the corner's curve, long side along it.
EDGE_LED_R = CORNER - 1.4                  # from the corner's centre: 1.4 mm in from the edge
for _i, (_cx, _cy, _ox, _oy) in enumerate(((CORNER, CORNER, -1, -1), (W - CORNER, CORNER, 1, -1),
                                           (CORNER, H - CORNER, -1, 1), (W - CORNER, H - CORNER, 1, 1))):
    for _j, _a in enumerate((18.0, 72.0)):
        _dx, _dy = _ox * math.cos(math.radians(_a)), _oy * math.sin(math.radians(_a))
        _rot = round(math.degrees(math.atan2(-_dx, -_dy)))     # along the tangent (-dy, dx), seen from the front
        _rot = (180 - _rot) % 180                               # place() mirrors the angle when it flips to the back
        PLACE[f"D{30 + _i * 2 + _j}"] = (_cx + EDGE_LED_R * _dx, _cy + EDGE_LED_R * _dy, _rot, B)

# Button pull-ups: two rows beside the expander.
for i in range(8):
    PLACE[f"R{50 + i}"] = (22.0 + (i % 4) * 2.2, 61.0 + (i // 4) * 2.4, 90, B)

# Passives that belong right at a module pad: ref -> (host, pad, distance
# out from the pad centre, offset along the module edge). They are pushed
# out of whichever module edge the pad is on, long side parallel to it.
AT_PAD = {
    "C2": ("U1", "2", 2.0, 0.0),      # 100 nF closest to the 3V3 pin
    "C1": ("U1", "2", 2.4, 3.0),      # 22 uF next to it
    "R3": ("U1", "20", 2.0, 0.0),     # display clock termination
    "R4": ("U1", "31", 2.0, 0.0),     # SD clock termination
    "R5": ("U1", "12", 2.0, 0.0),     # I2S bit clock termination
}
for _ref, (_host, *_rest) in AT_PAD.items():
    PLACE.setdefault(_ref, (0.0, 0.0, 0, B))   # final position comes from the pad


# -------------------------------------------------------------- board parts

def load_footprint(fpid):
    lib, name = fpid.split(":")
    fp = pcbnew.FootprintLoad(str(FP_ROOT / f"{lib}.pretty"), name)
    if fp is None:
        raise SystemExit(f"footprint not found: {fpid}")
    fp.SetFPID(pcbnew.LIB_ID(lib, name))
    return fp


def place(fp, x, y, rot, side):
    """Rotate as seen from the front, then flip back-side parts left-right
    (KiCad stores a flipped part's orientation as 180 - rotation, so the
    rotation must be applied before the flip)."""
    fp.SetPosition(pt(x, y))
    fp.SetOrientationDegrees(rot)
    if side == B:
        fp.Flip(pt(x, y), pcbnew.FLIP_DIRECTION_LEFT_RIGHT)


def pad_position(fp, number):
    for pad in fp.Pads():
        if pad.GetNumber() == number:
            pos = pad.GetPosition()
            return pcbnew.ToMM(pos.x) - ORIGIN[0], pcbnew.ToMM(pos.y) - ORIGIN[1]
    raise KeyError(number)


def add_line(board, layer, a, b, width=0.15):
    seg = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_SEGMENT)
    seg.SetLayer(layer)
    seg.SetStart(pt(*a))
    seg.SetEnd(pt(*b))
    seg.SetWidth(mm(width))
    board.Add(seg)


def add_arc(board, layer, centre, start, angle, width=0.15):
    arc = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_ARC)
    arc.SetLayer(layer)
    arc.SetCenter(pt(*centre))
    arc.SetStart(pt(*start))
    arc.SetArcAngleAndEnd(pcbnew.EDA_ANGLE(angle, pcbnew.DEGREES_T), True)
    arc.SetWidth(mm(width))
    board.Add(arc)


def add_circle(board, layer, centre, radius, width=0.1):
    c = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_CIRCLE)
    c.SetLayer(layer)
    c.SetCenter(pt(*centre))
    c.SetEnd(pt(centre[0] + radius, centre[1]))
    c.SetWidth(mm(width))
    board.Add(c)


def add_rect(board, layer, x, y, w, h, width=0.15):
    for a, b in (((x, y), (x + w, y)), ((x + w, y), (x + w, y + h)),
                 ((x + w, y + h), (x, y + h)), ((x, y + h), (x, y))):
        add_line(board, layer, a, b, width)


def add_rounded_rect(board, layer, x, y, w, h, r, width=0.1):
    add_line(board, layer, (x + r, y), (x + w - r, y), width)
    add_line(board, layer, (x + w, y + r), (x + w, y + h - r), width)
    add_line(board, layer, (x + w - r, y + h), (x + r, y + h), width)
    add_line(board, layer, (x, y + h - r), (x, y + r), width)
    add_arc(board, layer, (x + r, y + r), (x, y + r), 90, width)
    add_arc(board, layer, (x + w - r, y + r), (x + w - r, y), 90, width)
    add_arc(board, layer, (x + w - r, y + h - r), (x + w, y + h - r), 90, width)
    add_arc(board, layer, (x + r, y + h - r), (x + r, y + h), 90, width)


def add_text(board, layer, text, x, y, size=1.0, thickness=0.15, mirror=False, bold=False):
    t = pcbnew.PCB_TEXT(board)
    t.SetText(text)
    t.SetLayer(layer)
    t.SetPosition(pt(x, y))
    t.SetTextSize(pcbnew.VECTOR2I(mm(size), mm(size)))
    t.SetTextThickness(mm(thickness))
    t.SetMirrored(mirror)
    t.SetBold(bold)
    board.Add(t)


def outline(board):
    e = pcbnew.Edge_Cuts
    add_rounded_rect(board, e, 0, 0, W, H, CORNER)
    for cx, cy in SLOTS:
        r = SLOT_W / 2
        half = SLOT_LEN / 2 - r
        add_line(board, e, (cx - half, cy - r), (cx + half, cy - r), 0.1)
        add_line(board, e, (cx + half, cy + r), (cx - half, cy + r), 0.1)
        add_arc(board, e, (cx + half, cy), (cx + half, cy - r), 180, 0.1)
        add_arc(board, e, (cx - half, cy), (cx - half, cy + r), 180, 0.1)


GRILLE_ROWS = (0x41, 0x4E, 0x57, 0x45, 0x53, 0x48, 0x41)   # one row per byte, MSB on the left
GRILLE_PITCH = (1.8, 1.6)                                    # column, row (mm)
GRILLE_HOLES = (0.6, 1.2)                                    # drill for a 0 bit, a 1 bit (mm)


# M3 holes under the display module's own holes for its standoffs, M2 holes
# for the battery holder's foot, and fiducials for assembly.
MOUNT_HOLES = MODULE_HOLES
_bx, _by, _bw, _bh = BATTERY
HOLDER_HOLES = ((_bx + 3.0, _by + _bh + 0.3 + HOLDER_FOOT / 2), (_bx + _bw - 3.0, _by + _bh + 0.3 + HOLDER_FOOT / 2))
FIDUCIALS = {"F": ((2.6, 50.0), (85.4, 55.0), (2.6, 112.0)),
             "B": ((2.6, 45.0), (85.4, 52.0), (2.6, 56.5))}


def board_only(board, fpid, ref, x, y, side="F"):
    """A footprint with no schematic symbol (holes, fiducials)."""
    fp = load_footprint(fpid)
    fp.SetReference(ref)
    want = pcbnew.FP_BOARD_ONLY | pcbnew.FP_EXCLUDE_FROM_BOM
    if fp.GetAttributes() & want != want:      # keep the library's own flags when they suffice
        fp.SetAttributes(fp.GetAttributes() | want)
    fp.Reference().SetVisible(False)
    fp.Value().SetVisible(False)
    board.Add(fp)
    place(fp, x, y, 0, side)
    return fp


def mechanical(board):
    for i, (x, y) in enumerate(MOUNT_HOLES, 1):
        board_only(board, "MountingHole:MountingHole_3.2mm_M3", f"H{i}", x, y)
    for i, (x, y) in enumerate(HOLDER_HOLES, len(MOUNT_HOLES) + 1):
        board_only(board, "MountingHole:MountingHole_2.2mm_M2", f"H{i}", x, y)
    n = 1
    for side, spots in FIDUCIALS.items():
        for x, y in spots:
            board_only(board, "Fiducial:Fiducial_1mm_Mask2mm", f"FID{n}", x, y, side)
            n += 1


def speaker_grille(board):
    """Drilled (non-plated) holes over the speaker, read from the front:
    every hole passes sound, big holes are 1 bits and small holes 0 bits."""
    fp = pcbnew.FOOTPRINT(board)
    fp.SetReference("G1")
    fp.SetValue("speaker grille")
    fp.SetAttributes(pcbnew.FP_BOARD_ONLY | pcbnew.FP_EXCLUDE_FROM_BOM | pcbnew.FP_EXCLUDE_FROM_POS_FILES)
    fp.Reference().SetVisible(False)
    fp.Value().SetVisible(False)
    sx, sy, sw, sh = SPEAKER
    cx, cy = sx + sw / 2, sy + sh / 2
    fp.SetPosition(pt(cx, cy))
    board.Add(fp)
    dx, dy = GRILLE_PITCH
    for row, byte in enumerate(GRILLE_ROWS):
        for col in range(8):
            bit = (byte >> (7 - col)) & 1
            d = GRILLE_HOLES[bit]
            pad = pcbnew.PAD(fp)
            pad.SetAttribute(pcbnew.PAD_ATTRIB_NPTH)
            pad.SetShape(pcbnew.PAD_SHAPE_CIRCLE)
            pad.SetSize(pcbnew.VECTOR2I(mm(d), mm(d)))
            pad.SetDrillSize(pcbnew.VECTOR2I(mm(d), mm(d)))
            pad.SetLayerSet(pcbnew.PAD.UnplatedHoleMask())
            fp.Add(pad)
            pad.SetPosition(pt(cx + (col - 3.5) * dx, cy + (row - (len(GRILLE_ROWS) - 1) / 2) * dy))


def raster_art(board, png, layer, x, y, height, mirror=False, threshold=128):
    """Silkscreen artwork from a black-on-white PNG: dark pixels become silk.
    Pixel runs are merged into polygons by KiCad's own polygon engine."""
    from PIL import Image
    img = Image.open(png).convert("L")
    rows = max(1, round(height / 0.05))                     # 0.05 mm per pixel
    cols = max(1, round(img.width * rows / img.height))
    img = img.resize((cols, rows), Image.LANCZOS)
    if mirror:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    px = height / rows
    data = img.load()
    polys = pcbnew.SHAPE_POLY_SET()
    for r in range(rows):
        c = 0
        while c < cols:
            if data[c, r] < threshold:
                start = c
                while c < cols and data[c, r] < threshold:
                    c += 1
                x0, x1 = x + start * px, x + c * px
                y0, y1 = y + r * px, y + (r + 1) * px + 0.001
                polys.NewOutline()
                for vx, vy in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
                    polys.Append(mm(ORIGIN[0] + vx), mm(ORIGIN[1] + vy))
            else:
                c += 1
    polys.Simplify()
    # A polygon shape holds one outline (with its holes), so each merged
    # outline becomes its own shape.
    for i in range(polys.OutlineCount()):
        piece = pcbnew.SHAPE_POLY_SET()
        piece.AddOutline(polys.Outline(i))
        for h in range(polys.HoleCount(i)):
            piece.AddHole(polys.Hole(i, h))
        shape = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_POLY)
        shape.SetLayer(layer)
        shape.SetPolyShape(piece)
        shape.SetFilled(True)
        shape.SetWidth(0)
        board.Add(shape)


def heart(board, layer, cx, cy, width, line=0.3):
    """An outline heart in the line art's weight, drawn as a raster so it
    goes through the same path as the other artwork."""
    from PIL import Image, ImageDraw
    import tempfile
    size = 400
    img = Image.new("L", (size, size), 255)
    draw = ImageDraw.Draw(img)
    pts = []
    for i in range(361):
        t = math.radians(i)
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((size / 2 + x * size / 36, size / 2 - y * size / 36 - 10))
    stroke = max(2, round(line / width * size * 36 / 34))
    draw.line(pts, fill=0, width=stroke, joint="curve")
    with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
        img.save(tmp.name)
        raster_art(board, Path(tmp.name), layer, cx - width / 2, cy - width / 2, width)


def imu_axes(board, layer, x, y, length=4.0):
    """Arrows beside U7 showing the MPU-6050's axes as OreoOS reads them:
    +X to the left of the screen, +Y up the screen (Z goes into the badge).
    Drawn in front-view coordinates, so on the back they read mirrored."""
    w = 0.15
    for (dx, dy), label in (((-1, 0), "X"), ((0, -1), "Y")):
        ex, ey = x + dx * length, y + dy * length
        add_line(board, layer, (x, y), (ex, ey), w)
        # arrow head
        hx, hy = -dx * 0.8, -dy * 0.8
        px, py = -dy * 0.5, dx * 0.5
        add_line(board, layer, (ex, ey), (ex + hx + px, ey + hy + py), w)
        add_line(board, layer, (ex, ey), (ex + hx - px, ey + hy - py), w)
        add_text(board, layer, label, ex + dx * 1.2, ey + dy * 1.2, 0.8, 0.15, mirror=True)
    add_text(board, layer, "U7", x + 1.8, y + 1.2, 0.8, 0.15, mirror=True)


def silkscreen(board):
    fs, bs = pcbnew.F_SilkS, pcbnew.B_SilkS
    # The display module's outline (it stands on J3 and H1-H4).
    px, py, pw, ph = PANEL
    for (cx, cy, dx, dy) in ((px, py, 1, 1), (px + pw, py, -1, 1), (px, py + ph, 1, -1), (px + pw, py + ph, -1, -1)):
        add_line(board, pcbnew.F_Fab, (cx, cy), (cx + 3 * dx, cy), 0.1)
        add_line(board, pcbnew.F_Fab, (cx, cy), (cx, cy + 3 * dy), 0.1)
    add_rect(board, pcbnew.F_Fab, px, py, pw, ph, 0.1)
    add_rect(board, pcbnew.F_CrtYd, px, py, pw, ph, 0.05)
    add_text(board, pcbnew.F_Fab, "2.8in ILI9341 SPI module (MSP2807), 86 x 50 mm", px + pw / 2, py + ph / 2, 1.5)
    # Button labels: U D L R inside the D-pad; a house for HOME and A B C above
    # their buttons (below them sit the USB-C shell pegs).
    dx_, dy_ = DPAD
    for label, ox, oy in (("U", 0, -2.9), ("D", 0, 2.9), ("L", -1.9, 0), ("R", 1.9, 0)):
        add_text(board, fs, label, dx_ + ox, dy_ + oy, 1.2, 0.2, bold=True)
    for ref, label in (("SW15", "A"), ("SW16", "B"), ("SW17", "C")):
        add_text(board, fs, label, PLACE[ref][0], dy_ - 5.6, 1.5, 0.25, bold=True)
    hx, hy = PLACE["SW18"][0], dy_ - 5.7
    for a, b in (((hx - 1.3, hy - 0.1), (hx, hy - 1.3)), ((hx, hy - 1.3), (hx + 1.3, hy - 0.1)),
                 ((hx - 0.9, hy - 0.4), (hx - 0.9, hy + 1.0)), ((hx + 0.9, hy - 0.4), (hx + 0.9, hy + 1.0)),
                 ((hx - 0.9, hy + 1.0), (hx + 0.9, hy + 1.0)),
                 ((hx - 0.3, hy + 1.0), (hx - 0.3, hy + 0.2)), ((hx - 0.3, hy + 0.2), (hx + 0.3, hy + 0.2)),
                 ((hx + 0.3, hy + 0.2), (hx + 0.3, hy + 1.0))):
        add_line(board, fs, a, b, 0.22)
    sx, sy, sw, sh = SPEAKER
    # Back.
    bx, by, bw, bh = BATTERY
    add_rect(board, pcbnew.B_Fab, bx, by, bw, bh, 0.1)
    add_rect(board, pcbnew.B_CrtYd, bx, by, bw, bh, 0.05)
    # The cell's corners, and the battery holder: its foot (solid outline,
    # screwed through H5-H6) and how far its lip reaches over the cell (dashed).
    for (cx, cy, dx, dy) in ((bx, by, 1, 1), (bx + bw, by, -1, 1), (bx, by + bh, 1, -1), (bx + bw, by + bh, -1, -1)):
        add_line(board, bs, (cx, cy), (cx + 3 * dx, cy), 0.15)
        add_line(board, bs, (cx, cy), (cx, cy + 3 * dy), 0.15)
    fy = by + bh + 0.3
    add_rect(board, bs, bx, fy, bw, HOLDER_FOOT, 0.15)
    ly = by + bh - HOLDER_LIP
    x = bx
    while x < bx + bw - 0.1:
        add_line(board, bs, (x, ly), (min(x + 1.5, bx + bw), ly), 0.15)
        x += 2.5
    for xx in (bx, bx + bw):
        y = ly
        while y < by + bh - 0.1:
            add_line(board, bs, (xx, y), (xx, min(y + 1.5, by + bh)), 0.15)
            y += 2.5
    add_text(board, bs, "BATTERY HOLDER", bx + bw / 2, fy + HOLDER_FOOT / 2, 1.0, 0.15, mirror=True)
    add_text(board, bs, "holder lip", bx + bw / 2, ly + 1.4, 0.8, 0.12, mirror=True)
    # Order with "Remove Mark": no JLCPCB order number. Set JLC_MARK to a
    # placeholder to have it printed here, under the battery.
    if JLC_MARK:
        add_text(board, bs, JLC_MARK, bx + bw / 2, ly + 5.5, 1.0, 0.15, mirror=True)
    add_text(board, bs, "LiPo 3.7 V, up to 6 x 34 x 50 mm", bx + bw / 2, by + bh / 2 - 6, 1.2, 0.15, mirror=True)
    add_text(board, bs, "JST-PH: check polarity", bx + bw / 2, by + bh / 2 - 3, 1.0, 0.15, mirror=True)
    add_rect(board, pcbnew.B_Fab, sx, sy, sw, sh, 0.1)
    add_rect(board, pcbnew.B_CrtYd, sx, sy, sw, sh, 0.05)
    for (cx, cy, dx, dy) in ((sx, sy, 1, 1), (sx + sw, sy, -1, 1), (sx, sy + sh, 1, -1), (sx + sw, sy + sh, -1, -1)):
        add_line(board, bs, (cx, cy), (cx + 2.5 * dx, cy), 0.15)
        add_line(board, bs, (cx, cy), (cx, cy + 2.5 * dy), 0.15)
    # "Elixpo" alone on the board's centre line; the OSHW mark and the
    # badge's details stacked in the column beside the module (seen from the
    # back it is right of the module: front-view x is mirrored there).
    mid, y0 = W / 2, BACK_ROW_Y
    add_text(board, bs, "Elixpo", mid, y0, 4.2, 0.6, mirror=True, bold=True)
    add_text(board, bs, REPO_URL, mid, y0 + 4.6, 1.0, 0.15, mirror=True)
    tx, ty = BACK_COLUMN
    for text, dy, size, thick, bold in (("FALERA BADGE", OSHW_H + 3.0, 1.5, 0.25, True),
                                        ("falera.elixpo.com", OSHW_H + 5.8, 1.0, 0.15, False),
                                        ("CERN-OHL-P-2.0", OSHW_H + 8.2, 0.9, 0.15, False),
                                        ("A/A-2509-0023", OSHW_H + 10.6, 0.9, 0.15, False)):
        add_text(board, bs, text, tx, ty + dy, size, thick, mirror=True, bold=bold)
    # Art: the Oreo panda in profile on the front, under the name card, and
    # OSHWA's certification mark on the back.
    px_, py_, ph_ = PANDA
    raster_art(board, ART / "oreo-lineart.png", fs, px_, py_, ph_)
    heart(board, fs, *HEART)
    ow = OSHW_H * 2196 / 1768              # the rendered mark's aspect ratio
    raster_art(board, ART / "oshw-certification-mark-IN000107.png", bs,
               tx - ow / 2, ty, OSHW_H, mirror=True)
    add_text(board, bs, "RST", 34.0, 26.8, 0.8, 0.12, mirror=True)
    add_text(board, bs, "BOOT", 54.0, 26.8, 0.8, 0.12, mirror=True)
    add_text(board, bs, "ON", 84.0, 37.9, 0.8, 0.12, mirror=True)
    imu_axes(board, bs, 51.0, 73.2, 3.0)
    add_text(board, bs, "microSD", 9.0, 86.1, 0.8, 0.12, mirror=True)
    add_text(board, bs, "Qwiic", 13.0, 125.6, 0.8, 0.12, mirror=True)
    # Expansion header: each pin named beside it on the inner side (it reads on
    # the left of the pin seen from the back), the title below, clear of FID6.
    jx, jy = PLACE["J6"][:2]
    for i, label in enumerate(("3V3", "GND", "IO5", "IO41", "IO42", "IO47")):
        add_text(board, bs, label, jx + 3.2, jy + i * 2.54, 0.8, 0.12, mirror=True)
    add_text(board, bs, "EXPANSION", jx + 3.0, jy + 5 * 2.54 + 2.3, 0.8, 0.12, mirror=True)
    add_text(board, bs, "I2C / SPI / GPIO", jx + 3.0, jy + 5 * 2.54 + 3.6, 0.8, 0.12, mirror=True)
    for ref, label in (("TP1", "TX"), ("TP2", "RX"), ("TP3", "GND"), ("TP4", "3V3"), ("TP5", "VBAT"), ("TP6", "P17")):
        tx, ty = PLACE[ref][:2]
        add_text(board, bs, label, tx, ty + 2.2, 0.8, 0.12, mirror=True)


def zone(board, net, layer, polygon, priority=0, clearance=0.25, min_width=0.2):
    z = pcbnew.ZONE(board)
    z.SetLayer(layer)
    if net is not None:
        z.SetNet(net)
    z.SetAssignedPriority(priority)
    z.SetLocalClearance(mm(clearance))
    z.SetMinThickness(mm(min_width))
    z.SetPadConnection(pcbnew.ZONE_CONNECTION_FULL)    # solid: no starved thermals on fine-pitch pads
    z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
    z.SetThermalReliefGap(mm(0.3))
    z.SetThermalReliefSpokeWidth(mm(0.35))
    outline_ = z.Outline()
    outline_.NewOutline()
    for x, y in polygon:
        outline_.Append(mm(ORIGIN[0] + x), mm(ORIGIN[1] + y))
    board.Add(z)
    return z


def keepout(board, polygon, layers, name):
    z = pcbnew.ZONE(board)
    z.SetIsRuleArea(True)
    z.SetZoneName(name)
    z.SetDoNotAllowTracks(True)
    z.SetDoNotAllowVias(True)
    z.SetDoNotAllowPads(False)
    z.SetDoNotAllowZoneFills(True)
    z.SetDoNotAllowFootprints(False)
    ls = pcbnew.LSET()
    for layer in layers:
        ls.AddLayer(layer)
    z.SetLayerSet(ls)
    o = z.Outline()
    o.NewOutline()
    for x, y in polygon:
        o.Append(mm(ORIGIN[0] + x), mm(ORIGIN[1] + y))
    board.Add(z)


def planes(board):
    # 4 layers: F signal / In1 GND / In2 signal / B signal (6 layers add In3
    # signal and an In4 GND plane). 3.3 V is routed with the Power net class.
    gnd = board.FindNet("GND")
    full = [(0.3, 0.3), (W - 0.3, 0.3), (W - 0.3, H - 0.3), (0.3, H - 0.3)]
    zone(board, gnd, pcbnew.In1_Cu, full)                 # return plane for F and In2
    if COPPER_LAYERS == 6:
        zone(board, gnd, pcbnew.In4_Cu, full)             # return plane for In3 and B
    else:
        # 4 layers: the free area of In2 carries 3.3 V, a reference for the
        # back's tracks and a low-impedance supply; it fills around In2's tracks.
        zone(board, board.FindNet("+3V3"), pcbnew.In2_Cu, full, clearance=0.3)
    zone(board, gnd, pcbnew.F_Cu, full, clearance=0.3)    # ground fill, stitched to In1
    zone(board, gnd, pcbnew.B_Cu, full, clearance=0.3)
    # Antenna: no copper on any layer beside or under the antenna, per the
    # ESP32-S3-WROOM-1 datasheet; the module's antenna end is on the top edge.
    mx = PLACE["U1"][0]
    copper = list(board.GetEnabledLayers().CuStack())
    keepout(board, [(mx - 15.0, 0.0), (mx + 15.0, 0.0), (mx + 15.0, 7.0), (mx - 15.0, 7.0)],
            copper, "antenna keep-out")


def stackup(board):
    board.SetCopperLayerCount(COPPER_LAYERS)
    ds = board.GetDesignSettings()
    ds.SetBoardThickness(mm(1.6))
    # Standard 4- and 6-layer capability at JLCPCB/PCBWay is 0.09 mm track and gap,
    # 0.2 mm drill; these rules stay well inside it.
    ds.m_TrackMinWidth = mm(0.1)        # Freerouting necks tracks to ~0.11 mm at fine-pitch pins
    ds.m_MinClearance = mm(0.127)
    ds.m_ViasMinSize = mm(0.45)
    ds.m_MinThroughDrill = mm(0.3)       # JLCPCB's standard drill: 0.2 mm costs extra
    ds.m_CopperEdgeClearance = mm(0.3)
    ds.m_HoleClearance = mm(0.2)         # JLCPCB multilayer via-hole to track
    ds.m_ViasMinAnnularWidth = mm(0.075)  # JLCPCB multilayer: 0.3 mm hole in a 0.45 mm via pad
    ds.m_SilkClearance = mm(0.0)


def write_netclasses():
    """KiCad keeps net classes in the project file."""
    pro = json.loads(PROJECT_FILE.read_text())
    ns = pro.setdefault("net_settings", {})
    base = dict(bus_width=12, diff_pair_gap=0.15, diff_pair_via_gap=0.25, diff_pair_width=0.2,
                line_style=0, microvia_diameter=0.3, microvia_drill=0.1, pcb_color="rgba(0, 0, 0, 0.000)",
                schematic_color="rgba(0, 0, 0, 0.000)", wire_width=6, priority=2147483647)
    ns["classes"] = [
        dict(base, name="Default", clearance=0.13, track_width=0.15, via_diameter=0.45, via_drill=0.3),
        # 0.3 mm reaches the 0.5 mm-pitch QFN/WSON pads of the charger and the
        # regulator within clearance, and carries about 1 A on outer copper:
        # enough for the 0.5-0.8 A these short runs see.
        dict(base, name="Power", clearance=0.13, track_width=0.3, via_diameter=0.6, via_drill=0.3, priority=1),
        dict(base, name="Battery", clearance=0.13, track_width=0.3, via_diameter=0.6, via_drill=0.3, priority=0),
        # about 50 ohm on an outer layer over the 0.1 mm prepreg to its ground plane
        dict(base, name="Fast", clearance=0.15, track_width=0.18, via_diameter=0.45, via_drill=0.3, priority=2),
        dict(base, name="USB", clearance=0.15, track_width=0.3, via_diameter=0.45, via_drill=0.3,
             diff_pair_width=0.3, diff_pair_gap=0.15, priority=3),
    ]
    ns["netclass_patterns"] = (
        [dict(netclass="Battery", pattern=p) for p in ("VBUS_5V", "VSYS", "VSYS_SW", "VBAT", "BAT_IN", "BUCK_L1", "BUCK_L2")] +
        [dict(netclass="Power", pattern=p) for p in ("+3V3", "+3V3_AUX", "LCD_5V", "LCD_BOOST_SW", "GND", "LCD_LEDA", "LCD_BL_SINK", "SPK_P", "SPK_N", "IR_LED_*", "CHASSIS")] +
        [dict(netclass="Fast", pattern=p) for p in ("LCD_SCK*", "LCD_MOSI", "LCD_MISO", "SD_CLK*", "SD_CMD", "SD_D*", "I2S_BCLK*")] +
        [dict(netclass="USB", pattern=p) for p in ("USB_D*", "USB_CONN_D*")]
    )
    PROJECT_FILE.write_text(json.dumps(pro, indent=2) + "\n")


STACKUP_6 = """\t\t(stackup
\t\t\t(layer "F.SilkS" (type "Top Silk Screen") (color "White"))
\t\t\t(layer "F.Paste" (type "Top Solder Paste"))
\t\t\t(layer "F.Mask" (type "Top Solder Mask") (color "#0A0A0AF0") (thickness 0.01))
\t\t\t(layer "F.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "dielectric 1" (type "prepreg") (thickness 0.1) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))
\t\t\t(layer "In1.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "dielectric 2" (type "core") (thickness 0.535) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))
\t\t\t(layer "In2.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "dielectric 3" (type "prepreg") (thickness 0.1) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))
\t\t\t(layer "In3.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "dielectric 4" (type "core") (thickness 0.535) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))
\t\t\t(layer "In4.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "dielectric 5" (type "prepreg") (thickness 0.1) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))
\t\t\t(layer "B.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "B.Mask" (type "Bottom Solder Mask") (color "#0A0A0AF0") (thickness 0.01))
\t\t\t(layer "B.Paste" (type "Bottom Solder Paste"))
\t\t\t(layer "B.SilkS" (type "Bottom Silk Screen") (color "White"))
\t\t\t(copper_finish "HAL lead-free")
\t\t\t(dielectric_constraints no)
\t\t)
"""


STACKUP_4 = """\t\t(stackup
\t\t\t(layer "F.SilkS" (type "Top Silk Screen") (color "White"))
\t\t\t(layer "F.Paste" (type "Top Solder Paste"))
\t\t\t(layer "F.Mask" (type "Top Solder Mask") (color "#0A0A0AF0") (thickness 0.01))
\t\t\t(layer "F.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "dielectric 1" (type "prepreg") (thickness 0.2104) (material "FR4") (epsilon_r 4.4) (loss_tangent 0.02))
\t\t\t(layer "In1.Cu" (type "copper") (thickness 0.0152))
\t\t\t(layer "dielectric 2" (type "core") (thickness 1.065) (material "FR4") (epsilon_r 4.6) (loss_tangent 0.02))
\t\t\t(layer "In2.Cu" (type "copper") (thickness 0.0152))
\t\t\t(layer "dielectric 3" (type "prepreg") (thickness 0.2104) (material "FR4") (epsilon_r 4.4) (loss_tangent 0.02))
\t\t\t(layer "B.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "B.Mask" (type "Bottom Solder Mask") (color "#0A0A0AF0") (thickness 0.01))
\t\t\t(layer "B.Paste" (type "Bottom Solder Paste"))
\t\t\t(layer "B.SilkS" (type "Bottom Silk Screen") (color "White"))
\t\t\t(copper_finish "HAL lead-free")
\t\t\t(dielectric_constraints no)
\t\t)
"""
STACKUP = STACKUP_4 if COPPER_LAYERS == 4 else STACKUP_6   # JLCPCB JLC04161H-7628 for 4 layers


TITLE_BLOCK_FMT = '\t(title_block\n\t\t(title "Falera Badge")\n\t\t(date "2026-11-15")\n\t\t(rev "1.0")\n\t\t(company "Elixpo")\n\t\t(comment 1 "Hardware: CERN-OHL-P-2.0, OSHWA IN000107")\n\t\t(comment 2 "%d layers, 1.6 mm, HASL, black mask")\n\t)\n'


TITLE_BLOCK = TITLE_BLOCK_FMT % COPPER_LAYERS


def write_title():
    text = BOARD_FILE.read_text()
    if "(title_block" not in text:
        text = text.replace('\t(paper "A4")\n', '\t(paper "A4")\n' + TITLE_BLOCK, 1)
        BOARD_FILE.write_text(text)


def write_stackup():
    """1.6 mm 4- or 6-layer build with black solder mask and white silkscreen.
    The stackup is not exposed to Python, so it goes into the file."""
    text = BOARD_FILE.read_text()
    if "(stackup" not in text:
        text = text.replace("\t(setup\n", "\t(setup\n" + STACKUP, 1)
        BOARD_FILE.write_text(text)


def write_rules():
    (HERE / "elixpo.kicad_dru").write_text(
        '(version 1)\n'
        '# The USB-C receptacle\'s GND pads sit 0.19 mm from its locating holes, as\n'
        '# GCT drew the footprint.\n'
        '(rule "USB-C shell holes"\n'
        '  (condition "A.Parent == \'J1\' && B.Parent == \'J1\'")\n'
        '  (constraint hole_clearance (min 0.15mm)))\n')


def main():
    comps, pad_nets = read_netlist()
    board = pcbnew.BOARD()
    stackup(board)

    nets = {}
    for name in sorted(set(pad_nets.values())):
        net = pcbnew.NETINFO_ITEM(board, name)
        board.Add(net)
        nets[name] = net

    missing = sorted(set(comps) - set(PLACE))
    if missing:
        raise SystemExit(f"no placement for: {', '.join(missing)}")
    footprints = {}
    for ref, comp in sorted(comps.items()):
        fp = load_footprint(comp["footprint"])
        fp.SetReference(ref)
        fp.SetValue(comp["value"])
        fp.SetPath(pcbnew.KIID_PATH(comp["path"]))
        fp.SetField("Description", comp["description"])
        fp.SetExcludedFromBOM(False)
        board.Add(fp)
        for pad in fp.Pads():
            name = pad_nets.get((ref, pad.GetNumber()))
            # Pins marked no-connect in the schematic stay without a net.
            if name and not name.startswith("unconnected-"):
                pad.SetNet(nets[name])
        # Dense passives carry their reference on the fab layer, not silk.
        if not re.match(r"(U\d|J\d|Q\d|SW3$)", ref) or ref in ("U9", "J7", "U8", "J5", "U5", "J6", "U4", "Q4", "U6", "U11"):
            fp.Reference().SetLayer(pcbnew.F_Fab)   # the flip below moves it to B.Fab
        for pad in fp.Pads():
            # JLCPCB's standard drill is 0.3 mm; the module footprint's thermal
            # holes are 0.2 mm (0.6 mm pads), so they grow to 0.3 mm.
            if pad.GetAttribute() == pcbnew.PAD_ATTRIB_PTH and pad.GetDrillSize().x < mm(0.3):
                pad.SetDrillSize(pcbnew.VECTOR2I(mm(0.3), mm(0.3)))
        x, y, rot, side = PLACE[ref]
        place(fp, x, y, rot, side)
        if ref == "J3":
            model = pcbnew.FP_3DMODEL()
            model.m_Filename = MODULE_MODEL
            model.m_Offset = pcbnew.VECTOR3D(0, 0, MODULE_STANDOFF)
            fp.Models().push_back(model)
        if comp["footprint"].startswith("Button_Switch_THT:"):
            for model in fp.Models():
                model.m_Scale = pcbnew.VECTOR3D(1, 1, round(BUTTON_MODEL_Z, 4))
            # The library puts the origin on pin 1; PLACE gives the switch's centre.
            xs = [pcbnew.ToMM(pad.GetPosition().x) - ORIGIN[0] for pad in fp.Pads()]
            ys = [pcbnew.ToMM(pad.GetPosition().y) - ORIGIN[1] for pad in fp.Pads()]
            dx = x - (min(xs) + max(xs)) / 2
            dy = y - (min(ys) + max(ys)) / 2
            fp.SetPosition(fp.GetPosition() + pcbnew.VECTOR2I(mm(dx), mm(dy)))
        footprints[ref] = fp

    for ref, (host, padnum, dist, along) in AT_PAD.items():
        hx, hy = pad_position(footprints[host], padnum)
        mx, my = PLACE[host][:2]
        fp = footprints[ref]
        if abs(hx - mx) > 8.0:            # side column: push out sideways
            out = 1 if hx > mx else -1
            x, y, rot = hx + out * dist, hy + along, 90
        else:                              # bottom row: push down
            x, y, rot = hx + along, hy + dist, 0
        side = PLACE[ref][3]
        fp.SetOrientationDegrees(180 - rot if side == B else rot)
        fp.SetPosition(pt(x, y))

    outline(board)
    speaker_grille(board)
    mechanical(board)
    silkscreen(board)
    planes(board)

    filler = pcbnew.ZONE_FILLER(board)
    filler.Fill(board.Zones())
    board.Save(str(BOARD_FILE))
    write_stackup()
    write_title()
    write_netclasses()
    write_rules()
    print(f"Placed {len(footprints)} footprints on a {W:g} x {H:g} mm {COPPER_LAYERS}-layer board: {BOARD_FILE}")


if __name__ == "__main__":
    main()
