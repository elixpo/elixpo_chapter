#!/usr/bin/python3
"""Autoroute elixpo.kicad_pcb with Freerouting and pour the planes again.

    /usr/bin/python3 circuit/elixpo/route_badge_pcb.py [path/to/freerouting.jar] [passes]
    /usr/bin/python3 circuit/elixpo/route_badge_pcb.py --import-only

Use the system Python that ships KiCad's pcbnew module, not a virtualenv.
--import-only skips steps 1 and 2 and imports an existing build/route.ses.

1. Exports a Specctra DSN from a copy of the board without the ground fills
   on the outer layers (Freerouting treats any fill as an obstacle for other
   nets). The GND and 3.3 V planes on In1 and In2 stay, and pads reach them
   through vias.
2. Runs Freerouting headless and writes build/route.ses.
3. Imports the session into elixpo.kicad_pcb, refills every zone and saves.

Run it after generate_badge_pcb.py; running generate_badge_pcb.py again
discards the tracks.
"""

import subprocess
import sys
from pathlib import Path

if sys.prefix != sys.base_prefix:
    raise SystemExit("Run this with /usr/bin/python3, not inside a virtualenv: "
                     "KiCad's pcbnew module comes from the system Python.")
sys.path.insert(0, "/usr/lib/python3/dist-packages")
import pcbnew  # noqa: E402

HERE = Path(__file__).resolve().parent
BOARD = HERE / "elixpo.kicad_pcb"
BUILD = HERE / "build"
DSN = BUILD / "route.dsn"
SES = BUILD / "route.ses"
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
IMPORT_ONLY = "--import-only" in sys.argv
JAR = Path(ARGS[0]) if ARGS else Path.home() / "src/freerouting-2.5.0/freerouting-2.5.0.jar"
PASSES = ARGS[1] if len(ARGS) > 1 else "40"


def export_dsn():
    board = pcbnew.LoadBoard(str(BOARD))
    for zone in list(board.Zones()):
        if not zone.GetIsRuleArea() and zone.GetLayer() in (pcbnew.F_Cu, pcbnew.B_Cu):
            board.Remove(zone)
    BUILD.mkdir(exist_ok=True)
    if not pcbnew.ExportSpecctraDSN(board, str(DSN)):
        raise SystemExit("DSN export failed")
    # In1 (and In4 on six layers) are solid ground planes: mark them as power
    # layers so Freerouting routes only on the signal layers and never cuts
    # a slot in a return plane.
    import re
    text = DSN.read_text()
    planes = ("In1.Cu", "In4.Cu") if "(layer In4.Cu" in text else ("In1.Cu",)
    for layer in planes:
        text, n = re.subn(r"(\(layer %s\s*\(type )signal" % re.escape(layer), r"\1power", text)
        if n != 1:
            raise SystemExit("could not mark %s as a plane in the DSN" % layer)
    DSN.write_text(text)


