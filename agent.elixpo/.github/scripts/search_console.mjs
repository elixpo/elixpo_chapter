// Resubmit a site's sitemap to Google Search Console and report the index
// status of its URLs. Used by .github/workflows/search-console-reusable.yml.
//
// Usage:
//   node .github/scripts/search_console.mjs            # submit sitemap + inspect URLs
//   node .github/scripts/search_console.mjs --submit   # submit sitemap only
//
// Env:
//   GOOGLE_SERVICE_ACCOUNT_JSON  full service-account key JSON. The account's
//                                email must be an Owner of the property.
//   SITE_URL                     public origin, e.g. https://me.elixpo.com (required)
//   SEARCH_CONSOLE_SITE          property id, e.g. "sc-domain:elixpo.com".
//                                Defaults to the URL-prefix property "<SITE_URL>/".
//   SITEMAP_URL                  defaults to "<SITE_URL>/sitemap.xml"
//   INSPECT_LIMIT                maximum URLs to inspect per run (default 50),
//                                most recently modified first.
//                                URL Inspection allows ~2,000 calls/day per
//                                property, shared by every site on that property.
import crypto from "node:crypto";
import fs from "node:fs";

const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "");
const PROPERTY = process.env.SEARCH_CONSOLE_SITE || `${SITE_URL}/`;
const SITEMAP_URL = process.env.SITEMAP_URL || `${SITE_URL}/sitemap.xml`;
const INSPECT_LIMIT = Number.parseInt(process.env.INSPECT_LIMIT || "50", 10);
const SCOPE = "https://www.googleapis.com/auth/webmasters";
const submitOnly = process.argv.includes("--submit");

function summary(markdown) {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

async function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = key.token_uri || "https://oauth2.googleapis.com/token";
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: key.client_email,
    scope: SCOPE,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function google(token, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${options.method || "GET"} ${url} failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function submitSitemap(token) {
  const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}/sitemaps/${encodeURIComponent(SITEMAP_URL)}`;
  await google(token, base, { method: "PUT" });
  const status = await google(token, base);
  const submitted = status.contents?.reduce((sum, c) => sum + Number(c.submitted || 0), 0) ?? "?";
  summary(`### Sitemap\n\nSubmitted \`${SITEMAP_URL}\` to \`${PROPERTY}\`: ${submitted} URLs, last downloaded by Google ${status.lastDownloaded || "never"}, ${status.errors || 0} errors, ${status.warnings || 0} warnings.\n`);
}

// Most recently modified first, so a capped run always covers new pages.
async function getSitemapUrls() {
  const res = await fetch(SITEMAP_URL);
  if (!res.ok) throw new Error(`Fetching ${SITEMAP_URL} failed: ${res.status}`);
  const entries = [...(await res.text()).matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, block]) => ({
    url: block.match(/<loc>(.*?)<\/loc>/)?.[1].trim(),
    lastmod: Date.parse(block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1] ?? "") || 0,
  }));
  return entries
    .filter((entry) => entry.url)
    .sort((a, b) => b.lastmod - a.lastmod)
    .map((entry) => entry.url);
}

async function inspectUrls(token) {
  const allUrls = await getSitemapUrls();
  const urls = allUrls.slice(0, Math.max(0, INSPECT_LIMIT));
  const rows = [];
  let notIndexed = 0;

  for (const url of urls) {
    try {
      const { inspectionResult } = await google(token, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
        method: "POST",
        body: JSON.stringify({ inspectionUrl: url, siteUrl: PROPERTY }),
      });
      const index = inspectionResult?.indexStatusResult || {};
      const indexed = index.verdict === "PASS";
      const canonicalOk = !index.googleCanonical || index.googleCanonical === url;
      if (!indexed) notIndexed += 1;
      rows.push(`| ${indexed ? "✅" : "⚠️"} | ${new URL(url).pathname} | ${index.coverageState || "-"} | ${index.lastCrawlTime?.slice(0, 16).replace("T", " ") || "-"} | ${canonicalOk ? "ok" : index.googleCanonical} |`);
    } catch (error) {
      notIndexed += 1;
      rows.push(`| ❌ | ${new URL(url).pathname} | ${error.message.slice(0, 120)} | - | - |`);
    }
  }

  const skipped = allUrls.length - urls.length;
  summary([
    `### Index status (${urls.length - notIndexed}/${urls.length} indexed${skipped ? `; ${skipped} not inspected, INSPECT_LIMIT=${INSPECT_LIMIT}` : ""})`,
    "",
    "| | Page | Coverage | Last crawl (UTC) | Google canonical |",
    "|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n"));
}

const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!rawKey) {
  summary("GOOGLE_SERVICE_ACCOUNT_JSON is not set; skipping Search Console sync.");
  process.exit(0);
}
if (!SITE_URL) {
  console.error("SITE_URL is required.");
  process.exit(1);
}

const token = await getAccessToken(JSON.parse(rawKey));
await submitSitemap(token);
if (!submitOnly && INSPECT_LIMIT > 0) await inspectUrls(token);
