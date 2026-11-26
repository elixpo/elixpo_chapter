#!/usr/bin/env python3
"""Draw the base plane for the Falera Badge's front name card.

The name card is the printed photo-paper card on the front of the badge, in
the band between the board's top edge and the top of the LCD module. It wraps
around the IR receiver (U8) and the IR LED (D10) on the right edge, and stays
clear of the two lanyard slots.

Every number comes from ../../elixpo/elixpo.kicad_pcb (KiCad 10, read with
pcbnew on 2026-11-22). Board coordinates are in mm, y pointing down; the
card's origin (0, 0) is the board's top-left corner (board x 40, y 30).

Writes, into template/:
  name-card.svg         1:1 in millimetres: cut line, cut-outs, guides, dimensions
  name-card-print.svg   the cut line and cut-outs only, for a print template
  name-card-mask.svg    the card's shape as a filled mask (holes cut out), used
                        by the HTML card designs in cards/ to clip the artwork
  name-card-cut.svg     the cut line with the fold-back tab, and the fold line
                        (cards/ draw it for printing)

Run: python3 make_name_card.py
"""

from pathlib import Path

HERE = Path(__file__).resolve().parent

# ── Board, in board coordinates (mm) ─────────────────────────────────────
BOARD_X0, BOARD_Y0 = 40.0, 30.0     # top-left of Edge.Cuts
BOARD_W = 88.0                      # 40 → 128
CORNER_R = 3.0                      # board corner radius
LCD_TOP = 90.0                      # F.Fab outline of the 2.8" LCD module (41–127 × 90–140)

# Lanyard slots (Edge.Cuts stadiums): x span, y span, end radius.
SLOTS = [((43.2, 56.8), (33.85, 37.15)), ((111.2, 124.8), (33.85, 37.15))]

# Parts the card must wrap around (front courtyards).
U8_IR_RECEIVER = ((122.25, 127.69), (50.30, 57.77))   # TSOP38238, MINICAST body
D10_IR_LED = ((115.17, 119.83), (53.83, 56.17))       # 940 nm, 1206

# Guides only (the card may cover them; marked so the design can avoid them).
SPEAKER_GRILLE = ((111.40, 124.90), (39.10, 49.90))   # G1, holes through to LS1
CORNER_LEDS = [((42.83, 44.38), (39.48, 42.52)), ((125.62, 127.17), (37.48, 40.52))]  # D1, D2

# ── Card ─────────────────────────────────────────────────────────────────
CLEAR = 0.5                 # clearance around every cut-out
CARD_H = LCD_TOP - BOARD_Y0 - CLEAR   # stops 0.5 mm above the LCD module
INNER_R = 1.0               # radius on the IR notch's inside corners
# Fold-back tab under the bottom edge (1.5 cm of extra paper): folded back
# along the dashed line, it props the card's lower end off the board, so the
# card sits at an angle and the paper doesn't lie on the speaker grille. It
# folds under the card, so the card's footprint doesn't change.
TAB = 15.0                  # depth below the bottom edge: folded back, it sets the card's lift
TAB_INSET = 2.0             # in from each side
TAB_R = 1.0                 # its outer corners


def c(x, y):
    """Board → card coordinates."""
    return round(x - BOARD_X0, 3), round(y - BOARD_Y0, 3)


def stadium(x0, x1, y0, y1):
    r = (y1 - y0) / 2
    return (f"M{x0 + r:.3f},{y0:.3f} H{x1 - r:.3f} A{r:.3f},{r:.3f} 0 0 1 {x1 - r:.3f},{y1:.3f} "
            f"H{x0 + r:.3f} A{r:.3f},{r:.3f} 0 0 1 {x0 + r:.3f},{y0:.3f} Z")


def card_outline(tab=False):
    """The card's outer edge, with the IR notch cut from its right side, and
    with tab=True the fold-back tab below the bottom edge.

    The notch covers U8 and D10 together: they sit 1.4 mm apart, too close
    for a strip of paper between them to survive."""
    w, h, r = BOARD_W, CARD_H, CORNER_R
    nx0 = c(D10_IR_LED[0][0], 0)[0] - CLEAR                  # notch left edge
    ny0 = c(0, min(U8_IR_RECEIVER[1][0], D10_IR_LED[1][0]))[1] - CLEAR
    ny1 = c(0, max(U8_IR_RECEIVER[1][1], D10_IR_LED[1][1]))[1] + CLEAR
    ir = INNER_R
    return (
        f"M{r},0 H{w - r} A{r},{r} 0 0 1 {w},{r} "
        f"V{ny0:.3f} H{nx0 + ir:.3f} A{ir},{ir} 0 0 0 {nx0:.3f},{ny0 + ir:.3f} "
        f"V{ny1 - ir:.3f} A{ir},{ir} 0 0 0 {nx0 + ir:.3f},{ny1:.3f} H{w} "
        + (f"V{h} H{w - TAB_INSET} V{h + TAB - TAB_R} A{TAB_R},{TAB_R} 0 0 1 {w - TAB_INSET - TAB_R},{h + TAB} "
           f"H{TAB_INSET + TAB_R} A{TAB_R},{TAB_R} 0 0 1 {TAB_INSET},{h + TAB - TAB_R} V{h} " if tab else f"V{h} ")
        + f"H0 V{r} A{r},{r} 0 0 1 {r},0 Z"
    ), (nx0, ny0, ny1)


