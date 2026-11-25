# Agent Guidelines for url.elixpo

ElixpoURL — open URL shortener on Cloudflare's edge. Next.js 15, Cloudflare Pages (edge runtime), Cloudflare D1 (SQLite). This file is the operating manual for any agent or AI teammate working in this repo.

## Architecture

- **Runtime**: Cloudflare Pages (edge) via `@cloudflare/next-on-pages`. Node.js APIs are NOT available at runtime.
- **Database**: Cloudflare D1 (SQLite). Migrations in `workers/migrations/`. Access via `lib/db.ts`.
- **Auth**: Session cookies issued by `accounts.elixpo` (SSO). Verified in `lib/auth.ts`.
- **Rate limiting**: KV-backed quota enforcement in `lib/ratelimit.ts`.
- **UI**: Next 15 + React 19 + Tailwind (no MUI). Design language mirrors research.elixpo — see **Design System** below. System fonts only (no `next/font` download).
- **Animations**: prefer small CSS transitions (honour `prefers-reduced-motion`, already wired in `globals.css`); reserve framer-motion for genuinely interactive elements.

## Repository Structure

```
app/
  page.tsx                   - Landing entry (auth redirect) → LandingPageClient.tsx (server-rendered)
  layout.tsx                 - Root layout: SEO, favicon (system fonts)
  globals.css                - Design tokens, component classes, focus + reduced-motion
  styles/app-shell.css       - Logged-in app shell: page header, panels, responsive tables, skeletons, bottom tab bar (imported by dashboard/profile/admin layouts)
  icon.png / apple-icon.png  - Favicon (Next auto-emits link tags)
  components/
    Navbar.tsx               - Floating pill header + skip link + mobile menu
    Footer.tsx               - Brand + link columns (server) + CopyEmailButton island
    Sidebar.tsx              - Dashboard pill top bar + account menu
    NotFoundView.tsx         - Shared 404 surface
    landing/GuestShortener   - Client island for the guest short-link form
  pricing/                   - Pricing page ("coming soon" until tiers ship)
  docs/                      - Integrator docs; sections come from lib/docs-sections.ts (also drives sitemap)
  dashboard/                 - Logged-in user dashboard
  profile/                   - Account profile + API key management
  admin/                     - Admin panel (RBAC-gated)
  login/                     - Sign-in screen
  api/                       - Edge API routes (auth, links, analytics, keys)
  not-found.tsx / not-found/ - 404 fallbacks
lib/
  auth.ts                    - Session verify, SSO callback handling
  db.ts                      - D1 client helpers
  ratelimit.ts               - KV-backed quota enforcement
  types.ts                   - Shared TS types
  utils.ts                   - Misc helpers (slug gen, etc.)
  validate.ts                - Input validation
workers/migrations/          - D1 schema migrations (gapless NNNN_name.sql)
public/                      - Static assets (logo.png, og-image.png, product_pitch.mp4)
.github/                     - GitHub Actions + agent runbooks
```

## Hard Constraints (edge runtime)

These will break the Cloudflare Pages build or fail at runtime if violated:

- **Every API route MUST export `export const runtime = 'edge'`**. Missing this makes the route attempt Node runtime and the build fails.
- **Never import Node built-ins** (`crypto`, `fs`, `path`, `stream`, `buffer`). Use Web APIs.
- **D1 is SQLite**, not Postgres. No `RETURNING *` on multi-row writes, no `JSONB`, no window functions in older binding versions.
- **KV has eventual consistency** (up to 60s globally). Don't use KV as the source of truth for link records — D1 is authoritative. Rate-limit counters in KV are tolerated because eventual consistency only relaxes enforcement.
- **MUI is not installed.** This repo is Tailwind-only. Don't add `@mui/*` to keep the bundle le## Design System

The visual language matches research.elixpo. Tokens live in `theme.js` (`palette`, `fonts`, `radii`), are exposed to Tailwind in `tailwind.config.ts`, and mirrored as CSS variables in `app/globals.css`.

