import Link from "next/link";
import { LumiTip } from "@/components/Lumi";
import { Card, NextStep, NumberBand, PageHeader, Section, SectionHeader } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

// Set to the arXiv identifier (e.g. "2610.01234") once the paper is announced;
// the status, links, and citation switch over automatically.
const ARXIV_ID: string | null = "2610.35935";
const ZENODO_DOI = "10.5281/zenodo.23543367";
const TITLE =
  "RV565: Cross-Layer Co-Design for Frame-Independent Video Playback on MicroPython-Class ESP32-S3 Systems";

export const metadata = pageMetadata({
  title: "RV565 Research Paper: frame-independent video on ESP32-S3",
  description:
    "RV565: a decode framework for frame-independent RGB565 video on the ESP32-S3, with a dual-core pipeline that holds 24 FPS with zero deadline misses and a decode-cost model that predicts schedulability from container metadata.",
  path: "/paper/",
  keywords: ["RV565 paper", "ESP32-S3 video", "embedded video playback", "RGB565", "SPI DMA", "dual-core pipeline", "MicroPython"],
  type: "article",
});

const AUTHORS = [
  { name: "Ayushman Bhattacharya", affiliation: "Pollinations AI", email: "ayushman.elixpo@gmail.com" },
  { name: "Anwesha Chakraborty", affiliation: "Department of CSE, JIS University", email: "anwesha.elixpo@gmail.com" },
];

const HEADLINES = [
  { value: "24 FPS", label: "on both workloads, zero deadline misses (dual-core)" },
  { value: "10.3 ms", label: "worst-frame slack, against a 41.7 ms period" },
  { value: "98.1%", label: "of the 40 MHz SPI wire-time bound" },
  { value: "r² 0.9987", label: "decode-cost model, pooled across windows" },
];

const RESULTS = [
  ["W90", "Standalone, serial", "24.002", "0", "40.224", "41.353"],
  ["W90", "Standalone, dual-core", "24.009", "0", "31.324", "31.334"],
  ["W360", "Standalone, serial", "23.905", "7,200", "41.830", "41.901"],
  ["W360", "Standalone, dual-core", "24.009", "0", "31.326", "31.336"],
  ["W90", "FaleraOS Gallery", "12.170", "720", "80.400", "92.102"],
];

const CONTRIBUTIONS = [
  ["Container", "A frame-independent, display-native RGB565 container with a host- and device-side validation contract."],
  ["Dual-core pipeline", "Core 1 inflates frame k+1 while core 0 scales and DMA-transfers frame k, removing decode from the critical path."],
  ["Schedulability from metadata", "Inflation time is linear in the stored payload length, so an admission threshold decides from the container which clips a path can play."],
  ["The price of independence", "Within Deflate, independent frames cost nothing; against explicit temporal prediction they cost 1.9–5.1× in size."],
  ["Integration anatomy", "Inside FaleraOS the gap is serialized input, external-RAM placement, and blocking presentation — interpreter overhead is 0.8 ms."],
];

function bibtex() {
  const key = "bhattacharya2026rv565";
  const authors = AUTHORS.map((a) => a.name).join(" and ");
  if (ARXIV_ID) {
    return `@misc{${key},
  author        = {${authors}},
  title         = {${TITLE}},
  year          = {2026},
  eprint        = {${ARXIV_ID}},
  archivePrefix = {arXiv},
  primaryClass  = {cs.AR}
}`;
  }
  return `@misc{${key},
  author = {${authors}},
  title  = {${TITLE}},
  year   = {2026},
  note   = {Under arXiv moderation (cs.AR). Artifact: doi:${ZENODO_DOI}}
}`;
}