def slot_paths():
    out = []
    for (xa, xb), (ya, yb) in SLOTS:
        x0, y0 = c(xa, ya)
        x1, y1 = c(xb, yb)
        out.append(stadium(x0 - CLEAR, x1 + CLEAR, y0 - CLEAR, y1 + CLEAR))
    return out


def rect(b, cls, label=None):
    (xa, xb), (ya, yb) = b
    x0, y0 = c(xa, ya)
    x1, y1 = c(xb, yb)
    s = f'<rect class="{cls}" x="{x0}" y="{y0}" width="{x1 - x0:.3f}" height="{y1 - y0:.3f}" rx="0.4"/>'
    if label:
        s += f'<text class="lab" x="{(x0 + x1) / 2:.2f}" y="{(y0 + y1) / 2:.2f}">{label}</text>'
    return s


def box(b, clear=0.0):
    """A board-coordinate box → card (x0, y0, x1, y1), optionally grown."""
    (xa, xb), (ya, yb) = b
    x0, y0 = c(xa, ya)
    x1, y1 = c(xb, yb)
    return x0 - clear, y0 - clear, x1 + clear, y1 + clear


def hdim(x0, x1, y, label, above=True):
    """Horizontal dimension line with end ticks and a centred label."""
    t = -0.8 if above else 2.0
    return (f'<g class="dl"><line x1="{x0:.3f}" y1="{y:.3f}" x2="{x1:.3f}" y2="{y:.3f}"/>'
            f'<line x1="{x0:.3f}" y1="{y - 0.9:.3f}" x2="{x0:.3f}" y2="{y + 0.9:.3f}"/>'
            f'<line x1="{x1:.3f}" y1="{y - 0.9:.3f}" x2="{x1:.3f}" y2="{y + 0.9:.3f}"/></g>'
            f'<text class="dt" x="{(x0 + x1) / 2:.3f}" y="{y + t:.3f}">{label}</text>')


def vdim(y0, y1, x, label, left=True):
    """Vertical dimension line with end ticks and a rotated label."""
    tx = x - 0.8 if left else x + 0.8
    my = (y0 + y1) / 2
    return (f'<g class="dl"><line x1="{x:.3f}" y1="{y0:.3f}" x2="{x:.3f}" y2="{y1:.3f}"/>'
            f'<line x1="{x - 0.9:.3f}" y1="{y0:.3f}" x2="{x + 0.9:.3f}" y2="{y0:.3f}"/>'
            f'<line x1="{x - 0.9:.3f}" y1="{y1:.3f}" x2="{x + 0.9:.3f}" y2="{y1:.3f}"/></g>'
            f'<text class="dt" x="{tx:.3f}" y="{my:.3f}" transform="rotate(-90 {tx:.3f} {my:.3f})">{label}</text>')


def features():
    """Every cut-out and guide in card millimetres: (name, x0, y0, x1, y1, note)."""
    outline, (nx0, ny0, ny1) = card_outline()
    rows = [("Card", 0.0, 0.0, BOARD_W, CARD_H, "cut line; top corners r 3.0")]
    for name, sl in zip(("Lanyard slot, left", "Lanyard slot, right"), SLOTS):
        x0, y0, x1, y1 = box(sl, CLEAR)
        rows.append((name, x0, y0, x1, y1, f"cut; round ends r {(y1 - y0) / 2:.2f}"))
    rows.append(("IR notch (rx + tx)", nx0, ny0, BOARD_W, ny1, f"cut, open to the right edge; inner corners r {INNER_R}"))
    rows.append(("IR receiver U8 (body)", *box(U8_IR_RECEIVER), "inside the notch"))
    rows.append(("IR LED D10", *box(D10_IR_LED), "inside the notch"))
    rows.append(("Speaker grille G1", *box(SPEAKER_GRILLE), "covered by the card; keep artwork light"))
    for name, led in zip(("Corner LED D1", "Corner LED D2"), CORNER_LEDS):
        rows.append((name, *box(led), "covered; light shows through paper"))
    rows.append(("Fold-back tab", TAB_INSET, CARD_H, BOARD_W - TAB_INSET, CARD_H + TAB,
                 f"fold back on the dashed line: props the card up; corners r {TAB_R:g}"))
    sx1 = c(SPEAKER_GRILLE[0][0], 0)[0] - CLEAR - 2
    sy0 = c(0, SLOTS[0][1][1])[1] + CLEAR + 2
    rows.append(("Artwork safe area", 2.0, sy0, sx1, CARD_H - 2, "keep text and faces inside"))
    return rows


