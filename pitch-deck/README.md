# FaleraOS sponsor deck

The sponsor pitch deck as plain HTML: one file per slide, each a fixed
1920×1080 page, and a script that renders them to PNGs and a PDF. It is not
part of the website.

```
pitch-deck/
  style.css      shared styles: colours, type, the 1920x1080 canvas, bow bullets, footer, Lumi's corner mark
  slides/        one HTML file per slide; filename order is slide order
  assets/        images the slides use
  render.py      renders slides/*.html to out/NN.png and out/FaleraOS-pitch.pdf
  out/           rendered output (git-ignored)
```

## Install

```bash
python3 -m pip install playwright pillow
python3 -m playwright install chromium-headless-shell
```

`render.py` uses, in order: `$CHROME` if set, Playwright's
`chrome-headless-shell` from its browser cache (`~/.cache/ms-playwright`),
then Playwright's own Chromium (`python3 -m playwright install chromium`).

## Edit a slide

1. Open `slides/NN-name.html` in an editor. Each slide is a complete page:
   a `<style>` block for its own layout, then the slide, with short comments
   marking each part. Shared classes (`.title`, `.lede`, `.p`, `.small`,
   `.card`, `.list`, `.eyebrow`, `.footer`, …) are in `style.css`.
2. Preview it by opening the file in a browser (double-click it). The slide
   is drawn at 1920×1080; zoom the browser out to see all of it.
3. Render it: `python3 render.py --only NN`, then look at `out/NN.png`.

Italic emphasis in a title is `<em>…</em>` (Georgia). A bow-bulleted list is

```html
<ul class="list">
  <li><img class="bow" src="../assets/bow.svg" alt="">First point</li>
</ul>
```

Fonts are system fonts (Arial, Georgia and the system monospace), so slides
open offline and render the same as long as the machine has the same fonts.

## Add, remove or reorder slides

Slides are rendered in filename order, so the two-digit prefix is the
position. To add one, copy a similar slide, give it the right number and
renumber the files after it. To remove or reorder, rename the files so the
numbers run 01, 02, … again.

Each footer has its number written in by hand:

```html
<span class="num">4 / 13</span>
```

After adding, removing or reordering, update the footer (and `<title>`) in
every slide. `render.py` warns about any footer whose `n / N` doesn't match
the file's position and the slide count.

## Render

```bash
python3 render.py                 # every slide to out/01.png … and out/FaleraOS-pitch.pdf
python3 render.py --only 04       # one slide (no PDF)
python3 render.py --scale 2       # 3840x2160 PNGs for a crisper PDF
python3 render.py --out ~/Documents/falera-pitch
```

It prints each file it writes. The PDF has one 16:9 page per slide holding
the PNG's pixels unchanged (lossless).

## Images

All in `assets/`:

| File | What | Used on |
|---|---|---|
| `lumi-badge.webp` | Lumi, the Falera panda, holding a badge; also the corner mark | all |
| `lumi-mark.webp` | Lumi's old corner mark, no longer used | — |
| `bow.svg` | Lumi's bow: bullets, eyebrows, cards | all |
| `board-angle.webp` | Render of the Falera Badge PCB, no longer used | — |
| `pcb_back.jpg` | Photo of the back of the first boards | 4 |
| `oshw_mark.png` | OSHWA certification mark, IN000107 | 4 |
| `photo_portrait.jpg` | FaleraOS on the breadboard badge | 5 |

The photos and the OSHWA mark are copies of the ones in
`falera.elixpo/public/`.

## Where the facts come from

Every number and name on a slide comes from one of these sources. Check the
source before changing a figure, and don't add a figure, supporter or
partner that isn't in one.

1. **Title:** OSHWA certificate IN000107 (README.md).
2. **The problem:** GitHub Octoverse 2026 (India 32.0M developers, Sept 2026); Hackaday, "Badgelife: the hardware demoscene", 20 Aug 2018 (DEF CON 2018 badge). Sources are printed on the slide.
3. **The solution (03a):** answers the three columns of slide 2.
   **What Falera is (03b):** the community loop (apps in Python, App Store, OTA updates, events); README.md and docs/APPS.md.
4. **The hardware:** circuit/elixpo/README.md and BOM_COST.md (origin/pcb-bringup), README.md hardware table; ₹4,171.70 is the BOM_COST.md total of the prices paid on 17 Nov 2026.
5. **The software:** README.md (apps, App Store, updates, CLI); apps_market/index.json (10 apps); PR #197 (audio apps, in review).
6. **RV565, the story (06a) and where it went (06b):** elixpo/rv565 README.md and docs/RESULTS_V8.md, "On the badge" (UI animation measured 20 Nov 2026: 31.4 ms whole frames, 14.8 ms with format version 7 = RV565 2.0, 6.3 ms with version 8 = RV565 3.0; 44.3% and 17.1% of pixels); README.md press section; rv565 CHANGELOG (3.0.0: LVGL widget, FFmpeg patches, 77 conformance files).
7. **Recognition (07a-recognition.html):** README.md "In the press" and "Recognised upstream"; the fundraiser API (payouts.elixpo.com/f/falera-badge, read 21 Nov 2026: ₹872 from 16 contributors); FUNDRAISER_APPEAL.md (about ₹8,000 spent out of pocket).
8. **Built so far (07b-built-so-far.html):** release counts from the git tags `stable/*` (57 since the first on 15 May 2026, 19 in November); README.md press section (Adafruit, Espressif USB ID); cli/CHANGELOG.md (1.0.0); BOM_COST.md (orders of 17 Nov 2026); PR #180 (PCB support).
9. **Where it goes (09-where-it-goes.html):** a road from today to the goal. The four months make the version 2 board final and build 10 badges on it (SPONSORSHIP.md). 2027: SPONSORS.md (IndiaFOSS 2027, FOSSASIA Summit 2027 as events to approach), README.md (GSoC 2027: Elixpo is applying, not accepted). Where we are heading: AGENTS.md (Bluetooth and the mobile app come last, #101, #103, #124).
10. **What we put in (10a-what-we-put-in.html):** release count from git tags `stable/*`; apps/ and apps_market/index.json; first boards about ₹8,000 paid by the team and ₹872 from 16 people (fundraiser, 21 Nov 2026); "self-funded, no salaries" is the maintainers' own statement.
    **The ask (10b-the-ask.html):** the budget in SPONSORSHIP.md, "The plan a sponsor funds" (₹2,50,000; ₹62,500 a month): stipends, the final version 2 board with 10 badges, two workshops, test equipment. Dollars at ₹93.96 (17 Nov 2026).
11. **Sponsorship (11a-what-sponsors-get.html) and after you sign (11b-after-you-sign.html):** every level, return and date is defined in `pitch-deck/SPONSORSHIP.md`; change it there first. Dollars at ₹93.96 (17 Nov 2026). The final version 2 board is month 3 of the plan.
12. **The team (12-team.html):** photos are the maintainers' GitHub profile pictures (assets/team-*.jpg); the "check our work" records are github.com/elixpo, arXiv 2610.35935, OSHWA IN000107 and USB ID 303a:83ec. The earlier "45+ contributors" and programme list are off the slide.
13. **Contact:** README.md closing line (hello@elixpo.com).
