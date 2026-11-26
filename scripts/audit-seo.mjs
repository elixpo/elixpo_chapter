import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { auditSitemap, AuditConfigError } from './seo/audit.mjs';
import { renderJson, renderMarkdown } from './seo/report.mjs';

const USAGE = `Usage: node scripts/audit-seo.mjs --sitemap <url> [options]

Options:
  --sitemap <url>    Explicit article sitemap URL (HTTPS; loopback HTTP for local fixtures).
  --limit <1..100>   Sample size (default 25, maximum 100).
  --json <path>      Write the structured report to a file.
  --markdown <path>  Write the Markdown report to a file.
  --help             Show this help without making a request.

The sitemap must contain article URLs only. This audit samples the first unique URLs
in producer order; it is not an exhaustive crawl. Exit codes: 0 clean, 1 technical
failure, 2 invalid configuration. Google indexing is not checked.`;

const VALUE_FLAGS = new Set(['--sitemap', '--limit', '--json', '--markdown']);

export function parseArgs(argv) {
  if (argv.includes('--help')) {
    return { help: true, sitemap: null, limit: undefined, json: null, markdown: null };
  }
  const options = { help: false, sitemap: null, limit: undefined, json: null, markdown: null };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!VALUE_FLAGS.has(flag)) throw new Error('Unknown or positional argument.');
    if (seen.has(flag)) throw new Error('An option was repeated.');
    seen.add(flag);
    const value = argv[index + 1];
    if (value === undefined || value === '' || value.startsWith('--')) {
      throw new Error('An option is missing its value.');
    }
    index += 1;
    if (flag === '--sitemap') {
      options.sitemap = value;
    } else if (flag === '--limit') {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100) {
        throw new Error('The limit must be an integer from 1 to 100.');
      }
      options.limit = Number(value);
    } else if (flag === '--json') {
      options.json = value;
    } else {
      options.markdown = value;
    }
  }
  if (!options.sitemap) throw new Error('The --sitemap option is required.');
  return options;
}

export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 2;
  }
  if (options.help) {
    io.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let report;
  try {
    report = await auditSitemap({ sitemapUrl: options.sitemap, limit: options.limit });
  } catch (error) {
    if (error instanceof AuditConfigError) {
      io.stderr.write(`${error.message}\n`);
      return 2;
    }
    io.stderr.write('The audit could not run.\n');
    return 1;
  }

  const markdown = renderMarkdown(report);
  io.stdout.write(markdown);
  try {
    if (options.json) await writeFile(options.json, renderJson(report));
    if (options.markdown) await writeFile(options.markdown, markdown);
  } catch {
    io.stderr.write('Could not write an output file.\n');
    return 1;
  }
  return report.technicalStatus === 'passed' ? 0 : 1;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (entry === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2));
}
