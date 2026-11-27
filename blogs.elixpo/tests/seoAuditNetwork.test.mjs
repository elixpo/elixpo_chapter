import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSitemap, AuditConfigError } from '../scripts/seo/audit.mjs';

const SITEMAP_URL = 'https://example.com/blog-sitemap.xml';
const ROBOTS_URL = 'https://example.com/robots.txt';
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

const xml = (entries) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="${SITEMAP_NS}">${entries}</urlset>`;
const entry = (url) => `<url><loc>${url}</loc></url>`;
const sitemapFor = (urls) => xml(urls.map(entry).join(''));
const articleHtml = (url) =>
  `<!doctype html><html><head><link rel="canonical" href="${url}">` +
  `<script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', url })}</script>` +
  `</head><body></body></html>`;

function response(body, { status = 200, type } = {}) {
  const headers = {};
  if (type) headers['content-type'] = type;
  return new Response(body, { status, headers });
}

function auditFetch({
  sitemapUrls = [],
  robots = '',
  robotsStatus = 200,
  robotsType = 'text/plain',
  articleType = 'text/html',
  articleBody = articleHtml,
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === SITEMAP_URL) {
      return response(sitemapFor(sitemapUrls), { type: 'application/xml' });
    }
    if (url === ROBOTS_URL) {
      return response(robots, { status: robotsStatus, type: robotsType });
    }
    return response(articleBody(url), { type: articleType });
  };
  return { calls, fetchImpl };
}

const urlsOf = (calls) => calls.map((call) => call.url);
const issueCodes = (issues) => issues.map((issue) => issue.code);
const resultIssues = (report, index) => report.results[index].issues.map((issue) => issue.code);

test('rejected response bodies are cancelled for redirects, errors, types and robots 404', async () => {
  const article = 'https://example.com/@writer/a';
  for (const [target, status, type] of [
    [SITEMAP_URL, 302, 'text/html'], [SITEMAP_URL, 503, 'application/xml'],
    [article, 200, 'text/plain'], [ROBOTS_URL, 404, 'text/plain'],
  ]) {
    let cancelled = false;
    const fetchImpl = async (url) => {
      if (url === target) return new Response(new ReadableStream({
        cancel() { cancelled = true; },
      }), { status, headers: { 'content-type': type } });
      if (url === SITEMAP_URL) return response(sitemapFor([article]), { type: 'application/xml' });
      if (url === ROBOTS_URL) return response('', { type: 'text/plain' });
      return response(articleHtml(url), { type: 'text/html' });
    };
    await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
    assert.equal(cancelled, true, `response ${status} from ${target} must be cancelled`);
  }
});

test('timeout and oversize failures do not await an unresponsive stream cancellation', async () => {
  const article = 'https://example.com/@writer/a';
  for (const oversize of [false, true]) {
    let releaseCancel;
    let timer;
    const cancelPending = new Promise((resolve) => { releaseCancel = resolve; });
    const fetchImpl = async (url) => {
      if (url === SITEMAP_URL) return response(sitemapFor([article]), { type: 'application/xml' });
      if (url === ROBOTS_URL) return response('', { type: 'text/plain' });
      return new Response(new ReadableStream({
        start(controller) { if (oversize) controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
        cancel() { return cancelPending; },
      }), { headers: { 'content-type': 'text/html' } });
    };
    const audit = auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl, timeoutMs: 20 });
    let result;
    try {
      result = await Promise.race([audit, new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), 1000);
      })]);
    } finally {
      clearTimeout(timer);
      releaseCancel();
      await audit;
    }
    assert.ok(result, 'audit exceeded its deadline while awaiting cancellation');
    assert.deepEqual(resultIssues(result, 0), [oversize ? 'TOO_LARGE' : 'TIMEOUT']);
  }
});

async function assertConfigFailure(factory, code) {
  await assert.rejects(factory, (error) => {
    assert.ok(error instanceof AuditConfigError);
    assert.equal(error.code, code);
    return true;
  });
}

test('fetches the sitemap, robots and each sampled article with a safe request init', async () => {
  const urls = ['https://example.com/@writer/a', 'https://example.com/@writer/b'];
  const { calls, fetchImpl } = auditFetch({ sitemapUrls: urls });
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });

  assert.deepEqual(urlsOf(calls), [SITEMAP_URL, ROBOTS_URL, ...urls]);
  for (const { init } of calls) {
    assert.equal(init.redirect, 'manual');
    assert.equal(init.credentials, 'omit');
    const headerNames = Object.keys(init.headers ?? {}).map((name) => name.toLowerCase());
    assert.ok(!headerNames.includes('authorization'));
    assert.ok(!headerNames.includes('cookie'));
  }
  assert.deepEqual(report, {
    version: 1,
    technicalStatus: 'passed',
    sitemapUrl: SITEMAP_URL,
    discoveredCount: 2,
    sampledUrls: urls,
    duplicateCount: 0,
    selection: 'first-unique-in-producer-order',
    results: urls.map((url) => ({ url, issues: [] })),
    issues: [],
    inspection: { status: 'skipped', reason: 'not part of this package' },
  });
});

