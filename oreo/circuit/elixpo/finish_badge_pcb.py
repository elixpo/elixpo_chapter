#!/usr/bin/python3
"""Finish the routed board: ground stitching, the last few gaps, stubs.

    /usr/bin/python3 circuit/elixpo/finish_badge_pcb.py [--ripup NET,NET] [--first NET,NET] [--thin NET=0.12]

--ripup removes those nets' tracks and vias first (rip-up and reroute);
--first routes those nets before the rest.

Run after route_badge_pcb.py. Freerouting leaves a handful of near misses
(a route that stops short of its pad, a layer change without a via) and
does not stitch ground. This script:

1. adds ground stitching vias on a grid, wherever a via clears every
   non-ground pad, track and via on all six layers, the board edge, the
   antenna keep-out and every part's courtyard: they tie the four ground
   layers together for short return paths and join stray fill islands;
2. joins each net that is still in pieces, closest points first, with a
   straight, L-shaped or 45-degree route on a signal layer (vias only at
   track ends, never in pads), keeping the first candidate that clears
   everything;
3. removes track stubs that lead nowhere.

Every check uses KiCad's own shapes and the board's clearance. The board is
saved, its zones refilled, and the project file left untouched.
"""

import math
import os
import sys
from pathlib import Path

if sys.prefix != sys.base_prefix:
    raise SystemExit("Run this with /usr/bin/python3, not inside a virtualenv.")
sys.path.insert(0, "/usr/lib/python3/dist-packages")
import pcbnew  # noqa: E402

HERE = Path(__file__).resolve().parent
BOARD = HERE / "elixpo.kicad_pcb"
MM = pcbnew.FromMM

ROUTE_LAYERS = (pcbnew.F_Cu, pcbnew.In2_Cu, pcbnew.In3_Cu, pcbnew.B_Cu)   # 6 layers; set from the board in main
CLEARANCE = MM(0.15)              # the largest net-class clearance
EDGE = MM(0.4)                    # copper to board edge, with margin
HOLE_GAP = MM(0.25)               # drill to drill
VIA_D, VIA_DRILL = MM(0.45), MM(0.3)          # JLCPCB's standard 0.3 mm drill
STITCH_PITCH = 4.0                # mm: about lambda/30 at 2.4 GHz


def is_thermal_pad(fp, pad):
    """A chip's exposed thermal pad (the module's ground pad, a QFN's EP):
    the one kind of SMD pad a via may sit in."""
    if not pad.IsOnCopperLayer():          # a paste opening inside a thermal pad
        return True
    size = pad.GetSize(pad.GetLayer())
    return fp.GetReference().startswith("U") and min(size.x, size.y) >= MM(1.0)


