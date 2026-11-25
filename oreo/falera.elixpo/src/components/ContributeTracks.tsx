import { Bug, BookOpen, Code2, ExternalLink, GitPullRequest } from "lucide-react";

const NEW_ISSUE = "https://github.com/elixpo/falera/issues/new?template=";

/* The four contribution paths on /contribute. Each card opens its GitHub
 * issue form (.github/ISSUE_TEMPLATE/<form>); the small link is the guide
 * to read first. */
const TRACKS = [
  { Icon: Code2, title: "Write an app", form: "app_proposal.yml",
    body: "Propose the idea, the controls and whether it belongs in the App Store or ships built in. Start with falera new and the app guide.",
    guide: { label: "App guide", href: "/docs/apps/" } },
  { Icon: Bug, title: "Fix a bug", form: "bug_report.yml",
    body: "Report it with the FaleraOS version from falera info, the falera doctor output and the steps. Or pick a good first issue.",
    guide: { label: "Good first issues", href: "https://github.com/elixpo/falera/issues?q=is%3Aopen+label%3A%22good+first+issue%22" } },
  { Icon: BookOpen, title: "Write a hack", form: "hack_proposal.yml",
    body: "Say what it shows and what hardware it needs, then write one Markdown file in docs/hacks/. Merged hacks get a page on /hacks.",
    guide: { label: "The hacks", href: "/hacks/" } },
  { Icon: GitPullRequest, title: "Improve the OS", form: "os_improvement.yml",
    body: "Name the area, the problem and your proposal, and which OS and CLI contract it touches, before a large change.",
    guide: { label: "AGENTS.md", href: "https://github.com/elixpo/falera/blob/main/AGENTS.md" } },
] as const;

export default function ContributeTracks() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {TRACKS.map((t) => {
        const external = /^https?:/.test(t.guide.href);
        return (
          <div key={t.title} className="card-link group relative flex items-start gap-4 p-6">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-inner border border-border bg-card-sub text-primary">
              <t.Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <h3 className="h-card">
                {/* The title link covers the whole card (after:inset-0). */}
                <a href={NEW_ISSUE + t.form} target="_blank" rel="noreferrer"
                   className="after:absolute after:inset-0 after:rounded-card after:content-[''] group-hover:text-primary">
                  {t.title}
                </a>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-dim">{t.body}</p>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted">
                <span className="inline-flex items-center gap-1 font-semibold text-primary">
                  Open the form <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </span>
                <a href={t.guide.href}
                   {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                   className="relative z-10 underline decoration-border underline-offset-2 transition-colors hover:text-primary">
                  {t.guide.label}
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
