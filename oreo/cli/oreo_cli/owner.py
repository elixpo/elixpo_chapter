"""`falera setup`: the badge owner's profile, written over USB.

Badge, Commits, Weather and the clock read the owner's details
through oreoOS/profile.py, which takes the first non-empty value from
/profile.json on the badge, then /secrets.py (written by tools/deploy.py),
then the app's own default. This command edits /profile.json, so a badge
can be set up without a repo checkout or a .env.local (docs/PROFILE.md).

/profile.json is a flat JSON object with the keys in KEYS (the secrets.py
names). Numbers are stored as numbers, like oreoOS.profile.save() does,
and an empty value removes the key so the secrets.py value shows through.

The OpenWeatherMap key never comes back from the badge: the read snippet
only reports whether one is set, and the merge happens on the badge, so
the computer only ever holds a key the person has just typed. It is sent
once and redacted from any error text.

After the profile, setup makes sure /avatar.bin holds GITHUB_USER's GitHub
avatar (avatar.py): fetched and converted on this computer, copied over
USB, fetched again only when the user changed or --avatar asks for it.
"""

import math
import re
from pathlib import Path
import sys

from . import avatar
from .badge import lit
from .commands import command
from .errors import BadgeError, Cancelled, OreoError, UsageError
from .ui import esc

PATH = "/profile.json"

# Same keys, in the same order, as KEYS in oreoOS/profile.py (a contract
# test checks this inside a FaleraOS checkout).
KEYS = ("GITHUB_USER", "DISPLAY_NAME", "DISPLAY_DESIGNATION", "TIMEZONE_OFFSET",
        "WEATHER_LAT", "WEATHER_LON", "WEATHER_NAME", "OWM_API_KEY")
NUMERIC = ("TIMEZONE_OFFSET", "WEATHER_LAT", "WEATHER_LON")
SECRET = "OWM_API_KEY"
# Older names still accepted on input (files, --set) and read from the badge.
ALIASES = {"DESIGNATION": "DISPLAY_DESIGNATION"}

# key -> (option, label shown in prompts and tables)
FIELDS = (
    ("GITHUB_USER", "github_user", "GitHub user"),
    ("DISPLAY_NAME", "name", "Name"),
    ("DISPLAY_DESIGNATION", "designation", "Title"),
    ("TIMEZONE_OFFSET", "timezone", "Timezone (hours from UTC)"),
    ("WEATHER_LAT", "lat", "Weather latitude"),
    ("WEATHER_LON", "lon", "Weather longitude"),
    ("WEATHER_NAME", "weather_name", "Weather place name"),
    ("OWM_API_KEY", "owm_key", "OpenWeatherMap key"),
)
LABELS = {k: label for k, _, label in FIELDS}

_GITHUB_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")
_OFFSET_RE = re.compile(r"^(?:UTC|GMT)?\s*([+-]?)(\d{1,2})(?::(\d{2}))?$", re.I)
_TEXT_MAX = {"DISPLAY_NAME": 32, "DISPLAY_DESIGNATION": 40, "WEATHER_NAME": 32}


def _number(text, what):
    try:
        v = float(text)
    except (TypeError, ValueError):
        raise UsageError("%s must be a number, not %r" % (what, text))
    if math.isnan(v) or math.isinf(v):
        raise UsageError("%s must be a number, not %r" % (what, text))
    return v


def parse_offset(text):
    """Hours from UTC: 5.5, -4, +05:30, UTC+5:45. Range -12 to +14, in
    quarter hours (every zone in use today is a multiple of 15 minutes)."""
    s = str(text).strip()
    m = _OFFSET_RE.match(s)
    if m and m.group(3) is not None:
        minutes = int(m.group(3))
        if minutes >= 60:
            raise UsageError("timezone %r: minutes must be under 60" % s)
        v = int(m.group(2)) + minutes / 60.0
        if m.group(1) == "-":
            v = -v
    elif m:
        v = float(int(m.group(2)) * (-1 if m.group(1) == "-" else 1))
    else:
        v = _number(s, "the timezone offset")
    if not -12 <= v <= 14:
        raise UsageError("timezone offset %s is out of range" % s,
                         hint="use hours from UTC between -12 and +14, e.g. 5.5 or -4")
    if abs(v * 4 - round(v * 4)) > 1e-9:
        raise UsageError("timezone offset %s is not a whole number of quarter hours" % s,
                         hint="e.g. 5.5 for UTC+5:30, 5.75 for UTC+5:45")
    return round(v * 4) / 4.0


