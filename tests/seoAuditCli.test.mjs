import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../scripts/audit-seo.mjs';
import { renderMarkdown, renderJson } from '../scripts/seo/report.mjs';

const CLI = fileURLToPath(new URL('../scripts/audit-seo.mjs', import.meta.url));
const FIXTURES = new URL('./fixtures/seo-audit/', import.meta.url);
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

const children = new Set();
after(() => {
  for (const child of children) child.kill();
});

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('CLI timed out'));
    }, 30_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      children.delete(child);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      children.delete(child);
      resolve({ code, stdout, stderr });
    });
  });
}

async function startFixtureServer() {
  const routes = new Map();
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    const route = routes.get(request.url);
    if (!route) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': route.type });
    response.end(route.body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    requests,
    routes,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const sitemapXml = (base, paths) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="${SITEMAP_NS}">` +
  paths.map((path) => `<url><loc>${base}${path}</loc></url>`).join('') +
  `</urlset>`;

const healthyDocument = (url) =>
  `<!doctype html><html><head>` +
  `<link rel="canonical" href="${url}">` +
  `<script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', url })}</script>` +
  `</head><body><article>Healthy</article></body></html>`;

test('parses supported options and applies the documented defaults', () => {
  assert.deepEqual(
    parseArgs([
      '--sitemap',
      'https://example.com/blog-sitemap.xml',
      '--limit',
      '7',
      '--json',
      'report.json',
      '--markdown',
      'report.md',
    ]),
    {
      help: false,
      sitemap: 'https://example.com/blog-sitemap.xml',
      limit: 7,
      json: 'report.json',
      markdown: 'report.md',
    },
  );
  assert.deepEqual(parseArgs(['--sitemap', 'https://example.com/blog-sitemap.xml']), {
    help: false,
    sitemap: 'https://example.com/blog-sitemap.xml',
    limit: undefined,
    json: null,
    markdown: null,
  });
});

test('rejects missing, unknown, repeated and invalid options', () => {
  for (const args of [
    [],
    ['--sitemap'],
    ['--limit', '5'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml', '--limit', '0'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml', '--limit', '101'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml', '--limit', '1.5'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml', '--limit', 'abc'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml', '--token', 'x'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml', '--sitemap', 'https://example.com/other.xml'],
    ['--sitemap', '--limit', '3'],
  ]) {
    assert.throws(() => parseArgs(args), `expected rejection for ${args.join(' ')}`);
  }
});

test('--help wins without requiring a sitemap', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['--help', '--unknown']).help, true);
});

test('renders a bounded, escaped markdown report', () => {
  const untrusted = 'https://example.com/@writer/<script>alert(1)</script>`\n::error::pwn';
  const report = {
    version: 1,
    technicalStatus: 'failed',
    sitemapUrl: 'https://example.com/blog-sitemap.xml',
    discoveredCount: 1,
    sampledUrls: [untrusted],
    duplicateCount: 0,
    selection: 'first-unique-in-producer-order',
    results: [
      {
        url: untrusted,
        issues: [{ check: 'canonical', code: 'CANONICAL_MISSING', reason: 'The page has no canonical link.' }],
      },
    ],
    issues: [],
    inspection: { status: 'skipped', reason: 'not part of this package' },
  };
  const markdown = renderMarkdown(report);
  assert.ok(markdown.includes('**failed**'));
  assert.ok(markdown.includes('CANONICAL_MISSING'));
  assert.ok(markdown.includes('&lt;script&gt;'));
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.split('\n').some((line) => line.startsWith('::')));

  const longUrl = `https://example.com/${'a'.repeat(5000)}`;
  const longMarkdown = renderMarkdown({
    ...report,
    sampledUrls: [longUrl],
    results: [{ url: longUrl, issues: [] }],
  });
  assert.ok(!longMarkdown.includes(longUrl));
});

test('renders JSON that round-trips', () => {
  const report = {
    version: 1,
    technicalStatus: 'passed',
    sitemapUrl: 'https://example.com/blog-sitemap.xml',
    discoveredCount: 0,
    sampledUrls: [],
    duplicateCount: 0,
    selection: 'first-unique-in-producer-order',
    results: [],
    issues: [],
    inspection: { status: 'skipped', reason: 'not part of this package' },
  };
  assert.deepEqual(JSON.parse(renderJson(report)), report);
});

