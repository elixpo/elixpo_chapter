import { Card, NextStep, PageHeader, Section } from "@/components/ui";

/* /docs/apps — the full "how to write a badge app" reference.
 *
 * Pairs with the short overview on /contribute. This page goes deep:
 * directory layout, lifecycle hooks, manifest fields, drawing API,
 * input model, and a walkthrough of snake as the reference app.
 *
 * Static markup — no runtime data dependencies — so the Next.js
 * static export ships it as a flat HTML page.
 */

export default function AppDocsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Docs · writing apps"
        title={<>Write an app <em>for the badge.</em></>}
        lede={<>Apps on FaleraOS are plain Python packages. One manifest, one shim, and a <code className="code">src/</code> tree that you organise however your app needs. The launcher discovers it automatically.</>}
      />

      <Section>
      <div className="max-w-3xl [&>section:first-child]:mt-0 [&>section:first-child]:border-0 [&>section:first-child]:pt-0">
        {/* ── Directory layout ───────────────────────────────────── */}
          <section className="mt-12 border-t border-border pt-12">
            <h2 className="mb-4 font-display text-[1.625rem] leading-tight text-text">Directory layout</h2>
            <p className="mb-6 max-w-3xl text-[0.975rem] leading-relaxed text-text-dim">
              Every app lives in <code className="code">apps/&lt;name&gt;/</code>.
              The launcher imports{" "}
              <code className="code">apps.&lt;name&gt;.main</code> and
              reads <code className="code">App</code> off it — so{" "}
              <code className="code">main.py</code> is required, but
              it's a 2-line shim. Your actual code lives under{" "}
              <code className="code">src/</code>.
            </p>
            <pre className="pre">
{`apps/snake/
├── manifest.json     name, author, icon, version, category
├── main.py           thin shim — re-exports App from src/
├── __init__.py       empty; makes it a Python package
├── assets/           optional — sprites, fonts, optimised images
│   ├── raw/          source images (host-only, never on flash)
│   └── optimized/    .py modules baked by tools/optimize_assets.py
├── hiscore.txt       optional — written by the app at runtime
└── src/              your code, split however you like
    ├── __init__.py
    ├── app.py        App class — lifecycle hooks only
    ├── game.py       pure logic + constants
    ├── render.py     drawing
    └── highscore.py  file I/O`}
            </pre>
            <p className="mt-4 max-w-3xl text-[0.975rem] leading-relaxed text-text-dim">
              The split inside <code className="code">src/</code> is{" "}
              <em>your call</em> — Snake uses logic / render / persistence,
              but a simpler app might be a single{" "}
              <code className="code">src/app.py</code>, and a complex
              game can have a dozen modules. The deploy script pushes every
              <code className="code"> .py</code> under{" "}
              <code className="code">src/</code> recursively.
            </p>
          </section>

        {/* ── main.py shim ──────────────────────────────────────── */}
          <section className="mt-12 border-t border-border pt-12">
            <h2 className="mb-4 font-display text-[1.625rem] leading-tight text-text">The main.py shim</h2>
            <p className="mb-4 max-w-3xl text-[0.975rem] leading-relaxed text-text-dim">
              The launcher requires <code className="code">main.py</code> and
              looks for a class named <code className="code">App</code>{" "}
              on it. Re-export from your <code className="code">src/</code>{" "}
              package and you're done:
            </p>
            <pre className="pre">
{`# apps/snake/main.py

from .src.app import App

__all__ = ["App"]`}
            </pre>
            <p className="mt-4 max-w-3xl text-[0.975rem] leading-relaxed text-text-dim">
              That's the whole file. Real app code goes in{" "}
              <code className="code">src/app.py</code>.
            </p>
          </section>

        {/* ── manifest.json ──────────────────────────────────────── */}
          <section className="mt-12 border-t border-border pt-12">
            <h2 className="mb-4 font-display text-[1.625rem] leading-tight text-text">manifest.json</h2>
            <p className="mb-4 max-w-3xl text-[0.975rem] leading-relaxed text-text-dim">
              Metadata the launcher reads at boot to populate the app
              drawer. All fields are required except{" "}
              <code className="code">icon</code> (defaults to a
              generic tile).
            </p>
            <pre className="pre">
{`{
  "name":     "Snake",
  "author":   "Circuit-Overtime",
  "version":  "1.0.0",
  "category": "game",
  "icon":     "snake"
}`}
            </pre>
            <ul className="mt-4 max-w-3xl space-y-2 text-[0.975rem] leading-relaxed text-text-dim">
              <li><b className="text-text">name</b> — display name in the drawer (under the tile).</li>
              <li><b className="text-text">author</b> — GitHub handle shown on the about screen.</li>
              <li><b className="text-text">version</b> — semver; bumped by your PR.</li>
              <li><b className="text-text">category</b> — <code>game</code> / <code>tool</code> / <code>system</code>. Affects drawer grouping.</li>
              <li><b className="text-text">icon</b> — stem of a sprite in <code>assets/icons/optimized/</code> (e.g. <code>"snake"</code> → <code>snake.py</code>).</li>
            </ul>
          </section>

        {/* ── Lifecycle hooks ────────────────────────────────────── */}
          <section className="mt-12 border-t border-border pt-12">
            <h2 className="mb-4 font-display text-[1.625rem] leading-tight text-text">Lifecycle hooks</h2>
            <p className="mb-6 max-w-3xl text-[0.975rem] leading-relaxed text-text-dim">
              The OS calls four methods on your <code className="code">App</code>{" "}
              instance — implement what you need, ignore what you don't.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Hook
                sig="on_enter(os)"
                body="Called once when the user opens the app. Set up state, load assets, snapshot any persistent values. The os object exposes settings, display, buttons, and notifications."
              />
              <Hook
                sig="update(dt)"
                body="Called every frame (~30 FPS). dt is seconds since last frame. Advance game state, tick animations, poll sensors. No drawing here."
              />
              <Hook
                sig="draw(d)"
                body="Called every frame after update(). d is the display. Paint your scene. Set self._dirty = False at the end if you want to skip redraws when nothing changed."
              />
              <Hook
                sig="on_button_press(btn)"
                body="Called when a button goes down. btn is one of api.BTN_UP / DOWN / LEFT / RIGHT / A / B / HOME. HOME is reserved by the launcher — it pops back to the drawer."
              />
            </div>
            <pre className="pre mt-6">
{`# apps/snake/src/app.py (excerpt)

import oreoOS
from oreoOS import api, theme, widgets

from . import game, render, highscore


class App(oreoOS.App):
    name = "Snake"

    def on_enter(self, os):
        self._os    = os
        self._state = game.INTRO
        self._hi    = highscore.load()
        self._snake = game.initial_snake()
        # ... initial state ...

    def update(self, dt):
        if self._state != game.PLAY: return
        # ... advance snake by one cell when step timer fires ...

    def draw(self, d):
        d.clear(theme.BG)
        widgets.draw_header(d, "SNAKE")
        render.draw_arena(d, self._snake, self._food, self._food_sprite)
        widgets.draw_hint(d, "A=start  B=pause  arrows=move")

    def on_button_press(self, btn):
        if btn == api.BTN_A and self._state == game.INTRO:
            self._start()`}
            </pre>
          </section>

        {/* ── Drawing API ───────────────────────────────────────── */}
          <section className="mt-12 border-t border-border pt-12">
            <h2 className="mb-4 font-display text-[1.625rem] leading-tight text-text">Drawing API</h2>
            <p className="mb-4 max-w-3xl text-[0.975rem] leading-relaxed text-text-dim">
              Screen is 320×240 landscape. The display object{" "}
              <code className="code">d</code> passed to{" "}
              <code className="code">draw()</code> exposes a small set
              of primitives:
            </p>
            <ul className="max-w-3xl space-y-2 text-[0.975rem] leading-relaxed text-text-dim">
              <li>
                <code className="code">d.clear(color)</code> — fill the
                whole framebuffer.
              </li>
              <li>
                <code className="code">d.rect(x, y, w, h, color, fill=True)</code>
                {" "}— solid or outlined rectangle.
              </li>
              <li>
                <code className="code">d.text(s, x, y, color, scale=1)</code>
                {" "}— bitmap text at the given scale (1, 2, or 3).
              </li>
              <li>
                <code className="code">d.blit(data, x, y, w, h)</code>
                {" "}— stamp an RGB565 sprite. Magenta is the chroma key for
                transparency.
              </li>
              <li>
                <code className="code">d.blit_scale(data, x, y, w, h, scale)</code>
                {" "}— integer upscale of a sprite during stamping.
              </li>
            </ul>
            <p className="mt-4 max-w-3xl text-[0.975rem] leading-relaxed text-text-dim">
              Use <code className="code">widgets.draw_header(d, "TITLE")</code>{" "}
              and <code className="code">widgets.draw_hint(d, "...")</code>{" "}
              for the standard chrome — the badge looks more consistent if
              every app uses them.
            </p>
          </section>

        {/* ── Persistence ───────────────────────────────────────── */}
          <section className="mt-12 border-t border-border pt-12">
            <h2 className="mb-4 font-display text-[1.625rem] leading-tight text-text">Persistence</h2>
            <p className="mb-4 max-w-3xl text-[0.975rem] leading-relaxed text-text-dim">
              Two options:
            </p>
            <ul className="max-w-3xl space-y-3 text-[0.975rem] leading-relaxed text-text-dim">
              <li>
                <b className="text-text">OS settings</b> — for small
                key/value state shared across launches:{" "}
                <code className="code">os.settings_get(key, default)</code>{" "}
                /{" "}
                <code className="code">os.settings_set(key, value)</code>.
                Backed by a single JSON file the OS manages for you.
              </li>
              <li>
                <b className="text-text">Plain files</b> — for larger or
                custom data, just{" "}
                <code className="code">open()</code> a file under your
                app dir. Snake's hi-score lives at{" "}
                <code className="code">apps/snake/hiscore.txt</code>.
                Wrap I/O in <code className="code">try</code> blocks
                so a full or read-only flash doesn't crash the app.
              </li>
            </ul>
          </section>

        {/* ── Deploying ─────────────────────────────────────────── */}
          <section className="mt-12 border-t border-border pt-12">
            <h2 className="mb-4 font-display text-[1.625rem] leading-tight text-text">Deploying to the badge</h2>
            <p className="mb-4 max-w-3xl text-[0.975rem] leading-relaxed text-text-dim">
              From the repo root, with the badge connected over USB:
            </p>
            <pre className="pre">
{`python tools/deploy.py            # auto-detect port, push diffs
python tools/deploy.py --force    # ignore hash cache, push everything
python tools/deploy.py --clean    # wipe device first`}
            </pre>
            <p className="mt-4 max-w-3xl text-[0.975rem] leading-relaxed text-text-dim">
              The script auto-discovers any directory under{" "}
              <code className="code">apps/</code> that has both{" "}
              <code className="code">main.py</code> and{" "}
              <code className="code">manifest.json</code>, plus its
              entire <code className="code">src/</code> subtree. No
              entry in <code className="code">tools/deploy.py</code>{" "}
              to edit.
            </p>
          </section>

        {/* ── Snake reference ───────────────────────────────────── */}
        <Card fill className="mt-12 p-6 sm:p-8">
          <p className="eyebrow">Reference app</p>
          <h2 className="h-card mt-3">Read the reference: apps/snake/</h2>
          <p className="mt-2 max-w-2xl text-[0.975rem] leading-relaxed text-text-dim">
            Snake is the canonical example for this layout. About
            350 lines split across four modules, each under 150
            lines. If you&apos;re stuck, start by reading{" "}
            <code className="code">src/app.py</code> —
            it&apos;s the smallest and shows how the pieces wire together.
          </p>
          <a
            href="https://github.com/elixpo/falera/tree/main/apps/snake"
            target="_blank" rel="noreferrer"
            className="btn-ghost mt-6"
          >
            View on GitHub ↗
          </a>
        </Card>
      </div>
      </Section>

      <NextStep
        title={<>Ship it to <em>the App Store.</em></>}
        body="Propose your app, then open a pull request that adds it to apps_market/."
        href="/contribute/"
        cta="Contribute"
      />
    </>
  );
}

function Hook({ sig, body }: { sig: string; body: string }) {
  return (
    <div className="card p-5">
      <code className="font-mono text-sm font-bold text-primary">{sig}</code>
      <p className="mt-2 text-sm leading-relaxed text-text-dim">{body}</p>
    </div>
  );
}
