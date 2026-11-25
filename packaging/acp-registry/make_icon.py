# Builds a monochrome 16x16 (32-cell) SVG panda from the site's pixel-art favicon.
import sys
from PIL import Image
N = 32
src, out_svg, out_png = sys.argv[1:4]
im = Image.open(src).convert("RGBA")
crop = im.crop(im.getchannel("A").point(lambda a: 255 if a > 32 else 0).getbbox())
w, h = crop.size; side = max(w, h)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0)); sq.paste(crop, ((side - w) // 2, (side - h) // 2))
cell = side / N
opaque, dark = set(), set()
for j in range(N):
    for i in range(N):
        px = [p for p in sq.crop((int(i*cell), int(j*cell), int((i+1)*cell), int((j+1)*cell))).get_flattened_data()]
        solid = [p for p in px if p[3] > 128]
        if len(solid) < len(px) / 2: continue
        opaque.add((i, j))
        if sum(0.299*r + 0.587*g + 0.114*b for r, g, b, a in solid) / len(solid) < 90: dark.add((i, j))
ring = {(i, j) for (i, j) in opaque if any((i+di, j+dj) not in opaque for di, dj in ((1,0),(-1,0),(0,1),(0,-1)))}
features = {(i, j) for (i, j) in dark if j <= 19}          # ears, eye patches, nose
# A cute panda mouth: a short stem under the nose opening into an omega.
mouth = {(15, 20), (16, 20), (12, 21), (15, 21), (16, 21), (19, 21), (13, 22), (14, 22), (17, 22), (18, 22)}
on = ring | features | mouth
# SVG: one path, horizontal runs per row.
d = []
for j in range(N):
    i = 0
    while i < N:
        if (i, j) in on:
            k = i
            while k < N and (k, j) in on: k += 1
            d.append(f"M{i} {j}h{k-i}v1h-{k-i}z"); i = k
        else: i += 1
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" shape-rendering="crispEdges">\n'
       f'  <path fill="currentColor" d="{"".join(d)}"/>\n</svg>\n')
open(out_svg, "w").write(svg)
def render(px, fg, bg):
    img = Image.new("RGB", (N, N), bg)
    for c in on: img.putpixel(c, fg)
    return img.resize((px, px), Image.NEAREST) if px >= N else img.resize((px, px), Image.BOX)
light, darkm = render(128, (0, 0, 0), (255, 255, 255)), render(128, (235, 235, 235), (30, 30, 30))
small = render(16, (0, 0, 0), (255, 255, 255)).resize((128, 128), Image.NEAREST)
sheet = Image.new("RGB", (400, 128), (128, 128, 128))
for k, imgx in enumerate((light, darkm, small)): sheet.paste(imgx, (k * 136, 0))
sheet.save(out_png); print(len(svg), "bytes,", len(on), "cells")
