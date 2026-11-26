import { load } from 'cheerio';
import { SaxesParser } from 'saxes';

const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const MAX_SITEMAP_ENTRIES = 50_000;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const BLOG_POSTING = 'BlogPosting';

export class SitemapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SitemapError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new SitemapError(code, message);
};

export function parseSitemapUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    fail('INVALID_SITEMAP_URL', 'The sitemap URL is not an absolute URL.');
  }
  if (url.username || url.password || url.search || url.hash) {
    fail('INVALID_SITEMAP_URL', 'The sitemap URL must not contain credentials, a query or a fragment.');
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    fail('INVALID_SITEMAP_URL', 'The sitemap URL must use HTTPS except on loopback hosts.');
  }
  return url;
}

export function parseSitemap(xml, sitemapUrl) {
  if (typeof xml !== 'string') {
    fail('INVALID_XML', 'The sitemap body is not text.');
  }
  const base = parseSitemapUrl(sitemapUrl);
  const parser = new SaxesParser({ xmlns: true });
  const urls = [];
  const seen = new Set();
  let duplicateCount = 0;
  let depth = 0;
  let rootSeen = false;
  let entry = null;
  let capture = null;
  let captureDepth = 0;
  let captureText = '';
  let entryCount = 0;

  const finishEntry = () => {
    if (entry.loc === null || entry.loc === '') {
      fail('MISSING_LOC', 'A sitemap entry has no loc.');
    }
    if (entry.lastmod !== null && !isValidLastmod(entry.lastmod)) {
      fail('INVALID_LASTMOD', 'A sitemap entry has a malformed lastmod.');
    }
    const loc = normalizeArticleUrl(entry.loc, base);
    if (seen.has(loc)) {
      duplicateCount += 1;
    } else {
      seen.add(loc);
      urls.push(loc);
    }
  };

  parser.on('error', () => {
    fail('INVALID_XML', 'The sitemap XML is not well formed.');
  });

  parser.on('opentag', (tag) => {
    depth += 1;
    if (depth === 1) {
      rootSeen = true;
      if (tag.local === 'sitemapindex') {
        fail('SITEMAP_INDEX_UNSUPPORTED', 'Sitemap indexes are not read by this audit.');
      }
      if (tag.local !== 'urlset') {
        fail('WRONG_NAMESPACE', 'The sitemap root element is not urlset.');
      }
      if (!tag.uri) {
        fail('MISSING_NAMESPACE', 'The sitemap urlset element has no namespace.');
      }
      if (tag.uri !== SITEMAP_NAMESPACE) {
        fail('WRONG_NAMESPACE', 'The sitemap urlset namespace is not the sitemap 0.9 namespace.');
      }
      return;
    }
    if (depth === 2) {
      if (tag.local === 'url' && tag.uri === SITEMAP_NAMESPACE) {
        entry = { loc: null, lastmod: null };
        entryCount += 1;
        if (entryCount > MAX_SITEMAP_ENTRIES) {
          fail('TOO_MANY_URLS', 'The sitemap has more than 50,000 entries.');
        }
      }
      return;
    }
    if (depth === 3 && entry && tag.uri === SITEMAP_NAMESPACE) {
      if (tag.local === 'loc') {
        if (entry.loc !== null) {
          fail('INVALID_LOC', 'A sitemap entry has more than one loc.');
        }
        capture = 'loc';
      } else if (tag.local === 'lastmod') {
        capture = 'lastmod';
      } else {
        return;
      }
      captureDepth = depth;
      captureText = '';
    }
  });

  parser.on('text', (text) => {
    if (capture && depth === captureDepth) {
      captureText += text;
    }
  });

  parser.on('cdata', (text) => {
    if (capture && depth === captureDepth) {
      captureText += text;
    }
  });

  parser.on('closetag', () => {
    if (capture && depth === captureDepth) {
      entry[capture] = captureText.trim();
      capture = null;
    }
    if (depth === 2 && entry) {
      finishEntry();
      entry = null;
    }
    depth -= 1;
  });

  try {
    parser.write(xml);
    parser.close();
  } catch (error) {
    if (error instanceof SitemapError) throw error;
    fail('INVALID_XML', 'The sitemap XML is not well formed.');
  }
  if (!rootSeen) {
    fail('INVALID_XML', 'The sitemap XML has no root element.');
  }
  return { urls, duplicateCount };
}

function normalizeArticleUrl(loc, base) {
  let url;
  try {
    url = new URL(loc);
  } catch {
    fail('INVALID_LOC', 'A sitemap loc is not an absolute URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail('UNSAFE_LOC', 'A sitemap loc does not use HTTP or HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    fail('UNSAFE_LOC', 'A sitemap loc contains credentials, a query or a fragment.');
  }
  if (url.origin !== base.origin) {
    fail('OFF_ORIGIN_LOC', 'A sitemap loc is not on the sitemap origin.');
  }
  return url.href;
}

function isValidLastmod(value) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
  const dateTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  const match = dateTime.exec(value) || dateOnly.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return false;
  if (!dateTime.test(value)) return true;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) return false;
  const zone = match[8];
  if (zone !== 'Z') {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) return false;
  }
  return true;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function issue(check, code, reason) {
  return { check, code, reason };
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== name) continue;
    const value = headers[key];
    return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  }
  return '';
}

