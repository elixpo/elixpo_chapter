import Link from "next/link";
import { ExternalLink, Github } from "lucide-react";
import { LumiTip } from "@/components/Lumi";
import { NextStep, PageHeader, Section } from "@/components/ui";
import { HACKS, hackUrl } from "@/data/hacks";
import { GITHUB as REPO } from "@/lib/links";

export default function HacksPage() {
  return (
    <>
      <PageHeader
        eyebrow="Hacks · open hardware, open invitation"
        title={<>Customize your badge. <em>Make it weird.</em></>}
        lede="Step-by-step recipes for putting your name, photos and colours on the badge, reading its sensors, and shipping your own updates. Each hack is one Markdown file in the repository, checked against the code."
      />

      <Section id="hacks">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HACKS.map((h, i) => {
            const url = hackUrl(h);
            const external = /^https?:/.test(url);
            return (
              <li key={h.slug} className={`card-link group relative flex flex-col p-6 ${i === 0 ? "sm:col-span-2 lg:row-span-2 lg:p-8" : ""}`}>
                <p className="flex items-center gap-3">
                  <span className="label text-primary">{h.difficulty}</span>
                  <span className="label">{h.mins < 60 ? `${h.mins} min` : `${Math.round(h.mins / 60)} h`}</span>
                </p>
                <h2 className={i === 0 ? "mt-4 font-display text-title text-text" : "h-card mt-3"}>
                  {/* The title link covers the whole card (after:inset-0). */}
                  <Link
                    href={url}
                    {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                    className="after:absolute after:inset-0 after:rounded-card after:content-[''] group-hover:text-primary"
                  >
                    {h.title}
                  </Link>
                </h2>
                <p className={i === 0 ? "mt-4 max-w-prose-site leading-relaxed text-text-dim" : "mt-2 text-sm leading-relaxed text-text-dim"}>{h.body}</p>
                {i === 0 && h.lead && <p className="mt-3 max-w-prose-site text-sm leading-relaxed text-text-dim">{h.lead}</p>}
                <div className="mt-auto flex items-center justify-between gap-3 pt-6 text-xs">
                  <span className="inline-flex items-center gap-1 font-bold text-primary">
                    {h.doc ? "Try this hack" : "Open"}
                    {external ? <ExternalLink className="h-3 w-3" aria-hidden="true" /> : <span aria-hidden="true">→</span>}
                  </span>
                  {h.doc && (
                    <a
                      href={`${REPO}/blob/main/docs/hacks/${h.doc}`}
                      target="_blank" rel="noreferrer"
                      aria-label={`${h.title}: Markdown source on GitHub`}
                      className="relative z-10 inline-flex items-center gap-1 text-muted transition-colors hover:text-primary"
                    >
                      <Github className="h-3 w-3" aria-hidden="true" /> source
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <LumiTip align="right">New here? Start with the five-minute hack: put your GitHub handle on the badge.</LumiTip>
      </Section>

      <Section id="your-hack" tone="green">
        <div className="max-w-3xl">
          <p className="eyebrow">Your hack here</p>
          <h2 className="h-title mt-3">Got an idea <em>for a hack?</em></h2>
          <p className="mt-2 max-w-prose-site leading-relaxed text-text-dim">
            Propose it, then write it up as one Markdown file in <code className="code">docs/hacks/</code> and
            send a pull request. Once it is merged, it gets its own page here.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={`${REPO}/issues/new?template=hack_proposal.yml`} target="_blank" rel="noreferrer" className="btn-primary">
              Propose a hack
            </a>
            <a href={`${REPO}/blob/main/docs/hacks/README.md`} target="_blank" rel="noreferrer" className="btn-ghost">
              <Github className="h-4 w-4" aria-hidden="true" /> docs/hacks on GitHub
            </a>
          </div>
        </div>
      </Section>

      <NextStep
        title={<>Made something? <em>Send it upstream.</em></>}
        body="Apps, fixes, hacks and OS improvements each have their own path."
        href="/contribute/"
        cta="Contribute"
      />
    </>
  );
}
