/* Build-time Markdown → HTML for Markdown files in the repository (the
 * guides in docs/, the hacks in docs/hacks/, CONTRIBUTING.md), so the
 * website renders the same files the repository reads instead of a copy
 * that drifts.
 *
 * Runs only on the server, at `next build` (the site is a static export),
 * so none of this reaches the browser bundle.
 *
 * Supported subset, which is what those files use:
 *   • # to #### headings, with GitHub-style ids so "#anchor" links work
 *   • paragraphs, **bold**, *italic*, `code`, [links](url), \-escapes
 *   • bullet and numbered lists, nested by indentation, with code blocks
 *     and paragraphs inside items
 *   • fenced code blocks, blockquotes, tables (with \| inside cells), ---
 *   • ```mermaid blocks, through an optional `diagram` hook that returns
 *     ready-made SVG (see src/lib/diagrams.ts); without one, or when the
 *     hook has no drawing for that source, the source is shown as code
 * Raw HTML in the source is escaped, never passed through.
 */

export type LinkResolver = (href: string) => string;

/** Returns the HTML for a ```mermaid block, or null to show its source. */
export type DiagramHook = (source: string) => string | null;

export type Heading = { level: number; id: string; text: string };

export type RenderedDoc = { html: string; headings: Heading[]; title: string };

const REPO_BLOB = "https://github.com/elixpo/falera/blob/main/";