function googlebotHeaderDirectives(value) {
  const directives = [];
  let agent = null;
  const parameterRules = new Set([
    'max-snippet', 'max-image-preview', 'max-video-preview', 'unavailable_after',
  ]);
  for (const part of String(value).split(',')) {
    let segment = part.trim().toLowerCase();
    if (!segment) continue;
    const prefix = /^([a-z][a-z0-9_-]*)\s*:/.exec(segment);
    if (prefix && !parameterRules.has(prefix[1])) {
      agent = prefix[1];
      segment = segment.slice(prefix[0].length);
    }
    if (agent === null || agent === 'googlebot') directives.push(segment);
  }
  return directives;
}

function robotsIssues($, headers) {
  const directives = [];
  for (const element of $('meta[name]').toArray()) {
    const name = ($(element).attr('name') || '').trim().toLowerCase();
    if (name !== 'robots' && name !== 'googlebot') continue;
    directives.push(($(element).attr('content') || '').toLowerCase());
  }
  directives.push(...googlebotHeaderDirectives(headerValue(headers, 'x-robots-tag')));
  const tokens = directives.flatMap((value) => value.split(/[\s,]+/)).filter(Boolean);
  const issues = [];
  if (tokens.includes('noindex') || tokens.includes('none')) {
    issues.push(issue('robots', 'ROBOTS_NOINDEX', 'The page tells Googlebot not to index it.'));
  }
  if (tokens.includes('nofollow') || tokens.includes('none')) {
    issues.push(issue('robots', 'ROBOTS_NOFOLLOW', 'The page tells Googlebot not to follow links.'));
  }
  return issues;
}

function canonicalIssues($, pageUrl, documentBase) {
  const links = $('link[rel]')
    .toArray()
    .filter((element) =>
      ($(element).attr('rel') || '')
        .toLowerCase()
        .split(/\s+/)
        .includes('canonical'),
    );
  if (links.length === 0) {
    return [issue('canonical', 'CANONICAL_MISSING', 'The page has no canonical link.')];
  }
  if (links.length > 1) {
    return [issue('canonical', 'CANONICAL_MULTIPLE', 'The page has more than one canonical link.')];
  }
  const href = ($(links[0]).attr('href') || '').trim();
  if (!href) {
    return [issue('canonical', 'CANONICAL_EMPTY', 'The canonical link has an empty href.')];
  }
  let resolved;
  try {
    resolved = new URL(href, documentBase);
  } catch {
    return [issue('canonical', 'CANONICAL_MISMATCH', 'The canonical link is not a usable URL.')];
  }
  if (resolved.href !== pageUrl.href) {
    return [issue('canonical', 'CANONICAL_MISMATCH', 'The canonical link points at another URL.')];
  }
  return [];
}

function collectJsonLdNodes(value, nodes) {
  if (Array.isArray(value)) {
    for (const child of value) collectJsonLdNodes(child, nodes);
    return;
  }
  if (!value || typeof value !== 'object') return;
  nodes.push(value);
  if ('@graph' in value) collectJsonLdNodes(value['@graph'], nodes);
}

function isBlogPosting(node) {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return types.some((type) => typeof type === 'string' && type.trim() === BLOG_POSTING);
}

function identifiesPage(node, pageUrl, documentBase) {
  const references = [];
  if (typeof node.url === 'string') references.push(node.url);
  if (typeof node['@id'] === 'string') references.push(node['@id']);
  const mainEntity = node.mainEntityOfPage;
  if (typeof mainEntity === 'string') {
    references.push(mainEntity);
  } else if (mainEntity && typeof mainEntity === 'object') {
    if (typeof mainEntity['@id'] === 'string') references.push(mainEntity['@id']);
    if (typeof mainEntity.url === 'string') references.push(mainEntity.url);
  }
  return references.some((reference) => {
    try {
      return new URL(reference, documentBase).href === pageUrl.href;
    } catch {
      return false;
    }
  });
}

function blogPostingIssues($, pageUrl, documentBase) {
  const nodes = [];
  let malformed = false;
  for (const element of $('script[type]').toArray()) {
    const type = ($(element).attr('type') || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/ld+json') continue;
    const text = $(element).text().trim();
    if (!text) {
      malformed = true;
      continue;
    }
    try {
      collectJsonLdNodes(JSON.parse(text), nodes);
    } catch {
      malformed = true;
    }
  }
  if (malformed) {
    return [issue('blogposting', 'BLOGPOSTING_MALFORMED', 'A JSON-LD script is not valid JSON.')];
  }
  const posts = nodes.filter(isBlogPosting);
  if (posts.length === 0) {
    return [issue('blogposting', 'BLOGPOSTING_MISSING', 'The page has no BlogPosting JSON-LD.')];
  }
  if (!posts.some((post) => identifiesPage(post, pageUrl, documentBase))) {
    return [
      issue(
        'blogposting',
        'BLOGPOSTING_UNIDENTIFIED',
        'No BlogPosting JSON-LD identifies the audited article URL.',
      ),
    ];
  }
  return [];
}

export function checkArticle({ url, html, headers } = {}) {
  const pageUrl = new URL(url);
  const $ = load(html ?? '');
  let documentBase = pageUrl;
  const baseHref = $('base[href]').first().attr('href');
  if (baseHref !== undefined) {
    try { documentBase = new URL(baseHref, pageUrl); } catch { /* Invalid base uses the page URL. */ }
  }
  return [
    ...robotsIssues($, headers),
    ...canonicalIssues($, pageUrl, documentBase),
    ...blogPostingIssues($, pageUrl, documentBase),
  ];
}