- **Palette**: paper `#fbfbf8` (page), paper-deep `#eff1ed`, paper-soft `#f5f6f2` (alt sections), ink `#142018` (text + primary buttons), muted `#5f6962`, line `#d7dbd6`, blue `#3a65c7` / blue-deep `#2f56b0` (eyebrows, focus, accents), blue-wash `#dce7ff` (CTA panels), green `#0b623c` (inline links), danger `#b42318`. Pastels for art panels: `#f1c64f #cbdcff #dfd0f3 #d4eadf #f3dfb5`. Tailwind: `bg-paper`, `text-ink`, `border-line`, `text-accent-deep`, `text-green`, `bg-pastel-*`.
- **Typography**: Arial/Helvetica (`font-sans`), Georgia for italic `<em>` accents inside display headings (`font-serif`), `ui-monospace` for code and eyebrows. Classes: `.display-1` (hero h1), `.display-2` (section h2), `.lede`, `.eyebrow` (mono uppercase kicker), `.app-title` (dashboard/profile h1), `.doc-h1/.doc-h2/.doc-h3/.doc-p` (docs).
- **Chrome**: `Navbar` is a floating, blurred pill header (`shadow-header`) with a skip link to `#main-content`; the dashboard `Sidebar` uses the same pill bar. `Footer` is white with a hairline top border and mono column labels.
- **Surfaces**: `.glass-card` / `.glass-card-hover` — white, `border-line`, `rounded-[1.4rem]`, hover lifts 3px with a soft shadow. Ink sections (`bg-ink text-white`) for developer/API callouts; blue-wash panels for closing CTAs. `.art-panel` + `.art-ring` / `.art-pill` draw the research-style geometry.
- **Buttons**: pills only. `.btn-primary` (alias `.btn-accent`) = solid ink; `.btn-secondary` (alias `.btn-glass`) = ink outline; `.btn-danger`. Minimum 44px touch target.
- **Accessibility**: one `<h1>` per route (use `sr-only` when the visual title lives in a modal), every page wraps content in `<main id="main-content">`, global `:focus-visible` ring in blue, decorative SVG/geometry is `aria-hidden`, muted text never lighter than `#5f6962` on paper.
- **Performance**: keep marketing pages server components; isolate interactivity in small client islands (e.g. `components/landing/GuestShortener.tsx`, `components/CopyEmailButton.tsx`). Give every `<img>` explicit `width`/`height`.

Legacy `lime` / `sage` / `honey` aliases have been removed — every route uses the tokens above. Don't reintroduce red (`#e53935`) or purple accents.

.**

## Migrations

- Location: `workers/migrations/NNNN_<name>.sql`. Number is gapless — pick the next integer.
- Apply locally: `npm run db:migrate:local`.
- Apply to prod: `npm run db:migrate:remote`. **Only via merged PR + deploy**, never from a dev machine.

## Testing

- No test runner is wired yet. Verification is manual:
  1. `npm run dev` (Next dev, not on CF Pages).
  2. `curl http://localhost:3000/api/...` for API changes.
  3. `npm run pages:build` before deploy — only way to catch edge-runtime incompat.

## Deploy

- `./deploy.sh build deploy` — builds and deploys to Cloudflare Pages.
- By default deploys to the **production branch (`main`)**. To deploy a preview from your feature branch, set `DEPLOY_BRANCH=<branch>`.
- Never run with `sudo` — the script writes inside `.vercel/` and `node_modules/`; sudo files break subsequent non-sudo runs. The script refuses to run as root by design.

## Git & PR Workflow

- **Never commit to `main`.** It's branch-protected; use a feature branch.
- Branch naming: `elixpo/<issue-n>-<hex>` for agent-driven; `feat/<slug>` / `fix/<slug>` for manual.
- Commit format: conventional — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:`.
- PR title: `[ELIXPO] <short>` for agent PRs.
- PR body ends with `Fixes #N` so GitHub auto-closes on merge.

## Communication Style

- Bullets over paragraphs. <200 words per PR body / comment unless the change genuinely needs more.
- Facts, not opinions. Link specific files/lines rather than describing.
- No marketing language ("seamlessly", "robust", "leverages").
- No hedging ("I think", "maybe").

## Agent Voice

- Never say "Claude", "Claude Code", "AI", "LLM", "analyzing".
- Speak as a teammate: "looking into this", "pushed a fix", "opened #N".

## Workflow Orchestration

- Read `.elixpo-context/context.md` ONCE at the start if injected into the prompt; otherwise use `Glob` / `Grep` to locate files directly. Don't `ls -R`.
- For issue work, follow `.claude/commands/respond-to-issue.md`.
- For commit / push / PR, follow `.claude/commands/commit-push-pr.md`.
- For mechanical bulk refactors (>3 files, renames, string migrations), use `python .github/scripts/apply_refactor.py` with a JSON plan on stdin.

## Common Mistakes

- **`sudo npx` in deploy.sh** — files end up root-owned, breaks subsequent local builds. The fixed `deploy.sh` no longer does this; don't reintroduce it.
- **Deploying without `--branch=main`** — wrangler tags the deploy as Preview for whatever git branch you're on, so production never updates. The fixed `deploy.sh` passes `--branch="${DEPLOY_BRANCH:-main}"`.
- **Putting `router` from `useRouter()` in a useEffect deps array** — the ref is unstable under Next 15.2 + React 19, causing infinite re-render. Use `[]` deps or `window.location.assign(...)` for redirects.
- **Inline fetch functions in useEffect deps** — same loop class as above. Wrap fetch helpers in `useCallback(..., [])` so the ref is stable.
- **Bundling `@mui/*`** — this repo doesn't use MUI. Tailwind-only.
