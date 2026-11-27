import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import history from "../../../content/history.json";
import organization from "../../../content/organization.json";
import people from "../../../content/people.json";
import { DIRECTORY_ENTRIES, familyPath, type Lifecycle, type PublicFamily } from "@/lib/directory";
import { RESEARCH_RECORDS, researchRecordPath } from "@/lib/research";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";
import { Sparks } from "@/components/Sparks";

export const metadata = createPageMetadata({
  title: "Elixpo Wiki — encyclopedic overview",
  description: "A neutral, referenced overview of Elixpo: an open-source project foundry founded in 2023, its history, operating model, projects, services, research, and people.",
  path: "/wiki",
});

// Every claim on this page cites a public record; references are numbered in first-use order.
const references: { label: string; url: string }[] = [];
function cite(label: string, url: string) {
  const existing = references.findIndex((reference) => reference.url === url);
  if (existing !== -1) return existing + 1;
  references.push({ label, url });
  return references.length;
}

const Ref = ({ n }: { n: number }) => <sup className="wiki-ref"><a href={`#ref-${n}`}>[{n}]</a></sup>;

const LIFECYCLE_ORDER: Lifecycle[] = ["active", "maintenance", "incubating", "paused", "completed", "archived"];
const FAMILIES: { family: PublicFamily; label: string }[] = [{ family: "project", label: "Projects" }, { family: "service", label: "Services" }, { family: "research", label: "Research" }];
const entries = DIRECTORY_ENTRIES.filter((entry) => entry.repository !== "elixpo_chapter");
const current = entries.filter((entry) => entry.lifecycle !== "archived").sort((a, b) => LIFECYCLE_ORDER.indexOf(a.lifecycle) - LIFECYCLE_ORDER.indexOf(b.lifecycle) || a.name.localeCompare(b.name));
const archived = entries.filter((entry) => entry.lifecycle === "archived");
const papers = RESEARCH_RECORDS.filter((record) => record.paperUrl && record.releasedAt).sort((a, b) => b.releasedAt!.localeCompare(a.releasedAt!));
const founders = people.currentTeam.filter((person) => /found/i.test(person.role));

const refOrigin = cite("OctaBit repository, earliest surviving Elixpo project record (26 December 2023)", "https://github.com/elixpo/octabit");
const refOrg = cite("Elixpo GitHub organization", organization.urls.github.url);
const refAbout = cite("About Elixpo", "https://elixpo.com/about");
const refPeople = cite("Elixpo people record", "https://elixpo.com/people");
const refPollinations = cite("search.elixpo hosted under the Pollinations GitHub organization", "https://github.com/pollinations/search.elixpo");
const historyRefs = history.entries.map((item) => cite(item.evidence[0].label, item.evidence[0].url));
const refFlappy = cite("6502.org Homebuilt Projects", "https://6502.org/homebuilt/");
const paperRefs = papers.map((record) => cite(record.title, record.paperUrl!));

// Group the history ledger by the first four-digit year in each period.
const historyByYear = history.entries.reduce<{ year: string; items: { item: (typeof history.entries)[number]; ref: number }[] }[]>((groups, item, index) => {
  const year = item.period.match(/\d{4}/)?.[0] ?? "Undated";
  const group = groups.find((entry) => entry.year === year) ?? groups[groups.push({ year, items: [] }) - 1];
  group.items.push({ item, ref: historyRefs[index] });
  return groups;
}, []);

const sections = [["history", "History"], ["model", "Operating model"], ["projects", "Projects and services"], ["research", "Research"], ["people", "People"], ["see-also", "See also"], ["references", "References"]] as const;

