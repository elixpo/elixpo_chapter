#!/usr/bin/env python3
# SPDX-License-Identifier: CERN-OHL-P-2.0
"""Write MSP2807.step, the 3D model of the badge's 2.8" ILI9341 SPI module.

    python3 circuit/elixpo/3d/make_msp2807_model.py

No licensed 3D model of the LCDwiki MSP2807 exists, so this script builds
one from the module's drawing: LCDwiki "LCM OUTLINE", SKU MSP2807, rev V1.0
(drawing date 2026-04-03), https://www.lcdwiki.com/res/MSP2807/MSP2807_Size.pdf
Every number below is from that drawing; the panel figures match the
panel's own data sheet (QD-TFT2803 specification v1.1, outline
50 x 69.2 mm, active area 43.2 x 57.6 mm).

The model is plain boxes and prisms: solids of planar faces bounded by
poly loops (holes are 48-sided), coloured per face, which kicad-cli (Open
CASCADE) reads for both the renders and the GLB. Standard library only.

- red module PCB, 50 x 86 x 1.6 mm, with the four 3.2 mm mounting holes
  (4.7 mm tinned rings) 3.00 mm in from the edges, 44.00 mm apart across
  and 76.08 mm apart along;
- the panel over the PCB's front: 0.50 mm back tape, the LCD with its
  backlight (2.30 mm) and the resistive touch panel (1.20 mm), all
  50.00 x 69.20 mm, 6.40 mm from the PCB's top edge; total 5.60 mm from
  the PCB's back face to the touch panel's face;
- the active area, 43.20 x 57.60 mm, 9.30 mm from the top edge and
  3.40 mm from the right edge (front view), drawn as a 0.005 mm skin on
  the touch panel so it shows;
- the 14-pin 2.54 mm male header on the back: pin 1 8.49 mm from the left
  edge (front view) and 2.00 mm up from the bottom edge, 2.54 mm of
  plastic, pins 0.64 mm square reaching 8.38 mm behind the PCB's back face
  (5.84 mm past the plastic) and 11.17 mm long in all.

Not modelled (too little of them is dimensioned on the drawing): the
microSD socket and the SMD parts on the module's back (2.20 mm max), the
four SD pads (J4), and the touch panel's pull tab.

Frame: millimetres; origin at the centre of header pin 1, on the PCB's
back face. +Z points out of the display face. +Y runs from pin 14 towards
pin 1 and on to the PCB edge 8.49 mm away; +X runs from the header across
the module towards its far edge (the SD pads). This is the frame of
KiCad's PinSocket_1x14_P2.54mm_Vertical, whose pins run along -Y from pin
1, so the model belongs to the header socket footprint (J3) with offset
(0, 0, H), H being the gap between the badge's front and the module's
back face: 11.0 mm, the length of the M3 standoffs in H1-H4 (BOM_COST.md),
which is also the 8.5 mm socket plus the header's 2.54 mm of plastic to
within the drawing's 0.2 mm tolerance.
"""
import math
from pathlib import Path

OUT = Path(__file__).resolve().parent / "MSP2807.step"

# ---- the drawing, in its front view: portrait, header at the bottom ----
# u: across the 50 mm width from the left edge; v: down the 86 mm length
# from the top edge; z: up from the PCB's back face.
PCB_W, PCB_L, PCB_T = 50.00, 86.00, 1.60
HOLE_D, RING_D, RING_T = 3.20, 4.70, 0.035
HOLES = [(u, v) for v in (3.00, 3.00 + 76.08) for u in (3.00, PCB_W - 3.00)]
PANEL_V0, PANEL_L = 6.40, 69.20          # touch panel and backlight outline, 50.00 wide
TAPE_T, LCD_T, TP_T = 0.50, 2.30, 1.20   # 1.60 + 0.50 + 2.30 + 1.20 = 5.60
AA = (PCB_W - 3.40 - 43.20, 9.30, 43.20, 57.60)   # u, v, width, length
PIN1 = (8.49, PCB_L - 2.00)              # u, v of header pin 1
PITCH, PINS = 2.54, 14
PIN_W = 0.64
HDR_PLASTIC = 8.38 - 5.84                # 2.54 mm
PIN_BELOW = 8.38                         # pin tip, behind the back face
PIN_LEN = 11.17                          # tip to tip
SKIN = 0.005

COLOURS = {                              # linear-ish RGB for the STEP styles
    "pcb": (0.62, 0.06, 0.06),           # red solder mask
    "tin": (0.80, 0.80, 0.82),
    "tape": (0.88, 0.88, 0.86),
    "backlight": (0.90, 0.90, 0.90),     # white backlight frame
    "glass": (0.025, 0.025, 0.03),       # touch panel over the black border
    "active": (0.09, 0.10, 0.12),        # the LCD's active area, switched off
    "plastic": (0.05, 0.05, 0.05),
    "gold": (0.83, 0.69, 0.36),
}