/** Resolve `path` against the repository folder `dir` ("" is the root). */
export function repoPath(dir: string, path: string): string {
  const parts: string[] = dir.split("/").filter(Boolean);
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Map links written for GitHub to site URLs.
 *
 * `dir`: the repository folder of the file being rendered ("docs",
 * "docs/hacks", "" for the root), which relative links start from.
 * `pages`: repository paths rendered from Markdown on the site, so their
 * "#anchor" links work there too. `overviews`: paths the site covers with
 * a page of its own wording; a bare link goes there, a link to a section
 * goes to the file on GitHub, where that section exists. Everything else
 * goes to the file on GitHub. */
export function repoLinkResolver(
  dir: string,
  pages: Record<string, string>,
  overviews: Record<string, string> = {},
): LinkResolver {
  return (href: string) => {
    if (/^(https?:|mailto:|#)/.test(href)) return href;
    const [path, hash = ""] = href.split("#", 2);
    const anchor = hash ? "#" + hash : "";
    const target = repoPath(dir, path);
    if (pages[target] !== undefined) return pages[target] + anchor;
    if (!hash && overviews[target] !== undefined) return overviews[target];
    return REPO_BLOB + target + anchor;
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** GitHub's heading anchor: lower case, punctuation dropped, spaces → "-". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/** The heading text as GitHub sees it for the slug (markup removed). */
function plainText(md: string): string {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\\(.)/g, "$1")
    .replace(/[`*]/g, "");
}

const CODE_CLASS =
  "rounded bg-card-sub px-1.5 py-0.5 font-mono text-[0.9em] text-text";
const LINK_CLASS =
  "text-text underline decoration-primary/50 underline-offset-4 hover:decoration-primary";

function renderInline(src: string, resolve: LinkResolver): string {
  // Code spans and backslash escapes are set aside first so nothing
  // inside them is read as markup.
  const held: string[] = [];
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`;
  let s = src.replace(/`([^`]+)`/g, (_, code: string) =>
    hold(`<code class="${CODE_CLASS}">${escapeHtml(code)}</code>`));
  s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|<>~])/g, (_, ch: string) => hold(escapeHtml(ch)));
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
    const url = resolve(href.replace(/&amp;/g, "&"));
    const external = /^https?:/.test(url);
    const attrs = external ? ' target="_blank" rel="noreferrer"' : "";
    return `<a href="${escapeHtml(url)}"${attrs} class="${LINK_CLASS}">${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-text">$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)]);
}

const indentOf = (line: string) => line.length - line.trimStart().length;
const LIST_ITEM = /^( *)([-*]|\d+\.) +(.*)$/;
const FENCE = /^ *```/;
const TABLE_RULE = /^\|? *:?-{3,}:? *(\| *:?-{3,}:? *)*\|? *$/;

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

type Ctx = {
  resolve: LinkResolver;
  diagram?: DiagramHook;
  headings: Heading[];
  ids: Map<string, number>;
};

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    /^#{1,6} /.test(line) ||
    /^ {0,3}>/.test(line) ||
    LIST_ITEM.test(line) ||
    /^-{3,} *$/.test(line)
  );
}

function renderBlocks(lines: string[], ctx: Ctx, tight = false): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Fenced code
    if (FENCE.test(line)) {
      const pad = indentOf(line);
      const lang = line.trim().slice(3).trim().toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i].slice(Math.min(pad, indentOf(lines[i]))));
        i++;
      }
      i++; // closing fence
      if (lang === "mermaid") {
        const svg = ctx.diagram ? ctx.diagram(body.join("\n")) : null;
        if (svg) {
          out.push(svg);
          continue;
        }
      }
      out.push(
        `<pre class="my-5 overflow-x-auto rounded-inner border border-border bg-card-sub p-4 font-mono text-xs leading-relaxed text-text"><code>${escapeHtml(body.join("\n"))}</code></pre>`,
      );
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,6}) +(.*?) *#* *$/);
    if (h) {
      const level = Math.min(h[1].length, 4);
      const base = slugify(plainText(h[2]));
      const seen = ctx.ids.get(base) ?? 0;
      ctx.ids.set(base, seen + 1);
      const id = seen ? `${base}-${seen}` : base;
      ctx.headings.push({ level: h[1].length, id, text: plainText(h[2]) });
      const klass = {
        1: "mt-12 mb-4 font-display text-title text-text",
        2: "mt-14 mb-4 border-t border-border pt-10 font-display text-[1.625rem] leading-tight text-text",
        3: "mt-10 mb-3 text-lg font-bold leading-snug text-text",
        4: "mt-6 mb-2 text-base font-bold text-text",
      }[level as 1 | 2 | 3 | 4];
      out.push(
        `<h${level} id="${id}" class="group scroll-mt-24 ${klass}">${renderInline(h[2], ctx.resolve)}` +
        `<a href="#${id}" aria-label="Link to this section" class="ml-2 text-primary/0 no-underline transition-colors group-hover:text-primary/60">#</a></h${level}>`,
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^-{3,} *$/.test(line)) {
      out.push('<hr class="my-10 border-border" />');
      i++;
      continue;
    }

    // Tables
    if (line.trim().startsWith("|") && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1].trim())) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const th = header
        .map((c) => `<th class="border-b border-border px-3 py-2 text-left font-medium text-text">${renderInline(c, ctx.resolve)}</th>`)
        .join("");
      const tb = rows
        .map((r) =>
          `<tr class="border-b border-border/50 last:border-0">${header
            .map((_, k) => `<td class="px-3 py-2 align-top">${renderInline(r[k] ?? "", ctx.resolve)}</td>`)
            .join("")}</tr>`)
        .join("");
      out.push(
        `<div class="my-6 overflow-x-auto rounded-inner border border-border bg-card"><table class="w-full text-sm text-text-dim"><thead class="bg-card-sub"><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`,
      );
      continue;
    }

    // Blockquotes
    if (/^ {0,3}>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
        body.push(lines[i].replace(/^ {0,3}> ?/, ""));
        i++;
      }
      out.push(
        `<blockquote class="my-6 rounded-r-inner border-l-2 border-primary bg-card-sub px-5 py-1">${renderBlocks(body, ctx)}</blockquote>`,
      );
      continue;
    }

    // Lists
    const first = line.match(LIST_ITEM);
    if (first) {
      const base = first[1].length;
      const ordered = /\d/.test(first[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM);
        if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
        const contentIndent = base + m[2].length + (lines[i].length - m[1].length - m[2].length - m[3].length);
        const body = [m[3]];
        i++;
        let lazy = true;
        while (i < lines.length) {
          const next = lines[i];
          if (!next.trim()) {
            // A blank line ends the item unless indented content follows.
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;
            if (j < lines.length && indentOf(lines[j]) >= contentIndent) {
              for (; i < j; i++) body.push("");
              lazy = false;
              continue;
            }
            break;
          }
          if (indentOf(next) >= contentIndent) {
            body.push(next.slice(contentIndent));
            i++;
            continue;
          }
          // Lazy continuation of the item's first paragraph.
          if (lazy && !startsBlock(next) && indentOf(next) > base) {
            body.push(next.trim());
            i++;
            continue;
          }
          if (lazy && !startsBlock(next) && indentOf(next) === base && !LIST_ITEM.test(next)) {
            body.push(next.trim());
            i++;
            continue;
          }
          break;
        }
        items.push(`<li class="pl-1">${renderBlocks(body, ctx, true)}</li>`);
        // A blank line between items keeps the list going.
        let j = i;
        while (j < lines.length && !lines[j].trim()) j++;
        const again = j < lines.length ? lines[j].match(LIST_ITEM) : null;
        if (again && again[1].length === base && /\d/.test(again[2]) === ordered) i = j;
      }
      const klass = ordered
        ? "my-4 list-decimal space-y-2 pl-6 text-text-dim marker:text-primary/70"
        : "my-4 list-disc space-y-2 pl-6 text-text-dim marker:text-primary/70";
      out.push(`<${ordered ? "ol" : "ul"} class="${klass}">${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }

    // Paragraph
    const para: string[] = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) &&
           !(lines[i].trim().startsWith("|") && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1].trim()))) {
      para.push(lines[i].trim());
      i++;
    }
    const text = renderInline(para.join(" "), ctx.resolve);
    out.push(tight ? `<p class="my-1 leading-relaxed">${text}</p>` : `<p class="my-4 leading-relaxed text-text-dim">${text}</p>`);
  }
  return out.join("\n");
}

/** Render a Markdown document. The first `# ` heading is returned as the
 * title and left out of the HTML, so the page can show its own hero. */
export function renderMarkdown(
  src: string,
  resolve: LinkResolver,
  options: { diagram?: DiagramHook } = {},
): RenderedDoc {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  const h1 = lines.findIndex((l) => /^# /.test(l));
  if (h1 !== -1) {
    title = plainText(lines[h1].slice(2).trim());
    lines.splice(h1, 1);
  }
  const ctx: Ctx = { resolve, diagram: options.diagram, headings: [], ids: new Map() };
  return { html: renderBlocks(lines, ctx), headings: ctx.headings, title };
}
