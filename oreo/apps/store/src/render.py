"""App Store drawing: rows, featured card, detail page, dialogs.

Everything here is a plain function of the display and the values to
show, so app.py decides *what* changed and repaints only that region.
"""

from oreoOS import api, theme, widgets, pixelfont

SW = api.SCREEN_W
SH = api.SCREEN_H

TOP     = widgets.HEADER_H + 2        # first content pixel row
TAB_H   = 18
BOTTOM  = SH - TAB_H                  # content ends here (tab/hint bar below)
FEAT_H  = 76
ROW_H   = 42
GAP     = 2
TEXT_X  = 48
PILL_W  = 68
PILL_H  = 18
PILL_X  = SW - 8 - PILL_W
TEXT_CH = (PILL_X - 4 - TEXT_X) // 8  # 8 px framebuf glyphs

_fonts = {}


def font(name):
    f = _fonts.get(name)
    if f is None:
        try:
            f = pixelfont.load(name)
        except Exception:
            f = False
        _fonts[name] = f
    return f or None


def fit(text, n):
    text = str(text or "")
    return text if len(text) <= n else text[:max(1, n - 2)] + ".."


def fit_px(f, text, max_w):
    """Trim text until the pixel font fits it into max_w."""
    text = str(text or "")
    if f.measure(text) <= max_w:
        return text
    while len(text) > 1 and f.measure(text + "..") > max_w:
        text = text[:-1]
    return text + ".."