def build(guides=True):
    outline, (nx0, ny0, ny1) = card_outline()
    w, h = BOARD_W, CARD_H
    style = """
    .cut   { fill: #ffffff; stroke: #c93a45; stroke-width: 0.25; }
    .fold  { stroke: #c93a45; stroke-width: 0.2; stroke-dasharray: 1 0.7; }
    .guide { fill: none; stroke: #1d2420; stroke-width: 0.15; stroke-dasharray: 0.8 0.6; opacity: 0.55; }
    .safe  { fill: none; stroke: #2e7d5b; stroke-width: 0.15; stroke-dasharray: 0.4 0.4; }
    .lab   { font: 1.3px Arial, sans-serif; fill: #1d2420; text-anchor: middle; dominant-baseline: middle; }
    .dl line { stroke: #1d4fa0; stroke-width: 0.12; }
    .dt    { font: 1.15px Arial, sans-serif; fill: #1d4fa0; text-anchor: middle; }
    .th    { font: bold 1.5px Arial, sans-serif; fill: #1d2420; }
    .td    { font: 1.3px Arial, sans-serif; fill: #1d2420; }
    .tn    { font: 1.15px Arial, sans-serif; fill: #6b756f; }
    """
    tabbed, _ = card_outline(tab=True)
    body = [f'<path class="cut" fill-rule="evenodd" d="{tabbed} {" ".join(slot_paths())}"/>',
            f'<line class="fold" x1="{TAB_INSET}" y1="{h}" x2="{w - TAB_INSET}" y2="{h}"/>']
    extra_h = 0
    if guides:
        rows = features()
        sa = rows[-1]
        body.append(f'<rect class="safe" x="{sa[1]:.2f}" y="{sa[2]:.2f}" width="{sa[3] - sa[1]:.2f}" height="{sa[4] - sa[2]:.2f}"/>')
        for r in rows[4:9]:
            body.append(f'<rect class="guide" x="{r[1]:.3f}" y="{r[2]:.3f}" width="{r[3] - r[1]:.3f}" height="{r[4] - r[2]:.3f}" rx="0.3"/>')
        # Feature labels with their size, inside or beside each one.
        body.append(f'<text class="lab" x="{(rows[6][1] + rows[6][3]) / 2:.2f}" y="{rows[6][2] + 3.2:.2f}">speaker grille</text>')
        body.append(f'<text class="lab" x="{(rows[6][1] + rows[6][3]) / 2:.2f}" y="{rows[6][2] + 5:.2f}">13.5 × 10.8</text>')
        body.append(f'<text class="lab" x="{(rows[4][1] + rows[4][3]) / 2:.2f}" y="{rows[4][2] + 2.6:.2f}">IR rx</text>')
        body.append(f'<text class="lab" x="{(rows[4][1] + rows[4][3]) / 2:.2f}" y="{rows[4][2] + 4.2:.2f}">5.4 × 7.5</text>')
        body.append(f'<text class="lab" x="{(rows[5][1] + rows[5][3]) / 2:.2f}" y="{rows[5][2] - 2.4:.2f}">IR tx</text>')
        body.append(f'<text class="lab" x="{(rows[5][1] + rows[5][3]) / 2:.2f}" y="{rows[5][2] - 1.0:.2f}">4.7 × 2.3</text>')
        body.append(f'<text class="lab" x="{(sa[1] + sa[3]) / 2:.2f}" y="{(sa[2] + sa[4]) / 2:.2f}">artwork safe area  {sa[3] - sa[1]:.1f} × {sa[4] - sa[2]:.1f}</text>')
        # Dimension lines.
        body.append(hdim(0, w, -2.4, f"{w:.1f}"))
        body.append(vdim(0, h, -2.4, f"{h:.1f}"))
        ls, rs = rows[1], rows[2]
        body.append(hdim(ls[1], ls[3], ls[2] - 0.9, f"{ls[3] - ls[1]:.1f}"))
        body.append(hdim(0, ls[1], ls[4] + 1.4, f"{ls[1]:.1f}", above=False))
        body.append(hdim(rs[1], rs[3], rs[2] - 0.9, f"{rs[3] - rs[1]:.1f}"))
        body.append(hdim(rs[3], w, rs[4] + 1.4, f"{w - rs[3]:.1f}", above=False))
        body.append(vdim(0, ls[2], ls[1] - 1.2, f"{ls[2]:.2f}"))
        body.append(vdim(ls[2], ls[4], ls[3] + 1.4, f"{ls[4] - ls[2]:.1f}", left=False))
        nt = rows[3]
        body.append(hdim(nt[1], w, nt[4] + 2.0, f"notch {w - nt[1]:.2f}", above=False))
        body.append(vdim(nt[2], nt[4], w + 2.4, f"{nt[4] - nt[2]:.2f}", left=False))
        body.append(vdim(0, nt[2], w + 4.6, f"{nt[2]:.2f}", left=False))
        body.append(vdim(nt[4], h, w + 2.4, f"{h - nt[4]:.2f}", left=False))
        body.append(f'<text class="lab" x="{w / 2}" y="{h + TAB / 2}">fold back here (dashed): {TAB:g} mm of paper props the card up</text>')
        body.append(vdim(h, h + TAB, -2.4, f"{TAB:g}"))
        body.append(f'<line class="guide" x1="0" y1="{LCD_TOP - BOARD_Y0}" x2="{w}" y2="{LCD_TOP - BOARD_Y0}"/>')
        body.append(f'<text class="lab" x="{w / 2}" y="{h + TAB + 1.8}">grey dashes at y 60.0: the LCD module\'s top edge, 0.5 below the card (the tab folds under the card)</text>')
        # Dimension table under the drawing.
        ty = h + TAB + 6
        body.append(f'<text class="th" x="0" y="{ty}">All dimensions in mm, from the card\'s top-left corner (x right, y down). Cut-outs include 0.5 clearance.</text>')
        cols = [0, 26, 37, 48, 59, 70, 79]
        heads = ["Feature", "x", "y", "width", "height", "", "Note"]
        ty += 3
        for cx, hd in zip(cols, ["Feature", "x", "y", "width", "height"]):
            body.append(f'<text class="th" x="{cx}" y="{ty}">{hd}</text>')
        body.append(f'<text class="th" x="{cols[5]}" y="{ty}">Note</text>')
        for r in rows:
            ty += 2.3
            name, x0, y0, x1, y1, note = r
            vals = [name, f"{x0:.2f}", f"{y0:.2f}", f"{x1 - x0:.2f}", f"{y1 - y0:.2f}"]
            for cx, v in zip(cols, vals):
                body.append(f'<text class="td" x="{cx}" y="{ty}">{v}</text>')
            body.append(f'<text class="tn" x="{cols[5]}" y="{ty}">{note}</text>')
        extra_h = ty - h + 2
    pad = 7 if guides else 0
    if not guides:
        extra_h = TAB
    H = h + 2 * pad + extra_h
    vb = f"{-pad} {-pad} {w + 2 * pad + (3 if guides else 0)} {H}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w + 2 * pad + (3 if guides else 0)}mm" '
            f'height="{H}mm" viewBox="{vb}">\n'
            f'<title>Falera Badge name card, 1:1 (mm)</title>\n<style>{style}</style>\n'
            + "\n".join(body) + "\n</svg>\n")