test('invalid CLI configuration exits 2 without echoing secrets', async () => {
  const cases = [
    [],
    ['--sitemap'],
    ['--limit', '5'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml', '--limit', '0'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml', '--limit', '101'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml', '--limit', 'abc'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml', '--token', 'x'],
    [
      '--sitemap',
      'https://example.com/blog-sitemap.xml',
      '--sitemap',
      'https://example.com/other.xml',
    ],
    ['--sitemap', 'https://user:super-secret@example.com/blog-sitemap.xml'],
    ['--sitemap', 'http://example.com/blog-sitemap.xml'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml?token=super-secret'],
    ['--sitemap', 'https://example.com/blog-sitemap.xml#super-secret'],
  ];
  for (const args of cases) {
    const result = await runCli(args);
    assert.equal(result.code, 2, `args: ${args.join(' ')}`);
    assert.ok(!result.stderr.includes('super-secret'));
  }
});

test('--help exits 0 without making a request', async () => {
  const result = await runCli(['--help', '--sitemap', 'http://127.0.0.1:1/blog-sitemap.xml']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage:/);
});

test('runs end-to-end against a loopback fixture server', async (t) => {
  const fixture = await startFixtureServer();
  const temp = await mkdtemp(join(tmpdir(), 'seo-audit-cli-'));
  t.after(async () => {
    await rm(temp, { recursive: true, force: true });
    await fixture.close();
  });

  const healthy = `${fixture.base}/@writer/healthy`;
  const collision = `${fixture.base}/@writer/namespace-collision-543`;
  fixture.routes.set('/blog-sitemap.xml', {
    type: 'application/xml',
    body: sitemapXml(fixture.base, ['/@writer/healthy', '/@writer/namespace-collision-543']),
  });
  fixture.routes.set('/healthy-sitemap.xml', {
    type: 'application/xml',
    body: sitemapXml(fixture.base, ['/@writer/healthy']),
  });
  fixture.routes.set('/robots.txt', { type: 'text/plain', body: 'User-agent: *\nAllow: /\n' });
  fixture.routes.set('/@writer/healthy', { type: 'text/html', body: healthyDocument(healthy) });
  fixture.routes.set('/@writer/namespace-collision-543', {
    type: 'text/html',
    body: await readFile(new URL('namespace-collision-543.html', FIXTURES), 'utf8'),
  });

  const jsonPath = join(temp, 'report.json');
  const markdownPath = join(temp, 'report.md');
  const failing = await runCli([
    '--sitemap',
    `${fixture.base}/blog-sitemap.xml`,
    '--json',
    jsonPath,
    '--markdown',
    markdownPath,
  ]);
  assert.equal(failing.code, 1);
  assert.ok(failing.stdout.length > 0);

  const report = JSON.parse(await readFile(jsonPath, 'utf8'));
  assert.equal(report.version, 1);
  assert.equal(report.technicalStatus, 'failed');
  assert.equal(report.sitemapUrl, `${fixture.base}/blog-sitemap.xml`);
  assert.equal(report.discoveredCount, 2);
  assert.deepEqual(report.sampledUrls, [healthy, collision]);
  assert.equal(report.duplicateCount, 0);
  assert.equal(report.selection, 'first-unique-in-producer-order');
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.inspection, { status: 'skipped', reason: 'not part of this package' });
  assert.deepEqual(report.results[0], { url: healthy, issues: [] });
  assert.deepEqual(
    report.results[1].issues.map((issue) => issue.code),
    ['ROBOTS_NOINDEX', 'CANONICAL_MISSING', 'BLOGPOSTING_MISSING'],
  );

  const markdown = await readFile(markdownPath, 'utf8');
  assert.equal(markdown, failing.stdout);
  for (const code of ['ROBOTS_NOINDEX', 'CANONICAL_MISSING', 'BLOGPOSTING_MISSING']) {
    assert.ok(markdown.includes(code));
  }
  assert.ok(markdown.includes(healthy));
  assert.ok(markdown.includes(collision));

  const healthyRun = await runCli(['--sitemap', `${fixture.base}/healthy-sitemap.xml`]);
  assert.equal(healthyRun.code, 0);
  assert.match(healthyRun.stdout, /\*\*passed\*\*/);

  assert.ok(fixture.requests.includes('/blog-sitemap.xml'));
  assert.ok(fixture.requests.includes('/healthy-sitemap.xml'));
  assert.ok(fixture.requests.includes('/robots.txt'));
  assert.ok(fixture.requests.includes('/@writer/healthy'));
  assert.ok(fixture.requests.includes('/@writer/namespace-collision-543'));
  assert.ok(!fixture.requests.some((url) => url.includes('canonical')));
});

test('output write failures are sanitized operational errors', async (t) => {
  const fixture = await startFixtureServer();
  const temp = await mkdtemp(join(tmpdir(), 'seo-audit-cli-'));
  t.after(async () => {
    await rm(temp, { recursive: true, force: true });
    await fixture.close();
  });

  const healthy = `${fixture.base}/@writer/healthy`;
  fixture.routes.set('/sitemap.xml', {
    type: 'application/xml',
    body: sitemapXml(fixture.base, ['/@writer/healthy']),
  });
  fixture.routes.set('/robots.txt', { type: 'text/plain', body: 'User-agent: *\nAllow: /\n' });
  fixture.routes.set('/@writer/healthy', { type: 'text/html', body: healthyDocument(healthy) });

  const result = await runCli([
    '--sitemap',
    `${fixture.base}/sitemap.xml`,
    '--json',
    join(temp, 'missing-directory', 'report.json'),
  ]);
  assert.equal(result.code, 1);
  assert.ok(!result.stderr.includes('ENOENT'));
  assert.ok(!result.stderr.includes('missing-directory'));
});