def title(d, text, x, y, color, max_w, size="pixelify_12"):
    f = font(size)
    if f:
        f.text(d, fit_px(f, text, max_w), x, y, color)
    else:
        d.text(fit(text, max_w // 8), x, y, color)


def fmt_size(n):
    n = int(n or 0)
    if n >= 1024 * 1024:
        return "%.1f MB" % (n / 1048576.0)
    if n >= 1024:
        return "%d KB" % ((n + 1023) // 1024)
    return "%d B" % n


def wrap(text, width, max_lines):
    out = []
    words = str(text or "").split()
    cur = ""
    while words and len(out) < max_lines:
        w = words[0]
        cand = cur + " " + w if cur else w
        if len(cand) <= width:
            cur = cand
            words.pop(0)
        elif cur:
            out.append(cur)
            cur = ""
        else:
            out.append(w[:width])
            words[0] = w[width:]
    if cur and len(out) < max_lines:
        out.append(cur)
    if words and out:
        out[-1] = fit(out[-1] + " " + words[0], width)
    return out


def outline(d, x, y, w, h, color):
    d.rect(x, y, w, 1, color, fill=True)
    d.rect(x, y + h - 1, w, 1, color, fill=True)
    d.rect(x, y, 1, h, color, fill=True)
    d.rect(x + w - 1, y, 1, h, color, fill=True)


def centered(d, text, x, w, y, color):
    text = fit(text, w // 8)
    d.text(text, x + (w - len(text) * 8) // 2, y, color)


# ── icons ───────────────────────────────────────────────────────────────

_CAT_COLORS = {
    "Games": theme.PRIMARY, "Social": theme.TEAL, "Tools": theme.ORANGE,
    "Utilities": theme.PURPLE, "System": theme.MUTED,
}


def icon(d, ico, x, y, size, name, category, tile=None):
    if ico:
        data, w, h = ico
        d.blit(data, x + (size - w) // 2, y + (size - h) // 2, w, h)
        return
    d.rect(x, y, size, size,
           tile or _CAT_COLORS.get(category, theme.MUTED), fill=True)
    letter = str(name or "?")[:1].upper()
    sc = 2 if size < 48 else 4
    d.text(letter, x + (size - 8 * sc) // 2, y + (size - 8 * sc) // 2,
           api.WHITE, scale=sc)


def upscale2x(data, w, h):
    """Pixel-double an RGB565 icon (done once per icon, then cached)."""
    src = memoryview(data)
    out = bytearray(w * h * 8)
    row = w * 4
    for yy in range(h):
        s = yy * w * 2
        o = yy * 2 * row
        for xx in range(w):
            a = src[s]
            b = src[s + 1]
            s += 2
            out[o] = a; out[o + 1] = b; out[o + 2] = a; out[o + 3] = b
            o += 4
        out[o:o + row] = out[o - row:o]
    return (out, w * 2, h * 2)


# ── action pill ─────────────────────────────────────────────────────────

PILL_STYLE = {
    # label: (fill, ink, border)
    "INSTALL":  (theme.PRIMARY, api.WHITE, None),
    "UPDATE":   (theme.TEAL, api.WHITE, None),
    "OPEN":     (None, theme.PRIMARY, theme.PRIMARY),
    "BUILT-IN": (None, theme.MUTED, theme.MUTED2),
    "SOON":     (None, theme.MUTED, theme.MUTED2),
}


def pill(d, label, x, y, w=PILL_W, h=PILL_H, bg=None, invert=False):
    fill, ink, border = PILL_STYLE.get(label, (None, theme.MUTED, theme.MUTED2))
    if invert:
        # On a coloured card: white pill, accent text.
        fill, ink, border = api.WHITE, theme.PRIMARY, None
    if fill is not None:
        d.rect(x, y, w, h, fill, fill=True)
    elif bg is not None:
        d.rect(x, y, w, h, bg, fill=True)
    if border is not None:
        outline(d, x, y, w, h, border)
    centered(d, label, x, w, y + (h - 8) // 2, ink)


# ── list rows ───────────────────────────────────────────────────────────

def row(d, y, selected, ico, name, line2, line3, label, category):
    bg = theme.DOCK_SEL if selected else theme.BG
    d.rect(4, y, SW - 8, ROW_H, bg, fill=True)
    if selected:
        outline(d, 4, y, SW - 8, ROW_H, theme.SEL_BORDER)
    else:
        d.rect(TEXT_X, y + ROW_H - 1, SW - TEXT_X - 8, 1, theme.MUTED2,
               fill=True)
    icon(d, ico, 8, y + 4, 32, name, category)
    title(d, name, TEXT_X, y + 3, theme.TEXT_BRIGHT, PILL_X - 6 - TEXT_X)
    d.text(fit(line2, TEXT_CH), TEXT_X, y + 19, theme.TEXT_DIM)
    d.text(fit(line3, TEXT_CH), TEXT_X, y + 30, theme.MUTED)
    if label:
        pill(d, label, PILL_X, y + (ROW_H - PILL_H) // 2, bg=bg)


def featured(d, y, selected, big_ico, entry, label, count, index):
    x, w = 6, SW - 12
    d.rect(x, y, w, FEAT_H, theme.PRIMARY, fill=True)
    if selected:
        outline(d, x, y, w, FEAT_H, theme.TEXT_BRIGHT)
        outline(d, x + 1, y + 1, w - 2, FEAT_H - 2, theme.TEXT_BRIGHT)
    d.text("FEATURED", x + 10, y + 8, theme.GOLD)
    d.text(fit(entry["category"], 10), x + 84, y + 8, api.WHITE)
    title(d, entry["name"], x + 10, y + 21, api.WHITE, 220, "pixelify_16")
    d.text(fit(entry["tagline"], 27), x + 10, y + 42, api.WHITE)
    pill(d, label, x + 10, y + 54, 68, 16, invert=True)
    if count > 1:
        # Page dots for the featured carousel (LEFT/RIGHT).
        dx = x + 88
        for i in range(count):
            d.rect(dx + i * 8, y + 61, 4, 4,
                   api.WHITE if i == index else theme.MUTED2, fill=True)
    icon(d, big_ico, x + w - 72, y + 6, 64, entry["name"], entry["category"],
         tile=theme.GOLD)


def empty(d, lines):
    d.rect(0, TOP, SW, BOTTOM - TOP, theme.BG, fill=True)
    y = TOP + (BOTTOM - TOP) // 2 - len(lines) * 7
    for i, line in enumerate(lines):
        centered(d, line, 0, SW, y + i * 14,
                 theme.TEXT_BRIGHT if i == 0 else theme.MUTED)


# ── chrome ──────────────────────────────────────────────────────────────

def header(d, status):
    widgets.draw_header(d, "App Store")
    if status:
        d.text(fit(status, 9), 6, (widgets.HEADER_H - 8) // 2, api.WHITE)


def tabs(d, page):
    y = BOTTOM
    d.rect(0, y, SW, TAB_H, theme.DOCK_BG, fill=True)
    d.rect(0, y, SW, 1, theme.MUTED2, fill=True)
    half = SW // 2
    for i, label in enumerate(("Discover", "Installed")):
        active = (page == i)
        x = i * half
        if active:
            d.rect(x + 20, y + 1, half - 40, 2, theme.PRIMARY, fill=True)
        centered(d, label, x, half, y + 6,
                 theme.PRIMARY if active else theme.TEXT_DIM)
    d.text("B", half - 4, y + 6, theme.MUTED)


def hint(d, text):
    d.rect(0, BOTTOM, SW, TAB_H, theme.DOCK_BG, fill=True)
    d.rect(0, BOTTOM, SW, 1, theme.MUTED2, fill=True)
    centered(d, text, 0, SW, BOTTOM + 6, theme.TEXT_BRIGHT)


# ── detail page ─────────────────────────────────────────────────────────

BTN_Y = BOTTOM - 32
BTN_H = 26


def detail(d, big_ico, entry, meta, note):
    d.rect(0, TOP, SW, BOTTOM - TOP, theme.BG, fill=True)
    icon(d, big_ico, 10, TOP + 4, 64, entry["name"], entry.get("category"))
    title(d, entry["name"], 84, TOP + 6, theme.TEXT_BRIGHT, SW - 92,
          "pixelify_16")
    d.text(fit(entry.get("author") or "", 29), 84, TOP + 28, theme.MUTED)
    d.text(fit(meta, 29), 84, TOP + 42, theme.TEXT_DIM)
    if entry.get("category"):
        cat = fit(entry["category"], 12)
        cw = len(cat) * 8 + 8
        d.rect(84, TOP + 54, cw, 12,
               _CAT_COLORS.get(entry["category"], theme.MUTED), fill=True)
        d.text(cat, 88, TOP + 56, api.WHITE)
    lines = wrap(entry.get("description") or "No description.", 38, 6)
    for i, line in enumerate(lines):
        d.text(line, 8, TOP + 76 + i * 11, theme.TEXT_BRIGHT)
    if note:
        centered(d, note, 0, SW, BTN_Y - 13, theme.MUTED)


def buttons(d, actions, sel):
    d.rect(0, BTN_Y - 2, SW, BTN_H + 4, theme.BG, fill=True)
    n = len(actions)
    if not n:
        return
    gap = 6
    w = (SW - 16 - gap * (n - 1)) // n
    for i, (label, danger) in enumerate(actions):
        x = 8 + i * (w + gap)
        if i == sel:
            d.rect(x, BTN_Y, w, BTN_H, theme.PRIMARY, fill=True)
            ink = api.WHITE
        else:
            outline(d, x, BTN_Y, w, BTN_H,
                    theme.PRIMARY if danger else theme.MUTED2)
            ink = theme.PRIMARY if danger else theme.TEXT_BRIGHT
        f = font("pixelify_12")
        if f:
            tw = f.measure(label)
            f.text(d, label, x + (w - tw) // 2, BTN_Y + (BTN_H - f.h) // 2, ink)
        else:
            centered(d, label, x, w, BTN_Y + (BTN_H - 8) // 2, ink)


def progress(d, label, received, total):
    """Progress bar in the button slot (repainted alone while installing)."""
    d.rect(0, BTN_Y - 14, SW, BTN_H + 16, theme.BG, fill=True)
    total = max(1, int(total or 0))
    received = max(0, min(total, int(received or 0)))
    pct = received * 100 // total
    text = "%s  %d%%  %s / %s" % (label, pct, fmt_size(received),
                                  fmt_size(total))
    centered(d, text, 0, SW, BTN_Y - 12, theme.TEXT_BRIGHT)
    x, w = 8, SW - 16
    d.rect(x, BTN_Y + 4, w, 14, theme.MUTED2, fill=True)
    fw = w * pct // 100
    if fw:
        d.rect(x, BTN_Y + 4, fw, 14, theme.PRIMARY, fill=True)


def confirm(d, name, lines, sel):
    x, y, w, h = 16, TOP + 22, SW - 32, 140
    d.rect(x + 3, y + 3, w, h, theme.MUTED2, fill=True)   # drop shadow
    d.rect(x, y, w, h, theme.BG, fill=True)
    outline(d, x, y, w, h, theme.PRIMARY)
    outline(d, x + 1, y + 1, w - 2, h - 2, theme.PRIMARY)
    d.rect(x + 2, y + 2, w - 4, 22, theme.PRIMARY, fill=True)
    title(d, "Uninstall " + name + "?", x + 10, y + 7, api.WHITE, w - 20)
    for i, line in enumerate(lines[:5]):
        d.text(fit(line, (w - 20) // 8), x + 10, y + 32 + i * 12,
               theme.TEXT_BRIGHT if i < 2 else theme.TEXT_DIM)
    bw = (w - 30) // 2
    by = y + h - 30
    for i, (label, danger) in enumerate((("Cancel", False),
                                         ("Uninstall", True))):
        bx = x + 10 + i * (bw + 10)
        if i == sel:
            d.rect(bx, by, bw, 22, theme.PRIMARY, fill=True)
            ink = api.WHITE
        else:
            outline(d, bx, by, bw, 22,
                    theme.PRIMARY if danger else theme.MUTED2)
            ink = theme.PRIMARY if danger else theme.TEXT_BRIGHT
        centered(d, label, bx, bw, by + 7, ink)
