#!/usr/bin/env python3
"""Render the poster's hero image: the badge from above at an angle, with
Ayushman's name card and the lanyard, at 3000 x 3000 px on a transparent
background (assets/hero.png).

It reuses circuit/elixpo/render_board.py's board, card and lanyard models,
with the same camera as its top-angle render, just larger. Needs kicad-cli 10.

Run: python3 render_hero.py
"""
import subprocess
import sys
import tempfile
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "circuit" / "elixpo"))
import render_board as rb  # noqa: E402

SIZE = 3000


def main():
    a = types.SimpleNamespace(card="Circuit-Overtime", lanyard=True, lanyard_theme="paper",
                              battery=False, renders=True, glb=False)
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        raw = rb.export_raw(tmp)
        extras = rb.build_extras(a, raw, tmp)
        board = rb.board_with_extras(tmp, rb.render_extras(tmp, extras))
        out = HERE / "assets" / "hero.png"
        subprocess.run(["kicad-cli", "pcb", "render", "--use-board-stackup-colors", "--quality", "high",
                        "--background", "transparent", "-w", str(SIZE), "-h", str(SIZE), "--perspective",
                        "--rotate", "-40,0,30", "--zoom", "0.72", "-o", str(out), str(board)],
                       check=True, stdout=subprocess.DEVNULL)
        print(out)


if __name__ == "__main__":
    main()
