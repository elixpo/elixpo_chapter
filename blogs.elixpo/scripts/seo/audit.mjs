import robotsParser from 'robots-parser';
import { checkArticle, parseSitemap, parseSitemapUrl, SitemapError } from './checks.mjs';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const CONCURRENCY = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const SITEMAP_MAX_BYTES = 8 * 1024 * 1024;
const HTML_MAX_BYTES = 2 * 1024 * 1024;
const ROBOTS_MAX_BYTES = 512 * 1024;
const XML_TYPES = new Set(['application/xml', 'text/xml']);
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml']);
const TEXT_TYPES = new Set(['text/plain']);

const FETCH_REASONS = {
  REDIRECT: 'The request returned a redirect, which this audit does not follow.',
  HTTP_STATUS: 'The response status was not 200.',
  WRONG_CONTENT_TYPE: 'The response media type was not the expected type.',
  TIMEOUT: 'The request exceeded the audit timeout.',
  TOO_LARGE: 'The response body exceeded the audit size cap.',
  NETWORK: 'The request failed before a usable response arrived.',
  INVALID_BODY: 'The response body was not valid UTF-8 text.',
};

export class AuditConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuditConfigError';
    this.code = code;
  }
}

class FetchFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function issue(check, code, reason) {
  return { check, code, reason };
}

function mediaType(response) {
  const value = response.headers?.get?.('content-type') ?? '';
  return value.split(';')[0].trim().toLowerCase();
}

function fetchReason(error) {
  return FETCH_REASONS[error instanceof FetchFailure ? error.code : 'NETWORK'];
}

async function readBoundedBody(response, maxBytes, controller) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let onAbort;
  const aborted = new Promise((resolve, reject) => {
    onAbort = () => reject(new FetchFailure('TIMEOUT'));
    if (controller.signal.aborted) {
      onAbort();
      return;
    }
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new FetchFailure('TOO_LARGE');
      }
      chunks.push(value);
    }
  } catch (error) {
    // Cancellation itself must not extend the request deadline.
    void reader.cancel().catch(() => {});
    if (error instanceof FetchFailure) throw error;
    if (controller.signal.aborted) throw new FetchFailure('TIMEOUT');
    throw new FetchFailure('NETWORK');
  } finally {
    controller.signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new FetchFailure('INVALID_BODY');
  }
}

async function fetchText(
  fetchImpl,
  url,
  { timeoutMs, maxBytes, types, accept, allowNotFound = false },
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    try {
      response = await fetchImpl(url, {
        redirect: 'manual',
        credentials: 'omit',
        signal: controller.signal,
        headers: { accept },
      });
    } catch (error) {
      throw new FetchFailure(
        controller.signal.aborted || error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
      );
    }
    if (allowNotFound && response.status === 404) {
      return { response, text: null };
    }
    if (response.status >= 300 && response.status < 400) {
      throw new FetchFailure('REDIRECT');
    }
    if (response.status !== 200) {
      throw new FetchFailure('HTTP_STATUS');
    }
    if (!types.has(mediaType(response))) {
      throw new FetchFailure('WRONG_CONTENT_TYPE');
    }
    const text = await readBoundedBody(response, maxBytes, controller);
    return { response, text };
  } finally {
    clearTimeout(timer);
    if (response?.body && !response.bodyUsed) {
      void response.body.cancel().catch(() => {});
    }
    controller.abort();
  }
}

async function inspectArticle(fetchImpl, url, timeoutMs) {
  try {
    const { response, text } = await fetchText(fetchImpl, url, {
      timeoutMs,
      maxBytes: HTML_MAX_BYTES,
      types: HTML_TYPES,
      accept: 'text/html,application/xhtml+xml;q=0.9',
    });
    return checkArticle({ url, html: text, headers: response.headers });
  } catch (error) {
    return [issue('fetch', error instanceof FetchFailure ? error.code : 'NETWORK', fetchReason(error))];
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function auditSitemap({
  sitemapUrl,
  limit = DEFAULT_LIMIT,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let base;
  try {
    base = parseSitemapUrl(sitemapUrl);
  } catch {
    throw new AuditConfigError('INVALID_SITEMAP_URL', 'The sitemap URL is invalid.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new AuditConfigError('INVALID_LIMIT', 'The limit must be an integer from 1 to 100.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new AuditConfigError('INVALID_FETCH', 'The fetch implementation is not a function.');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AuditConfigError('INVALID_TIMEOUT', 'The timeout must be a positive number.');
  }

  const report = {
    version: 1,
    technicalStatus: 'failed',
    sitemapUrl: base.href,
    discoveredCount: 0,
    sampledUrls: [],
    duplicateCount: 0,
    selection: 'first-unique-in-producer-order',
    results: [],
    issues: [],
    inspection: { status: 'skipped', reason: 'not part of this package' },
  };

  let sitemapText;
  try {
    const fetched = await fetchText(fetchImpl, base.href, {
      timeoutMs,
      maxBytes: SITEMAP_MAX_BYTES,
      types: XML_TYPES,
      accept: 'application/xml,text/xml;q=0.9',
    });
    sitemapText = fetched.text;
  } catch (error) {
    report.issues.push(issue('sitemap', error instanceof FetchFailure ? error.code : 'NETWORK', fetchReason(error)));
    return report;
  }

  let parsed;
  try {
    parsed = parseSitemap(sitemapText, base);
  } catch (error) {
    const code = error instanceof SitemapError ? error.code : 'INVALID_SITEMAP';
    const reason = error instanceof SitemapError ? error.message : 'The sitemap could not be read.';
    report.issues.push(issue('sitemap', code, reason));
    return report;
  }
  report.discoveredCount = parsed.urls.length;
  report.duplicateCount = parsed.duplicateCount;
  if (parsed.urls.length === 0) {
    report.issues.push(
      issue('sitemap', 'EMPTY_FEED', 'The sitemap returned no article URLs.'),
    );
    return report;
  }

  report.sampledUrls = parsed.urls.slice(0, limit);

  let robots = null;
  try {
    const robotsUrl = new URL('/robots.txt', base).href;
    const fetched = await fetchText(fetchImpl, robotsUrl, {
      timeoutMs,
      maxBytes: ROBOTS_MAX_BYTES,
      types: TEXT_TYPES,
      accept: 'text/plain',
      allowNotFound: true,
    });
    if (fetched.text !== null) robots = robotsParser(robotsUrl, fetched.text);
  } catch {
    report.issues.push(
      issue('robots', 'ROBOTS_UNAVAILABLE', 'robots.txt could not be read for Googlebot evaluation.'),
    );
  }

  report.results = await mapWithConcurrency(
    report.sampledUrls,
    CONCURRENCY,
    async (url) => {
      const issues = await inspectArticle(fetchImpl, url, timeoutMs);
      if (robots && robots.isAllowed(url, 'Googlebot') === false) {
        issues.unshift(
          issue('robots', 'ROBOTS_DISALLOWED', 'robots.txt disallows Googlebot for this URL.'),
        );
      }
      return { url, issues };
    },
  );

  const failed =
    report.issues.length > 0 || report.results.some((result) => result.issues.length > 0);
  report.technicalStatus = failed ? 'failed' : 'passed';
  return report;
}
