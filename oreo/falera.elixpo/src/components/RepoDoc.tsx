import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { ReactNode } from "react";
import { Github } from "lucide-react";
import { PageHeader, Section, type Tone } from "@/components/ui";
import { LumiTip } from "@/components/Lumi";
import { HACK_GUIDES } from "@/data/hacks";
import { mermaidDrawing } from "@/lib/diagrams";
import { renderMarkdown, repoLinkResolver } from "@/lib/markdown";

/* A Markdown file from the repository, rendered at build time.
 *
 * The Markdown files are the source: the site reads ../<file> during
 * `next build` (tools/deploy.py --website and `npm run build` both run in
 * falera.elixpo/ inside the repository checkout), so the website and GitHub
 * always show the same text. Edit the Markdown file, not the page.
 */

const REPO = "https://github.com/elixpo/falera";

/** Repository files rendered on the site; links between them stay on the site. */
export const SITE_DOCS: Record<string, string> = {
  "docs/CLI.md": "/docs/cli/",
  "docs/USB.md": "/docs/usb/",
  "docs/TRANSFER.md": "/docs/transfer/",
  "docs/hacks/README.md": "/hacks/",
  "CONTRIBUTING.md": "/contribute/",
  ...Object.fromEntries(HACK_GUIDES.map((h) => [`docs/hacks/${h.doc}`, `/hacks/${h.slug}/`])),
};

const OVERVIEWS: Record<string, string> = {
  "docs/APPS.md": "/docs/apps/",
};

export type QuickLink = { label: string; href: string };
export type Related = { href: string; title: string; description: string };

/** Read a file by its path in the repository ("docs/CLI.md"). */
export function readRepoDoc(file: string): string {
  const full = path.join(process.cwd(), "..", file);
  if (!fs.existsSync(full)) {
    throw new Error(
      `${file} not found at ${full}: build the site from falera.elixpo/ inside the FaleraOS repository`,
    );
  }
  return fs.readFileSync(full, "utf8");
}

/** The header's right column on every doc page: where the page lives on
 *  GitHub, and the two things a reader can do about it. */
function SourceCard({ file }: { file: string }) {
  const rows: [string, string][] = [
    ["Read it on GitHub", `${REPO}/blob/main/${file}`],
    ["Suggest an edit", `${REPO}/edit/main/${file}`],
    ["Good first issues", `${REPO}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22`],
  ];
  return (
    <div className="card hidden p-6 lg:block">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 24 24" className="h-10 w-10 shrink-0 text-text" fill="currentColor" aria-hidden="true">
          <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
        </svg>
        <div className="min-w-0">
          <p className="eyebrow">Open source</p>
          <p className="truncate font-mono text-sm font-bold text-text">elixpo/falera</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-text-dim">
        This page is <code className="font-mono text-text">{file}</code> in the repository. Fix a typo or add a step
        with a pull request.
      </p>
      <ul className="mt-4 border-t border-border">
        {rows.map(([label, href]) => (
          <li key={label} className="border-b border-border last:border-0">
            <a href={href} target="_blank" rel="noreferrer"
               className="flex items-center justify-between py-2.5 text-sm font-semibold text-text hover:text-primary">
              {label} <span aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RepoDoc({
  file, chip, title, lead, quickLinks = [], related = [], children,
  bodyTitle, aside, childrenTone = "plain", lumi,
}: {
  /** Lumi's tip at the end of the page. */
  lumi?: ReactNode;
  /** The tone of the section holding `children`. */
  childrenTone?: Tone;
  /** Path in the repository, e.g. "docs/CLI.md" or "CONTRIBUTING.md". */
  file: string;
  /** The eyebrow above the title. */
  chip: string;
  title: ReactNode;
  lead: string;
  quickLinks?: QuickLink[];
  related?: Related[];
  /** Shown between the header and the document (e.g. cards). */
  children?: ReactNode;
  /** A heading above the rendered document, when `children` come first. */
  bodyTitle?: string;
  /** Right column of the header; defaults to the page's GitHub card. */
  aside?: ReactNode;
}) {
  const dir = path.posix.dirname(file) === "." ? "" : path.posix.dirname(file);
  const doc = renderMarkdown(
    readRepoDoc(file),
    repoLinkResolver(dir, SITE_DOCS, OVERVIEWS),
    { diagram: mermaidDrawing },
  );
  const toc = doc.headings.filter((h) => h.level === 2);

  return (
    <>
      <PageHeader eyebrow={chip} title={title} lede={lead} aside={aside ?? <SourceCard file={file} />}>
        {quickLinks.map((q) => (
          <a key={q.href} href={q.href} className="chip transition-colors hover:border-text/50 hover:text-text">
            {q.label}
          </a>
        ))}
        <a href={`${REPO}/blob/main/${file}`} target="_blank" rel="noreferrer"
           className="chip transition-colors hover:border-text/50 hover:text-text">
          <Github className="h-3 w-3" aria-hidden="true" /> {file}
        </a>
      </PageHeader>

      {children && <Section tone={childrenTone}>{children}</Section>}

      <Section>
        {bodyTitle && <h2 className="h-title mb-10">{bodyTitle}</h2>}

        <div className="grid gap-12 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-[calc(var(--header-h)+2rem)] max-h-[calc(100vh-8rem)] overflow-y-auto text-sm">
              <p className="label mb-4">On this page</p>
              <ul className="space-y-2.5 border-l border-border pl-4">
                {toc.map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} className="text-text-dim transition-colors hover:text-primary">
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="min-w-0 max-w-3xl">
            <article className="text-[0.975rem] text-text-dim [&>*:first-child]:mt-0" dangerouslySetInnerHTML={{ __html: doc.html }} />

            <p className="mt-16 border-t border-border pt-6 text-sm text-muted">
              This page is built from{" "}
              <a href={`${REPO}/blob/main/${file}`} target="_blank" rel="noreferrer" className="link">
                {file}
              </a>{" "}
              in the FaleraOS repository. Corrections are welcome there.
            </p>

            {related.length > 0 && (
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {related.map((r) => (
                  <Link key={r.href} href={r.href} className="card-link group block p-6">
                    <p className="h-card group-hover:text-primary">{r.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-text-dim">{r.description}</p>
                    <span className="link-onward mt-4">Read <span aria-hidden="true">→</span></span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        <LumiTip pose="read" align="right">
          {lumi ?? <>This page is built from {file} in the repo. Spotted a mistake? Fix it there, and it shows up here.</>}
        </LumiTip>
      </Section>
    </>
  );
}