def validate(key, value):
    """The value to store for `key`, or "" to remove it. Raises UsageError."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if value == "":
            return ""
    if key == "GITHUB_USER":
        v = str(value).lstrip("@")
        if not _GITHUB_RE.match(v):
            raise UsageError("%r is not a GitHub user name" % v,
                             hint="letters, digits and single hyphens, at most 39 characters")
        return v
    if key == "TIMEZONE_OFFSET":
        return parse_offset(value)
    if key == "WEATHER_LAT":
        v = _number(value, "latitude")
        if not -90 <= v <= 90:
            raise UsageError("latitude %s is out of range" % value,
                             hint="between -90 (south) and 90 (north)")
        return v
    if key == "WEATHER_LON":
        v = _number(value, "longitude")
        if not -180 <= v <= 180:
            raise UsageError("longitude %s is out of range" % value,
                             hint="between -180 (west) and 180 (east)")
        return v
    if key == SECRET:
        v = str(value)
        if not re.match(r"^[A-Za-z0-9]{16,64}$", v):
            # do not quote it: it is a secret, even when malformed
            raise UsageError("that does not look like an OpenWeatherMap API key",
                             hint="copy the key from https://home.openweathermap.org/api_keys "
                                  "(32 letters and digits)")
        return v
    v = str(value)
    limit = _TEXT_MAX.get(key, 40)
    if len(v) > limit:
        raise UsageError("%s is %d characters; keep it to %d so it fits the screen"
                         % (LABELS[key], len(v), limit))
    if any(ord(c) < 32 for c in v):
        raise UsageError("%s has control characters" % LABELS[key])
    if not all(32 <= ord(c) < 127 for c in v):
        raise UsageError("%s must be plain ASCII letters, digits and punctuation "
                         "(the badge font has no others)" % LABELS[key],
                         hint="e.g. Jose for José")
    return v


# ── on the badge ─────────────────────────────────────────────────────

def _read_code():
    return (
        "K=%(k)s\n"
        "S=%(s)s\n"
        "def _m(d):\n"
        " o={}\n"
        " for k in K:\n"
        "  v=d.get(k)\n"
        "  if v is None or (isinstance(v,str) and not v.strip()):\n"
        "   continue\n"
        "  o[k]=bool(v) if k==S else v\n"
        " return o\n"
        "f=None\n"
        "st='missing'\n"
        "for p in (%(p)s,%(p)s+'.tmp'):\n"
        " try:\n"
        "  with open(p) as h:\n"
        "   d=_j.loads(h.read())\n"
        "  if isinstance(d,dict):\n"
        "   f=_m(d)\n"
        "   st='ok' if p==%(p)s else 'tmp'\n"
        "   break\n"
        "  st='bad'\n"
        " except OSError:\n"
        "  pass\n"
        " except Exception:\n"
        "  st='bad'\n"
        "s={}\n"
        "try:\n"
        " import secrets as _s\n"
        " s=_m({k:getattr(_s,k,None) for k in K})\n"
        " _s=None\n"
        "except Exception:\n"
        " pass\n"
        "_e({'file':f,'state':st,'secrets':s})\n"
        % {"k": lit(list(KEYS) + list(ALIASES)), "s": lit(SECRET), "p": lit(PATH)})


def read(b):
    """{'file': {...} or None, 'state': ok|tmp|missing|bad, 'secrets': {...}}
    with the OWM key replaced by True when it is set."""
    return b.result(_read_code())


def _write_code(updates):
    # Merge on the badge so an existing key never has to leave it. Staged
    # as /profile.json.tmp, read back and parsed, then renamed over
    # /profile.json, with the remove-then-rename fallback FAT needs. The
    # staging name is the one oreoOS/state.read_json falls back to, so a
    # power cut between the remove and the rename still leaves a profile
    # the badge reads (the same scheme as state.write_json).
    return (
        "import os\n"
        "U=%(u)s\n"
        "d={}\n"
        "for p in (%(p)s,%(p)s+'.tmp'):\n"
        " try:\n"
        "  with open(p) as h:\n"
        "   x=_j.loads(h.read())\n"
        "  if isinstance(x,dict):\n"
        "   d=x\n"
        "   break\n"
        " except Exception:\n"
        "  pass\n"
        "for k in U:\n"
        " if U[k]=='':\n"
        "  d.pop(k,None)\n"
        " else:\n"
        "  d[k]=U[k]\n"
        "U=None\n"
        "t=_j.dumps(d)\n"
        "w=%(p)s+'.tmp'\n"
        "with open(w,'w') as h:\n"
        " h.write(t)\n"
        "with open(w) as h:\n"
        " ok=_j.loads(h.read())==d\n"
        "if not ok:\n"
        " os.remove(w)\n"
        " raise OSError('read-back mismatch')\n"
        "try:\n"
        " os.rename(w,%(p)s)\n"
        "except OSError:\n"
        " try:\n"
        "  os.remove(%(p)s)\n"
        " except OSError:\n"
        "  pass\n"
        " os.rename(w,%(p)s)\n"
        "_e({'keys':sorted(k for k in d if d[k] not in (None,''))})\n"
        % {"u": lit(updates), "p": lit(PATH)})


def _with_aliases_cleared(updates):
    """Saving a key under its current name removes the older name from
    /profile.json, so a stale DESIGNATION can't shadow DISPLAY_DESIGNATION."""
    out = dict(updates)
    for alias, new in ALIASES.items():
        if new in out:
            out[alias] = ""
    return out


