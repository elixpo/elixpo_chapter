#!/usr/bin/env python3
"""Falera Badge lanyard: print artwork and a preview.

The strap is 12 mm wide (the badge's lanyard slots are 13.6 x 3.3 mm, so a
12 mm strap and its fold fit through them). It is printed on one side, 950 mm
long: 900 mm shows, and 25 mm at each end folds through a slot and is sewn.

The pattern repeats along the strap and turns 180 degrees at the middle, so
when the lanyard is worn both sides read the same way, from the badge up.

Writes:
    lanyard-print-<theme>.svg          the artwork, 950 x 12 mm (for the printer)
    renders/lanyard-print-<theme>.pdf  the same as a PDF at 950 x 12 mm
    renders/preview-<handle>.png       each person's card on the badge, with the
                                       strap in their card's theme (people.json)
    renders/themes.png                 110-330 mm of every theme, stacked
    renders/previews.png               everyone side by side
    lanyard-guides.svg                 the artwork with the fold, sew and centre lines

Themes (THEMES below): faint grounds from the Elixpo palette, paper, butter
(yellow), blush (red) and bamboo (green), all in the card's ink and red.

Run: python3 make_lanyard.py   (needs a headless Chromium, see
name-card/make_cards.py, and pdftoppm for the badge picture in the preview)
"""

import base64
import hashlib
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "name-card"))
from make_cards import chrome  # noqa: E402

# Strap (mm)
L, WID = 950.0, 12.0
END = 25.0                      # folded through the slot and sewn, each end
SEW = 12.0                      # sew line, this far from each end
MID = L / 2
SAFE = 1.2                      # keep artwork this far from the long edges

# Colour themes: strap (bg), text, quiet text, accent (wave peaks, edge
# stripes, "by Elixpo"), bow and its knot, the folded ends, Lumi's lines.
CARD = dict(ink="#1f2328", muted="#59636e", accent="#c93a45", bow="#c93a45",
            knot="#a92f39", ends="#c93a45", lumi="#1f2328")
# Faint grounds from the Elixpo palette (falera.elixpo globals.css), so the
# strap matches the card: the card's ink and red on every one.
THEMES = {
    "paper":  dict(CARD, bg="#fbfbf8"),                  # site paper
    "butter": dict(CARD, bg="#fbf3d6"),                  # faint yellow
    "blush":  dict(CARD, bg="#fbe9ea"),                  # the red, faint
    "bamboo": dict(CARD, bg="#e5f0e8", muted="#5f6962"),  # the green, faint
}
MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'


def bow(t):
    return ('<path d="M18 12C12 3 3 1 2 7c-1 5-1 10 1 13 3 3 10-1 15-8z" fill="{r}"/>'
            '<path d="M22 12c6-9 15-11 16-5 1 5 1 10-1 13-3 3-10-1-15-8z" fill="{r}"/>'
            '<rect x="15.5" y="7" width="9" height="10" rx="3.5" fill="{d}"/>').format(r=t["bow"], d=t["knot"])


def lumi_href(colour):
    """Lumi facing the viewer (circuit/elixpo/art/lumi-front-lineart.png, lines
    thickened), turned so she stands upright when worn, in the theme's colour."""
    from PIL import Image
    im = Image.open(HERE / "assets" / "lumi-front.png").convert("RGBA")
    rgb = tuple(int(colour[i:i + 2], 16) for i in (1, 3, 5))
    tinted = Image.new("RGBA", im.size, rgb + (0,))
    tinted.putalpha(im.getchannel("A"))
    buf = io.BytesIO()
    tinted.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def brand_wave(n):
    """n values in 0..1: SHA-256 of "falera:<k>" chained, smoothed like the card's."""
    raw = []
    k = 0
    while len(raw) < n + 2:
        raw += list(hashlib.sha256(f"falera:{k}".encode()).digest())
        k += 1
    raw = [v / 255 for v in raw]
    return [(raw[i] + 2 * raw[i + 1] + raw[i + 2]) / 4 for i in range(n)]


