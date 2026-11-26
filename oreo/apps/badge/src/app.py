"""Badge — your conference badge on one screen.

Who you are comes from the owner profile (oreoOS.profile: /profile.json,
then secrets.py written from .env.local at deploy): DISPLAY_NAME,
DISPLAY_DESIGNATION and GITHUB_USER. Your GitHub card (location, bio,
repos / followers / following) comes from the profile cached on flash, so
the badge draws the moment it opens, Wi-Fi or not. When the cache is older
than oreoOS.github.PROFILE_TTL_S, or A is pressed, a fresh copy is fetched
in the background (oreoOS.cache.Refresh) while the badge stays on screen
and buttons keep working. Automatic refreshes wait for netsvc's boot quiet
window, like Commits.

Everything fits one 320x240 screen, no scrolling (y on the left):

   0 ┌───────────────── FALERA BADGE ─────────────────┐ OS header
  32 │╭▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ (slot) ▀▀▀▀▀▀▀▀▀▀ 2h ago ╮ │ gold edge, slot,
     ││                                           │ │ status pill (38)
  52 ││  ╭──────╮  Ayushman                       │ │ name: Pixelify
     ││  │avatar│  Bhattacharya                   │ │ 24/16/12, 2 lines
     ││  │ or AB│  OSS Maintainer @pollinations   │ │ title: 16/12/8
     ││  ╰──────╯  @Circuit-Overtime              │ │ @GITHUB_USER
 150 ││  - - - - - - - - - - - - - - - - - - - -  │ │ divider
 154 ││  o Kolkata, India                         │ │ location
 166 ││  Building tiny computers and the          │ │ bio, 2 lines
 189 ││ [ 42 repos | 1.2k followers | 35 following]│ │ counts, one row
 216 │╰───────────────────────────────────────────╯ │
 224 └────────────── A=refresh  HOME=back ──────────┘ OS hint bar
       x: card 8..311, avatar disc centre (60, 99) r 38, text 110..302

The avatar is the owner's own: `falera setup` fetches GITHUB_USER's GitHub
avatar on the computer and copies it to /avatar.bin over USB, with the user
it was made for (oreoOS.profile.avatar). It shows only while that user is
the profile's GITHUB_USER; otherwise, or without the file, the badge draws
the owner's initials in a disc. Nothing is fetched or decoded here.

Controls:
  A      refresh the GitHub card now
  HOME   apps drawer
"""

import time

import oreoOS
from oreoOS import api, cache, github, pixelfont
from oreoOS import theme, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H

TITLE = "FALERA BADGE"
HINT = "A=refresh  HOME=back"
HINT_NO_USER = "HOME=back"

# ── layout (pixels) ──────────────────────────────────────────────────────
CARD_X = 8
CARD_Y = widgets.HEADER_H + 4
CARD_W = SW - 2 * CARD_X
CARD_H = SH - widgets.HINT_H - CARD_Y - 7     # leaves room for the shadow
CARD_R = 8                                    # corner radius
PAD = 10                                      # inner margin
IN_X = CARD_X + PAD                           # inner content box
IN_R = CARD_X + CARD_W - PAD
IN_W = IN_R - IN_X

SLOT_W, SLOT_H = 38, 6                        # lanyard slot
SLOT_X = (SW - SLOT_W) // 2
SLOT_Y = CARD_Y + 7

TOP_Y = CARD_Y + 20                           # identity block
TOP_B = CARD_Y + 114
AV_R = 36                                     # avatar disc (72 px), filled by the
RING = 2                                      # 72x72 avatar edge to edge
AV_CX = IN_X + 4 + AV_R + RING
AV_CY = (TOP_Y + TOP_B) // 2
TX = AV_CX + AV_R + RING + 12                 # text column
TW = IN_R - TX

DIV_Y = TOP_B + 4                             # dashed divider
LOC_Y = DIV_Y + 4
BIO_Y = LOC_Y + 12
BIO_LH = 10
BAND_H = 22                                   # counts row
BAND_Y = CARD_Y + CARD_H - 6 - BAND_H

