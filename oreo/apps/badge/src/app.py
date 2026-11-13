"""Badge — GitHub identity card.

Reads GITHUB_USER from secrets.py and renders a centred identity card from
the profile cached on flash, so it opens instantly with or without WiFi:

  ╔════════════════════╗
  ║       (avatar)     ║
  ║  Display Name      ║
  ║  @login            ║
  ║  ──────────────    ║
  ║ repos  fol  fol    ║
  ║   42  120  35      ║
  ╚════════════════════╝

The avatar is stamped at deploy time by tools/fetch_avatar.py (committed as
apps/badge/assets/optimized/avatar.py) so it renders on-device without WiFi.
When the cached profile is older than oreoOS.github.PROFILE_TTL_S and WiFi
is connected, the app refreshes it after the first frame, with a SYNCING
label over the card instead of a blank loading screen.

Controls:
  A      refresh now
  HOME   apps drawer
"""

import oreoOS
from oreoOS import api, github
from oreoOS import theme, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H


def _try_avatar():
    """Load the pre-fetched avatar baked at deploy time, or None."""
    try:
        m = __import__("apps.badge.assets.optimized.avatar", None, None,
                       ["DATA", "W", "H"])
        return (bytearray(m.DATA), m.W, m.H)
    except (ImportError, AttributeError):
        return None


def _filled_circle(d, cx, cy, r, color):
    """Approximate filled circle by horizontal scan-lines."""
    for dy in range(-r, r + 1):
        dx = int((r * r - dy * dy) ** 0.5)
        d.rect(cx - dx, cy + dy, dx * 2 + 1, 1, color, fill=True)


def _wrap(text, max_chars):
    """Word-wrap helper — splits at spaces, hard-breaks oversized words."""
    if not text:
        return [""]
    out, cur = [], ""
    for w in text.split():
        cand = (cur + " " + w).strip()
        if len(cand) <= max_chars:
            cur = cand
        else:
            if cur:
                out.append(cur)
                cur = ""
            if len(w) > max_chars:
                while len(w) > max_chars:
                    out.append(w[:max_chars])
                    w = w[max_chars:]
            cur = w
    if cur:
        out.append(cur)
    return out


class App(oreoOS.App):
    name         = "Badge"
    SHOW_LOADING = False      # the cached card is drawn immediately

    def on_enter(self, os):
        self._os = os
        self._user = github.user("octocat")
        self._avatar = _try_avatar()
        self._profile, age = github.cached_profile(self._user)
        # 0 idle, 1 SYNCING label requested, 2 label drawn: fetch now.
        self._sync = 1 if (github.stale(age, github.PROFILE_TTL_S)
                           and github.online()) else 0
        self._dirty = True

    def on_button_press(self, btn):
        if btn == api.BTN_A and self._sync == 0:
            self._sync = 1
            self._dirty = True

    def update(self, dt):
        if self._sync == 1:
            self._sync = 2          # let draw() paint the SYNCING label first
        elif self._sync == 2:
            fresh = github.fetch_profile(self._user)
            if fresh:
                self._profile = fresh
            self._sync = 0
            self._dirty = True

    # ── render ───────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        d.clear(theme.BG)
        widgets.draw_header(d, "BADGE")
        widgets.draw_hint  (d, "A=refresh  HOME=back")

        if self._profile is None:
            self._draw_offline(d)
            self._draw_sync(d)
            self._dirty = False
            return

        p = self._profile

        # Card centred in the play area.
        play_top = widgets.HEADER_H
        play_h   = SH - widgets.HEADER_H - widgets.HINT_H
        cw, ch   = SW - 24, play_h - 16
        cx, cy   = (SW - cw) // 2, play_top + 8
        # Soft shadow + body + top accent
        d.rect(cx + 2, cy + 2, cw, ch, theme.MUTED2, fill=True)
        d.rect(cx,     cy,     cw, ch, theme.CARD,   fill=True)
        d.rect(cx,     cy,     cw,  3, theme.PRIMARY, fill=True)

        # ── avatar (top-centred, sized to the baked asset, pink ring) ──
        if self._avatar:
            data, aw, ah = self._avatar
            av_sz = max(aw, ah)
        else:
            aw = ah = av_sz = 48
            data = None
        av_cx = SW // 2
        av_cy = cy + 14 + av_sz // 2
        _filled_circle(d, av_cx, av_cy, av_sz // 2 + 3, theme.PRIMARY)
        if data:
            d.blit(data, av_cx - aw // 2, av_cy - ah // 2, aw, ah)
        else:
            _filled_circle(d, av_cx, av_cy, av_sz // 2, theme.CARD)
            letter = (p["login"] or "?")[:1].upper()
            d.text(letter, av_cx - 12, av_cy - 12, theme.PRIMARY, scale=3)

        # ── name + @login centred under avatar, with breathing-room margin
        # so the text block doesn't crowd the pfp.
        TEXT_MARGIN = 18                     # gap between avatar bottom and name
        name_y = av_cy + av_sz // 2 + TEXT_MARGIN
        for line in _wrap(p["name"][:32], 18)[:1]:
            lw = len(line) * 16
            d.text(line, (SW - lw) // 2, name_y, theme.PRIMARY, scale=2)
        name_y += 22

        login_lines = _wrap("@" + p["login"], 24)[:2]
        for ln in login_lines:
            lw = len(ln) * 8
            d.text(ln, (SW - lw) // 2, name_y, theme.TEAL)
            name_y += 10

        # ── stats row at the bottom of the card ──────────────────────
        stats_y = cy + ch - 30
        col_w   = cw // 3
        for i, (lbl, val) in enumerate([
                ("repos",     p["repos"]),
                ("followers", p["followers"]),
                ("following", p.get("following", 0))]):
            mx = cx + col_w * i + col_w // 2
            num = str(val)
            d.text(num, mx - len(num) * 8, stats_y, theme.PRIMARY, scale=2)
            d.text(lbl, mx - len(lbl) * 4, stats_y + 22, theme.MUTED)

        self._draw_sync(d)
        self._dirty = False

    def _draw_sync(self, d):
        if not self._sync:
            return
        label = "SYNCING"
        w = len(label) * 8 + 12
        x = SW - w - 8
        y = widgets.HEADER_H + 4
        d.rect(x, y, w, 12, theme.PRIMARY, fill=True)
        d.text(label, x + 6, y + 2, api.WHITE)

    def _draw_offline(self, d):
        cw, ch = SW - 32, SH - widgets.HEADER_H - widgets.HINT_H - 32
        cx, cy = 16, widgets.HEADER_H + 16
        d.rect(cx + 2, cy + 2, cw, ch, theme.MUTED2, fill=True)
        d.rect(cx,     cy,     cw, ch, theme.CARD,   fill=True)
        d.rect(cx,     cy,     cw,  2, theme.PRIMARY, fill=True)
        d.text("offline", (SW - 7 * 16) // 2, cy + 14, theme.PRIMARY, scale=2)
        for i, line in enumerate([
                "No GitHub data yet.",
                "",
                "set on your laptop:",
                "",
                "  WIFI_SSID=...",
                "  WIFI_PASSWORD=...",
                "  GITHUB_USER=" + self._user[:16],
                "",
                "redeploy + press A."]):
            d.text(line, cx + 16, cy + 42 + i * 12, theme.TEXT_BRIGHT)
