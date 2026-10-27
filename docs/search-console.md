# Search Console sync

`search-console-reusable.yml` resubmits a site's sitemap to Google Search
Console and writes a per-URL index report to the run summary. Site repos call it
through the thin caller in `distribution/workflows/search-console.yml`.

## One-time setup

1. In Google Cloud, enable the
   [Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com)
   and create a service account with a JSON key.
2. In [Search Console](https://search.google.com/search-console), add the
   service account's email as an **Owner** of each property. The
   `sc-domain:elixpo.com` domain property covers every `*.elixpo.com` site;
   other domains such as `lixrl.com` need their own property.
3. In the organization's Actions settings, add:
   - secret `GOOGLE_SERVICE_ACCOUNT_JSON`: the full key JSON;
   - variable `SEARCH_CONSOLE_SITE`: `sc-domain:elixpo.com`.

Without the secret the run logs a skip message and exits successfully.

## Adding a site

Copy a caller into the site repository's `.github/workflows/`, set `site-url`
and the deploy workflow name, and give the cron a minute no other site uses.
Pass `property` only when the site is not on `SEARCH_CONSOLE_SITE`.

| Caller | Sites | Runs | Inspected per run |
|---|---|---|---|
| `distribution/workflows/search-console.yml` | every site except LixBlogs | after each successful deploy of a merge, and every third day | 50 |
| `distribution/workflows/search-console-blogs.yml` | LixBlogs | every 6 hours (posts publish without merges) | 100 |

Every run resubmits the full sitemap; only URL inspection is capped, and it
takes the most recently modified URLs first.

## Inputs

| Input | Default | Purpose |
|---|---|---|
| `site-url` | required | Public origin, e.g. `https://me.elixpo.com` |
| `property` | `vars.SEARCH_CONSOLE_SITE`, then `<site-url>/` | Search Console property id |
| `sitemap-url` | `<site-url>/sitemap.xml` | Sitemap location |
| `inspect-limit` | `50` | URLs inspected per run, newest `lastmod` first; `0` submits the sitemap only |

## Quota

URL Inspection allows about 2,000 calls per day per property, and every site on
`sc-domain:elixpo.com` shares that budget. Sitemap submission does not consume
it. The standard cadence spends roughly:

| Source | Per day |
|---|---|
| LixBlogs: 4 runs × 100 | 400 |
| ~15 other sites: one run every 3 days × 50 | 250 |
| Deploys: 50 per merge | 50 × merges |

That leaves room for about 20 merges a day across the organization. Lower a
site's `inspect-limit` before adding a faster schedule.

`vars.ELIXPO_SEARCH_CONSOLE_REF` pins the script revision; it defaults to `main`.
