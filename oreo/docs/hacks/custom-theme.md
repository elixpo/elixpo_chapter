# Theme the OS in your colours

Most of FaleraOS's colours come from one file, `oreoOS/theme.py`: the cream
background, the pink accent, the cards, the text and the status bar.
Change a few numbers there and the apps that use the theme follow.

- **Difficulty:** beginner, about 10 minutes
- **You need:** a badge, a USB-C cable, [falera-cli](../CLI.md#install) and
  a checkout of this repository (or just a copy of `oreoOS/theme.py`)

## What is in `theme.py`

Each colour is written twice: as an RGB triplet (for host tools and maths)
and as an RGB565 value the display uses, made with `api.rgb(r, g, b)`.

| Name | Default | Used for |
|---|---|---|
| `BG` | 255, 248, 235 (ivory) | screen background |
| `CARD` | 255, 240, 210 | cards and panels |
| `PRIMARY` | 255, 93, 104 (cheek pink) | main accent, header underline |
| `TEAL`, `GOLD` | 0, 180, 165 / 255, 190, 30 | secondary accents |
| `TEXT_BRIGHT`, `TEXT_DIM`, `MUTED`, `MUTED2` | dark grey to warm brown | text |
| `STATUS_BG` | 255, 93, 104 | the status bar |
| `DOCK_BG`, `DOCK_SEL`, `SEL_BORDER` | | the dock and selection |
| `ORANGE`, `PURPLE`, `GREEN` | | extra accents |

Apps import it as `from oreoOS import theme` and draw with `theme.BG`,
`theme.PRIMARY` and so on. Colours that an app or screen picks itself (for
example the home screen's green header, `HEADER_HOME_BG` in
`oreoOS/widgets.py`, or colours baked into sprites) do not change.

## 1. Back up the badge's copy

```bash
falera pull /oreoOS/theme.py theme.py.orig
```

## 2. Edit the colours

In `oreoOS/theme.py`, change the RGB565 lines. A dark theme, for example:

```python
BG           = api.rgb(24,  24,  32)       # near-black
CARD         = api.rgb(40,  40,  52)
PRIMARY      = api.rgb(0,  180, 165)       # teal accent
TEXT_BRIGHT  = api.rgb(240, 238, 232)      # light text on a dark background
TEXT_DIM     = api.rgb(190, 185, 175)
```

Keep the names: other modules import them. Change the matching `*_R, *_G,
*_B` triplets too if you want host tools to agree. Keep enough contrast
between `BG` and the text colours; the screen is small and viewed at an
angle.

## 3. Put it on the badge

For a quick try, copy just this file; `falera push` restarts FaleraOS when it
finishes:

```bash
falera push oreoOS/theme.py /oreoOS/theme.py
```

If you build FaleraOS from a checkout, `./deploy --board` pushes it with the
rest of your changes.

## 4. Undo

```bash
falera push theme.py.orig /oreoOS/theme.py
```

## Things to know

- **Updates overwrite it.** `falera update` and the badge's own updates
  replace every OS file whose checksum differs from the release, including
  `oreoOS/theme.py`. Push your theme again after an update, or ship it from
  your own fork ([Self-host OTA updates](ota-fork.md)).
- **Not every pixel is themed.** Apps that hardcode colours, the home
  screen wallpaper and sprite art keep their own colours.
- **A theme for everyone** (a setting to pick a palette at runtime) is an
  OS change; propose it with the
  [OS improvement form](https://github.com/elixpo/falera/issues/new?template=os_improvement.yml).
