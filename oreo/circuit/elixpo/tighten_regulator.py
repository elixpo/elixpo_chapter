#!/usr/bin/python3
"""Pull the TPS63031's inductor and capacitors in against its pins.

Clears tracks and vias in a box around U5 (in the file's text: removing
them through the API crashes the zone filler), moves the parts, and leaves
the reconnection to finish_badge_pcb.py."""
import os, sys
sys.path.insert(0, "/usr/lib/python3/dist-packages")
import pcbnew
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOARD = HERE / "elixpo.kicad_pcb"
O = (40.0, 30.0)                         # board origin on the page
# U5 sits below the A and B button pins, turned so its switch pins (1-5)
# face the inductor on the left and VINA (pin 8) faces its filter on the right.
BOX = (19.5, 123.4, 33.2, 133.4)         # x0, y0, x1, y1 in board mm
U5_ORIENTATION = 0                       # stored orientation of the flipped part
MOVES = {                                # ref: (x, y, orientation as seen on the board)
    "U5": (28.0, 127.5, None),
    "L1": (24.0, 127.5, None),           # pads to face pins 2 (L2) and 4 (L1)
    "C20": (28.5, 124.6, None),          # VIN, across pins 5 and 6
    "C21": (27.0, 130.6, None),          # VOUT, at pins 1 and 10
    "C28": (23.3, 131.3, None),          # second VOUT cap beside it
    "C27": (31.3, 127.6, None),          # VINA filter at pin 8
    "R26": (31.3, 126.3, None),
}

def strip_box(text):
    x0, y0, x1, y1 = (BOX[0] + O[0], BOX[1] + O[1], BOX[2] + O[0], BOX[3] + O[1])
    inside = lambda x, y: x0 <= x <= x1 and y0 <= y <= y1
    import re
    out, i, start, depth, block, n = [], 0, 0, 0, None, len(text)
    removed = 0
    while i < n:
        c = text[i]
        if c == '"':
            i = text.index('"', i + 1)
        elif c == "(":
            depth += 1
            if depth == 2:
                block = i
        elif c == ")":
            if depth == 2 and block is not None:
                chunk = text[block:i + 1]
                hit = False
                if chunk.startswith("(segment") or chunk.startswith("(arc"):
                    pts = re.findall(r"\((?:start|end|mid) ([-\d.]+) ([-\d.]+)\)", chunk)
                    hit = any(inside(float(x), float(y)) for x, y in pts)
                elif chunk.startswith("(via"):
                    m = re.search(r"\(at ([-\d.]+) ([-\d.]+)\)", chunk)
                    hit = bool(m) and inside(float(m.group(1)), float(m.group(2)))
                if hit:
                    out.append(text[start:text.rfind("\n", 0, block)])
                    start = i + 1
                    removed += 1
                block = None
            depth -= 1
        i += 1
    out.append(text[start:])
    return "".join(out), removed

text, removed = strip_box(BOARD.read_text())
BOARD.write_text(text)
project = BOARD.with_suffix(".kicad_pro").read_bytes()
board = pcbnew.LoadBoard(str(BOARD))
for ref, (x, y, _rot) in MOVES.items():
    fp = board.FindFootprintByReference(ref)
    fp.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(O[0] + x), pcbnew.FromMM(O[1] + y)))
board.FindFootprintByReference("U5").SetOrientationDegrees(U5_ORIENTATION)
# L1: turn it so its pads run along the pin column, pad 1 (BUCK_L1) towards pin 4
l1 = board.FindFootprintByReference("L1")
u5 = board.FindFootprintByReference("U5")
pin = {p.GetNumber(): p.GetPosition() for p in u5.Pads()}
def pads(fp): return {p.GetNumber(): p.GetPosition() for p in fp.Pads()}
best = None
for ang in (0, 90, 180, 270):
    l1.SetOrientationDegrees(ang)
    lp = pads(l1)
    d = max((lp["1"] - pin["4"]).EuclideanNorm(), (lp["2"] - pin["2"]).EuclideanNorm())
    if best is None or d < best[0]:
        best = (d, ang)
l1.SetOrientationDegrees(best[1])
# capacitors: pad 1 (the supply side) towards its pin
for ref, own, target in (("C21", "1", "1"), ("C28", "1", "1"), ("C20", "1", "6"),
                         ("C27", "1", "8"), ("R26", "2", "8")):
    fp = board.FindFootprintByReference(ref)
    best = None
    for ang in (0, 180):                 # every part stays flat, along the row
        fp.SetOrientationDegrees(ang)
        d = (pads(fp)[own] - pin[target]).EuclideanNorm()
        if best is None or d < best[0]:
            best = (d, ang)
    fp.SetOrientationDegrees(best[1])
board.Save(str(BOARD))
BOARD.with_suffix(".kicad_pro").write_bytes(project)
for ref in MOVES:
    if ref == "U5":
        continue
    fp = board.FindFootprintByReference(ref)
    near = min((pd.GetPosition() - pin[k]).EuclideanNorm() for pd in fp.Pads() for k in pin if k)
    print(f"{ref}: nearest pad to a U5 pin {pcbnew.ToMM(near):.2f} mm")
print("removed", removed, "tracks/vias in the box")
sys.stdout.flush(); os._exit(0)
