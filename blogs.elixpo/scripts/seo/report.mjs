const MAX_TEXT = 2048;

function escapeText(value) {
  return String(value ?? '')
    .slice(0, MAX_TEXT)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`/g, "'")
    .replace(/[\u0000-\u001f\u007f]/g, ' ');
}

function issueLine(issue) {
  return `- \`${escapeText(issue.code)}\` (${escapeText(issue.check)}): ${escapeText(issue.reason)}`;
}

export function renderMarkdown(report) {
  const lines = [
    '# SEO audit report',
    '',
    `- Sitemap: \`${escapeText(report.sitemapUrl)}\``,
    `- Technical status: ${report.technicalStatus === 'passed' ? '**passed**' : '**failed**'}`,
    `- Discovered articles: ${report.discoveredCount}`,
    `- Sampled articles: ${report.sampledUrls.length} (${escapeText(report.selection)})`,
    `- Duplicate sitemap entries: ${report.duplicateCount}`,
    '- Google inspection: skipped — not part of this package',
    '',
    'This technical audit does not prove that Google has indexed these URLs.',
    '',
    '## Global issues',
    '',
  ];
  if (report.issues.length === 0) lines.push('None.');
  for (const globalIssue of report.issues) lines.push(issueLine(globalIssue));
  lines.push('', '## Sampled articles', '');
  if (report.results.length === 0) lines.push('None.');
  for (const result of report.results) {
    lines.push(
      `### \`${escapeText(result.url)}\` — ${result.issues.length === 0 ? 'passed' : 'failed'}`,
      '',
    );
    if (result.issues.length === 0) lines.push('No issues.');
    for (const articleIssue of result.issues) lines.push(issueLine(articleIssue));
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
