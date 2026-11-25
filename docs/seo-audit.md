# SEO audit CLI (local, audit-only)

`scripts/audit-seo.mjs` runs a bounded technical audit against an explicit article sitemap. It is audit tooling only: it does not submit URLs to Google, does not read Search Console, and does not prove that Google has indexed anything.

## Requirements

- Node 22
- `npm ci` from the repository root

## Usage

```bash
node scripts/audit-seo.mjs --sitemap <url> [--limit <1..100>] [--json <path>] [--markdown <path>]
```

`--help` prints usage and exits 0 without making a request. An explicit `--sitemap` URL is required; the CLI never guesses a feed.

| Option | Meaning |
| --- | --- |
| `--sitemap <url>` | Explicit sitemap URL. HTTPS is required except for loopback HTTP (`localhost`, `127.0.0.1`, `[::1]`) used by local fixtures. Credentials, query strings and fragments are rejected. |
| `--limit <1..100>` | Sample size. Default 25, maximum 100. |
| `--json <path>` | Write the structured report. |
| `--markdown <path>` | Write the Markdown report. |

Markdown is always written to stdout. Requesting an output file adds that artifact; it does not suppress stdout.

## Feed requirement

The audit reads a **urlset containing article URLs only**. A future `/blog-sitemap.xml` producer is not deployed by this package, so the CLI requires the URL as input. Sitemap indexes, foreign origins and non-article entries are rejected rather than crawled.

## Sampling and coverage

- The audit samples the first 25 unique URLs in producer order by default, up to 100.
- Duplicates are counted in the report and are not sampled twice.
- This is a bounded newest-article audit, not an exhaustive site crawl. The producer intends newest-first order; the audit does not independently verify that intent.
- The report lists `discoveredCount`, `duplicateCount`, the exact `sampledUrls`, and `selection: first-unique-in-producer-order`.

## Fixed bounds

- Request timeout: 10 seconds, including body reading.
- Article concurrency: 3.
- Decoded body caps: 8 MiB sitemap, 2 MiB article HTML, 512 KiB `robots.txt`.
- Redirects are not followed. Every request uses `redirect: 'manual'` and sends no credentials, cookies or authorization headers.
- Off-origin sitemap entries, redirect targets, canonical URLs and JSON-LD URLs are never fetched.

## Checks

- Direct HTTP 200 with an HTML media type. Redirects, other statuses, wrong media types, timeouts, network failures and oversized bodies are reported as failures.
- Exactly one canonical link whose resolved, normalized URL matches the audited sitemap URL.
- `robots`/`googlebot` meta tags and `X-Robots-Tag` restrictions: `noindex`, `nofollow` and `none` fail. Missing tags mean the normal index/follow default. Unrelated user-agent directives do not restrict Googlebot.
- `robots.txt` is fetched once per audit and evaluated for `Googlebot` with `robots-parser`. A 404 means no rules; other unavailable or invalid responses are a visible technical failure. Sitemaps advertised in `robots.txt` are not fetched.
- `BlogPosting` JSON-LD in objects, arrays, `@graph` and `@type` arrays. The article node must identify the audited URL through `url`, `@id` or `mainEntityOfPage`. Related-post nodes do not satisfy the check. JSON-LD is parsed, never executed.
- The named `namespace-collision-543.html` fixture covers the HTTP 200 soft 404: `noindex` body, no canonical, no `BlogPosting`, reported as three independent failures.

## Output and exit codes

| Code | Meaning |
| --- | --- |
| 0 | Technically clean run |
| 1 | Technical audit failure, including an empty feed or an output-file write failure |
| 2 | Invalid configuration, before any request |

Failed URLs, check names and bounded static reasons are reported. Fetched page bodies, raw network errors, response headers and credentials are never printed. Rendered URLs are length-bounded and escaped.

A technical pass only means these checks passed. Google indexing status is separate and is not inspected by this package (`inspection: { status: 'skipped' }`).

## Local example

Run against a synthetic loopback fixture; do not run a live production crawl from this documentation:

```bash
node scripts/audit-seo.mjs --sitemap http://127.0.0.1:8787/blog-sitemap.xml --limit 25
```

No scheduled workflow, artifact upload or Search Console integration is part of this package.
