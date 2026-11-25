# Your profile on the badge

Badge, Commits, Weather and the clock show the owner's details: GitHub
user, name, title, timezone and weather location. Nothing is set by
default. Until you set `GITHUB_USER`, Commits shows a setup hint and Badge
shows only your name and title (or, with no name either, a setup card)
instead of someone else's profile, and nothing is fetched.
Weather shows its setup card until it has an OpenWeatherMap key; its
location comes from the badge itself (below) unless you pin one. The clock
runs on UTC until `TIMEZONE_OFFSET` is set.

## Upgrading from stable/v2.0.5 or older

Older builds had the maintainer's GitHub user, name, weather location
and timezone (`+5.5`) hardcoded in `oreoOS/config.py`. They now come
only from `.env.local` or `/profile.json`. If your `.env.local` does not
set them, the next deploy writes them blank: Badge loses your name and title,
Weather loses its location and the clock drops to UTC. Before you
deploy, add `GITHUB_USER`, `DISPLAY_NAME`, `DISPLAY_DESIGNATION` and
`TIMEZONE_OFFSET` (and `OWM_API_KEY` for Weather) to `.env.local`, or put
them on the badge with `falera setup`. `tools/deploy.py` prints one
note listing every key that is still blank.

## The keys

| Key | Used by | Example |
|---|---|---|
| `GITHUB_USER` | Badge (@handle and GitHub card), Commits | `octocat` |
| `DISPLAY_NAME` | Badge (falls back to your GitHub name, then the login) | `Mona Lisa` |
| `DISPLAY_DESIGNATION` | Badge (title under the name); `DESIGNATION` is accepted as the older name | `Firmware @ Example` |
| `TIMEZONE_OFFSET` | the clock, after each time sync | `5.5`, `-4` |
| `WEATHER_LAT`, `WEATHER_LON` | Weather, **optional**: pins a place; without them the badge finds its own location | `12.97`, `77.59` |
| `WEATHER_NAME` | Weather (optional label) | `Bengaluru` |
| `OWM_API_KEY` | Weather ([OpenWeatherMap](https://openweathermap.org/api) key) | |

## Your avatar

The Badge app draws your GitHub avatar in its ring. It is not a profile
key and the badge never downloads it: `falera setup` fetches the avatar of
`GITHUB_USER` on your computer, converts it to a 72x72 circle and copies it
over USB to **`/avatar.bin`**, next to `/profile.json` and outside every
app folder, so FaleraOS updates and deploys never replace it. The file
records the GitHub user it was made for, and Badge shows it only while
that user is your `GITHUB_USER` (case does not matter); otherwise, or
without the file, it draws your initials. No avatar ships with FaleraOS.

```bash
falera setup --avatar          # fetch it again, e.g. after changing your GitHub picture
```

Changing `GITHUB_USER` with `falera setup` replaces the avatar, and removing
it removes the file. Details: [CLI.md](CLI.md#falera-setup-owner-profile).
Without the CLI, `python3 tools/fetch_avatar.py --user <you>` makes the
same file from a checkout; copy it with `falera push avatar.bin /avatar.bin`.

## Weather's location

With no `WEATHER_LAT` / `WEATHER_LON`, Weather asks where the badge is from
its internet connection: `oreoOS/geo.py` sends one HTTPS request to a
keyless geolocation service (ipwho.is, then ipapi.co) from Weather's
background fetch, and gets a latitude, a longitude and a town. It is
city-level, from the network's public address: no GPS, nothing else is
sent. The answer is remembered in `/state/geo.json`, so Weather still has
a place when the services are unreachable, and it is looked up again once
per boot (so a badge that travels follows you). Set `WEATHER_LAT` and
`WEATHER_LON` to pin a place instead; they always win.

## Where the badge looks

`oreoOS/profile.py` returns the first non-empty value from:

1. **`/profile.json` on the badge.** A flat JSON object with the keys
   above. This is the one to use if you did not build the OS yourself.
2. **`/secrets.py` on the badge**, written by `tools/deploy.py` from your
   `.env.local` (copy [`.env.example`](../.env.example)).
3. The app's own fallback (for example `octocat`).

### Set it over USB

With the `falera` CLI ([CLI.md](CLI.md#falera-setup-owner-profile)), using the
same key names as `.env.local`:

```bash
falera setup                                   # asks for each value
falera setup --from-file .env.local            # the profile keys from your file
falera setup --set DISPLAY_NAME="Mona Lisa" --set TIMEZONE_OFFSET=5.5
```

`--from-file` takes only the keys above and leaves everything else in the
file (Wi-Fi password, tokens) alone; it names what it took and what it
skipped, never their values.

Or by hand:

Write the file on your computer and copy it to the badge:

```bash
cat > profile.json <<'EOF'
{"GITHUB_USER": "octocat", "DISPLAY_NAME": "Mona Lisa",
 "TIMEZONE_OFFSET": 5.5, "WEATHER_LAT": 12.97, "WEATHER_LON": 77.59}
EOF
mpremote cp profile.json :/profile.json
mpremote reset
```

Or from the badge's REPL:

```python
from oreoOS import profile
profile.save({"GITHUB_USER": "octocat", "TIMEZONE_OFFSET": 5.5})
profile.save({"DESIGNATION": ""})      # "" removes a key
```

`save()` rejects unknown keys and non-numeric values for the number
keys. Apps read the file when they open; the timezone applies at the
next time sync (boot, or **Sync Time** in Settings or the C panel).

### Set it at deploy time

```bash
cp .env.example .env.local     # git-ignored
$EDITOR .env.local             # GITHUB_USER=..., TIMEZONE_OFFSET=...
python tools/deploy.py /dev/ttyACM0
```

`/profile.json` still wins over these, so a value set on the badge is
not overwritten by a redeploy.

## For app developers

```python
from oreoOS import profile
profile.get("GITHUB_USER", "octocat")
profile.is_set_up()        # True once GITHUB_USER is set
profile.avatar(profile.get("GITHUB_USER"))   # (pixels, w, h) for d.blit, or None
```

Read the profile through this module, not `from secrets import ...`, so
both sources work.