class Wave:
    """Hands out consecutive slices of one long sequence, so the strap's
    waveform pieces read as one band broken by the text."""
    PITCH, BAR, H = 0.9, 0.5, 7.4

    def __init__(self, t):
        self.t = t
        self.vals = brand_wave(4000)
        self.i = 0

    def draw(self, x, length):
        n = int(length / self.PITCH)
        vals = self.vals[self.i:self.i + n]
        self.i += n
        peak = max(range(n), key=lambda k: vals[k])
        out = []
        for k, v in enumerate(vals):
            h = max(0.6, (0.18 + 0.82 * v) * self.H)
            col = self.t["accent"] if abs(k - peak) <= 1 else self.t["ink"]
            out.append(f'<rect x="{x + k * self.PITCH:.2f}" y="{WID / 2 - h / 2:.2f}" width="{self.BAR}" '
                       f'height="{h:.2f}" rx="{self.BAR / 2}" fill="{col}"/>')
        return "".join(out)


def text(x, s, size, weight, fill, length, spacing=True):
    # textLength fixes the width, so the layout doesn't depend on the font.
    base = WID / 2 + size * 0.36
    adj = "spacing" if spacing else "spacingAndGlyphs"
    return (f'<text x="{x:.2f}" y="{base:.2f}" font-family=\'{MONO}\' font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" textLength="{length}" lengthAdjust="{adj}">{s}</text>')


def module(x, wave, lumi, t):
    """One 150 mm repeat, starting at x. Widths in mm."""
    parts = []
    parts.append(f'<g transform="translate({x:.2f} {WID / 2 - 3.6:.2f}) scale(0.3)">{bow(t)}</g>')   # bow, 12 x 7.2
    x += 12 + 4
    parts.append(text(x, "FALERA BADGE", 3.9, 800, t["ink"], 34))
    x += 34 + 5
    parts.append(wave.draw(x, 22))
    x += 22 + 5
    parts.append(f'<image href="{lumi}" x="{x + 0.6:.2f}" y="{WID / 2 - 4.7:.2f}" width="8.3" height="9.4"/>')   # 1443 x 1635 px
    x += 9.5 + 4
    parts.append(text(x, "falera.elixpo.com", 3.1, 600, t["muted"], 27))
    x += 27 + 3
    parts.append(text(x, "by Elixpo", 2.6, 700, t["accent"], 13))
    return "".join(parts)


MODULE_W = 12 + 4 + 34 + 5 + 22 + 5 + 9.5 + 4 + 27 + 3 + 13     # 138.5 mm
MIN_GAP = 5.0
CENTRE = 24.0                   # kept clear at the neck for the centre bow alone