def write(b, updates):
    """Merge `updates` into /profile.json on the badge. Returns the keys
    now set in the file."""
    for k in updates:
        if k not in KEYS:
            raise UsageError("unknown profile key: %s" % k)
    secret = updates.get(SECRET)
    try:
        r = b.result(_write_code(_with_aliases_cleared(updates)),
                     secrets=(secret,) if secret else ())
    except BadgeError as e:
        raise OreoError("could not write %s on the badge: %s" % (PATH, e.message),
                        hint="check free space with `falera info`, then try again")
    return r.get("keys") or []


# ── showing it ───────────────────────────────────────────────────────

def _shown(key, value):
    if key == SECRET:
        return "[ok]set[/] [dim](hidden)[/]" if value else "[dim]not set[/]"
    if value is None:
        return "[dim]not set[/]"
    if key == "TIMEZONE_OFFSET":
        h = float(value)
        sign = "-" if h < 0 else "+"
        m = int(round(abs(h) * 60))
        return "%s [dim](UTC%s%d:%02d)[/]" % (esc(_num(h)), sign, m // 60, m % 60)
    if key in NUMERIC:
        return esc(_num(value))
    return esc(value)


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return str(v)
    return ("%d" % f) if f == int(f) else ("%g" % f)


def resolved(data):
    """key -> (value, source) the way oreoOS.profile.get() resolves it."""
    f = data.get("file") or {}
    s = data.get("secrets") or {}
    out = {}
    old = dict((new, alias) for alias, new in ALIASES.items())
    for k in KEYS:
        names = (k, old[k]) if k in old else (k,)
        hit = next(((f[n], "profile.json") for n in names if n in f), None) or \
            next(((s[n], "secrets.py") for n in names if n in s), None)
        out[k] = hit or (None, "")
    return out


def show(ui, data, title="profile"):
    rows = []
    for k, (value, source) in resolved(data).items():
        rows.append([esc(LABELS[k]), _shown(k, value),
                     ("[dim]%s[/]" % source) if source else "", "[dim]%s[/]" % k])
    ui.table(["Field", "Value", "From", "Key"], rows, title=title)
    state = data.get("state")
    if state == "bad":
        ui.warn("%s on the badge is not valid JSON; saving replaces it" % PATH)
    elif state == "tmp":
        ui.warn("%s was cut short by an earlier save; its backup is shown and saving "
                "repairs it" % PATH)
    elif state == "missing":
        ui.note("no %s yet: values come from secrets.py (deploy time) or nowhere" % PATH)


# ── the flow ─────────────────────────────────────────────────────────

def updates_from_args(args):
    """{key: validated value} from --from-file, then --set, then the named
    flags (later ones win; "" removes a key)."""
    out = {}
    if getattr(args, "from_file", None):
        got, _ = updates_from_file(args.from_file)
        out.update(got)
    out.update(updates_from_set(getattr(args, "set", None)))
    for key, opt, _ in FIELDS:
        raw = getattr(args, opt, None)
        if raw is not None:
            out[key] = validate(key, raw)
    if getattr(args, "owm_key_stdin", False):
        line = sys.stdin.readline().strip()
        if not line:
            raise UsageError("no key on standard input")
        out[SECRET] = validate(SECRET, line)
    return out


def canonical_key(name):
    """A profile key from a file or --set, by the names in .env.example /
    .env.local (older names accepted). None for anything else."""
    k = str(name).strip().upper()
    k = ALIASES.get(k, k)
    return k if k in KEYS else None


def parse_env_text(text):
    """KEY=VALUE pairs from .env-style text: comments, blank lines and an
    `export ` prefix are skipped, matching quotes are removed."""
    pairs = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
            v = v[1:-1]
        elif " #" in v:
            v = v.split(" #", 1)[0].rstrip()
        pairs.append((k, v))
    return pairs


def updates_from_file(path):
    """(updates, ignored_names) from an .env-style file. Only profile keys
    are taken; everything else (Wi-Fi password, tokens) is left alone and
    only its name is reported. Empty values are skipped, not removed."""
    try:
        text = Path(path).expanduser().read_text(encoding="utf-8")
    except OSError as e:
        raise UsageError("cannot read %s: %s" % (path, e.strerror or e))
    out, ignored = {}, []
    for name, value in parse_env_text(text):
        k = canonical_key(name)
        if k is None:
            ignored.append(name)
            continue
        if value == "":
            continue
        out[k] = validate(k, value)
    return out, ignored


def updates_from_set(items):
    """{key: value} from repeated --set KEY=VALUE ("KEY=" removes it)."""
    out = {}
    for item in items or ():
        if "=" not in item:
            raise UsageError("--set needs KEY=VALUE, not %r" % item,
                             hint="e.g. --set DISPLAY_NAME=\"Mona Lisa\"; keys are listed "
                                  "in `falera help setup`")
        name, value = item.split("=", 1)
        k = canonical_key(name)
        if k is None:
            raise UsageError("%s is not a profile key" % name.strip(),
                             hint="profile keys: " + ", ".join(KEYS))
        out[k] = validate(k, value)
    return out


def ask_updates(ui, data):
    """Prompt for every field, current value as the default. Enter keeps a
    value, a single "-" removes it. The key is read without echo."""
    current = resolved(data)
    ui.note("Enter keeps the value shown, - removes it.")
    out = {}
    for key, _, label in FIELDS:
        value, source = current[key]
        if key == SECRET:
            prompt = "%s (%s; Enter keeps it, - removes it)" % (
                label, "set" if value else "not set")
            while True:
                try:
                    raw = ui.secret(prompt)
                except EOFError:
                    raw = ""
                raw = (raw or "").strip()
                if not raw:
                    break
                try:
                    out[key] = "" if raw == "-" else validate(key, raw)
                except UsageError as e:
                    ui.error(e.message, hint=e.hint)   # never quotes the key
                    continue
                finally:
                    raw = None
                break
            continue
        shown = "" if value is None else (_num(value) if key in NUMERIC else str(value))
        while True:
            raw = ui.ask(label, default=shown)
            if raw == shown:
                break
            try:
                v = "" if raw.strip() == "-" else validate(key, raw)
            except UsageError as e:
                ui.error(e.message, hint=e.hint)
                continue
            if v == "" and source != "profile.json":
                break       # nothing in the file to remove
            out[key] = v
            break
    return out


def describe(updates):
    parts = []
    for k, v in updates.items():
        if v == "":
            parts.append("remove %s" % LABELS[k])
        elif k == SECRET:
            parts.append("%s: (hidden)" % LABELS[k])
        else:
            parts.append("%s: %s" % (LABELS[k], _num(v) if k in NUMERIC else v))
    return parts


# ── the avatar ───────────────────────────────────────────────────────

# auto: fetch when /avatar.bin is missing or made for another user;
# refresh: fetch again anyway (--avatar); skip: leave it alone (--no-avatar)
AVATAR_AUTO, AVATAR_REFRESH, AVATAR_SKIP = "auto", "refresh", "skip"


def _avatar_owner_code():
    return (
        "u=None\n"
        "x=0\n"
        "try:\n"
        " with open(%(p)s,'rb') as h:\n"
        "  x=1\n"
        "  b=h.read(%(n)d)\n"
        " if b[:%(m)d]==%(g)s:\n"
        "  u=str(b[%(h)d:%(h)d+b[%(h)d-1]],'ascii')\n"
        "except Exception:\n"
        " pass\n"
        "_e({'exists':x,'user':u})\n"
        % {"p": lit(avatar.PATH), "n": avatar.HEADER + 255, "m": len(avatar.MAGIC),
           "g": lit(avatar.MAGIC), "h": avatar.HEADER})


def avatar_owner(b):
    """(exists, login) of /avatar.bin on the badge; login is None when the
    file is missing or not an avatar file. Reads only its header."""
    r = b.result(_avatar_owner_code())
    return bool(r.get("exists")), r.get("user")


def _remove_avatar(b):
    b.result("import os\ntry:\n os.remove(%s)\nexcept OSError:\n pass\n_e({'ok':1})\n"
             % lit(avatar.PATH))


def _same(a, b):
    """GitHub logins are case-insensitive."""
    return bool(a) and bool(b) and a.lower() == b.lower()


def sync_avatar(ui, b, user, mode=AVATAR_AUTO):
    """Make /avatar.bin hold `user`'s GitHub avatar. Returns True when the
    file on the badge changed. Never fails the setup: without the avatar
    the Badge app draws the owner's initials."""
    if mode == AVATAR_SKIP:
        return False
    exists, have = avatar_owner(b)
    if not user:
        if exists:
            _remove_avatar(b)
            ui.note("removed %s: no GitHub user is set" % avatar.PATH)
        return exists
    if mode == AVATAR_AUTO and _same(have, user):
        ui.note("the avatar for @%s is on the badge (`falera setup --avatar` fetches it again)"
                % esc(user))
        return False
    try:
        with ui.status("fetching @%s's avatar from GitHub" % user):
            data = avatar.build(user)
    except avatar.AvatarError as e:
        stale = exists and not _same(have, user)
        if stale:
            _remove_avatar(b)       # never leave another user's face behind
        ui.warn("no avatar: %s. The Badge app shows your initials; run "
                "`falera setup --avatar` to try again." % esc(str(e)))
        return stale
    with ui.status("copying the avatar to %s" % avatar.PATH):
        b.write_file(data, avatar.PATH)
    ui.ok("saved %s (@%s's GitHub avatar, %dx%d)" % (avatar.PATH, esc(user),
                                                    avatar.SIZE, avatar.SIZE))
    return True


def _github_user(data):
    value, _ = resolved(data)["GITHUB_USER"]
    return str(value).lstrip("@") if value else ""


def setup(ui, b, updates=None, show_only=False, avatar_mode=AVATAR_AUTO):
    """Show the profile, collect changes (prompting when `updates` is None),
    write them, then bring /avatar.bin in line with GITHUB_USER. Returns
    True when /profile.json or /avatar.bin changed."""
    with ui.status("reading the profile"):
        data = read(b)
    show(ui, data, title="on the badge now")
    if show_only:
        exists, have = avatar_owner(b)
        if have:
            ui.note("%s: avatar of @%s" % (avatar.PATH, esc(have)))
        elif not exists:
            ui.note("no %s yet: the Badge app shows your initials" % avatar.PATH)
        return False
    if updates is not None and not updates and avatar_mode == AVATAR_REFRESH:
        return sync_avatar(ui, b, _github_user(data), avatar_mode)   # --avatar alone
    prompted = updates is None
    if prompted:
        if not ui.interactive:
            raise UsageError("no terminal to ask for the profile",
                             hint="pass values as options, e.g. falera setup --github-user "
                                  "octocat --timezone 5.5 (see `falera help setup`)")
        updates = ask_updates(ui, data)
    if not updates:
        ui.ok("nothing changed")
        return sync_avatar(ui, b, _github_user(data), avatar_mode)
    for line in describe(updates):
        ui.step(esc(line))
    # values typed as options are the answer already; prompted ones get a last look
    if prompted and not ui.confirm("Save this to %s on the badge?" % PATH, default=True):
        raise Cancelled("nothing saved")
    with ui.status("saving %s" % PATH):
        write(b, updates)
    ui.ok("saved %s" % PATH)
    saved = read(b)
    show(ui, saved, title="saved")
    now = dict((k, v) for k, (v, _) in resolved(saved).items())
    if not now.get(SECRET):
        ui.note("Weather needs an OpenWeatherMap key (OWM_API_KEY).")
    if now.get("WEATHER_LAT") is None or now.get("WEATHER_LON") is None:
        ui.note("No weather location pinned: Weather finds the badge's location "
                "from its network (set WEATHER_LAT and WEATHER_LON to pin one).")
    sync_avatar(ui, b, _github_user(saved), avatar_mode)
    return True


# ── the command ──────────────────────────────────────────────────────

def after_save(ui, reset):
    if reset == "none":
        ui.note("the badge is at the MicroPython prompt (--reset none); restart FaleraOS "
                "(Ctrl-D there, or unplug and replug) so the apps read the new profile")
    else:
        ui.ok("FaleraOS is restarting, so the apps read the new profile")
        ui.note("the timezone applies at the next time sync, which happens as FaleraOS "
                "starts (or Sync Time in Settings)")


@command("setup")
def cmd_setup(ctx):
    ui = ctx.ui
    args = ctx.args
    updates = updates_from_args(args)          # bad values fail before the badge is touched
    if getattr(args, "from_file", None):
        got, ignored = updates_from_file(args.from_file)
        ui.note("from %s: %s" % (esc(args.from_file),
                                 ", ".join(sorted(got)) or "no profile values"))
        if ignored:
            ui.note("left alone (not profile keys): %s" % ", ".join(sorted(set(ignored))))
    refresh = getattr(args, "avatar", False)
    skip = getattr(args, "no_avatar", False)
    if refresh and skip:
        raise UsageError("--avatar and --no-avatar contradict each other")
    if args.show and (updates or refresh or skip or getattr(args, "from_file", None)
                      or getattr(args, "set", None)):
        raise UsageError("--show only prints the profile; leave out the other options")
    if args.owm_key is not None and args.owm_key.strip():
        ui.warn("a key given as --owm-key can end up in your shell history; "
                "--owm-key-stdin or the prompt (falera setup) avoids that")
    if not updates and not args.show and not refresh and not ui.interactive:
        raise UsageError("no terminal to ask for the profile",
                         hint="pass values as options, e.g. falera setup --github-user "
                              "octocat --timezone 5.5 (see `falera help setup`)")
    mode = AVATAR_REFRESH if refresh else AVATAR_SKIP if skip else AVATAR_AUTO
    ui.header("setup", "owner profile in %s (docs/PROFILE.md)" % PATH)
    with ctx.session() as b:
        # --avatar alone refreshes the avatar without asking for the profile
        changed = setup(ui, b, updates=updates if (updates or refresh) else None,
                        show_only=args.show, avatar_mode=mode)
    if changed:
        after_save(ui, ctx.args.reset)
    return 0
