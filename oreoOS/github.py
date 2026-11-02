"""GitHub data for the badge, offline first.

Badge (profile card) and Commits (contribution graph) share this module so
they behave the same way:

  * `cached_*()` reads flash only and never touches the network, so apps
    can draw their screen the instant they open, Wi-Fi or not;
  * `fetch_*()` does one bounded HTTPS request through `oreoOS._http`
    (timeouts that are honoured, unlike urequests) and only when Wi-Fi is
    already connected; on success it writes the cache;
  * `stale()` tells an app whether a refresh is worth doing.

No token is needed: the profile comes from the public REST API and the
graph from the public contributions page.
"""

from oreoOS import cache

PROFILE_PATH = "apps/badge/cache.txt"
GRAPH_PATH = "apps/commits/cache.txt"
PROFILE_TTL_S = 6 * 3600
GRAPH_TTL_S = 3 * 3600
TIMEOUT_S = 6


def user(default="octocat"):
    try:
        from secrets import GITHUB_USER
        return GITHUB_USER or default
    except Exception:
        return default


def online():
    """True when a refresh can be attempted without waiting on Wi-Fi."""
    try:
        from oreoWare import wifi
        return wifi.is_connected()
    except Exception:
        return False


def stale(age_s, ttl_s):
    return age_s is None or age_s > ttl_s


def _get(url, accept=None):
    try:
        from oreoOS import _http
        return _http.get_url(url, accept=accept, timeout_s=TIMEOUT_S)
    except Exception:
        return None


# ── profile ────────────────────────────────────────────────────────────────

def cached_profile(login):
    """Return (profile dict, age_s) from flash, or (None, None)."""
    payload, age = cache.load(PROFILE_PATH)
    if not payload or payload.get("login", "").lower() != login.lower():
        return None, None
    try:
        return {
            "name": payload.get("name", "") or login,
            "login": payload.get("login", login),
            "bio": payload.get("bio", ""),
            "location": payload.get("location", ""),
            "followers": int(payload.get("followers", 0)),
            "following": int(payload.get("following", 0)),
            "repos": int(payload.get("repos", 0)),
        }, age
    except Exception:
        return None, None


def fetch_profile(login):
    """Fetch and cache the public profile; returns the dict or None."""
    if not online():
        return None
    body = _get("https://api.github.com/users/" + login,
                accept="application/vnd.github+json")
    if not body:
        return None
    try:
        import json
        data = json.loads(body.decode())
    except Exception:
        return None
    profile = {
        "name": data.get("name") or data.get("login") or login,
        "login": data.get("login") or login,
        "bio": (data.get("bio") or "")[:60],
        "location": (data.get("location") or "")[:24],
        "followers": data.get("followers", 0),
        "following": data.get("following", 0),
        "repos": data.get("public_repos", 0),
    }
    cache.save(PROFILE_PATH, profile)
    return profile


# ── contribution graph ─────────────────────────────────────────────────────

def _attr(body, start, name):
    """Value of attribute `name` (bytes) in the tag starting at `start`."""
    end = body.find(b">", start)
    key = name + b'="'
    i = body.find(key, start, end)
    if i < 0:
        return None
    i += len(key)
    j = body.find(b'"', i, end)
    return body[i:j] if j >= 0 else None


def _tooltip_counts(body):
    """Map cell id -> contribution count from the <tool-tip> labels."""
    counts = {}
    i = 0
    while True:
        i = body.find(b"<tool-tip", i)
        if i < 0:
            break
        cell = _attr(body, i, b"for")
        close = body.find(b">", i)
        end = body.find(b"</tool-tip>", close)
        if cell is None or close < 0 or end < 0:
            break
        text = body[close + 1:end].strip()
        n = 0
        if text[:1].isdigit():
            k = 0
            while k < len(text) and text[k:k + 1].isdigit():
                k += 1
            n = int(text[:k])
        counts[cell] = n          # "No contributions on ..." stays 0
        i = end
    return counts


def parse_contributions(body):
    """Return days as a chronological list of (date, level, count).

    The page lays the calendar out row by row (one row per weekday), and the
    legend squares also carry data-level, so cells are read individually by
    their data-date and sorted by date rather than taken in page order.
    """
    counts = _tooltip_counts(body)
    days = []
    i = 0
    while True:
        i = body.find(b'data-date="', i)
        if i < 0:
            break
        tag = body.rfind(b"<", 0, i)
        date = _attr(body, tag, b"data-date")
        level = _attr(body, tag, b"data-level")
        cell = _attr(body, tag, b"id")
        if date and level is not None:
            try:
                lv = max(0, min(4, int(level)))
            except ValueError:
                lv = 0
            days.append((date.decode(), lv, counts.get(cell, 0) if cell else 0))
        i += 11
    days.sort()
    return days


def cached_graph(login):
    """Return (days, age_s) from flash, or (None, None)."""
    try:
        import time
        with open(GRAPH_PATH) as f:
            head = f.readline().strip()
            name, _, ts = head.partition("|")
            if name.lower() != login.lower() or not ts:
                return None, None
            days = []
            for line in f:
                parts = line.strip().split(",")
                if len(parts) == 3:
                    days.append((parts[0], int(parts[1]), int(parts[2])))
        try:
            age = max(0, int(time.time()) - int(ts))
        except Exception:
            age = None
        return (days or None), (age if days else None)
    except Exception:
        return None, None


def _save_graph(login, days):
    try:
        import time
        with open(GRAPH_PATH, "w") as f:
            f.write("%s|%d\n" % (login, int(time.time())))
            for date, level, count in days:
                f.write("%s,%d,%d\n" % (date, level, count))
    except Exception:
        pass


def fetch_graph(login):
    """Fetch, parse and cache the contribution graph; returns days or None."""
    if not online():
        return None
    body = _get("https://github.com/users/%s/contributions" % login,
                accept="text/html")
    if not body:
        return None
    days = parse_contributions(body)
    del body
    if not days:
        return None
    _save_graph(login, days)
    return days
