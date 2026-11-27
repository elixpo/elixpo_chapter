# Festive themes

Elixpo's core services share one festive calendar: `config/festivals.yaml`. At build time,
`agent.elixpo/scripts/build-festive.mjs` validates it and writes
`https://agent.elixpo.com/festive/theme.js` with the calendar inlined. Each service loads that
file once, and the browser picks the theme from today's date in `Asia/Kolkata`.

| Service | Loads the script in |
| --- | --- |
| elixpo.com | `elixpo/elixpo` → `src/app/layout.tsx` |
| lixrl.com | `elixpo/lixrl.com` → `app/layout.tsx` |
| sketch.elixpo.com | `elixpo/sketch.elixpo` → `src/app/layout.jsx` |
| blogs.elixpo.com | `elixpo/blogs.elixpo` → `app/layout.jsx` |
| accounts.elixpo.com | `elixpo/accounts.elixpo` → `app/layout.tsx` |
| mail.elixpo.com | `elixpo/mail.elixpo` → `app/layout.tsx` |
| me.elixpo.com | `elixpo/me.elixpo` → `app/layout.js` |

## Changing dates

1. Edit `config/festivals.yaml`. Fixed-date festivals use `every_year: "MM-DD"`; lunar festivals
   list `dates` per year and need new entries each year.
2. Deploy agent.elixpo.com (`agent.elixpo/deploy.sh pages`). The build fails on an invalid calendar.

No service needs a redeploy. A festival runs from `before` days ahead (default 7) to `after` days
past its last day (default 3). Seasons fill the gaps.

## Controls

- `override: diwali` forces one theme everywhere; `override: none` turns all themes off.
- Removing a host from `services` turns themes off for that site only.
- `exclude_paths` lists routes per host that never show a theme, such as sketch's canvas
  (`/c/*`, `/room/*`, `/s/*`) and the blogs editor (`/edit/*`, `/new-blog`). Globs; `*` matches
  anything. Client-side navigation into or out of these routes switches the theme off and on.
- `canary` lists hosts that get a theme's next design first.
- `?festive=<id>` previews a theme on any page; `?festive=off` hides it.
- Visitors can dismiss the greeting, which also stops the particles for that festival.

## Behaviour and limits

The layer is decorative and `pointer-events: none`. It adds a top garland, a soft glow, at most 14
particles (7 on small screens) that animate only `transform` and `opacity`, and a dismissible
greeting badge. Motion stops under `prefers-reduced-motion`, and nothing prints.

The script runs on every listed service, including the sign-in pages of accounts and mail, so
anyone who can deploy agent.elixpo.com can run JavaScript there. Keep deploy access as narrow as
the access to those services.