test('caps in-flight article requests at three', async () => {
  const urls = Array.from({ length: 6 }, (_, index) => `https://example.com/@writer/p-${index}`);
  let active = 0;
  let maxActive = 0;
  const fetchImpl = async (url, init) => {
    if (url === SITEMAP_URL) return response(sitemapFor(urls), { type: 'application/xml' });
    if (url === ROBOTS_URL) return response('', { type: 'text/plain' });
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return response(articleHtml(url), { type: 'text/html' });
  };
  await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl, limit: 6 });
  assert.equal(maxActive, 3);
});

test('preserves sample order in results despite concurrent completion', async () => {
  const urls = Array.from({ length: 5 }, (_, index) => `https://example.com/@writer/p-${index}`);
  const delays = [30, 1, 20, 2, 10];
  const fetchImpl = async (url) => {
    if (url === SITEMAP_URL) return response(sitemapFor(urls), { type: 'application/xml' });
    if (url === ROBOTS_URL) return response('', { type: 'text/plain' });
    const index = urls.indexOf(url);
    await new Promise((resolve) => setTimeout(resolve, delays[index]));
    return response(articleHtml(url), { type: 'text/html' });
  };
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl, limit: 5 });
  assert.deepEqual(
    report.results.map((result) => result.url),
    urls,
  );
});

test('samples the first 25 unique URLs by default and honours the maximum', async () => {
  const many = Array.from({ length: 105 }, (_, index) => `https://example.com/@writer/p-${index}`);
  const first = auditFetch({ sitemapUrls: many });
  const defaultReport = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl: first.fetchImpl });
  assert.equal(defaultReport.discoveredCount, 105);
  assert.equal(defaultReport.sampledUrls.length, 25);
  assert.equal(first.calls.length, 2 + 25);

  const second = auditFetch({ sitemapUrls: many });
  const maximumReport = await auditSitemap({
    sitemapUrl: SITEMAP_URL,
    fetchImpl: second.fetchImpl,
    limit: 100,
  });
  assert.equal(maximumReport.sampledUrls.length, 100);
  assert.equal(second.calls.length, 2 + 100);
});

test('counts duplicates while sampling unique URLs in producer order', async () => {
  const a = 'https://example.com/@writer/a';
  const b = 'https://example.com/@writer/b';
  const { fetchImpl } = auditFetch({ sitemapUrls: [a, b, a, b, a] });
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
  assert.equal(report.discoveredCount, 2);
  assert.equal(report.duplicateCount, 3);
  assert.deepEqual(report.sampledUrls, [a, b]);
  assert.equal(report.selection, 'first-unique-in-producer-order');
});

test('an empty feed is a global technical failure and fetches nothing else', async () => {
  const { calls, fetchImpl } = auditFetch({ sitemapUrls: [] });
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
  assert.equal(report.technicalStatus, 'failed');
  assert.deepEqual(issueCodes(report.issues), ['EMPTY_FEED']);
  assert.deepEqual(report.results, []);
  assert.deepEqual(urlsOf(calls), [SITEMAP_URL]);
});

test('rejects invalid caller configuration before any request', async () => {
  const fetchImpl = async () => {
    throw new Error('must not fetch');
  };
  for (const limit of [0, 101, 2.5, '3']) {
    await assertConfigFailure(
      () => auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl, limit }),
      'INVALID_LIMIT',
    );
  }
  for (const sitemapUrl of [
    'http://example.com/blog-sitemap.xml',
    'https://user:super-secret@example.com/blog-sitemap.xml',
    'https://example.com/blog-sitemap.xml?x=1',
    'https://example.com/blog-sitemap.xml#part',
    '/blog-sitemap.xml',
  ]) {
    await assertConfigFailure(
      () => auditSitemap({ sitemapUrl, fetchImpl }),
      'INVALID_SITEMAP_URL',
    );
  }
  await assertConfigFailure(
    () => auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl: null }),
    'INVALID_FETCH',
  );
  await assertConfigFailure(
    () => auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl, timeoutMs: 0 }),
    'INVALID_TIMEOUT',
  );
});

test('invalid sitemap configuration does not echo the secret input', async () => {
  try {
    await auditSitemap({
      sitemapUrl: 'https://user:super-secret@example.com/blog-sitemap.xml',
      fetchImpl: async () => response('', { type: 'text/html' }),
    });
  } catch (error) {
    assert.equal(error.code, 'INVALID_SITEMAP_URL');
    assert.ok(!error.message.includes('super-secret'));
  }
});

