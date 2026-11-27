"""Render the boot splash's artwork into oreoOS/splash.bin.

The badge has no font engine for anti-aliased type or complex scripts, so
the greetings ("hello" in many languages, each in its own script) are
rendered here as 16-level coverage masks, and the static parts (the dimmed
photo backdrop, the logo top left and the small "FaleraOS" line) are baked
into one 320x240 frame. On the badge, oreoOS/splash.py restores the
greeting band from that frame and draws two masks per frame with
framebuf's palette blit (C), so words roll smoothly over the photo.

    python3 tools/build_splash.py               # writes oreoOS/splash.bin
                                                # and oreoOS/wallpaper.bin
    python3 tools/build_splash.py --preview out.png

It also writes oreoOS/wallpaper.bin, the home screen wallpaper: the light
wallpaper as a raw 320x240 big-endian RGB565 frame (oreoOS/home.py reads it
straight into a buffer). Both wallpapers come from falera.elixpo/public, so
the website and the badge share one copy.

Fonts (SIL Open Font License 1.1, rendered to bitmaps): Inter SemiBold for
Latin and Cyrillic, Noto Sans Bold for Indic scripts and Arabic, Noto Sans
CJK Bold for Japanese, Chinese and Korean. Pillow must be built with libraqm
so Devanagari, Bengali, Tamil and Arabic are shaped correctly.

splash.bin layout (little-endian header; pixels are big-endian RGB565, the
panel's byte order):

    "OSP2" | u8 count | u8 0
    u16 band_y | u16 band_h
    u16 bar_x | u16 bar_y | u16 bar_w | u16 bar_h | u16 bar_track | u16 bar_fill
    u16 key                       palette entry 0 as framebuf reads it
    16 x 2 bytes                  palette: coverage 0..15 -> colour (BE)
    320 x 240 x 2 bytes           backdrop with logo and "FaleraOS" baked in
    count x ( u16 w | (w / 2) * band_h bytes GS4_HMSB mask )   (w is even)
"""

import argparse
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageStat, features

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "oreoOS" / "splash.bin"
LOGO_SRC = ROOT / "falera.elixpo" / "public" / "favicon.ico"
BG_SRC = ROOT / "falera.elixpo" / "public" / "wallpaper_dark.png"
HOME_SRC = ROOT / "falera.elixpo" / "public" / "wallpaper_light.png"
HOME_OUT = ROOT / "oreoOS" / "wallpaper.bin"
HOME_WASH = 0.15                # towards theme.BG, so Home's dark text reads
THEME_BG = (255, 248, 235)

SW, SH = 320, 240
BG_DIM = 0.75                   # the dark wallpaper, a touch darker for text
INK = (250, 246, 236)           # greeting: warm cream on the dark photo
TAG = (255, 140, 150)           # "FaleraOS": light theme pink
BAR_TRACK = (40, 46, 70)
BAR_FILL = (255, 190, 30)       # theme.GOLD

BAND_H = 64
BAND_Y = (SH - BAND_H) // 2 - 10
MAX_W = 300
SIZE = 44
LOGO = 36
TAG_SIZE = 22
BAR_W, BAR_H = SW - 100, 4
BAR_X, BAR_Y = (SW - BAR_W) // 2, SH - 28

INTER = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
INTER_TAG = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
NOTO = "/usr/share/fonts/truetype/noto/NotoSans%s-Bold.ttf"
CJK = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

# (text, font path, ttc index, language tag for shaping)
GREETINGS = [
    ("hello", INTER, 0, "en"),
    ("γεια σου", INTER, 0, "el"),
    ("hola", INTER, 0, "es"),
    ("নমস্কার", NOTO % "Bengali", 0, "bn"),
    ("bonjour", INTER, 0, "fr"),
    ("こんにちは", CJK, 0, "ja"),
    ("வணக்கம்", NOTO % "Tamil", 0, "ta"),
    ("ciao", INTER, 0, "it"),
    ("你好", CJK, 2, "zh"),
    ("olá", INTER, 0, "pt"),
    ("안녕하세요", CJK, 1, "ko"),
    ("hallo", INTER, 0, "de"),
    ("مرحبا", NOTO % "Arabic", 0, "ar"),
    ("привет", INTER, 0, "ru"),
    ("ನಮಸ್ಕಾರ", NOTO % "Kannada", 0, "kn"),
    ("merhaba", INTER, 0, "tr"),
]


def c565(rgb):
    r, g, b = rgb[:3]
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


def rgb565_be(img):
    out = bytearray()
    pixels = img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata()
    for px in pixels:
        out += struct.pack(">H", c565(px))
    return bytes(out)


def _font(path, size, index):
    return ImageFont.truetype(path, size, index=index,
                              layout_engine=ImageFont.Layout.RAQM)