PILL_Y = CARD_Y + 6                           # sync / age pill, top right

# The name takes the largest size at which it wraps into two lines on
# word boundaries; the designation then takes the largest smaller size
# that does the same and still fits the block.
NAME_FONTS = ("pixelify_24", "pixelify_16", "pixelify_12")
DESIG_FONTS = {"pixelify_24": ("pixelify_16", "pixelify_12", "pixelify_8"),
               "pixelify_16": ("pixelify_12", "pixelify_8"),
               "pixelify_12": ("pixelify_12", "pixelify_8")}
_MONO_SCALE = {"pixelify_24": 3, "pixelify_16": 2}

# Shown when the owner set nothing at all: the badge never borrows someone
# else's profile.
SETUP_LINES = (
    ("Your name, title and GitHub card", "text"),
    ("come from your owner profile.", "text"),
    ("", None),
    ("On your computer, run:", "text"),
    ("falera setup --from-file .env.local", "cmd"),
    ("or follow docs/PROFILE.md.", "text"),
    ("", None),
    ("Keys: GITHUB_USER, DISPLAY_NAME,", "dim"),
    ("      DISPLAY_DESIGNATION", "dim"),
)


# ── helpers ──────────────────────────────────────────────────────────────

class _Mono:
    """The built-in 8x8 font behind the PixelFont interface (fallback)."""

    def __init__(self, scale):
        self.scale = scale
        self.h = 8 * scale

    def measure(self, s):
        return len(s) * 8 * self.scale

    def text(self, d, s, x, y, color):
        if self.scale == 1:
            d.text(s, x, y, color)
        else:
            d.text(s, x, y, color, scale=self.scale)


_MONO1 = _Mono(1)


def _owner():
    """(DISPLAY_NAME, DISPLAY_DESIGNATION) from the owner profile; "" when
    unset. DESIGNATION resolves through profile.ALIASES either way round."""
    try:
        from oreoOS import profile
        name = profile.get("DISPLAY_NAME", "")
        title = profile.get("DESIGNATION", "")
    except Exception:
        return "", ""
    return _clean(name), _clean(title)


def _clean(v):
    if not v or not isinstance(v, str):
        return ""
    return " ".join(v.split())


def _try_avatar(user):
    """The owner's avatar from /avatar.bin as (pixels, w, h), only when it
    was made for `user`; None otherwise (the initials disc is drawn). Read
    once in on_enter, never in update/draw."""
    try:
        from oreoOS import profile
        return profile.avatar(user, 2 * AV_R)
    except Exception:
        return None


# Releases up to v2.0.x shipped one person's avatar here to every badge.
# OTA never deletes files, so the Badge app removes it (deploys do too).
OLD_AVATAR = "/apps/badge/assets/optimized/avatar.py"


def _drop_shipped_avatar():
    try:
        import os
        os.remove(OLD_AVATAR)
    except Exception:
        pass


def _filled_circle(d, cx, cy, r, color):
    """Filled circle by horizontal scan-lines."""
    for dy in range(-r, r + 1):
        dx = int((r * r - dy * dy) ** 0.5)
        d.rect(cx - dx, cy + dy, dx * 2 + 1, 1, color, fill=True)


def _round_rect(d, x, y, w, h, r, color):
    """Filled rectangle with rounded corners (2r + 1 rects)."""
    d.rect(x, y + r, w, h - 2 * r, color, fill=True)
    for i in range(r):
        dy = r - i - 0.5
        inset = r - int((r * r - dy * dy) ** 0.5 + 0.5)
        d.rect(x + inset, y + i, w - 2 * inset, 1, color, fill=True)
        d.rect(x + inset, y + h - 1 - i, w - 2 * inset, 1, color, fill=True)


def _cut(text, f, width, mark="~"):
    """`text` trimmed (with `mark`) until it measures within `width`."""
    if f.measure(text) <= width:
        return text
    while text and f.measure(text + mark) > width:
        text = text[:-1]
    return text.rstrip() + mark