def to_model(u, v):
    """Front-view (u, v) to the model frame (X, Y)."""
    return PIN1[1] - v, PIN1[0] - u


# ----------------------------------------------------------- solids
def box(u0, v0, u1, v1, z0, z1):
    return prism([(u0, v0), (u1, v0), (u1, v1), (u0, v1)], z0, z1)


def circle(cu, cv, d, n=48):
    r = d / 2
    return [(cu + r * math.cos(2 * math.pi * k / n), cv + r * math.sin(2 * math.pi * k / n))
            for k in range(n)]


def prism(outer, z0, z1, holes=()):
    """A vertical prism: an outline (with holes) in the (u, v) plane, z0..z1.
    Returns faces as lists of loops; each loop is a list of (X, Y, Z),
    counter-clockwise seen from outside the solid (outer loop first)."""
    def xy(loop):
        return [to_model(u, v) for u, v in loop]

    def area(loop):
        return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(loop, loop[1:] + loop[:1])) / 2

    o = xy(outer)
    if area(o) < 0:
        o = o[::-1]                       # outer loop CCW in X, Y
    hs = []
    for h in holes:
        h = xy(h)
        if area(h) > 0:
            h = h[::-1]                   # holes CW in X, Y
        hs.append(h)
    faces = []
    faces.append([[(x, y, z1) for x, y in o]] + [[(x, y, z1) for x, y in h] for h in hs])
    faces.append([[(x, y, z0) for x, y in o[::-1]]] + [[(x, y, z0) for x, y in h[::-1]] for h in hs])
    for loop in [o] + hs:                 # side walls: outward for both
        for (xa, ya), (xb, yb) in zip(loop, loop[1:] + loop[:1]):
            faces.append([[(xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1)]])
    return faces


def annulus(cu, cv, d_in, d_out, z0, z1):
    return prism(circle(cu, cv, d_out), z0, z1, holes=[circle(cu, cv, d_in)])


def parts():
    """(name, colour, faces) for every solid."""
    out = []
    pcb_outline = [(0, 0), (PCB_W, 0), (PCB_W, PCB_L), (0, PCB_L)]
    out.append(("module PCB", "pcb", prism(pcb_outline, 0.0, PCB_T,
                                           holes=[circle(u, v, HOLE_D) for u, v in HOLES])))
    for i, (u, v) in enumerate(HOLES, 1):
        out.append((f"hole ring {i} front", "tin", annulus(u, v, HOLE_D, RING_D, PCB_T, PCB_T + RING_T)))
        out.append((f"hole ring {i} back", "tin", annulus(u, v, HOLE_D, RING_D, -RING_T, 0.0)))
    z = PCB_T
    v0, v1 = PANEL_V0, PANEL_V0 + PANEL_L
    out.append(("back tape", "tape", box(0, v0, PCB_W, v1, z, z + TAPE_T)))
    z += TAPE_T
    out.append(("LCD and backlight", "backlight", box(0, v0, PCB_W, v1, z, z + LCD_T)))
    z += LCD_T
    out.append(("touch panel", "glass", box(0, v0, PCB_W, v1, z, z + TP_T)))
    z += TP_T
    au, av, aw, al = AA
    out.append(("active area", "active", box(au, av, au + aw, av + al, z - SKIN, z + SKIN)))
    pu, pv = PIN1
    h = PITCH / 2
    out.append(("header plastic", "plastic",
                box(pu - h, pv - h, pu + (PINS - 1) * PITCH + h, pv + h, -HDR_PLASTIC, 0.0)))
    w = PIN_W / 2
    for n in range(PINS):
        u = pu + n * PITCH
        out.append((f"header pin {n + 1}", "gold",
                    box(u - w, pv - w, u + w, pv + w, -PIN_BELOW, -PIN_BELOW + PIN_LEN)))
    return out


# ----------------------------------------------------------- STEP writer
class Step:
    def __init__(self):
        self.lines = []

    def add(self, text):
        self.lines.append(text)
        return f"#{len(self.lines)}"

    def pt(self, p):
        return self.add("CARTESIAN_POINT('',(%s));" % ",".join(f"{c:.6f}" for c in p))


def normal(loop):
    nx = ny = nz = 0.0
    for (x0, y0, z0), (x1, y1, z1) in zip(loop, loop[1:] + loop[:1]):
        nx += (y0 - y1) * (z0 + z1)
        ny += (z0 - z1) * (x0 + x1)
        nz += (x0 - x1) * (y0 + y1)
    m = (nx * nx + ny * ny + nz * nz) ** 0.5
    return nx / m, ny / m, nz / m