export default function WikiPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://elixpo.com/#organization",
    name: organization.name,
    url: organization.urls.website.url,
    description: organization.fullDescription,
    foundingDate: "2023",
    founder: founders.map((person) => ({ "@type": "Person", name: person.name, url: person.github })),
    email: organization.urls.contact.url.replace("mailto:", ""),
    sameAs: [organization.urls.github.url],
  };

  return <main className="page-shell wiki-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

    <div className="wiki-layout">
      <nav className="wiki-toc" aria-label="Contents">
        <p className="eyebrow">Contents</p>
        <ol>{sections.map(([id, label], index) => <li key={id}><a href={`#${id}`}><span>{index + 1}</span>{label}</a></li>)}</ol>
      </nav>

      <article className="wiki-article">
        <header className="wiki-title"><Sparks chips={["[citation needed]", "NPOV ✓", "sourced ✓"]} />
          <p className="eyebrow">Elixpo Wiki / every claim referenced</p>
          <h1>Elixpo</h1>
          <p>From the Elixpo public record. Corrections are welcome in <a href={organization.urls.discussions.url} target="_blank" rel="noreferrer">GitHub Discussions</a>.</p>
        </header>

        <aside className="wiki-infobox" aria-label="Elixpo at a glance">
          <h2>Elixpo</h2>
          <figure data-oreo-scene>
            <Image src="/logos/logo.webp" alt="Lumi, the Elixpo pixel panda mascot" width={132} height={132} />
            <figcaption>Lumi, the Elixpo mascot</figcaption>
          </figure>
          <dl>
            <dt>Type</dt><dd>Open-source project foundry</dd>
            <dt>Founded</dt><dd>2023<Ref n={refOrigin} /></dd>
            <dt>GitHub org</dt><dd>24 February 2024<Ref n={refOrg} /></dd>
            <dt>Founders</dt><dd>{founders.map((person) => person.name).join(", ")}<Ref n={refPeople} /></dd>
            <dt>Focus</dt><dd>Open software, reproducible research, open hardware, operated services</dd>
            <dt>Programmes</dt><dd>{organization.programs.map((program) => program.name).join(", ")}</dd>
            <dt>Projects</dt><dd>{current.length} current · {archived.length} archived</dd>
            <dt>Papers</dt><dd>{papers.length} public</dd>
            <dt>Partner</dt><dd>Pollinations.AI (infrastructure)<Ref n={refPollinations} /></dd>
            <dt>Website</dt><dd><a href={organization.urls.website.url}>elixpo.com</a></dd>
            <dt>Source</dt><dd><a href={organization.urls.github.url} target="_blank" rel="noreferrer">github.com/elixpo</a></dd>
          </dl>
        </aside>

        <p className="wiki-lead"><strong>Elixpo</strong> is an open-source project foundry that works with active maintainers to build and release software, reproducible research, open hardware, and publicly operated services in public.<Ref n={refAbout} /> Work is organized into time-bounded <em>Chapters</em> with a defined release objective, and projects that continue beyond a Chapter may become <em>Member Projects</em> while their original maintainers keep authority over them.<Ref n={refAbout} /></p>
        <p className="wiki-lead">Its earliest surviving project dates from December 2023<Ref n={refOrigin} />, and its GitHub organization was created in February 2024.<Ref n={refOrg} /> Elixpo currently lists {current.length} current projects, services, and research workstreams and {papers.length} public papers.</p>

        <section id="history"><h2>History</h2>
          <p>Elixpo began as a series of college-era projects, the earliest surviving one being the OctaBit breadboard computer, before those projects were gathered under a shared GitHub organization.<Ref n={refOrigin} /> Milestones are listed with the date precision the public record supports; the full ledger is on the <Link href="/history">history page</Link>.</p>
          <div className="wiki-timeline">{historyByYear.map(({ year, items }) => <div key={year} className="wiki-year">
            <h3>{year}</h3>
            <ol>{items.map(({ item, ref }) => <li key={`${item.period}-${item.title}`}><span>{item.period}</span><p>{item.title}<Ref n={ref} /></p></li>)}</ol>
          </div>)}</div>
        </section>

        <section id="model"><h2>Operating model</h2>
          <p>{organization.fullDescription}<Ref n={refAbout} /></p>
          <div className="wiki-cards two">{organization.programs.map((program) => <div key={program.name} className="wiki-card"><h3>{program.name}</h3><p>{program.purpose}</p></div>)}</div>
          <p>Participation does not require transferring a repository. Every public project carries a recorded lifecycle state—active, maintenance, incubating, paused, completed, or archived—so retired work stays visible without being presented as supported.<Ref n={refAbout} /></p>
        </section>

        <section id="projects"><h2>Projects and services</h2>
          <p>The public registry lists {current.length} current records and {archived.length} archived ones. Flappy6502, a Flappy Bird port for a breadboard R6502 computer, is listed in 6502.org&apos;s Homebuilt Projects.<Ref n={refFlappy} /></p>
          {FAMILIES.map(({ family, label }) => {
            const group = current.filter((entry) => entry.family === family);
            return group.length > 0 && <div key={family} className="wiki-group">
              <h3>{label} <small>{group.length}</small></h3>
              <div className="wiki-cards">{group.map((entry) => <Link key={entry.repository} className="wiki-card wiki-entry" href={`${familyPath(entry.family)}/${entry.slug}`}>
                <div><strong>{entry.name}</strong><span className={`status-pill status-${entry.lifecycle}`}>{entry.lifecycle}</span></div>
                <p>{entry.summary}</p>
              </Link>)}</div>
            </div>;
          })}
          <p className="wiki-note"><strong>Archived:</strong> {archived.map((entry) => entry.name).join(" · ")}</p>
        </section>

        <section id="research"><h2>Research</h2>
          <p>Elixpo publishes papers and technical reports with their review status stated. None of the records below has been independently peer reviewed.</p>
          <ol className="wiki-papers">{papers.map((record, index) => <li key={record.slug}>
            <span className="wiki-year-badge">{record.releasedAt!.slice(0, 4)}</span>
            <div>
              <Link href={researchRecordPath(record)}>{record.title}</Link><Ref n={paperRefs[index]} />
              <p>{record.authors.map((author) => author.name).join(", ")}</p>
              <div className="wiki-chips"><span>{record.researchStatus.replaceAll("-", " ")}</span><span>{record.reviewStatus.replaceAll("-", " ")}</span></div>
            </div>
          </li>)}</ol>
        </section>

        <section id="people"><h2>People</h2>
          <div className="wiki-people">{people.currentTeam.map((person) => <a key={person.handle} href={person.github} target="_blank" rel="noreferrer">
            <Image src={`https://github.com/${person.handle}.png`} alt="" width={48} height={48} unoptimized />
            <span><strong>{person.name}</strong>{person.role}</span>
          </a>)}</div>
          <p>Contributors are credited individually on the <Link href="/contributors">contributor records</Link>.<Ref n={refPeople} /></p>
        </section>

        <section id="see-also"><h2>See also</h2>
          <div className="wiki-chips links">{[["/about", "About"], ["/history", "History"], ["/chapter", "Chapter model"], ["/research", "Research"], ["/packages", "Packages"], ["/people", "People"]].map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</div>
        </section>

        <section id="references"><h2>References</h2>
          <div className="wiki-oreo-note" aria-hidden="true" data-oreo-scene><Image src="/logos/logo.webp" alt="" width={44} height={44} /><span>I clicked all {references.length} of these. Twice.</span></div>
          <ol className="wiki-references">{references.map((reference, index) => <li key={reference.url} id={`ref-${index + 1}`}><a href={reference.url} target="_blank" rel="noreferrer">{reference.label}<ArrowUpRight size={11} /></a></li>)}</ol>
        </section>
      </article>
    </div>
  </main>;
}
