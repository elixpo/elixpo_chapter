import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSitemap, checkArticle, parseSitemapUrl } from '../scripts/seo/checks.mjs';

const FIXTURES = new URL('./fixtures/seo-audit/', import.meta.url);
const SITEMAP_URL = 'https://example.com/blog-sitemap.xml';
const ARTICLE_URL = 'https://example.com/@writer/valid-article';
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

const read = (name) => readFile(new URL(name, FIXTURES), 'utf8');
const sitemap = (entries) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="${SITEMAP_NS}">${entries}</urlset>`;
const page = ({ head = '', body = '' } = {}) =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const jsonLd = (value) =>
  `<script type="application/ld+json">${typeof value === 'string' ? value : JSON.stringify(value)}</script>`;
const canonical = (href) => `<link rel="canonical" href="${href}">`;
const validArticleHead = (extra = '') =>
  jsonLd({ '@context': 'https://schema.org', '@type': 'BlogPosting', url: ARTICLE_URL }) + extra;

const codes = (issues) => issues.map((issue) => issue.code);
const codesFor = (issues, check) =>
  issues.filter((issue) => issue.check === check).map((issue) => issue.code);
const assertCode = (fn, expected) =>
  assert.throws(fn, (error) => {
    assert.equal(error.code, expected, `expected ${expected}, got ${error.code}: ${error.message}`);
    return true;
  });

test('parses a default-namespace sitemap in producer order', async () => {
  const result = parseSitemap(await read('sitemap-valid.xml'), SITEMAP_URL);
  assert.deepEqual(result.urls, [
    'https://example.com/@writer/first-post',
    'https://example.com/@writer/second-post',
    'https://example.com/@writer/third-post',
  ]);
  assert.equal(result.duplicateCount, 0);
});

test('parses the same sitemap with a prefixed namespace', async () => {
  const result = parseSitemap(await read('sitemap-prefixed.xml'), SITEMAP_URL);
  assert.deepEqual(result.urls, [
    'https://example.com/@writer/first-post',
    'https://example.com/@writer/second-post',
    'https://example.com/@writer/third-post',
  ]);
  assert.equal(result.duplicateCount, 0);
});

test('decodes XML entities in loc values', () => {
  const result = parseSitemap(
    sitemap('<url><loc>https://example.com/@writer/a&amp;b</loc></url>'),
    SITEMAP_URL,
  );
  assert.deepEqual(result.urls, ['https://example.com/@writer/a&b']);
});

test('counts duplicates and preserves first occurrence order', async () => {
  const result = parseSitemap(await read('sitemap-duplicates.xml'), SITEMAP_URL);
  assert.deepEqual(result.urls, [
    'https://example.com/@writer/a',
    'https://example.com/@writer/b',
  ]);
  assert.equal(result.duplicateCount, 3);
});

test('an empty but valid feed parses to an empty list', () => {
  assert.deepEqual(parseSitemap(sitemap(''), SITEMAP_URL), { urls: [], duplicateCount: 0 });
});

test('rejects an entry without a loc', async () => {
  const xml = await read('sitemap-missing-loc.xml');
  assertCode(() => parseSitemap(xml, SITEMAP_URL), 'MISSING_LOC');
});

test('rejects a whitespace-only loc', () => {
  assertCode(
    () => parseSitemap(sitemap('<url><loc>   </loc></url>'), SITEMAP_URL),
    'MISSING_LOC',
  );
});

test('rejects a wrong urlset namespace', async () => {
  const xml = await read('sitemap-wrong-namespace.xml');
  assertCode(() => parseSitemap(xml, SITEMAP_URL), 'WRONG_NAMESPACE');
});

test('rejects a missing urlset namespace', () => {
  assertCode(
    () => parseSitemap('<urlset><url><loc>https://example.com/a</loc></url></urlset>', SITEMAP_URL),
    'MISSING_NAMESPACE',
  );
});

test('rejects malformed XML', async () => {
  const xml = await read('sitemap-malformed.xml');
  assertCode(() => parseSitemap(xml, SITEMAP_URL), 'INVALID_XML');
});

test('rejects a malformed supplied lastmod', async () => {
  const xml = await read('sitemap-bad-lastmod.xml');
  assertCode(() => parseSitemap(xml, SITEMAP_URL), 'INVALID_LASTMOD');
});

test('rejects a sitemap index', async () => {
  const xml = await read('sitemap-index.xml');
  assertCode(() => parseSitemap(xml, SITEMAP_URL), 'SITEMAP_INDEX_UNSUPPORTED');
});

test('rejects a relative loc', () => {
  assertCode(
    () => parseSitemap(sitemap('<url><loc>@writer/a</loc></url>'), SITEMAP_URL),
    'INVALID_LOC',
  );
});

test('rejects an off-origin loc', () => {
  assertCode(
    () => parseSitemap(sitemap('<url><loc>https://other.example/@writer/a</loc></url>'), SITEMAP_URL),
    'OFF_ORIGIN_LOC',
  );
});

test('rejects userinfo, query and fragment locs without echoing secrets', () => {
  for (const loc of [
    'https://user:super-secret@example.com/@writer/a',
    'https://example.com/@writer/a?token=super-secret',
    'https://example.com/@writer/a#super-secret',
  ]) {
    assertCode(
      () => parseSitemap(sitemap(`<url><loc>${loc.replaceAll('&', '&amp;')}</loc></url>`), SITEMAP_URL),
      'UNSAFE_LOC',
    );
  }
  try {
    parseSitemap(
      sitemap('<url><loc>https://user:super-secret@example.com/@writer/a</loc></url>'),
      SITEMAP_URL,
    );
  } catch (error) {
    assert.ok(!error.message.includes('super-secret'));
  }
});

test('rejects more than 50,000 entries', () => {
  const entries = Array.from(
    { length: 50_001 },
    (_, index) => `<url><loc>https://example.com/@writer/p-${index}</loc></url>`,
  ).join('');
  assertCode(() => parseSitemap(sitemap(entries), SITEMAP_URL), 'TOO_MANY_URLS');
});