def coverage(text, path, index, lang, size, height=None):
    """Greyscale coverage image (L), tightly cropped in width (even) and
    centred on its ink in a band of `height` rows (or cropped if None)."""
    kw = {"language": lang} if lang else {}
    while True:
        font = _font(path, size, index)
        x0, y0, x1, y1 = font.getbbox(text, **kw)
        if x1 - x0 <= MAX_W or size <= 20:
            break
        size -= 2
    w = x1 - x0 + 4
    w += w & 1
    h = (y1 - y0 + 4) if height is None else height
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).text((2 - x0, (h - (y1 - y0)) // 2 - y0), text,
                             font=font, fill=255, **kw)
    return img


def gs4_hmsb(mask):
    """Pack an L image (even width) into framebuf GS4_HMSB: two pixels per
    byte, the left pixel in the high nibble; 0 = transparent."""
    w, h = mask.size
    px = mask.load()
    out = bytearray()
    for y in range(h):
        for x in range(0, w, 2):
            a = (px[x, y] * 15 + 127) // 255
            b = (px[x + 1, y] * 15 + 127) // 255
            out.append((a << 4) | b)
    return bytes(out)


def fit(path):
    """The image scaled to cover 320x240 and centre-cropped."""
    src = Image.open(path).convert("RGB")
    scale = max(SW / src.width, SH / src.height)
    src = src.resize((round(src.width * scale), round(src.height * scale)), Image.LANCZOS)
    left, top = (src.width - SW) // 2, (src.height - SH) // 2
    return src.crop((left, top, left + SW, top + SH))


def backdrop():
    return Image.eval(fit(BG_SRC), lambda v: int(v * BG_DIM))


def home_wallpaper():
    img = fit(HOME_SRC)
    wash = Image.new("RGB", img.size, THEME_BG)
    return Image.blend(img, wash, HOME_WASH)


def logo():
    src = Image.open(LOGO_SRC)
    sizes = getattr(src, "info", {}).get("sizes")
    if sizes:
        src.size = max(sizes)
    src = src.convert("RGBA")
    src.thumbnail((LOGO, LOGO), Image.LANCZOS)
    return src


def palette_for(bg_img):
    """16 colours from the band's average backdrop colour to INK, so mask
    edges blend into the photo; entry 0 is the transparent key."""
    band = bg_img.crop((0, BAND_Y, SW, BAND_Y + BAND_H))
    avg = tuple(int(v) for v in ImageStat.Stat(band).mean)
    cols = [(255, 0, 255)]
    for i in range(1, 16):
        t = i / 15
        cols.append(tuple(round(avg[k] + (INK[k] - avg[k]) * t) for k in range(3)))
    values = [c565(c) for c in cols]
    # Entry 0 must be a colour no real entry uses: framebuf compares the
    # palette output with the key.
    while values[0] in values[1:]:
        values[0] ^= 0x0001
    pal = b"".join(struct.pack(">H", v) for v in values)
    key = struct.unpack("<H", pal[:2])[0]     # how framebuf reads it back
    return pal, key, values


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--preview", type=Path)
    args = p.parse_args()
    if not features.check("raqm"):
        raise SystemExit("Pillow needs libraqm to shape Indic and Arabic text")

    bg = backdrop()
    pal, key, pal_values = palette_for(bg)

    frame = bg.copy()
    lg = logo()
    frame.paste(lg, (12, 12), lg)
    tag = coverage("FaleraOS", INTER_TAG, 0, "en", TAG_SIZE)
    tag_y = BAND_Y + BAND_H + 2
    frame.paste(Image.new("RGB", tag.size, TAG), ((SW - tag.width) // 2, tag_y), tag)

    masks = [coverage(t, f, i, lang, SIZE, BAND_H) for t, f, i, lang in GREETINGS]

    blob = bytearray(b"OSP2" + struct.pack("<BB", len(masks), 0))
    blob += struct.pack("<HH", BAND_Y, BAND_H)
    blob += struct.pack("<HHHHHH", BAR_X, BAR_Y, BAR_W, BAR_H,
                        c565(BAR_TRACK), c565(BAR_FILL))
    blob += struct.pack("<H", key) + pal
    blob += rgb565_be(frame)
    for m in masks:
        blob += struct.pack("<H", m.width) + gs4_hmsb(m)
    args.out.write_bytes(blob)
    print("wrote %s: %d greetings, %.1f KB" % (args.out, len(masks), len(blob) / 1024))
    home = home_wallpaper()
    HOME_OUT.write_bytes(rgb565_be(home))
    print("wrote %s: 320x240 home wallpaper" % HOME_OUT)

    if args.preview:
        def expand(v):
            return (((v >> 11) & 31) * 255 // 31, ((v >> 5) & 63) * 255 // 63, (v & 31) * 255 // 31)
        cols = [expand(v) for v in pal_values]
        sheets = []
        for k in (0, 1, 5):
            shot = frame.copy()
            m = masks[k]
            q = m.point(lambda v: (v * 15 + 127) // 255)
            layer = Image.new("RGB", m.size)
            qd = q.get_flattened_data() if hasattr(q, "get_flattened_data") else q.getdata()
            layer.putdata([cols[v] for v in qd])
            shot.paste(layer, ((SW - m.width) // 2, BAND_Y), q.point(lambda v: 255 if v else 0))
            d = ImageDraw.Draw(shot)
            d.rectangle([BAR_X, BAR_Y, BAR_X + BAR_W - 1, BAR_Y + BAR_H - 1], fill=BAR_TRACK)
            d.rectangle([BAR_X, BAR_Y, BAR_X + BAR_W * (k + 2) // 8, BAR_Y + BAR_H - 1], fill=BAR_FILL)
            sheets.append(shot)
        sheets.append(home)
        sheet = Image.new("RGB", (SW, SH * len(sheets)))
        for i, s in enumerate(sheets):
            sheet.paste(s, (0, i * SH))
        sheet.save(args.preview)


if __name__ == "__main__":
    main()