def half(lumi, wave, t):
    """The artwork from the sewn end to the middle, in strap coordinates."""
    parts = []
    usable = MID - END - CENTRE / 2                   # stop short of the centre bow
    count = int(usable // (MODULE_W + MIN_GAP))         # 3 per half
    gap = (usable - count * MODULE_W) / count        # spread the spare length evenly
    x = END + gap / 2
    for _ in range(count):
        parts.append(module(x, wave, lumi, t))
        x += MODULE_W + gap
    return "".join(parts)


def artwork(theme="paper", guides=False):
    t = THEMES[theme]
    lumi = lumi_href(t["lumi"])
    first = half(lumi, Wave(t), t)
    # The second half is the first turned 180 degrees about the strap's centre.
    body = [f'<rect width="{L}" height="{WID}" fill="{t["bg"]}"/>']
    for y in (SAFE, WID - SAFE):
        body.append(f'<line x1="0" y1="{y}" x2="{L}" y2="{y}" stroke="{t["accent"]}" stroke-width="0.35"/>')
    body.append(f'<rect x="0" y="0" width="{END}" height="{WID}" fill="{t["ends"]}"/>')
    body.append(f'<rect x="{L - END}" y="0" width="{END}" height="{WID}" fill="{t["ends"]}"/>')
    body.append(first)
    body.append(f'<g transform="rotate(180 {MID} {WID / 2})">{first}</g>')
    # At the neck: one bow on the centre line.
    body.append(f'<g transform="translate({MID - 6} {WID / 2 - 3.6}) scale(0.3)">{bow(t)}</g>')
    if guides:
        g = 'stroke="#0a7cff" stroke-width="0.2" fill="none"'
        for x in (END, L - END):
            body.append(f'<line x1="{x}" y1="-3" x2="{x}" y2="{WID + 3}" {g} stroke-dasharray="1 0.6"/>')
        for x in (SEW, L - SEW):
            body.append(f'<line x1="{x}" y1="-3" x2="{x}" y2="{WID + 3}" stroke="#16a34a" stroke-width="0.25" stroke-dasharray="0.4 0.4"/>')
        body.append(f'<line x1="{MID}" y1="-4" x2="{MID}" y2="{WID + 4}" stroke="#0a7cff" stroke-width="0.2"/>')
        lab = 'font-family="sans-serif" font-size="2.4" fill="#0a7cff"'
        body.append(f'<text x="{END + 1}" y="-1" {lab}>fold through the slot ({END:g} mm)</text>')
        body.append(f'<text x="{SEW}" y="{WID + 3.2}" {lab} fill="#16a34a">sew {SEW:g} mm from the end</text>')
        body.append(f'<text x="{MID + 1}" y="-1" {lab}>centre (neck): pattern turns 180°</text>')
        body.append(f'<text x="0" y="{WID + 7}" {lab}>{L:g} × {WID:g} mm, one side printed; artwork {SAFE} mm clear of the long edges</text>')
        vb = f"0 -6 {L} {WID + 15}"
        size = f'width="{L}mm" height="{WID + 15}mm"'
    else:
        vb = f"0 0 {L} {WID}"
        size = f'width="{L}mm" height="{WID}mm"'
    return f'<svg xmlns="http://www.w3.org/2000/svg" {size} viewBox="{vb}">{"".join(body)}</svg>'


def run(exe, args):
    subprocess.run([exe, "--headless", "--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files"] + args,
                   capture_output=True, check=True)


def main():
    exe = chrome()
    if not exe:
        sys.exit("no headless Chromium found: set CHROME to its path")
    (HERE / "lanyard-guides.svg").write_text(artwork("paper", guides=True))
    out = HERE / "renders"
    out.mkdir(exist_ok=True)
    written = ["lanyard-guides.svg"]

    # Each person's lanyard is in their card's theme (name-card/people.json).
    people = json.loads((ROOT / "name-card" / "people.json").read_text())

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        rows, straps = [], {}
        for name in THEMES:
            art = artwork(name)
            inner = art[art.index(">") + 1:-6]
            svg = HERE / f"lanyard-print-{name}.svg"
            svg.write_text(art)
            # PDF at the strap's real size.
            page = tmp / f"print-{name}.html"
            page.write_text(f'<!doctype html><style>@page {{ size: {L}mm {WID}mm; margin: 0 }} body {{ margin: 0 }} '
                            f'svg {{ display: block }}</style>{art}')
            run(exe, ["--no-pdf-header-footer", f"--print-to-pdf={out / f'lanyard-print-{name}.pdf'}", page.as_uri()])
            # The strap as an image, for the previews.
            straps[name] = tmp / f"strap-{name}.png"
            strap = tmp / f"strap-{name}.html"
            strap.write_text(f'<!doctype html><style>body{{margin:0}} svg{{display:block}}</style>'
                             f'<svg viewBox="0 0 {L} {WID}" width="{int(L * 4)}" height="{int(WID * 4)}">{inner}</svg>')
            run(exe, [f"--window-size={int(L * 4)},{int(WID * 4)}", f"--screenshot={straps[name]}", strap.as_uri()])
            # One row of the themes overview: 110-330 mm, at 5 px/mm.
            rows.append(f'<div class="row"><svg viewBox="110 0 220 {WID}" width="1100" height="60">{inner}</svg><span>{name}</span></div>')
            written += [svg.name, f"renders/lanyard-print-{name}.pdf"]

        det = tmp / "themes.html"
        det.write_text('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#eaeef2;font:13px sans-serif;color:#59636e;padding:20px}'
                       '.row{margin-bottom:18px}.row svg{display:block;outline:1px solid #d1d9e0}'
                       f'.row span{{display:block;margin-top:5px}}</style>{"".join(rows)}')
        run(exe, ["--window-size=1140,{}".format(40 + 96 * len(THEMES)), f"--screenshot={out / 'themes.png'}", det.as_uri()])
        written.append("renders/themes.png")

        # Preview per person: their card on the badge, their theme's strap.
        for p in people:
            h, theme = p["handle"], p.get("theme", "paper")
            card_pdf = tmp / f"card-{h}.pdf"
            run(exe, ["--no-pdf-header-footer", f"--print-to-pdf={card_pdf}",
                      (ROOT / "name-card" / "cards" / f"{h}.html").as_uri() + "?card"])
            subprocess.run(["pdftoppm", "-r", "300", "-png", "-singlefile", str(card_pdf), str(tmp / f"card-{h}")], check=True)
            prev = tmp / f"preview-{h}.html"
            prev.write_text(preview_html((tmp / f"card-{h}.png").as_uri(), straps[theme].as_uri(), f"{p['name']}, {theme}"))
            run(exe, ["--window-size=900,1200", f"--screenshot={out / f'preview-{h}.png'}", prev.as_uri()])
            written.append(f"renders/preview-{h}.png")

        # Everyone side by side.
        from PIL import Image
        ims = [Image.open(out / f"preview-{p['handle']}.png").crop((150, 0, 750, 1200)) for p in people]
        w, hgt = ims[0].size
        gap = 48
        sheet = Image.new("RGB", (w * len(ims) + gap * (len(ims) - 1), hgt), "#eaeef2")
        for i, im in enumerate(ims):
            sheet.paste(im, (i * (w + gap), 0))
        sheet.save(out / "previews.png", optimize=True)
        written.append("renders/previews.png")

        # What to order: straps per theme.
        counts = {}
        for p in people:
            counts[p.get("theme", "paper")] = counts.get(p.get("theme", "paper"), 0) + 1
        print("order: " + ", ".join(f"{n} x {c}" for n, c in counts.items()))
    for f in written:
        print(f)


def preview_html(card, strap, name):
    """The badge (black board, the card, the screen) with the strap from each
    slot, at 4 px/mm. The strap image starts at the sewn end, so it runs from
    the slot upwards; both sides read the same way, as worn."""
    s = 4                                     # px per mm
    bx, by = 450 - 44 * s, 600                # board top-left
    slots = (10.0, 78.0)                      # slot centres, card x (mm)
    tilt = 11                                 # degrees from vertical
    straps = []
    for cx, sign in zip(slots, (-1, 1)):
        x = bx + cx * s
        y = by + 5.5 * s
        # The image is drawn along +x from the sewn end; rotate so it rises from the slot.
        straps.append(f'<img class="strap" src="{strap}" style="left:{x}px;top:{y}px;'
                      f'transform: rotate({-90 + sign * tilt}deg) translateX({-END * s}px) translateY(-{WID * s / 2}px)">')
    return f"""<!doctype html><meta charset="utf-8"><style>
body {{ margin: 0; width: 900px; height: 1200px; background: #eaeef2; position: relative; overflow: hidden; font: 13px sans-serif; }}
.strap {{ position: absolute; width: {L * s}px; height: {WID * s}px; transform-origin: 0 0; }}
.board {{ position: absolute; left: {bx}px; top: {by}px; width: {88 * s}px; height: {133.6 * s}px; background: #111316; border-radius: {3 * s}px {3 * s}px {2 * s}px {2 * s}px; }}
.card {{ position: absolute; left: {bx}px; top: {by}px; width: {88 * s}px; height: {59.5 * s}px; object-fit: cover; object-position: top; }}  /* the fold-back tab is under the card */
.lcd {{ position: absolute; left: {bx + 1 * s}px; top: {by + 60 * s}px; width: {86 * s}px; height: {50 * s}px; background: #b8322f; border-radius: 3px; }}
.lcd i {{ position: absolute; left: {6 * s}px; top: {3.5 * s}px; right: {6 * s}px; bottom: {3.5 * s}px; background: #0d0f12; }}
.cap {{ position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; color: #59636e; }}
</style>
{"".join(straps)}
<div class="board"></div><img class="card" src="{card}"><div class="lcd"><i></i></div>
<p class="cap">{name}</p>"""


if __name__ == "__main__":
    main()
