#!/usr/bin/python3
"""Draw the badge's schematic by board side, with every connection wired.

    /usr/bin/python3 circuit/elixpo/wire_side_schematics.py

Writes a small KiCad project to build/sides/ (front.kicad_sch and
back.kicad_sch under elixpo.kicad_sch) and exports
build/oreo-badge-schematic-front-back.pdf. Parts are grouped round the chip
they serve; a grid maze router draws each signal net as orthogonal wires,
never through another net's pin and never overlapping another net's wire
lengthwise, with junction dots at branches. Power nets keep power labels,
and a net that also continues on the other side gets one label naming it.
The project's real schematic is not touched.
"""

import heapq
import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "build" / "sides"
G = 1.27                                   # KiCad's 50 mil grid
POWER = {"GND", "+3V3", "VSYS", "VSYS_SW", "VBAT", "VBUS_5V", "BAT_IN", "CHASSIS"}


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, ["x"]
    spec.loader.exec_module(mod)
    sys.argv = argv
    return mod


sch = load("gsch", HERE / "generate_badge_schematic.py")


def board_sides():
    """Each part's side, from the board file itself."""
    import re
    text = (HERE / "elixpo.kicad_pcb").read_text()
    sides = {}
    for m in re.finditer(r'\n\t\(footprint "[^"]+"\s*\(layer "([FB])\.Cu"\)(.*?)\(property "Reference" "([^"]+)"',
                         text, re.S):
        sides[m.group(3)] = m.group(1)
    return sides


side_of = board_sides()


def geometry(c):
    pins, half, body_x = sch._layout_pins(c["pins"])
    pin_x = body_x + 2.54
    return pins, half, body_x, pin_x