def route():
    SES.unlink(missing_ok=True)
    cmd = ["java", "-jar", str(JAR), "-de", str(DSN), "-do", str(SES), "-mp", PASSES,
           "--gui.enabled=false"]
    print(" ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)
    if not SES.exists():
        raise SystemExit("Freerouting wrote no session file")


def _sexpr(text):
    import re
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


def _find(node, key):
    return [c for c in node if isinstance(c, list) and c and c[0] == key]


def _without_tracks(text):
    """The board file with its top-level segment, arc and via blocks removed
    (everything else, footprints and zones included, kept byte for byte)."""
    out, depth, i, start, n = [], 0, 0, 0, len(text)
    block_start = None
    while i < n:
        c = text[i]
        if c == '"':
            i = text.index('"', i + 1)          # strings never hold structure
            while text[i - 1] == "\\":
                i = text.index('"', i + 1)
        elif c == "(":
            depth += 1
            if depth == 2:
                block_start = i
        elif c == ")":
            if depth == 2 and block_start is not None:
                head = text[block_start + 1:block_start + 8]
                if head.startswith(("segment", "via", "arc")):
                    line = text.rfind("\n", 0, block_start)
                    out.append(text[start:line])
                    start = i + 1
                block_start = None
            depth -= 1
        i += 1
    out.append(text[start:])
    return "".join(out)


def import_ses():
    """Read Freerouting's session file and add its wires and vias.
    (KiCad's own ImportSpecctraSES needs the editor window.) Session
    coordinates are in the resolution unit (0.1 um) with y pointing up."""
    import re
    ses = _sexpr(SES.read_text())
    routes = _find(ses, "routes")[0]
    res = _find(routes, "resolution")[0]
    scale = {"um": 1000, "mm": 1000000, "mil": 25400}[res[1]] // int(res[2])   # nm per unit

    def at(x, y):
        return pcbnew.VECTOR2I(int(float(x) * scale), int(-float(y) * scale))

    pads = {}
    for lib in _find(routes, "library_out"):
        for ps in _find(lib, "padstack"):
            m = re.search(r"(\d+):(\d+)_um", ps[1])
            if m:
                pads[ps[1]] = (int(m.group(1)) * 1000, int(m.group(2)) * 1000)

    # Drop the old tracks in the file itself: removing them through the API
    # leaves dangling objects that crash the zone filler.
    # The copy sits next to copies of the project and rules files, or KiCad
    # would load it (and save it) with default net classes.
    import shutil
    stripped = BUILD / "route_input.kicad_pcb"
    stripped.write_text(_without_tracks(BOARD.read_text()))
    for ext in (".kicad_pro", ".kicad_dru"):
        shutil.copyfile(BOARD.with_suffix(ext), stripped.with_suffix(ext))
    project = BOARD.with_suffix(".kicad_pro").read_bytes()
    board = pcbnew.LoadBoard(str(stripped))
    layers = {board.GetLayerName(l): l for l in board.GetEnabledLayers().CuStack()}
    n_tracks = n_vias = 0
    for net_node in _find(_find(routes, "network_out")[0], "net"):
        net = board.FindNet(net_node[1])
        if net is None:
            continue
        for wire in _find(net_node, "wire"):
            for path in _find(wire, "path"):
                layer, width, pts = layers[path[1]], int(float(path[2]) * scale), path[3:]
                xy = [at(pts[i], pts[i + 1]) for i in range(0, len(pts) - 1, 2)]
                for p0, p1 in zip(xy, xy[1:]):
                    if p0 == p1:
                        continue
                    t = pcbnew.PCB_TRACK(board)
                    t.SetStart(p0)
                    t.SetEnd(p1)
                    t.SetWidth(width)
                    t.SetLayer(layer)
                    t.SetNet(net)
                    board.Add(t)
                    n_tracks += 1
        for via in _find(net_node, "via"):
            dia, drill = pads.get(via[1], (600000, 300000))
            v = pcbnew.PCB_VIA(board)
            v.SetPosition(at(via[2], via[3]))
            v.SetWidth(dia)
            v.SetDrill(drill)
            v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
            v.SetNet(net)
            board.Add(v)
            n_vias += 1
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    board.Save(str(BOARD))
    BOARD.with_suffix(".kicad_pro").write_bytes(project)    # never let a save change the rules
    print(f"Imported {n_tracks} track segments and {n_vias} vias into {BOARD}")


if __name__ == "__main__":
    import os
    if IMPORT_ONLY:
        import_ses()
        sys.stdout.flush()
        os._exit(0)             # pcbnew can crash while Python tears down
    else:
        export_dsn()
        route()
        # A second LoadBoard in this process crashes pcbnew, so the import
        # runs in a fresh one.
        subprocess.run([sys.executable, __file__, "--import-only"], check=True)
        sys.stdout.flush()
        os._exit(0)