def _wrap(text, f, width, max_lines, mark="~"):
    """Word-wrap `text` to `width` px with font `f`.

    Returns (lines, clean): clean is False when a word had to be broken or
    text had to be dropped to stay within `max_lines`; the last line then
    ends in `mark`, after its last whole word when there is one. Words are
    only split when one alone is wider than `width`.
    """
    words = text.split()
    lines = []
    cur = ""
    clean = True
    i = 0
    while i < len(words):
        w = words[i]
        cand = (cur + " " + w) if cur else w
        if f.measure(cand) <= width:
            cur = cand
            i += 1
            continue
        if cur:
            lines.append(cur)
            cur = ""
            continue
        # One word wider than the line: break it.
        clean = False
        n = len(w)
        while n > 1 and f.measure(w[:n]) > width:
            n -= 1
        lines.append(w[:n])
        words[i] = w[n:]
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        clean = False
        lines = lines[:max_lines]
        last = lines[-1]
        while " " in last and f.measure(last + mark) > width:
            last = last.rsplit(" ", 1)[0]
        lines[-1] = _cut(last + mark, f, width, mark)
    return lines, clean


def _initials(name, login):
    words = name.split() if name else []
    if words:
        s = words[0][:1]
        if len(words) > 1:
            s += words[-1][:1]
        return s.upper()
    return (login or "?")[:1].upper()