test('reports sitemap redirects, statuses and content types as global failures', async () => {
  const cases = [
    [() => response('', { status: 302, type: 'text/html' }), 'REDIRECT'],
    [() => response('', { status: 500, type: 'application/xml' }), 'HTTP_STATUS'],
    [() => response('<html></html>', { type: 'text/html' }), 'WRONG_CONTENT_TYPE'],
  ];
  for (const [makeResponse, code] of cases) {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return makeResponse();
    };
    const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
    assert.equal(report.technicalStatus, 'failed');
    assert.deepEqual(issueCodes(report.issues), [code]);
    assert.deepEqual(urlsOf(calls), [SITEMAP_URL]);
  }
});

test('bounds the sitemap body and cancels the oversize stream', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const fetchImpl = async () =>
    new Response(stream, { status: 200, headers: { 'content-type': 'application/xml' } });
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
  assert.deepEqual(issueCodes(report.issues), ['TOO_LARGE']);
  assert.equal(cancelled, true);
});

test('does not fetch foreign sitemap locs', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return response(
      xml('<url><loc>https://evil.example/@writer/a</loc></url>'),
      { type: 'application/xml' },
    );
  };
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
  assert.deepEqual(issueCodes(report.issues), ['OFF_ORIGIN_LOC']);
  assert.deepEqual(urlsOf(calls), [SITEMAP_URL]);
});

test('never fetches redirect targets, canonicals or JSON-LD URLs', async () => {
  const article = 'https://example.com/@writer/a';
  const head =
    `<link rel="canonical" href="${article}">` +
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', url: article, sameAs: 'https://evil.example/related' })}</script>`;
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === SITEMAP_URL) return response(sitemapFor([article]), { type: 'application/xml' });
    if (url === ROBOTS_URL) return response('', { type: 'text/plain' });
    if (url === article) {
      return response(`<!doctype html><html><head>${head}</head><body></body></html>`, {
        type: 'text/html',
      });
    }
    return response('', { status: 302, type: 'text/html' });
  };
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
  assert.deepEqual(report.results[0].issues, []);
  assert.deepEqual(urlsOf(calls), [SITEMAP_URL, ROBOTS_URL, article]);
});

test('reports article redirects, statuses and content types without following or echoing', async () => {
  const article = 'https://example.com/@writer/a';
  const cases = [
    [() => response('', { status: 302, type: 'text/html' }), 'REDIRECT'],
    [() => response('', { status: 404, type: 'text/html' }), 'HTTP_STATUS'],
    [() => response('plain', { type: 'text/plain' }), 'WRONG_CONTENT_TYPE'],
    [
      () => {
        throw new Error('Boom super-secret upstream failure');
      },
      'NETWORK',
    ],
  ];
  for (const [makeArticle, code] of cases) {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (url === SITEMAP_URL) return response(sitemapFor([article]), { type: 'application/xml' });
      if (url === ROBOTS_URL) return response('', { type: 'text/plain' });
      return makeArticle();
    };
    const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
    assert.deepEqual(resultIssues(report, 0), [code]);
    assert.equal(report.technicalStatus, 'failed');
    assert.ok(!JSON.stringify(report).includes('super-secret'));
    if (code === 'REDIRECT') {
      assert.ok(!urlsOf(calls).some((url) => url.includes('evil')));
    }
  }
});

