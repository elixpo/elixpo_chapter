# falera.elixpo

The website of the **Falera Badge** and FaleraOS — `falera.elixpo.com`:
the story, the hardware page with the 3D board, the app catalogue, the
docs (rendered from the repository's Markdown at build time), RV565 and
its in-browser converter, and the supporters page.

Built with Next.js 15 (App Router, static export) and Tailwind 3. No
animation library: pages are server components, and only a few small
islands run in the browser (the header, the 3D viewer, the converter, the
live fundraiser total, Mermaid on one docs page).

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
npm run test:rv565   # the converter's RV565 encoder tests
```

`predev` and `prebuild` copy the Draco decoder from three.js into
`public/draco/` for the 3D board viewer (`scripts/copy-draco.mjs`).

## Deploy to Cloudflare Pages

The site is a fully static export — no Workers runtime needed.

```bash
npm run build                                                 # writes ./out
npx wrangler pages deploy out --project-name=falera           # CF push
```

| Setting              | Value                              |
|----------------------|------------------------------------|
| Build command        | `npm install && npm run build`     |
| Output directory     | `out`                              |
| Root directory       | `falera.elixpo`                    |
| Node version         | `20`                               |

## Design rules

The site follows the Elixpo Research look (ink on a warm paper page,
generous margins, a clear reading width) with the sponsor deck's card
language (`pitch-deck/style.css`). New pages follow these rules:

- **Use the shared pieces.** `src/components/ui.tsx` has `PageHeader`,
  `Section`, `SectionHeader`, `Card`, `Stat`, `Fact`, `Onward`,
  `NextStep`, `BowList` and `Bow`; `globals.css` has the classes behind
  them. Don't hand-roll widths, section padding or colours.
- **One container.** `.container-page`: at most 1200px wide, gutters of
  16px on phones, 24px from 640px and 32px from 1024px. Nothing sets its
  own side margins.
- **One rhythm.** A page is a `PageHeader` followed by `Section`s. A
  section is 64 / 80 / 96px tall top and bottom (`section-tight` for a
  stat strip); a hairline separates sections. `fill` gives a section the
  light grey-green fill; alternate it sparingly.
- **One type scale.** `h-display` for the page's h1, `h-title` for a
  section's h2, `h-card` for card titles, `lede` for the paragraph under
  a title, `eyebrow` (red) and `label` (grey) for small monospace caps.
  Body copy stays under `max-w-prose-site` (42rem).
- **Headlines** are a strong sans with an italic Georgia second half:
  `The hardware, <em>all open.</em>`
- **Cards** are white with a 1px `border` and `rounded-card`; secondary
  blocks use `card-fill`. **No shadows**, no gradients, no glows; a
  linked card only darkens its border on hover.
- **Red** (`primary`, #C93A45) is for numbers, labels and one emphasis
  per block. The one red button is "Fund the badge" (`btn-accent`);
  other actions are `btn-primary` (ink) or `btn-ghost` (outline).
- **Every section ends with one link onward** (`Onward`), and every page
  ends with a `NextStep` card that points to the next page in the story.
- **Lightweight.** Server components by default; a client component
  only for real interaction. Size images (`width`/`height`) and reserve
  the height of anything that loads late, so nothing shifts. Respect
  `prefers-reduced-motion` (the global CSS turns transitions off).
- **Facts only.** Numbers on the site come from the repository, the
  paper or `src/data/press.ts`.

## Structure

```
src/
  app/
    layout.tsx        global chrome (Header + Footer), metadata, JSON-LD
    page.tsx          home: what Falera is → proof → badge → apps → build → RV565 → support
    badge/            hardware page with the 3D board viewer
    apps/             catalogue; apps/[slug]/ per-app pages
    get-started/      flashing + deploy guide
    docs/             docs hub; cli, usb, transfer from docs/*.md; apps; video-architecture
    hacks/            hack cards; hacks/[slug]/ from docs/hacks/*.md
    rv565/            RV565 overview; rv565/convert/ the in-browser converter
    paper/            the RV565 paper
    contribute/       CONTRIBUTING.md
    supporters/       live fundraiser total, team, press, sponsors
  components/
    ui.tsx            the shared layout components
    Header.tsx        sticky header; <details> menu on phones
    Footer.tsx        link columns and legal lines
    AppCard.tsx       app tile and icon
    BoardViewer.tsx   <model-viewer> 3D board (loaded by BoardViewerLazy)
    RepoDoc.tsx       a repository Markdown file rendered as a page
  data/               apps, hacks, press
  lib/                markdown, diagrams, seo, rv565, links
theme.js              brand tokens (colours, radii)
tailwind.config.ts    Tailwind config that consumes theme.js
```