def _count(n):
    """Compact count: 999, 1.2k, 34k."""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return "-"
    if n < 1000:
        return str(n)
    if n < 10000:
        return "%d.%dk" % (n // 1000, (n % 1000) // 100)
    return "%dk" % (n // 1000)


def _age_label(age_s):
    if age_s is None:
        return ""
    if age_s >= cache.UNKNOWN_AGE:
        return "cached"
    if age_s < 60:
        return "just now"
    if age_s < 3600:
        return "%dm ago" % (age_s // 60)
    if age_s < 86400:
        return "%dh ago" % (age_s // 3600)
    return "%dd ago" % (age_s // 86400)


def auto_fetch_ok(net=None):
    """True when an automatic (not user-asked) refresh may start: Wi-Fi up,
    past netsvc's boot quiet window, on a build with threads and with no
    other background network thread running. Same gate as Commits."""
    if not github.online():
        return False
    if net is None:
        try:
            from oreoOS import netsvc as net
        except Exception:
            return True
    try:
        if not net.has_threads() or net.in_quiet():
            return False
    except Exception:
        return True
    try:
        return not net.fetch_busy()
    except Exception:
        return True


class App(oreoOS.App):
    name         = "Badge"
    SHOW_LOADING = False      # the cached card is drawn immediately

    def on_enter(self, os):
        self._os = os
        # "" until the owner sets GITHUB_USER: then nothing is fetched and
        # the badge never shows a stranger's profile.
        self._user = _clean(github.user("")).lstrip("@")
        self._name, self._title = _owner()
        _drop_shipped_avatar()
        self._avatar = _try_avatar(self._user) if self._user else None
        self._fonts = {}
        if self._user:
            self._profile, self._age0 = github.cached_profile(self._user)
        else:
            self._profile, self._age0 = None, None
        self._opened_ms = time.ticks_ms()
        self._age_txt = ""
        self._age_s = -1
        self._note = None           # "no Wi-Fi" / "sync failed" pill
        self._layout = None         # identity block, built once per data
        user = self._user
        self._job = (cache.Refresh(lambda: github.fetch_profile(user))
                     if user else None)
        # A stale cache refreshes by itself, but not inside the boot quiet
        # window: update() starts it once that is over.
        self._auto = bool(user) and github.stale(self._age0,
                                                 github.PROFILE_TTL_S)
        if self._auto and auto_fetch_ok():
            self._refresh(quiet=True)
        self._update_age()
        self._dirty = True

    def on_exit(self):
        # A running fetch finishes on its own and writes the cache; the
        # next open picks the result up from flash.
        self._job = None
        self._fonts = {}
        self._layout = None
        self._avatar = None         # ~10 KB back to the heap

    # ── data ─────────────────────────────────────────────────────────────
    def _refresh(self, quiet=False):
        self._auto = False
        if self._job is None or self._job.busy():
            return
        if not github.online():
            if not quiet:
                self._note = "no Wi-Fi"
            return
        self._note = None
        self._job.start()

    def _update_age(self):
        # Called every frame: only rebuild the label (a string allocation)
        # when the elapsed second changes.
        el = time.ticks_diff(time.ticks_ms(), self._opened_ms) // 1000
        if el == self._age_s and self._age_txt:
            return
        self._age_s = el
        if self._age0 is None:
            txt = ""
        elif self._age0 >= cache.UNKNOWN_AGE:
            txt = _age_label(self._age0)
        else:
            txt = _age_label(self._age0 + el)
        if txt != self._age_txt:
            self._age_txt = txt
            self._dirty = True

    def on_button_press(self, btn):
        if btn == api.BTN_A:
            self._refresh()
            self._dirty = True

    def update(self, dt):
        job = self._job
        if job is not None:
            if self._auto and auto_fetch_ok():
                self._refresh(quiet=True)
                self._dirty = True
            if job.poll():
                if job.result:
                    self._profile = job.result
                    self._age0 = 0
                    self._opened_ms = time.ticks_ms()
                    self._age_s = -1
                    self._note = None
                    self._layout = None
                else:
                    self._note = "sync failed"
                self._dirty = True
        self._update_age()

    # ── fonts and layout ─────────────────────────────────────────────────
    def _font(self, name):
        f = self._fonts.get(name)
        if f is None:
            try:
                f = pixelfont.load(name)
            except Exception:
                f = _Mono(_MONO_SCALE.get(name, 1))
            self._fonts[name] = f
        return f

    def _display_name(self):
        p = self._profile
        if self._name:
            return self._name
        if p and p.get("name"):
            return _clean(p.get("name"))
        return self._user

    def _build_layout(self):
        """Pick the name and designation fonts (NAME_FONTS, DESIG_FONTS),
        then centre the block on the avatar. Text that cannot fit even at
        the smallest size ends in "~" instead of leaving the card. Done
        once per data change, not per frame."""
        name = self._display_name()
        title = self._title
        handle = ("@" + self._user) if self._user else ""
        h_handle = 8 if handle else 0
        room = TOP_B - TOP_Y
        best = None
        for nf_name in NAME_FONTS:
            nf = self._font(nf_name)
            n_lines, n_ok = _wrap(name, nf, TW, 2)
            if not n_ok and nf_name != NAME_FONTS[-1]:
                continue                 # try a smaller size first
            pick = None
            for df_name in (DESIG_FONTS[nf_name] if title else (None,)):
                df, d_lines, d_ok = None, [], True
                if df_name:
                    df = self._font(df_name)
                    d_lines, d_ok = _wrap(title, df, TW, 2)
                total = self._block_h(nf, n_lines, df, d_lines, h_handle)
                if total > room:
                    continue
                pick = (nf, n_lines, df, d_lines, total)
                if d_ok:
                    break                # largest size with whole words
            if pick is not None:
                best = pick
                break
        if best is None:                 # cannot happen with these fonts
            nf = self._font(NAME_FONTS[-1])
            best = (nf, _wrap(name, nf, TW, 1)[0], None, [], nf.h)
        nf, n_lines, df, d_lines, total = best
        y = TOP_Y + (TOP_B - TOP_Y - total) // 2
        rows = []
        for ln in n_lines:
            rows.append((nf, ln, y, theme.TEXT_BRIGHT))
            y += self._lh(nf)
        if d_lines:
            y += 3
            for ln in d_lines:
                rows.append((df, ln, y, theme.TEXT_DIM))
                y += self._lh(df)
        if handle:
            y += 4
            rows.append((_MONO1, _cut(handle, _MONO1, TW), y, theme.PRIMARY))
        self._layout = rows

    @staticmethod
    def _lh(f):
        return f.h if f.h >= 20 else f.h + 1

    def _block_h(self, nf, n_lines, df, d_lines, h_handle):
        h = len(n_lines) * self._lh(nf)
        if d_lines:
            h += 3 + len(d_lines) * self._lh(df)
        if h_handle:
            h += 4 + h_handle
        return h

    # ── render ───────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False
        d.clear(theme.BG)
        widgets.draw_header(d, TITLE)
        widgets.draw_hint(d, HINT if self._user else HINT_NO_USER)
        self._draw_card(d)
        if not (self._user or self._name):
            self._draw_setup(d)
            return
        if self._layout is None:
            self._build_layout()
        self._draw_avatar(d)
        for f, text, y, col in self._layout:
            f.text(d, text, TX, y, col)
        self._draw_divider(d)
        if not self._user:
            self._draw_no_user(d)
        elif self._profile is None:
            self._draw_not_synced(d)
        else:
            self._draw_github(d, self._profile)
        self._draw_status(d)

    def _draw_card(self, d):
        _round_rect(d, CARD_X + 2, CARD_Y + 2, CARD_W, CARD_H, CARD_R,
                    theme.MUTED2)
        _round_rect(d, CARD_X, CARD_Y, CARD_W, CARD_H, CARD_R, theme.GOLD)
        _round_rect(d, CARD_X, CARD_Y + 4, CARD_W, CARD_H - 4, CARD_R,
                    theme.CARD)
        # Lanyard slot punched through the card.
        _round_rect(d, SLOT_X, SLOT_Y, SLOT_W, SLOT_H, 3, theme.MUTED2)
        _round_rect(d, SLOT_X + 1, SLOT_Y + 1, SLOT_W - 2, SLOT_H - 2, 2,
                    theme.BG)

    def _draw_avatar(self, d):
        _filled_circle(d, AV_CX, AV_CY, AV_R + RING, theme.PRIMARY)
        if self._avatar:
            data, aw, ah = self._avatar
            _filled_circle(d, AV_CX, AV_CY, AV_R, theme.CARD)
            d.blit(data, AV_CX - aw // 2, AV_CY - ah // 2, aw, ah)
            return
        _filled_circle(d, AV_CX, AV_CY, AV_R, theme.DOCK_SEL)
        letters = _initials(self._display_name(), self._user)
        f = self._font("pixelify_24")
        if f.measure(letters) > 2 * AV_R - 16:
            f = _MONO1
        f.text(d, letters, AV_CX - f.measure(letters) // 2,
               AV_CY - f.h // 2, theme.PRIMARY)

    def _draw_divider(self, d):
        for x in range(IN_X, IN_R, 6):
            d.rect(x, DIV_Y, 3, 1, theme.MUTED2, fill=True)

    def _draw_github(self, d, p):
        y = LOC_Y
        loc = _clean(p.get("location") or "")
        if loc:
            _filled_circle(d, IN_X + 3, y + 3, 3, theme.TEAL)
            d.rect(IN_X + 3, y + 6, 1, 3, theme.TEAL, fill=True)
            d.text(_cut(loc, _MONO1, IN_W - 12), IN_X + 12, y,
                   theme.TEXT_DIM)
            y = BIO_Y
        bio = _clean(p.get("bio") or "")
        if bio:
            room = min(2, (BAND_Y - 3 - y + 2) // BIO_LH)
            lines = _wrap(bio, _MONO1, IN_W, room, "...")[0] \
                if room > 0 else []
            for ln in lines:
                d.text(ln, IN_X, y, theme.MUTED)
                y += BIO_LH
        self._draw_counts(d, p)

    def _draw_counts(self, d, p):
        _round_rect(d, IN_X, BAND_Y, IN_W, BAND_H, 4, theme.DOCK_SEL)
        num_f = self._font("pixelify_12")
        lbl_f = self._font("pixelify_8")
        cw = IN_W // 3
        for i, (lbl, key, col) in enumerate((
                ("repos",     "repos",     theme.PRIMARY),
                ("followers", "followers", theme.TEAL),
                ("following", "following", theme.ORANGE))):
            cx = IN_X + i * cw
            if i:
                d.rect(cx, BAND_Y + 4, 1, BAND_H - 8, theme.MUTED2, fill=True)
            num = _count(p.get(key, 0))
            nw = num_f.measure(num)
            lw = lbl_f.measure(lbl)
            if nw + 4 + lw <= cw - 6:
                # One line: number then label, sharing a baseline.
                x = cx + (cw - nw - 4 - lw) // 2
                ny = BAND_Y + (BAND_H - num_f.h) // 2
                num_f.text(d, num, x, ny, col)
                ly = ny + num_f.h - lbl_f.h - 1
                if ly < ny:
                    ly = ny
                lbl_f.text(d, lbl, x + nw + 4, ly, theme.TEXT_DIM)
            else:
                # Stacked: number above label.
                top = BAND_Y + (BAND_H - num_f.h - 2 - lbl_f.h) // 2
                num_f.text(d, num, cx + (cw - nw) // 2, top, col)
                lbl = _cut(lbl, lbl_f, cw - 4)
                lbl_f.text(d, lbl, cx + (cw - lbl_f.measure(lbl)) // 2,
                           top + num_f.h + 2, theme.TEXT_DIM)

    def _draw_note_box(self, d, lines):
        """Up to four short lines in the GitHub area (y DIV_Y..card end)."""
        top = DIV_Y + 6
        bottom = CARD_Y + CARD_H - 6
        _round_rect(d, IN_X, top, IN_W, bottom - top, 4, theme.DOCK_SEL)
        y = top + (bottom - top - len(lines) * 12 + 4) // 2
        for text, col in lines:
            text = _cut(text, _MONO1, IN_W - 12)
            d.text(text, IN_X + 6, y, col)
            y += 12

    def _draw_not_synced(self, d):
        job = self._job
        if job is not None and job.busy():
            second = "Fetching it from GitHub now..."
        elif not github.online():
            second = "Connect Wi-Fi, then press A."
        else:
            second = "Press A to fetch it."
        self._draw_note_box(d, (
            ("GitHub card not synced yet.", theme.PRIMARY),
            (second, theme.TEXT_BRIGHT),
            ("It is kept on the badge after", theme.MUTED),
            ("that, so it works offline.", theme.MUTED),
        ))

    def _draw_no_user(self, d):
        self._draw_note_box(d, (
            ("No GitHub user set.", theme.PRIMARY),
            ("For your GitHub card, run:", theme.TEXT_BRIGHT),
            ("falera setup --set GITHUB_USER=you", theme.TEXT_DIM),
            ("See docs/PROFILE.md.", theme.MUTED),
        ))

    def _draw_status(self, d):
        """Sync pill / age label in the card's top-right corner."""
        job = self._job
        if job is not None and job.busy():
            label, bg, fg = "SYNCING", theme.PRIMARY, api.WHITE
        elif self._note:
            label, bg, fg = self._note, theme.ORANGE, api.WHITE
        elif self._age_txt:
            label, bg, fg = self._age_txt, None, theme.MUTED
        else:
            return
        w = len(label) * 8 + 10
        x = IN_R - w
        if bg is not None:
            _round_rect(d, x, PILL_Y, w, 12, 3, bg)
        d.text(label, x + 5, PILL_Y + 2, fg)

    def _draw_setup(self, d):
        f = self._font("pixelify_16")
        title = "Set up your badge"
        f.text(d, title, (SW - f.measure(title)) // 2, CARD_Y + 18,
               theme.PRIMARY)
        y = CARD_Y + 18 + f.h + 10
        for text, kind in SETUP_LINES:
            if kind == "cmd":
                w = _MONO1.measure(text)
                x = (SW - w) // 2
                d.rect(x - 4, y - 3, w + 8, 14, theme.DOCK_SEL, fill=True)
                d.text(text, x, y, theme.TEXT_BRIGHT)
            elif kind:
                col = theme.MUTED if kind == "dim" else theme.TEXT_BRIGHT
                d.text(text, IN_X + 6, y, col)
            y += 14 if kind == "cmd" else 12