def layout(comps, page_w):
    """Blocks: each chip with the small parts that share its signal nets."""
    big = [c for c in comps if len(c["pins"]) > 4]
    small = [c for c in comps if len(c["pins"]) <= 4]
    nets_of = {c["ref"]: {p[2] for p in c["pins"] if p[2] not in POWER and not p[2].endswith("_NC")}
               for c in comps}
    big.sort(key=lambda c: -len(c["pins"]))
    owner = {}
    for s in small:
        best = None
        for b in big:
            k = len(nets_of[s["ref"]] & nets_of[b["ref"]])
            if k and (best is None or k > best[0]):
                best = (k, b["ref"])
        owner[s["ref"]] = best[1] if best else None
    blocks = [(b, [s for s in small if owner[s["ref"]] == b["ref"]]) for b in big]
    loose = [s for s in small if owner[s["ref"]] is None]
    blocks += [(None, loose[i:i + 6]) for i in range(0, len(loose), 6)]
    placed = []
    x, y, row_h = 40.0, 50.0, 0.0
    gap = 22.0                                  # wiring channels between blocks
    for chip, sats in blocks:
        items = ([chip] if chip else []) + sats
        # chip on the left of its block, satellites in a column beside it
        widths, heights = [], []
        for c in items:
            _p, half, _b, pin_x = geometry(c)
            widths.append(2 * pin_x + 14)
            heights.append(2 * half + 12)
        chip_w = widths[0] if chip else 0
        chip_h = heights[0] if chip else 0
        sat_w = max(widths[1:] if chip else widths, default=0)
        sat_col = (len(items) - (1 if chip else 0))
        col_rows = max(1, int(max(chip_h, 68) // 34))
        cols = max(1, -(-sat_col // col_rows))
        block_w = chip_w + cols * (sat_w + 8) + gap
        block_h = max(chip_h, min(sat_col, col_rows) * 34) + gap
        if x + block_w > page_w - 30:
            x, y, row_h = 40.0, y + row_h, 0.0
        if chip:
            c = dict(chip)
            c["x"], c["y"] = x + chip_w / 2, y + chip_h / 2
            placed.append(c)
        for i, s in enumerate(sats if chip else items):
            col, row = divmod(i, col_rows)
            c = dict(s)
            c["x"] = x + chip_w + 8 + col * (sat_w + 8) + sat_w / 2
            c["y"] = y + 17 + row * 34
            placed.append(c)
        x += block_w
        row_h = max(row_h, block_h)
    for c in placed:
        c["x"] = round(c["x"] / G) * G
        c["y"] = round(c["y"] / G) * G
    return placed, y + row_h + 30


class Router:
    def __init__(self, comps, w, h):
        self.W, self.H = int(w / G), int(h / G)
        self.block = set()
        self.ends = {}            # cell -> net (pin endpoints, wire corners and ends)
        self.occ = {}             # cell -> {net: set of "h"/"v"}
        self.term = {}            # (ref, number) -> cell
        for c in comps:
            pins, half, body_x, pin_x = geometry(c)
            cx, cy = c["x"] / G, c["y"] / G
            x0, x1 = int((c["x"] - body_x) / G) - 1, int((c["x"] + body_x) / G) + 1
            y0, y1 = int((c["y"] - half) / G) - 1, int((c["y"] + half) / G) + 1
            for gx in range(x0, x1 + 1):
                for gy in range(y0, y1 + 1):
                    self.block.add((gx, gy))
            for p in pins:
                ex, ey = sch.endpoint(c, p)
                cell = (round(ex / G), round(ey / G))
                # the pin's own line, from the body to its end, is not routable
                step = -1 if p["side"] == "left" else 1
                for k in range(1, 3):
                    self.block.add((cell[0] - step * k, cell[1]))
                self.term[(c["ref"], p["number"])] = (cell, step)
                self.ends[cell] = p["net"]

    def free(self, cell, net, d, corner):
        if cell in self.block or not (0 < cell[0] < self.W and 0 < cell[1] < self.H):
            return False
        e = self.ends.get(cell)
        if e is not None and e != net:
            return False
        o = self.occ.get(cell)
        if o:
            others = {n: ds for n, ds in o.items() if n != net}
            if others and (corner or any(d in ds for ds in others.values())):
                return False
        return True

    def route(self, net, start, step, goals):
        """A* from a pin (leaving outwards) to any goal cell of the net."""
        sx, sy = start
        first = (sx + step, sy)
        if not self.free(first, net, "h", False):
            return None
        heap = [(0, 0, first, "h", None)]
        came = {(first, "h"): None}
        cost = {(first, "h"): 0}
        gx = [g[0] for g in goals]
        gy = [g[1] for g in goals]
        box = (min(gx), max(gx), min(gy), max(gy))
        hfun = lambda c: max(box[0] - c[0], 0, c[0] - box[1]) + max(box[2] - c[1], 0, c[1] - box[3])
        n = 0
        while heap and n < 120000:
            _f, g, cell, d, _prev = heapq.heappop(heap)
            n += 1
            if cell in goals:
                path = [cell]
                key = (cell, d)
                while came[key] is not None:
                    key = came[key]
                    path.append(key[0])
                path.append(start)
                return path[::-1]
            for nd, (dx, dy) in (("h", (1, 0)), ("h", (-1, 0)), ("v", (0, 1)), ("v", (0, -1))):
                nxt = (cell[0] + dx, cell[1] + dy)
                turn = nd != d
                if turn and not self.free(cell, net, nd, True):
                    continue
                if not self.free(nxt, net, nd, False) and nxt not in goals:
                    continue
                o = self.occ.get(nxt, {})
                cross = 1 if any(k != net for k in o) else 0
                ng = g + 1 + (4 if turn else 0) + 3 * cross
                key = (nxt, nd)
                if ng < cost.get(key, 1e18):
                    cost[key] = ng
                    came[key] = (cell, d)
                    heapq.heappush(heap, (ng + hfun(nxt), ng, nxt, nd, cell))
        return None

    def commit(self, net, path):
        segs = []
        for a, b in zip(path, path[1:]):
            d = "h" if a[1] == b[1] else "v"
            for cell in (a, b):
                self.occ.setdefault(cell, {}).setdefault(net, set()).add(d)
            segs.append((a, b, d))
        # corners and both ends become end points of this net
        self.ends.setdefault(path[0], net)
        self.ends.setdefault(path[-1], net)
        for i in range(1, len(path) - 1):
            d0 = "h" if path[i - 1][1] == path[i][1] else "v"
            d1 = "h" if path[i][1] == path[i + 1][1] else "v"
            if d0 != d1:
                self.ends[path[i]] = net
        return segs


def merge(path):
    """Cells -> straight runs."""
    pts = [path[0]]
    for i in range(1, len(path) - 1):
        a, b, c = path[i - 1], path[i], path[i + 1]
        if (a[0] == b[0] == c[0]) or (a[1] == b[1] == c[1]):
            continue
        pts.append(b)
    pts.append(path[-1])
    return pts


def build_page(name, title, comps, paper, page_w, other_side_nets, extra_labels=()):
    placed, height = layout(comps, page_w)
    r = Router(placed, page_w, max(height, 200))
    by_net = {}
    for c in placed:
        for p in sch._layout_pins(c["pins"])[0]:
            by_net.setdefault(p["net"], []).append((c, p))
    wires, junctions, labels, ncs = [], [], [], []
    failed = []
    order = sorted(by_net, key=lambda n: len(by_net[n]))
    for net in order:
        members = by_net[net]
        if net.endswith("_NC"):
            for c, p in members:
                ncs.append(sch.endpoint(c, p))
            continue
        if net in POWER or len(members) == 1:
            for c, p in members:
                labels.append((net, c, p))
            continue
        cells = [(r.term[(c["ref"], p["number"])], c, p) for c, p in members]
        tree = {cells[0][0][0]}
        tree_mid = set()
        ok = True
        for (cell, step), c, p in cells[1:]:
            path = r.route(net, cell, step, tree | tree_mid)
            if path is None:
                ok = False
                labels.append((net, c, p))           # fall back to a label for this pin
                continue
            hit = path[-1]
            if hit in tree_mid:
                junctions.append(hit)
            segs = r.commit(net, path)
            pts = merge(path)
            for a, b in zip(pts, pts[1:]):
                wires.append((a, b))
            for cell2 in path:
                tree_mid.add(cell2)
            tree.add(cell)
        if not ok:
            failed.append(net)
            labels.append((net,) + members[0])
        elif net in other_side_nets:
            labels.append((net,) + members[0])       # continues on the other side
    # emit the sheet
    defs, inst, items = [], [], []
    sheet_id = sch.uid(name + "sheet")
    for c in placed:
        key = c["ref"].replace("#", "PWR")
        d, pins, half = sch.symbol_def(key, c)
        defs.append(d)
        inst.append(sch.placed(name, sheet_id, key, c, pins, half))
    for a, b in wires:
        items.append('(wire (pts (xy %.2f %.2f) (xy %.2f %.2f)) (stroke (width 0) (type default)) (uuid "%s"))'
                     % (a[0] * G, a[1] * G, b[0] * G, b[1] * G, sch.uid(name + "w%s%s" % (a, b))))
    for j in set(junctions):
        items.append('(junction (at %.2f %.2f) (diameter 0) (color 0 0 0 0) (uuid "%s"))'
                     % (j[0] * G, j[1] * G, sch.uid(name + "j%s" % (j,))))
    for ref, num in extra_labels:                  # pins ERC found unconnected: label them
        for c in placed:
            if c["ref"] == ref:
                for p in sch._layout_pins(c["pins"])[0]:
                    if p["number"] == num:
                        labels.append((p["net"], c, p))
    seen = set()
    for net, c, p in labels:
        k = (c["ref"], p["number"])
        if k in seen:
            continue
        seen.add(k)
        items.append(sch.global_label(name, c, p))
    for x, y in ncs:
        items.append('(no_connect (at %.2f %.2f) (uuid "%s"))' % (x, y, sch.uid(name + "nc%.2f%.2f" % (x, y))))
    notes = [sch.note(name, 1, title.upper(), 18, 18, 2.0, True),
             sch.note(name, 2, "Wires: signal nets. Labels: power nets, and nets that continue on the other side.",
                      18, 25, 1.2)]
    rows = ['(kicad_sch', '  (version 20250114)', '  (generator "oreo_badge_generator")',
            '  (generator_version "1.0")', f'  (uuid "{sch.uid(name + "root")}")', f'  (paper "{paper}")',
            f'  (title_block (title "{title}") (rev "1.0")', '    (company "Elixpo"))', '  (lib_symbols']
    rows += ['    ' + d.replace('\n', '\n    ') for d in defs]
    rows += ['  )']
    rows += ['  ' + it for it in items]
    rows += ['  ' + n for n in notes]
    rows += ['  ' + i.replace('\n', '\n  ') for i in inst]
    rows += ['  (embedded_fonts no)', ')']
    (OUT / f"{name}.kicad_sch").write_text("\n".join(rows) + "\n")
    return placed, failed, len(wires)


def unconnected_pins():
    """(sheet, ref, pin) for every pin ERC reports unconnected."""
    import re
    subprocess.run(["kicad-cli", "sch", "erc", str(OUT / "elixpo.kicad_sch"), "-o", str(OUT / "erc.rpt")],
                   check=False, capture_output=True)
    text = (OUT / "erc.rpt").read_text()
    found = []
    sheet = None
    for line in text.splitlines():
        m = re.match(r"\*\*\*\*\* Sheet /([^/]*)/", line)
        if m:
            sheet = m.group(1)
        m = re.search(r"Symbol (\S+) Pin (\S+) \[", line)
        if m and sheet is not None:
            found.append((sheet, m.group(1), m.group(2)))
    return found


def main():
    comps = [c for _n, _t, cs, _x in sch.PAGES for c in cs]
    front = [c for c in comps if side_of.get(c["ref"]) == "F"]
    back = [c for c in comps if side_of.get(c["ref"]) != "F"]
    nets = lambda cs: {p[2] for c in cs for p in c["pins"]}
    for f in ("elixpo.kicad_pro", "sym-lib-table", "oreo_badge.kicad_sym"):
        OUT.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(HERE / f, OUT / f)
    extra = {"whole": [], "front": [], "back": []}
    titles = {"whole": "Whole badge (sheet 1)", "front": "Front (display side)", "back": "Back"}
    for attempt in range(3):
        wp, wf, ww = build_page("whole", "Oreo badge, the whole circuit", comps, "A0", 1189, set(), extra["whole"])
        fp, ff, fw = build_page("front", "Oreo badge, front (display side)", front, "A2", 594, nets(back), extra["front"])
        bp, bf, bw = build_page("back", "Oreo badge, back", back, "A0", 1189, nets(front), extra["back"])
        sch.PAGES = [("whole", titles["whole"], wp, []), ("front", titles["front"], fp, []),
                     ("back", titles["back"], bp, [])]
        (OUT / "elixpo.kicad_sch").write_text(sch.root_schematic())
        missing = unconnected_pins()
        if not missing:
            break
        by_title = {v: k for k, v in titles.items()}
        for sheet, ref, pin in missing:
            extra[by_title.get(sheet, "whole")].append((ref, pin))
    print(f"whole badge: {len(comps)} parts, {ww} wires")
    print(f"front: {len(front)} parts, {fw} wires")
    print(f"back: {len(back)} parts, {bw} wires")
    print("pins labelled after ERC:", sum(len(v) for v in extra.values()))
    subprocess.run(["kicad-cli", "sch", "export", "pdf", str(OUT / "elixpo.kicad_sch"),
                    "-o", str(HERE / "build" / "oreo-badge-schematic-front-back.pdf")], check=True,
                   capture_output=True)


if __name__ == "__main__":
    main()