test('rejects unsafe or unsupported sitemap inputs', () => {
  const xml = sitemap('<url><loc>https://example.com/@writer/a</loc></url>');
  for (const input of [
    'http://example.com/blog-sitemap.xml',
    'https://user:super-secret@example.com/blog-sitemap.xml',
    'https://example.com/blog-sitemap.xml?x=1',
    'https://example.com/blog-sitemap.xml#part',
    '/blog-sitemap.xml',
  ]) {
    assertCode(() => parseSitemap(xml, input), 'INVALID_SITEMAP_URL');
  }
});

test('accepts explicit loopback HTTP sitemap origins', () => {
  const loopback = 'http://127.0.0.1:8787/blog-sitemap.xml';
  const result = parseSitemap(
    sitemap('<url><loc>http://127.0.0.1:8787/@writer/a</loc></url>'),
    loopback,
  );
  assert.deepEqual(result.urls, ['http://127.0.0.1:8787/@writer/a']);
  assert.equal(parseSitemapUrl(loopback).origin, 'http://127.0.0.1:8787');
});

test('accepts a canonical article without issues', async () => {
  const issues = checkArticle({
    url: ARTICLE_URL,
    html: await read('article-valid.html'),
    headers: {},
  });
  assert.deepEqual(issues, []);
});

test('reports the #543 soft 404 as three independent failures', async () => {
  const issues = checkArticle({
    url: 'https://example.com/@writer/namespace-collision-543',
    html: await read('namespace-collision-543.html'),
    headers: {},
  });
  assert.deepEqual(codes(issues), ['ROBOTS_NOINDEX', 'CANONICAL_MISSING', 'BLOGPOSTING_MISSING']);
  for (const issue of issues) {
    assert.equal(typeof issue.check, 'string');
    assert.ok(issue.reason.length > 0 && issue.reason.length < 200);
  }
});

test('accepts a relative canonical href', () => {
  const issues = checkArticle({
    url: ARTICLE_URL,
    html: page({ head: validArticleHead(canonical('/@writer/valid-article')) }),
    headers: {},
  });
  assert.deepEqual(codesFor(issues, 'canonical'), []);
});

test('accepts an entity-encoded canonical href', () => {
  const url = 'https://example.com/@writer/a&b';
  const issues = checkArticle({
    url,
    html: page({
      head:
        jsonLd({ '@type': 'BlogPosting', url }) +
        canonical('https://example.com/@writer/a&amp;b'),
    }),
    headers: {},
  });
  assert.deepEqual(codesFor(issues, 'canonical'), []);
});