export default function PaperPage() {
  const arxivUrl = ARXIV_ID ? `https://arxiv.org/abs/${ARXIV_ID}` : null;

  return (
    <article>
      <PageHeader
        eyebrow={`Paper · cs.AR · ${ARXIV_ID ? `arXiv:${ARXIV_ID}` : "arXiv moderation"}`}
        title={<>RV565: cross-layer co-design for <em>frame-independent</em> video on ESP32-S3.</>}
        lede={
          <>
            <span className="block text-sm leading-relaxed text-muted">{TITLE}</span>
            <span className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              {AUTHORS.map((a) => (
                <span key={a.email}>
                  <a href={`mailto:${a.email}`} className="font-bold text-text hover:text-primary">{a.name}</a>
                  <span className="block text-xs text-muted">{a.affiliation}</span>
                </span>
              ))}
            </span>
          </>
        }
      >
        {arxivUrl ? (
          <a href={arxivUrl} target="_blank" rel="noreferrer" className="btn-primary">Read on arXiv ↗</a>
        ) : (
          <span className="btn-primary cursor-default opacity-60">arXiv link pending</span>
        )}
        <a href={`https://doi.org/${ZENODO_DOI}`} target="_blank" rel="noreferrer" className="btn-ghost">Artifact on Zenodo ↗</a>
        <Link href="/rv565/convert/" className="btn-ghost">Convert a video</Link>
        <a href="https://pypi.org/project/rv565/" target="_blank" rel="noreferrer" className="btn-ghost">pip install rv565 ↗</a>
        <Link href="/docs/video-architecture/" className="btn-ghost">Architecture notes</Link>
      </PageHeader>

      {/* Headline numbers */}
      <Section label="Headline numbers" tone="ink">
        <p className="eyebrow mb-10">Headline numbers</p>
        <NumberBand items={HEADLINES} />
      </Section>

      {/* Abstract + status */}
      <Section id="abstract">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)] lg:gap-16">
          <div>
            <SectionHeader eyebrow="Abstract" title={<>Where each byte lives, <em>and which stages run serially.</em></>} />
            <div className="mt-8 max-w-prose-site space-y-5 text-[1.0625rem] leading-[1.75] text-text-dim">
              <p>
                Video on SPI-attached microcontroller displays is limited less by decoding than by where each
                byte lives and which stages run serially. RV565 is a decode framework for frame-independent
                video whose decoded representation is the panel&apos;s native RGB565 format, evaluated on an
                ESP32-S3 with two ten-second windows of an openly licensed film.
              </p>
              <p>
                A serial path meets the 41.7 ms deadline on the lighter window but misses all 7,200 frames of the
                heavier one. RV565&apos;s dual-core pipeline inflates the next frame on the second core during the
                display transfer and sustains 24 FPS with zero misses and 10.3 ms of slack on both windows; frame
                time then equals a transfer that runs at 98.1% of the wire-time bound.
              </p>
              <p>
                Because frames are independent, inflation time is linear in the compressed length stored in the
                container: a model fitted on one window predicts the other within 0.04 ms and identifies, from
                metadata alone, which window the serial path cannot schedule. Inside FaleraOS, firmware inflation
                alone reaches 12.2 FPS, and stage timing attributes the remaining cost to serialized input,
                external-RAM placement, and blocking presentation rather than the interpreter.
              </p>
            </div>
          </div>
          <Card fill className="self-start p-6">
            <p className="eyebrow">Status</p>
            <dl className="mt-5 space-y-4 text-sm">
              <div><dt className="label">Venue</dt><dd className="mt-1 font-semibold">arXiv preprint · cs.AR (cs.MM, cs.PF, eess.IV)</dd></div>
              <div><dt className="label">Review</dt><dd className="mt-1 font-semibold">{ARXIV_ID ? "Announced; not peer reviewed" : "Submitted; awaiting moderation"}</dd></div>
              <div><dt className="label">Artifact</dt><dd className="mt-1"><a href={`https://doi.org/${ZENODO_DOI}`} target="_blank" rel="noreferrer" className="link font-semibold">doi:{ZENODO_DOI}</a></dd></div>
              <div><dt className="label">Workload</dt><dd className="mt-1 font-semibold">Big Buck Bunny (CC BY 3.0), Blender Foundation</dd></div>
              <div><dt className="label">Licence</dt><dd className="mt-1 font-semibold">CC BY 4.0</dd></div>
              <div><dt className="label">Format</dt><dd className="mt-1 font-semibold">Measured with RV565 format version 6. Version 7 (RV565 2.0) adds more pixel formats and delta frames; version 6 files remain valid.</dd></div>
            </dl>
          </Card>
        </div>
      </Section>

      {/* Contributions */}
      <Section id="contributions">
        <SectionHeader
          eyebrow="Contributions"
          title={<>What the paper <em>establishes.</em></>}
          lede="RV565 does not propose a new entropy coder. The contribution is the co-design of representation, memory placement, scheduling, and display I/O — and the measurements that explain it."
        />
        <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CONTRIBUTIONS.map(([title, body], i) => (
            <li key={title} className="card flex flex-col p-6">
              <span className="font-mono text-sm font-bold text-primary">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="h-card mt-4">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-dim">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Results */}
      <Section id="results" fill>
        <SectionHeader
          eyebrow="Measured results"
          title={<>Ten independently reset runs <em>per standalone configuration.</em></>}
        />
        <div className="mt-10 overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-card-sub">
              <tr className="label">
                <th className="p-4 font-semibold">Window</th><th className="p-4 font-semibold">Path</th><th className="p-4 font-semibold">FPS</th>
                <th className="p-4 font-semibold">Misses</th><th className="p-4 font-semibold">Mean (ms)</th><th className="p-4 font-semibold">Max (ms)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {RESULTS.map(([w, path, fps, misses, mean, max]) => (
                <tr key={`${w}-${path}`}>
                  <td className="p-4 font-mono">{w}</td>
                  <td className="p-4 font-semibold">{path}</td>
                  <td className="p-4 tabular-nums">{fps}</td>
                  <td className={`p-4 tabular-nums ${misses === "0" ? "text-teal" : "font-semibold text-primary"}`}>{misses}</td>
                  <td className="p-4 tabular-nums">{mean}</td>
                  <td className="p-4 tabular-nums">{max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5 max-w-3xl text-xs leading-relaxed text-muted">
          W90 and W360 are the 90–100 s and 360–370 s windows of Big Buck Bunny, encoded at 180×135 and
          24 FPS. The FaleraOS row is one 720-frame run; Gallery slows playback instead of skipping frames.
        </p>
      </Section>

      {/* Citation */}
      <Section id="cite">
        <SectionHeader eyebrow="Cite" title={<>BibTeX.</>} />
        <pre className="pre mt-8 p-6">{bibtex()}</pre>
        <LumiTip pose="read">The measurement artifact is on Zenodo, so you can check every number on this page yourself.</LumiTip>
      </Section>

      <NextStep
        title={<>Make an RV565 clip <em>in your browser.</em></>}
        body="Convert an MP4 or WebM to RV565 or an Arduino clip.h. No upload, no account."
        href="/rv565/convert/"
        cta="Open the converter"
      />
    </article>
  );
}