class Copper:
    """Every copper item, by layer, for clearance checks."""

    def __init__(self, board):
        self.board = board
        self.layers = list(board.GetEnabledLayers().CuStack())
        self.net_clr = {code: net_clearance(n.GetNetname()) if n.GetNetname() else MM(0.13)
                        for code, n in board.GetNetsByNetcode().items()}
        self.items = {l: {} for l in self.layers}      # layer -> cell -> [(shape, netcode)]
        self.holes = []                                  # (centre, radius)
        self.smd_pads = {}                               # cell -> [pad shape]: no vias in these
        for fp in board.GetFootprints():
            board_only = bool(fp.GetAttributes() & pcbnew.FP_BOARD_ONLY)
            for pad in fp.Pads():
                for l in self.layers:
                    if pad.IsOnLayer(l):
                        # fiducials and mechanical holes keep a 0.6 mm clearance of their own
                        clr = MM(0.6) if board_only else self.net_clr.get(pad.GetNetCode(), CLEARANCE)
                        self._put(l, pad.GetEffectiveShape(l), pad.GetNetCode(), clr)
                if pad.HasHole():
                    d = max(pad.GetDrillSize().x, pad.GetDrillSize().y)
                    self.holes.append((pad.GetPosition(), d // 2))
                if pad.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH:
                    # An unplated hole has no copper, so it is not in the grid
                    # above: block it on every layer with the board's hole
                    # clearance (the USB-C shell pegs, mounting holes, grille).
                    hole = pad.GetEffectiveHoleShape()
                    for l in self.layers:
                        self._put(l, hole, -1, board.GetDesignSettings().m_HoleClearance)
                if pad.GetAttribute() == pcbnew.PAD_ATTRIB_SMD and not is_thermal_pad(fp, pad):
                    # No via inside an SMD pad, whatever its net: an open via
                    # wicks the solder out of the joint. Exposed thermal pads
                    # are the exception, where vias belong.
                    l = pad.GetLayer()
                    shape = pad.GetEffectiveShape(l)
                    for cell in self._cells(shape.BBox(), 0):
                        self.smd_pads.setdefault(cell, []).append(shape)
        for t in board.Tracks():
            self.add(t)
        # board rule areas and the footprints' own (the module's antenna, the IMU, the card socket)
        zones = list(board.Zones()) + [z for fp in board.GetFootprints() for z in fp.Zones()]
        self.keepouts = [z for z in zones if z.GetIsRuleArea() and
                         (z.GetDoNotAllowTracks() or z.GetDoNotAllowVias())]
        self.courtyards = []
        for fp in board.GetFootprints():
            if fp.GetAttributes() & pcbnew.FP_BOARD_ONLY:
                continue
            for layer in (pcbnew.F_CrtYd, pcbnew.B_CrtYd):
                cy = fp.GetCourtyard(layer)
                if cy.OutlineCount():
                    self.courtyards.append(cy)
        outline = pcbnew.SHAPE_POLY_SET()
        board.GetBoardPolygonOutlines(outline, True)
        self.outline = outline
        chains = [outline.COutline(i) for i in range(outline.OutlineCount())]
        for i in range(outline.OutlineCount()):
            chains += [outline.CHole(i, h) for h in range(outline.HoleCount(i))]
        self.edges = [c.CSegment(k) for c in chains for k in range(c.SegmentCount())]

    CELL = MM(2.0)

    def _cells(self, box, margin):
        c = self.CELL
        x0, y0 = (box.GetLeft() - margin) // c, (box.GetTop() - margin) // c
        x1, y1 = (box.GetRight() + margin) // c, (box.GetBottom() + margin) // c
        return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]

    def _put(self, layer, shape, net, clr=None):
        entry = (shape, net, clr or self.net_clr.get(net, CLEARANCE))
        for cell in self._cells(shape.BBox(), 0):
            self.items[layer].setdefault(cell, []).append(entry)

    def add(self, item):
        if item.Type() == pcbnew.PCB_VIA_T:
            for l in self.layers:
                self._put(l, item.GetEffectiveShape(l), item.GetNetCode())
            self.holes.append((item.GetPosition(), item.GetDrill() // 2))
        else:
            self._put(item.GetLayer(), item.GetEffectiveShape(item.GetLayer()), item.GetNetCode())

    def clear(self, shape, layer, net):
        seen = set()
        for cell in self._cells(shape.BBox(), MM(0.6)):
            for entry in self.items[layer].get(cell, ()):
                if id(entry) in seen:
                    continue
                seen.add(id(entry))
                other, onet, clr = entry
                if onet != net and other.Collide(shape, max(clr, self.net_clr.get(net, CLEARANCE))):
                    return False
        return True

    def inside(self, points, shape):
        for p in points:
            if not self.outline.Contains(p):
                return False
        for z in self.keepouts:                 # the whole shape, not just its points
            if z.Outline().Collide(shape, 0):
                return False
        box = shape.BBox()
        for seg in self.edges:
            sa, sb = seg.A, seg.B
            if (max(sa.x, sb.x) < box.GetLeft() - EDGE or min(sa.x, sb.x) > box.GetRight() + EDGE or
                    max(sa.y, sb.y) < box.GetTop() - EDGE or min(sa.y, sb.y) > box.GetBottom() + EDGE):
                continue
            if shape.Collide(seg, EDGE):
                return False
        return True

    def via_ok(self, pos, net, courtyards=False):
        shape = pcbnew.SHAPE_CIRCLE(pos, VIA_D // 2)
        if not self.inside([pos], shape):
            return False
        if courtyards and any(cy.Contains(pos) for cy in self.courtyards):
            return False
        for c, r in self.holes:
            if (c - pos).EuclideanNorm() < r + VIA_DRILL // 2 + HOLE_GAP:
                return False
        for cell in self._cells(shape.BBox(), 0):
            if any(p.Collide(shape, 0) for p in self.smd_pads.get(cell, ())):
                return False
        return all(self.clear(shape, l, net) for l in self.layers)

    def seg_ok(self, a, b, width, layer, net):
        shape = pcbnew.SHAPE_SEGMENT(a, b, width)
        return self.inside([a, b], shape) and self.clear(shape, layer, net)


def new_via(board, copper, pos, net):
    v = pcbnew.PCB_VIA(board)
    v.SetPosition(pos)
    v.SetWidth(VIA_D)
    v.SetDrill(VIA_DRILL)
    v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
    v.SetNet(net)
    board.Add(v)
    copper.add(v)
    return v


def new_track(board, copper, a, b, width, layer, net):
    t = pcbnew.PCB_TRACK(board)
    t.SetStart(a)
    t.SetEnd(b)
    t.SetWidth(width)
    t.SetLayer(layer)
    t.SetNet(net)
    board.Add(t)
    copper.add(t)
    return t


def stitch(board, copper):
    gnd = board.FindNet("GND")
    box = board.GetBoardEdgesBoundingBox()
    x0, y0 = pcbnew.ToMM(box.GetLeft()), pcbnew.ToMM(box.GetTop())
    x1, y1 = pcbnew.ToMM(box.GetRight()), pcbnew.ToMM(box.GetBottom())
    added = 0
    y = y0 + 1.5
    while y < y1 - 1.0:
        x = x0 + 1.5
        while x < x1 - 1.0:
            pos = pcbnew.VECTOR2I(MM(x), MM(y))
            if copper.via_ok(pos, gnd.GetNetCode()):
                new_via(board, copper, pos, gnd)
                added += 1
            x += STITCH_PITCH
        y += STITCH_PITCH
    return added


def anchors(item):
    """(position, layers, may take a via) for each point a route may start from."""
    if item.Type() == pcbnew.PCB_PAD_T:
        layers = [l for l in ROUTE_LAYERS if item.IsOnLayer(l)]
        return [(item.GetPosition(), layers, False)]
    if item.Type() == pcbnew.PCB_VIA_T:
        return [(item.GetPosition(), list(ROUTE_LAYERS), True)]
    if item.Type() == pcbnew.PCB_TRACE_T:
        return [(item.GetStart(), [item.GetLayer()], True), (item.GetEnd(), [item.GetLayer()], True)]
    return []


def clusters(board, net):
    conn = board.GetConnectivity()
    items = [p for fp in board.GetFootprints() for p in fp.Pads() if p.GetNetCode() == net.GetNetCode()]
    items += [t for t in board.Tracks() if t.GetNetCode() == net.GetNetCode()]
    key = lambda it: it.m_Uuid.AsString()
    left = {key(it): it for it in items}
    groups = []
    while left:
        k, it = left.popitem()
        group = [it]
        for other in conn.GetConnectedItems(it):
            ok = key(other)
            if ok in left:
                group.append(left.pop(ok))
        groups.append(group)
    return groups


def paths(a, b):
    """Candidate polylines from a to b: straight, two Ls, two 45-degree doglegs."""
    ax, ay, bx, by = a.x, a.y, b.x, b.y
    dx, dy = bx - ax, by - ay
    d = min(abs(dx), abs(dy))
    sx, sy = (1 if dx >= 0 else -1), (1 if dy >= 0 else -1)
    V = pcbnew.VECTOR2I
    return [
        [a, b],
        [a, V(bx, ay), b],
        [a, V(ax, by), b],
        [a, V(ax + sx * d, ay + sy * d), b],
        [a, V(bx - sx * d, by - sy * d), b],
    ]


def _netclasses():
    import json
    ns = json.loads(BOARD.with_suffix(".kicad_pro").read_text())["net_settings"]
    return ns, {c["name"]: c for c in ns["classes"]}


def _class_of(name):
    import fnmatch
    ns, classes = _netclasses()
    for pat in ns.get("netclass_patterns", []):
        if fnmatch.fnmatchcase(name, pat["pattern"]):
            return classes[pat["netclass"]]
    return classes["Default"]


def net_clearance(name):
    return MM(_class_of(name)["clearance"])


THIN = {}                      # net name -> track width override (mm), from --thin


def track_width(name):
    """The net class's track width, from the project file's patterns (the
    net-class object is not exposed to Python)."""
    import fnmatch
    import json
    ns = json.loads(BOARD.with_suffix(".kicad_pro").read_text())["net_settings"]
    widths = {c["name"]: c["track_width"] for c in ns["classes"]}
    if name in THIN:
        return MM(THIN[name])
    for pat in ns.get("netclass_patterns", []):
        if fnmatch.fnmatchcase(name, pat["pattern"]):
            return MM(widths[pat["netclass"]])
    return MM(widths["Default"])


def join(board, copper, net, ga, gb):
    """Route between the closest anchors of two pieces of a net."""
    width = track_width(net.GetNetname())
    pairs = []
    for ia in ga:
        for pa in anchors(ia):
            for ib in gb:
                for pb in anchors(ib):
                    pairs.append(((pa[0] - pb[0]).EuclideanNorm(), pa, pb))
    pairs.sort(key=lambda p: p[0])
    for _dist, (pa, la, via_a), (pb, lb, via_b) in pairs[:12]:
        order = sorted(ROUTE_LAYERS, key=lambda l: -((l in la) + (l in lb)))
        for layer in order:
            need_a, need_b = layer not in la, layer not in lb
            if (need_a and not via_a) or (need_b and not via_b):
                continue
            if need_a and not copper.via_ok(pa, net.GetNetCode()):
                continue
            if need_b and not copper.via_ok(pb, net.GetNetCode()):
                continue
            for poly in paths(pa, pb):
                if all(copper.seg_ok(p, q, width, layer, net.GetNetCode())
                       for p, q in zip(poly, poly[1:]) if p != q):
                    if need_a:
                        new_via(board, copper, pa, net)
                    if need_b:
                        new_via(board, copper, pb, net)
                    for p, q in zip(poly, poly[1:]):
                        if p != q:
                            new_track(board, copper, p, q, width, layer, net)
                    return True
        # A layer change part-way: a's layer to a corner, a via, b's layer on.
        V = pcbnew.VECTOR2I
        corners = [V(pb.x, pa.y), V(pa.x, pb.y), V((pa.x + pb.x) // 2, (pa.y + pb.y) // 2)]
        for m in corners:
            for l1 in la:
                for l2 in lb:
                    if l1 == l2 or not copper.via_ok(m, net.GetNetCode()):
                        continue
                    for p1 in paths(pa, m):
                        if not all(copper.seg_ok(p, q, width, l1, net.GetNetCode())
                                   for p, q in zip(p1, p1[1:]) if p != q):
                            continue
                        for p2 in paths(m, pb):
                            if all(copper.seg_ok(p, q, width, l2, net.GetNetCode())
                                   for p, q in zip(p2, p2[1:]) if p != q):
                                new_via(board, copper, m, net)
                                for poly, layer in ((p1, l1), (p2, l2)):
                                    for p, q in zip(poly, poly[1:]):
                                        if p != q:
                                            new_track(board, copper, p, q, width, layer, net)
                                return True
    return False


def escapes(copper, p, layers, can_via, width, code):
    """Ways out of an anchor: [(grid-free point, layers it reaches, prefix)],
    prefix being the (point, layer) steps from the anchor to that point. A
    pad on one layer may step 0.5-1.6 mm out to a via."""
    out = [(p, list(layers), [(p, layers[0])] if layers else [])]
    if can_via or not layers:
        return out
    l = layers[0]
    for r in (0.55, 0.8, 1.1, 1.4, 1.7, 2.0):     # far enough to stagger neighbours' vias
        for k in range(24):
            ang = 2 * math.pi * k / 24
            q = pcbnew.VECTOR2I(p.x + int(MM(r) * math.cos(ang)), p.y + int(MM(r) * math.sin(ang)))
            if copper.seg_ok(p, q, width, l, code) and copper.via_ok(q, code):
                out.append((q, list(ROUTE_LAYERS), [(p, l), (q, l), (q, "via")]))
    return out


def ground_tie(board, copper, net, group, width):
    """Tie a ground group that the fills cannot reach (the IMU's pins inside
    its keep-out, say) to the inner planes with one via: at a track end if
    one fits, otherwise a short stub from a pad or track end to a via."""
    code = net.GetNetCode()
    for it in group:
        for p, layers, can_via in anchors(it):
            if can_via and it.Type() != pcbnew.PCB_VIA_T and copper.via_ok(p, code):
                new_via(board, copper, p, net)
                return True
    for it in group:
        for p, layers, can_via in anchors(it):
            if not layers:
                continue
            for q, _ls, prefix in escapes(copper, p, layers, False, width, code)[1:]:
                new_track(board, copper, prefix[0][0], q, width, prefix[0][1], net)
                new_via(board, copper, q, net)
                return True
    return False


def plane_via(board, copper, net, pad, width):
    """Tie a lone ground pad to the inner planes: a short stub to a via."""
    code = net.GetNetCode()
    for q, _layers, prefix in escapes(copper, pad.GetPosition(),
                                      [l for l in ROUTE_LAYERS if pad.IsOnLayer(l)], False, width, code)[1:]:
        new_track(board, copper, prefix[0][0], q, width, prefix[0][1], net)
        new_via(board, copper, q, net)
        return True
    return False


def astar(board, copper, net, ga, gb, width, step=MM(0.25), margin=MM(6), budget=250000):
    """Grid maze route from ga to gb on the four signal layers, with vias.
    Pads may escape through a via next to them; every move is checked."""
    import heapq
    code = net.GetNetCode()
    starts = [e for it in ga for (p, ls, cv) in anchors(it) for e in escapes(copper, p, ls, cv, width, code)]
    goals = [e for it in gb for (p, ls, cv) in anchors(it) for e in escapes(copper, p, ls, cv, width, code)]
    if not starts or not goals:
        return False
    xs = [q.x for q, _l, _pre in starts + goals]
    ys = [q.y for q, _l, _pre in starts + goals]
    x0, x1, y0, y1 = min(xs) - margin, max(xs) + margin, min(ys) - margin, max(ys) + margin
    V = pcbnew.VECTOR2I
    snap = lambda p: (round((p.x - x0) / step), round((p.y - y0) / step))
    at = lambda gx, gy: V(x0 + gx * step, y0 + gy * step)
    seg_cache, via_cache = {}, {}

    def seg(a, b, layer):
        k = (a, b, layer) if a <= b else (b, a, layer)
        if k not in seg_cache:
            seg_cache[k] = copper.seg_ok(at(*a), at(*b), width, layer, code)
        return seg_cache[k]

    def via(a):
        if a not in via_cache:
            via_cache[a] = copper.via_ok(at(*a), code)
        return via_cache[a]

    def near(q):
        gx, gy = snap(q)
        return [(gx + dx, gy + dy) for dx in range(-3, 4) for dy in range(-3, 4)]

    goal_nodes = {}
    for q, layers, prefix in goals:
        for g in near(q):
            for l in layers:
                if (g, l) not in goal_nodes and (at(*g) == q or copper.seg_ok(q, at(*g), width, l, code)):
                    goal_nodes[(g, l)] = (q, prefix)
    if not goal_nodes:
        return False
    goal_pts = list({g for (g, _l) in goal_nodes})
    gxs = [g[0] for g in goal_pts]
    gys = [g[1] for g in goal_pts]
    gbox = (min(gxs), max(gxs), min(gys), max(gys))

    def h(n):     # distance to the goals' bounding box: admissible, O(1)
        dx = max(gbox[0] - n[0], 0, n[0] - gbox[1])
        dy = max(gbox[2] - n[1], 0, n[1] - gbox[3])
        return dx + dy

    heap, came, cost = [], {}, {}
    for q, layers, prefix in starts:
        for s0 in near(q):
            for l in layers:
                node = (s0, l)
                if node in cost:
                    continue
                if at(*s0) == q or copper.seg_ok(q, at(*s0), width, l, code):
                    cost[node] = 0
                    came[node] = ("start", q, prefix)
                    heapq.heappush(heap, (h(s0), 0, node))
    dirs = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
    nx_max, ny_max = int((x1 - x0) / step), int((y1 - y0) / step)
    found, expanded = None, 0
    while heap and expanded < budget:
        _f, c, node = heapq.heappop(heap)
        if c > cost.get(node, 1 << 60):
            continue
        expanded += 1
        if node in goal_nodes:
            found = node
            break
        (gx, gy), l = node
        moves = []
        for dx, dy in dirs:
            n = (gx + dx, gy + dy)
            if 0 <= n[0] <= nx_max and 0 <= n[1] <= ny_max and seg((gx, gy), n, l):
                moves.append(((n, l), 1.414 if dx and dy else 1.0))
        if via((gx, gy)):
            for l2 in ROUTE_LAYERS:
                if l2 != l:
                    moves.append((((gx, gy), l2), 8.0))
        for nxt, w in moves:
            nc = c + w
            if nc < cost.get(nxt, 1 << 60):
                cost[nxt] = nc
                came[nxt] = node
                heapq.heappush(heap, (nc + h(nxt[0]), nc, nxt))
    if found is None:
        return False
    path = [found]
    while came[path[-1]][0] != "start":
        path.append(came[path[-1]])
    path.reverse()
    _tag, start_q, start_prefix = came[path[0]]
    goal_q, goal_prefix = goal_nodes[found]
    # steps: anchor..escape, escape point, grid path, escape point, escape..anchor
    steps = list(start_prefix) + [(start_q, path[0][1])]
    steps += [(at(*n[0]), n[1]) for n in path]
    steps += [(goal_q, path[-1][1])] + list(reversed(goal_prefix))
    for (p, l), (q, l2) in zip(steps, steps[1:]):
        if l == "via" or l2 == "via":
            if l2 == "via":
                new_via(board, copper, q, net)
            continue
        if l != l2:
            if p == q:
                new_via(board, copper, p, net)
            continue
        if p != q:
            new_track(board, copper, p, q, width, l, net)
    return True


def close_gaps(board, copper, first=(), skip=()):
    joined, failed = 0, []
    nets = list(board.GetNetsByNetcode().values())
    nets.sort(key=lambda n: (n.GetNetname() not in first, list(first).index(n.GetNetname())
                             if n.GetNetname() in first else 0))
    for net in nets:
        name = net.GetNetname()
        if not name or name.startswith("unconnected-") or name in skip:
            continue
        for _ in range(10):
            groups = clusters(board, net)
            if len(groups) < 2:
                break
            groups.sort(key=len, reverse=True)
            small = groups[1]
            lone_pad = (len(small) == 1 and small[0].Type() == pcbnew.PCB_PAD_T)
            if name == "GND":
                done = (ground_tie(board, copper, net, small, track_width(name)) or
                        join(board, copper, net, groups[0], small))
            else:
                done = (join(board, copper, net, groups[0], small) or
                        astar(board, copper, net, small, groups[0], track_width(name)) or
                        astar(board, copper, net, small, groups[0], track_width(name),
                              margin=MM(14), budget=900000) or
                        # long runs that must swing around a crowded area:
                        # a coarser grid over a wider box
                        astar(board, copper, net, small, groups[0], track_width(name),
                              step=MM(0.5), margin=MM(25), budget=2500000))
            if done:
                joined += 1
            else:
                failed.append(name)
                break
    return joined, failed


def dangling_tracks(board):
    """Tracks with an end that touches nothing else on its net."""
    conn = board.GetConnectivity()
    out = []
    for t in board.Tracks():
        if t.Type() == pcbnew.PCB_TRACE_T:
            try:
                if conn.TestTrackEndpointDangling(t, False):
                    out.append(t.m_Uuid.AsString())
            except TypeError:
                pass
    return out


def strip_nets(text, names):
    """Remove top-level segments, arcs and vias on the named nets."""
    if not names:
        return text
    tags = ['(net "%s")' % n for n in names]
    out, i, start, depth, block, n = [], 0, 0, 0, None, len(text)
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
                if chunk.startswith(("(segment", "(via", "(arc")) and any(t in chunk for t in tags):
                    out.append(text[start:text.rfind("\n", 0, block)])
                    start = i + 1
                block = None
            depth -= 1
        i += 1
    out.append(text[start:])
    return "".join(out)


def strip_uuids(text, uuids):
    """Remove top-level segments whose uuid is listed (text-level: removing
    through the API destabilises the zone filler)."""
    if not uuids:
        return text
    want = set(uuids)
    out, i, start, depth, block = [], 0, 0, 0, None
    n = len(text)
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
                if chunk.startswith("(segment") and any('"%s"' % u in chunk for u in want):
                    line = text.rfind("\n", 0, block)
                    out.append(text[start:line])
                    start = i + 1
                block = None
            depth -= 1
        i += 1
    out.append(text[start:])
    return "".join(out)


def main():
    args = sys.argv[1:]
    opt = lambda k: args[args.index(k) + 1].split(",") if k in args else []
    ripup, first, skip = opt("--ripup"), opt("--first"), opt("--skip")
    for item in opt("--thin"):
        name, width = item.split("=")
        THIN[name] = float(width)
    project = BOARD.with_suffix(".kicad_pro").read_bytes()
    if ripup:
        BOARD.write_text(strip_nets(BOARD.read_text(), ripup))
    board = pcbnew.LoadBoard(str(BOARD))
    global ROUTE_LAYERS
    if board.GetCopperLayerCount() == 4:          # F / In1 GND / In2 signal / B
        ROUTE_LAYERS = (pcbnew.F_Cu, pcbnew.In2_Cu, pcbnew.B_Cu)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    board.GetConnectivity().RecalculateRatsnest()
    copper = Copper(board)
    joined, failed = close_gaps(board, copper, first, skip)
    stitched = stitch(board, copper)
    board.BuildConnectivity()
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    board.GetConnectivity().RecalculateRatsnest()
    stubs = dangling_tracks(board)
    board.Save(str(BOARD))
    if stubs:
        BOARD.write_text(strip_uuids(BOARD.read_text(), stubs))
    BOARD.with_suffix(".kicad_pro").write_bytes(project)
    print("joined %d gaps, %d still open %s; %d stitching vias; %d stubs removed"
          % (joined, len(failed), failed, stitched, len(stubs)))


if __name__ == "__main__":
    main()
    sys.stdout.flush()
    os._exit(0)                  # pcbnew can crash while Python tears down