test('reports missing, empty, duplicate and mismatched canonicals', () => {
  const cases = [
    ['CANONICAL_MISSING', ''],
    ['CANONICAL_EMPTY', canonical('')],
    ['CANONICAL_MULTIPLE', canonical(ARTICLE_URL) + canonical(ARTICLE_URL)],
    ['CANONICAL_MISMATCH', canonical('https://example.com/@writer/another-article')],
  ];
  for (const [expected, extra] of cases) {
    const issues = checkArticle({
      url: ARTICLE_URL,
      html: page({ head: validArticleHead(extra) }),
      headers: {},
    });
    assert.deepEqual(codesFor(issues, 'canonical'), [expected]);
  }
});

test('does not equate different path case, encoded slashes or query strings', () => {
  for (const href of [
    'https://example.com/@writer/Valid-Article',
    'https://example.com/@writer%2Fvalid-article',
    `${ARTICLE_URL}?x=1`,
  ]) {
    const issues = checkArticle({
      url: ARTICLE_URL,
      html: page({ head: validArticleHead(canonical(href)) }),
      headers: {},
    });
    assert.deepEqual(codesFor(issues, 'canonical'), ['CANONICAL_MISMATCH']);
  }
});

test('treats absent robots directives as index/follow', async () => {
  const issues = checkArticle({
    url: ARTICLE_URL,
    html: await read('article-valid.html'),
    headers: {},
  });
  assert.deepEqual(codesFor(issues, 'robots'), []);
});

test('combines robots and googlebot meta restrictions', () => {
  const cases = [
    ['ROBOTS_NOINDEX', '<meta name="robots" content="noindex">'],
    ['ROBOTS_NOFOLLOW', '<meta name="googlebot" content="nofollow">'],
  ];
  for (const [expected, meta] of cases) {
    const issues = checkArticle({
      url: ARTICLE_URL,
      html: page({ head: validArticleHead(canonical(ARTICLE_URL) + meta) }),
      headers: {},
    });
    assert.deepEqual(codesFor(issues, 'robots'), [expected]);
  }
});

test('unrelated agents do not restrict Googlebot', () => {
  const issues = checkArticle({
    url: ARTICLE_URL,
    html: page({
      head: validArticleHead(
        canonical(ARTICLE_URL) + '<meta name="bingbot" content="noindex,nofollow">',
      ),
    }),
    headers: { 'x-robots-tag': 'bingbot: noindex' },
  });
  assert.deepEqual(codesFor(issues, 'robots'), []);
});

test('a later index token does not undo noindex', () => {
  const issues = checkArticle({
    url: ARTICLE_URL,
    html: page({
      head: validArticleHead(
        canonical(ARTICLE_URL) +
          '<meta name="robots" content="noindex"><meta name="googlebot" content="index, follow">',
      ),
    }),
    headers: {},
  });
  assert.deepEqual(codesFor(issues, 'robots'), ['ROBOTS_NOINDEX']);
});

test('none means noindex and nofollow', () => {
  const issues = checkArticle({
    url: ARTICLE_URL,
    html: page({
      head: validArticleHead(canonical(ARTICLE_URL) + '<meta name="robots" content="none">'),
    }),
    headers: {},
  });
  assert.deepEqual(codesFor(issues, 'robots'), ['ROBOTS_NOINDEX', 'ROBOTS_NOFOLLOW']);
});

test('combines X-Robots-Tag restrictions with meta directives', () => {
  const issues = checkArticle({
    url: ARTICLE_URL,
    html: page({
      head: validArticleHead(canonical(ARTICLE_URL) + '<meta name="robots" content="noindex">'),
    }),
    headers: { 'x-robots-tag': 'googlebot: nofollow' },
  });
  assert.deepEqual(codesFor(issues, 'robots'), ['ROBOTS_NOINDEX', 'ROBOTS_NOFOLLOW']);
});

test('supports Headers instances and scoped header values', () => {
  const head = validArticleHead(canonical(ARTICLE_URL));
  const plain = checkArticle({ url: ARTICLE_URL, html: page({ head }), headers: new Headers({ 'X-Robots-Tag': 'noindex' }) });
  assert.deepEqual(codesFor(plain, 'robots'), ['ROBOTS_NOINDEX']);
  const scoped = checkArticle({ url: ARTICLE_URL, html: page({ head }), headers: { 'x-robots-tag': 'googlebot: noindex, nofollow' } });
  assert.deepEqual(codesFor(scoped, 'robots'), ['ROBOTS_NOINDEX', 'ROBOTS_NOFOLLOW']);
});

test('X-Robots-Tag names and directives are case insensitive', () => {
  const issues = checkArticle({ url: ARTICLE_URL,
    html: page({ head: validArticleHead(canonical(ARTICLE_URL)) }),
    headers: new Headers({ 'X-Robots-Tag': 'GoogleBot: NOINDEX, NOFOLLOW' }) });
  assert.deepEqual(codesFor(issues, 'robots'), ['ROBOTS_NOINDEX', 'ROBOTS_NOFOLLOW']);
});