def write(path):
    s = Step()
    ctx_app = s.add("APPLICATION_CONTEXT('core data for automotive mechanical design processes');")
    s.add(f"APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,{ctx_app});")
    pctx = s.add(f"PRODUCT_CONTEXT('',{ctx_app},'mechanical');")
    prod = s.add(f"PRODUCT('MSP2807','MSP2807 2.8in ILI9341 SPI module','',({pctx}));")
    pdf = s.add(f"PRODUCT_DEFINITION_FORMATION('','',{prod});")
    pdctx = s.add(f"PRODUCT_DEFINITION_CONTEXT('part definition',{ctx_app},'design');")
    pd = s.add(f"PRODUCT_DEFINITION('design','',{pdf},{pdctx});")
    pds = s.add(f"PRODUCT_DEFINITION_SHAPE('','',{pd});")
    lu = s.add("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));")
    au = s.add("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));")
    su = s.add("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());")
    unc = s.add(f"UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),{lu},'distance_accuracy_value','confusion accuracy');")
    gctx = s.add(f"(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT(({unc}))"
                 f"GLOBAL_UNIT_ASSIGNED_CONTEXT(({lu},{au},{su}))REPRESENTATION_CONTEXT('',''));")
    o = s.pt((0, 0, 0))
    dz = s.add("DIRECTION('',(0.,0.,1.));")
    dx = s.add("DIRECTION('',(1.,0.,0.));")
    origin = s.add(f"AXIS2_PLACEMENT_3D('',{o},{dz},{dx});")

    styles = {}
    breps, styled = [], []
    for name, colour, faces in parts():
        face_refs = []
        for loops in faces:
            bounds = []
            for i, loop in enumerate(loops):
                pts = [s.pt(p) for p in loop]
                pl = s.add("POLY_LOOP('',(%s));" % ",".join(pts))
                kind = "FACE_OUTER_BOUND" if i == 0 else "FACE_BOUND"
                bounds.append(s.add(f"{kind}('',{pl},.T.);"))
            n = normal(loops[0])
            a = (1.0, 0.0, 0.0) if abs(n[0]) < 0.9 else (0.0, 1.0, 0.0)
            # reference direction: any unit vector perpendicular to the normal
            rx = (a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0])
            m = sum(c * c for c in rx) ** 0.5
            rx = tuple(c / m for c in rx)
            p0 = s.pt(loops[0][0])
            dn = s.add("DIRECTION('',(%s));" % ",".join(f"{c:.6f}" for c in n))
            dr = s.add("DIRECTION('',(%s));" % ",".join(f"{c:.6f}" for c in rx))
            ax = s.add(f"AXIS2_PLACEMENT_3D('',{p0},{dn},{dr});")
            plane = s.add(f"PLANE('',{ax});")
            face_refs.append(s.add(f"FACE_SURFACE('',({','.join(bounds)}),{plane},.T.);"))
        shell = s.add(f"CLOSED_SHELL('',({','.join(face_refs)}));")
        brep = s.add(f"MANIFOLD_SOLID_BREP('{name}',{shell});")
        breps.append(brep)
        if colour not in styles:
            r, g, b = COLOURS[colour]
            c = s.add(f"COLOUR_RGB('{colour}',{r:.4f},{g:.4f},{b:.4f});")
            fac = s.add(f"FILL_AREA_STYLE_COLOUR('',{c});")
            fas = s.add(f"FILL_AREA_STYLE('',({fac}));")
            ssfa = s.add(f"SURFACE_STYLE_FILL_AREA({fas});")
            sss = s.add(f"SURFACE_SIDE_STYLE('',({ssfa}));")
            ssu = s.add(f"SURFACE_STYLE_USAGE(.BOTH.,{sss});")
            styles[colour] = s.add(f"PRESENTATION_STYLE_ASSIGNMENT(({ssu}));")
        # Styled per face, as KiCad's own models are: KiCad's loader
        # ignores a colour set on the solid alone.
        for f in face_refs:
            styled.append(s.add(f"STYLED_ITEM('color',({styles[colour]}),{f});"))
    rep = s.add(f"ADVANCED_BREP_SHAPE_REPRESENTATION('MSP2807',({origin},{','.join(breps)}),{gctx});")
    s.add(f"SHAPE_DEFINITION_REPRESENTATION({pds},{rep});")
    s.add(f"MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',({','.join(styled)}),{gctx});")

    head = ("ISO-10303-21;\nHEADER;\n"
            "FILE_DESCRIPTION(('MSP2807 2.8in ILI9341 SPI module, from the LCDwiki MSP2807 outline drawing V1.0'),'2;1');\n"
            "FILE_NAME('MSP2807.step','2026-11-22T00:00:00',('Falera badge'),('Elixpo'),"
            "'make_msp2807_model.py','make_msp2807_model.py','');\n"
            "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n")
    body = "".join(f"#{i}={line}\n" for i, line in enumerate(s.lines, 1))
    path.write_text(head + body + "ENDSEC;\nEND-ISO-10303-21;\n")


if __name__ == "__main__":
    write(OUT)
    print(f"{OUT} ({OUT.stat().st_size / 1e3:.0f} kB)")