def cutline():
    """The cut line with the tab, and the fold line, viewBox in mm (for cards/)."""
    tabbed, _ = card_outline(tab=True)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {BOARD_W} {CARD_H + TAB}" '
            f'width="{BOARD_W}mm" height="{CARD_H + TAB}mm">'
            f'<path class="cut" fill="none" stroke="#000" stroke-width="0.2" fill-rule="evenodd" d="{tabbed} {" ".join(slot_paths())}"/>'
            f'<line class="fold" x1="{TAB_INSET}" y1="{CARD_H}" x2="{BOARD_W - TAB_INSET}" y2="{CARD_H}" '
            f'stroke="#000" stroke-width="0.2" stroke-dasharray="1 0.7"/></svg>\n')


def mask():
    """The card as one white shape with the cut-outs as holes, viewBox in mm."""
    outline, _ = card_outline()
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {BOARD_W} {CARD_H}" '
            f'width="{BOARD_W}mm" height="{CARD_H}mm" preserveAspectRatio="none">'
            f'<path fill="#fff" fill-rule="evenodd" d="{outline} {" ".join(slot_paths())}"/></svg>\n')


if __name__ == "__main__":
    out = HERE / "template"
    out.mkdir(exist_ok=True)
    (out / "name-card.svg").write_text(build(guides=True))
    (out / "name-card-print.svg").write_text(build(guides=False))
    (out / "name-card-mask.svg").write_text(mask())
    (out / "name-card-cut.svg").write_text(cutline())
    _, (nx0, ny0, ny1) = card_outline()
    print(f"card {BOARD_W:.1f} x {CARD_H:.1f} mm; IR notch from x={nx0:.2f} to the right edge, "
          f"y={ny0:.2f}..{ny1:.2f} mm")
