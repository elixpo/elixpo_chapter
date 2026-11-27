#!/usr/bin/env python3
"""Finish the hero image: put FaleraOS's home screen on the badge's display
and drop the ground shadow kicad-cli bakes into a transparent render.

Reads assets/hero.png (render_hero.py) and falera.elixpo/public/screens/
home.webp (a real 640 x 480 screenshot, 2x); writes assets/hero-final.png.

The display face is found as the large black quadrilateral; the screenshot
goes on the MSP2807's active area inside it (circuit/elixpo/3d/
make_msp2807_model.py: panel 69.2 x 50 mm, active 57.6 x 43.2 mm, 2.9 mm from
the panel's left edge and 3.4 mm from its top as the badge is worn), mapped
with a homography so the perspective is exact.

Run: python3 compose_hero.py   (needs opencv-python and numpy)
"""
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PANEL = (69.2, 50.0)
ACTIVE = (2.9, 3.4, 57.6, 43.2)          # x, y, w, h on the panel, mm


def panel_quad(rgba):
    bgr, a = rgba[..., :3], rgba[..., 3]
    dark = ((bgr.max(axis=2) < 60) & (a == 255)).astype(np.uint8) * 255
    n, lab, stats, _ = cv2.connectedComponentsWithStats(dark)
    k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    cs, _ = cv2.findContours((lab == k).astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    hull = cv2.convexHull(max(cs, key=cv2.contourArea))
    q = cv2.approxPolyDP(hull, 0.01 * cv2.arcLength(hull, True), True).reshape(-1, 2).astype(np.float32)
    assert len(q) == 4, q
    # Order as worn: the long edge nearest the top of the image is the panel's
    # top (next to the name card); then clockwise.
    c = q.mean(axis=0)
    ang = np.arctan2(q[:, 1] - c[1], q[:, 0] - c[0])
    q = q[np.argsort(ang)]                                # clockwise from the left in image space
    edges = [np.linalg.norm(q[(i + 1) % 4] - q[i]) for i in range(4)]
    tops = [i for i in range(4) if edges[i] > min(edges) * 1.2]
    i0 = min(tops, key=lambda i: (q[i][1] + q[(i + 1) % 4][1]))   # the higher long edge
    return np.roll(q, -i0, axis=0)                        # TL, TR, BR, BL


def main():
    rgba = cv2.imread(str(HERE / "assets" / "hero.png"), cv2.IMREAD_UNCHANGED)
    quad = panel_quad(rgba)
    # Panel mm -> image px, then the active area's corners through it.
    src = np.float32([[0, 0], [PANEL[0], 0], [PANEL[0], PANEL[1]], [0, PANEL[1]]])
    H = cv2.getPerspectiveTransform(src, quad)
    x, y, w, h = ACTIVE
    act = cv2.perspectiveTransform(np.float32([[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]]), H)[0]

    shot = cv2.imread(str(ROOT / "falera.elixpo" / "public" / "screens" / "home.webp"), cv2.IMREAD_COLOR)
    shot = cv2.resize(shot, (shot.shape[1] * 4, shot.shape[0] * 4), interpolation=cv2.INTER_NEAREST)  # crisp pixels
    sh, sw = shot.shape[:2]
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [sw, 0], [sw, sh], [0, sh]]), act)
    size = (rgba.shape[1], rgba.shape[0])
    warped = cv2.warpPerspective(shot, M, size, flags=cv2.INTER_AREA)
    mask = cv2.warpPerspective(np.full((sh, sw), 255, np.uint8), M, size, flags=cv2.INTER_AREA)
    m = (mask.astype(np.float32) / 255)[..., None]
    rgba[..., :3] = (warped * m + rgba[..., :3] * (1 - m)).astype(np.uint8)

    # No baked ground shadow: keep the solid board, soften its edge by a pixel.
    a = rgba[..., 3]
    solid = (a >= 235).astype(np.uint8) * 255
    rgba[..., 3] = cv2.GaussianBlur(solid, (3, 3), 0)

    ys, xs = np.nonzero(rgba[..., 3])
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    cv2.imwrite(str(HERE / "assets" / "hero-final.png"), rgba)
    print("hero-final.png", rgba.shape[1], "x", rgba.shape[0])


if __name__ == "__main__":
    main()
