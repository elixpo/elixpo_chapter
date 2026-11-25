# Sitemap and index eligibility

Implementation of the blog-only sitemap plus shared indexability policy (#395 package 2).

## Endpoints

- `/sitemap.xml` — existing root sitemap. Keeps static pages, eligible article URLs, profiles, organizations, org collections, curated collections, tags and contests. Category priority is unchanged; at most 50,000 URLs are emitted (duplicates removed, first occurrence wins). Articles keep newest-publication order with an ID tie-breaker. Aggregate categories use stable name/path ordering; tags now select alphabetically rather than by popularity at their 2,000-entry cap.
- `/blog-sitemap.xml` — article-only `urlset` for the discovery auditor. Edge `GET`, `Cache-Control: no-store` on every HTTP response. Same eligible rows and canonical article mapping as the root sitemap.

Neither endpoint is live until this branch is deployed. No workflow or schedule is enabled here.

## Eligibility (`lib/indexability.js`)

One policy owner for the JS predicate and the SQL fragment (real-SQL parity covered by tests):

| State | Indexed |
| --- | --- |
| `status = 'published'`, `secret = 0/false`, `deleted_at IS NULL` | yes |
| Personal publication (`published_as` NULL or `'personal'`) | yes |
| Existing org with visibility other than `private` (case-insensitive; NULL = public) | yes |
| `member_only` | yes (paywall JSON-LD unchanged) |
| draft, unlisted, archived, under_review, trashed, unknown status | no |
| secret, deleted, revision view (`?rev=`) | no |
| private org, dangling/unknown org reference, org id mismatch | no |
| below-threshold reports, `account_status=disabled` | unchanged (no new policy input) |

`indexableBlogSql()` only accepts internally supplied identifier aliases (`/^[A-Za-z_][A-Za-z0-9_]*$/`); data is never interpolated. Join the publication's organization row, using `org.id = substr(blog.published_as, 5)` for an indexed lookup. The predicate still requires the exact `blog.published_as = ('org:' || org.id)` match.

The same predicate drives article `robots` metadata, article `BlogPosting` output and the public-profile post list (filtered before `LIMIT 20`), so the sitemaps, metadata and profile `hasPart` agree.

## Cache

- Key: `v3:public-sitemap-rows` (named row object: `blogs`, `users`, `orgs`, `collections`, `curatedCollections`, `tags`, `contests`).
- 300-second read-through fallback TTL. A valid cache hit does not open D1.
- The previous `v2` array shape is never read.
- KV invalidation is best effort; no global linearizability is claimed.

## Response contract

| Condition | `/blog-sitemap.xml` |
| --- | --- |
| Eligible rows, including zero | `200` XML `urlset` (`Content-Type: application/xml; charset=utf-8`, `no-store`) |
| D1/query failure | `503` sanitized text, `Retry-After: 30`, `Cache-Control: no-store`; no empty fallback is cached |
| KV failure only | `200` feed served directly from D1 |

Root `/sitemap.xml` keeps its separate static-only fallback when D1 is unavailable. `lastmod` comes only from `updated_at`/`published_at`; absent or invalid values are omitted.

## Deferred

Package 3 adds invalidation for org privacy/slug/delete, org collection changes, curated collection changes and user purge, plus eligibility-aware IndexNow/WebSub transition notifications. Until then those mutations can leave discovery data stale for up to the 300-second fallback TTL. Live scheduling, Search Console and #559 are out of scope.