test('times out stalled requests including body reads', async () => {
  const article = 'https://example.com/@writer/a';
  const stalledHeaders = async (url, init) => {
    if (url === SITEMAP_URL) return response(sitemapFor([article]), { type: 'application/xml' });
    if (url === ROBOTS_URL) return response('', { type: 'text/plain' });
    return new Promise((resolve, reject) => {
      init.signal.addEventListener(
        'abort',
        () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        },
        { once: true },
      );
    });
  };
  const headersReport = await auditSitemap({
    sitemapUrl: SITEMAP_URL,
    fetchImpl: stalledHeaders,
    timeoutMs: 20,
  });
  assert.deepEqual(resultIssues(headersReport, 0), ['TIMEOUT']);

  const stalledBody = async (url) => {
    if (url === SITEMAP_URL) return response(sitemapFor([article]), { type: 'application/xml' });
    if (url === ROBOTS_URL) return response('', { type: 'text/plain' });
    return new Response(new ReadableStream({ start() {} }), {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  };
  const bodyReport = await auditSitemap({
    sitemapUrl: SITEMAP_URL,
    fetchImpl: stalledBody,
    timeoutMs: 20,
  });
  assert.deepEqual(resultIssues(bodyReport, 0), ['TIMEOUT']);
});

test('bounds and cancels oversized article bodies', async () => {
  const article = 'https://example.com/@writer/a';
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const fetchImpl = async (url) => {
    if (url === SITEMAP_URL) return response(sitemapFor([article]), { type: 'application/xml' });
    if (url === ROBOTS_URL) return response('', { type: 'text/plain' });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
  assert.deepEqual(resultIssues(report, 0), ['TOO_LARGE']);
  assert.equal(cancelled, true);
});

test('treats a robots.txt 404 as no rules', async () => {
  const urls = ['https://example.com/@writer/a'];
  const { calls, fetchImpl } = auditFetch({ sitemapUrls: urls, robotsStatus: 404 });
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
  assert.equal(report.technicalStatus, 'passed');
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.results[0].issues, []);
  assert.deepEqual(urlsOf(calls), [SITEMAP_URL, ROBOTS_URL, urls[0]]);
});

test('fetches robots.txt once and attaches Googlebot disallow failures per URL', async () => {
  const blocked = 'https://example.com/@writer/blocked';
  const allowed = 'https://example.com/@writer/allowed';
  const { calls, fetchImpl } = auditFetch({
    sitemapUrls: [blocked, allowed],
    robots: 'User-agent: Googlebot\nDisallow: /@writer/blocked\n',
  });
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
  assert.deepEqual(resultIssues(report, 0), ['ROBOTS_DISALLOWED']);
  assert.deepEqual(resultIssues(report, 1), []);
  assert.equal(report.technicalStatus, 'failed');
  assert.equal(urlsOf(calls).filter((url) => url === ROBOTS_URL).length, 1);
});

test('uses robots-parser for user-agent groups, Allow precedence and wildcards', async () => {
  const robots = [
    'User-agent: Bingbot',
    'Disallow: /',
    '',
    'User-agent: Googlebot',
    'Disallow: /@writer/',
    'Allow: /@writer/allowed',
    'Disallow: /*-draft$',
  ].join('\n');
  const urls = [
    'https://example.com/@writer/allowed',
    'https://example.com/@writer/blocked',
    'https://example.com/@writer/some-draft',
  ];
  const { fetchImpl } = auditFetch({ sitemapUrls: urls, robots });
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
  assert.deepEqual(resultIssues(report, 0), []);
  assert.deepEqual(resultIssues(report, 1), ['ROBOTS_DISALLOWED']);
  assert.deepEqual(resultIssues(report, 2), ['ROBOTS_DISALLOWED']);
});

test('unavailable or invalid robots responses are visible technical failures', async () => {
  const urls = ['https://example.com/@writer/a'];
  for (const [robotsStatus, robotsType] of [
    [500, 'text/plain'],
    [200, 'text/html'],
  ]) {
    const { fetchImpl } = auditFetch({ sitemapUrls: urls, robotsStatus, robotsType });
    const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
    assert.equal(report.technicalStatus, 'failed');
    assert.deepEqual(issueCodes(report.issues), ['ROBOTS_UNAVAILABLE']);
    assert.deepEqual(report.results[0].issues, []);
  }
});

test('bounds robots.txt without silently passing', async () => {
  const urls = ['https://example.com/@writer/a'];
  const fetchImpl = async (url) => {
    if (url === SITEMAP_URL) return response(sitemapFor(urls), { type: 'application/xml' });
    if (url === ROBOTS_URL) {
      return response('a'.repeat(512 * 1024 + 1), { type: 'text/plain' });
    }
    return response(articleHtml(url), { type: 'text/html' });
  };
  const report = await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
  assert.deepEqual(issueCodes(report.issues), ['ROBOTS_UNAVAILABLE']);
});

test('does not fetch sitemaps advertised in robots.txt', async () => {
  const urls = ['https://example.com/@writer/a'];
  const { calls, fetchImpl } = auditFetch({
    sitemapUrls: urls,
    robots: 'Sitemap: https://example.com/other-sitemap.xml\nUser-agent: *\nDisallow:\n',
  });
  await auditSitemap({ sitemapUrl: SITEMAP_URL, fetchImpl });
  assert.ok(!urlsOf(calls).includes('https://example.com/other-sitemap.xml'));
  assert.deepEqual(urlsOf(calls), [SITEMAP_URL, ROBOTS_URL, urls[0]]);
});

test('accepts loopback HTTP and keeps every request on that origin', async () => {
  const base = 'http://127.0.0.1:8787/blog-sitemap.xml';
  const article = 'http://127.0.0.1:8787/@writer/a';
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === base) return response(sitemapFor([article]), { type: 'application/xml' });
    if (url === 'http://127.0.0.1:8787/robots.txt') return response('', { type: 'text/plain' });
    return response(articleHtml(url), { type: 'text/html' });
  };
  const report = await auditSitemap({ sitemapUrl: base, fetchImpl });
  assert.equal(report.technicalStatus, 'passed');
  assert.equal(report.sitemapUrl, base);
  assert.deepEqual(urlsOf(calls), [base, 'http://127.0.0.1:8787/robots.txt', article]);
});