test('a crawler scope applies to its entire comma-separated header rule list', () => {
  const html = page({ head: validArticleHead(canonical(ARTICLE_URL)) });
  assert.deepEqual(codesFor(checkArticle({ url: ARTICLE_URL, html,
    headers: { 'x-robots-tag': 'bingbot: noindex, nofollow' } }), 'robots'), []);
  assert.deepEqual(codesFor(checkArticle({ url: ARTICLE_URL, html,
    headers: { 'x-robots-tag': 'googlebot: noindex, bingbot: nofollow, none' } }), 'robots'),
    ['ROBOTS_NOINDEX']);
  assert.deepEqual(codesFor(checkArticle({ url: ARTICLE_URL, html,
    headers: { 'x-robots-tag': 'max-snippet: 50, noindex' } }), 'robots'),
    ['ROBOTS_NOINDEX']);
});

test('relative canonical and JSON-LD references honor the document base URL', () => {
  const html = page({ head: '<base href="https://other.example/">' +
    canonical('/@writer/valid-article') +
    jsonLd({ '@type': 'BlogPosting', url: '/@writer/valid-article' }) });
  const issues = checkArticle({ url: ARTICLE_URL, html });
  assert.deepEqual(codesFor(issues, 'canonical'), ['CANONICAL_MISMATCH']);
  assert.deepEqual(codesFor(issues, 'blogposting'), ['BLOGPOSTING_UNIDENTIFIED']);
});

test('accepts BlogPosting identified by url, @id or mainEntityOfPage', () => {
  const head = canonical(ARTICLE_URL);
  const nodes = [
    { '@type': 'BlogPosting', url: ARTICLE_URL },
    { '@type': 'BlogPosting', '@id': ARTICLE_URL },
    { '@type': 'BlogPosting', mainEntityOfPage: ARTICLE_URL },
    { '@type': 'BlogPosting', mainEntityOfPage: { '@type': 'WebPage', '@id': ARTICLE_URL } },
    { '@type': 'BlogPosting', url: '/@writer/valid-article' },
  ];
  for (const node of nodes) {
    const issues = checkArticle({ url: ARTICLE_URL, html: page({ head: jsonLd(node) + head }), headers: {} });
    assert.deepEqual(codesFor(issues, 'blogposting'), []);
  }
});

test('finds BlogPosting in arrays and graphs, including @type arrays', () => {
  const head = canonical(ARTICLE_URL);
  const values = [
    [
      { '@type': 'BlogPosting', url: 'https://example.com/@writer/related' },
      { '@type': 'BlogPosting', url: ARTICLE_URL },
    ],
    {
      '@context': 'https://schema.org',
      '@graph': [{ '@type': ['NewsArticle', 'BlogPosting'], '@id': ARTICLE_URL }],
    },
  ];
  for (const value of values) {
    const issues = checkArticle({ url: ARTICLE_URL, html: page({ head: jsonLd(value) + head }), headers: {} });
    assert.deepEqual(codesFor(issues, 'blogposting'), []);
  }
});

test('does not accept an unrelated related-post node', () => {
  const issues = checkArticle({
    url: ARTICLE_URL,
    html: page({
      head:
        canonical(ARTICLE_URL) +
        jsonLd({ '@type': 'BlogPosting', url: 'https://example.com/@writer/related' }),
    }),
    headers: {},
  });
  assert.deepEqual(codesFor(issues, 'blogposting'), ['BLOGPOSTING_UNIDENTIFIED']);
});

test('reports malformed, absent and non-JSON-LD markup', () => {
  const head = canonical(ARTICLE_URL);
  const cases = [
    ['BLOGPOSTING_MALFORMED', jsonLd('{not json')],
    ['BLOGPOSTING_MISSING', ''],
    ['BLOGPOSTING_MISSING', '<script>{"@type":"BlogPosting","url":"' + ARTICLE_URL + '"}</script>'],
    ['BLOGPOSTING_MISSING', jsonLd({ '@type': 'Article', url: ARTICLE_URL })],
  ];
  for (const [expected, extra] of cases) {
    const issues = checkArticle({ url: ARTICLE_URL, html: page({ head: head + extra }), headers: {} });
    assert.deepEqual(codesFor(issues, 'blogposting'), [expected]);
  }
});
