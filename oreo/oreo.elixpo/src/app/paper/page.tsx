import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { pageMetadata } from "@/lib/seo";

// Set to the arXiv identifier (e.g. "2610.01234") once the paper is announced;
// the status, links, and citation switch over automatically.
const ARXIV_ID: string | null = null;
const ZENODO_DOI = "10.5281/zenodo.23543367";
const TITLE =
  "RV565: Cross-Layer Co-Design for Frame-Independent Video Playback on MicroPython-Class ESP32-S3 Systems";

export const metadata = pageMetadata({
  title: "RV565 Research Paper",
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
  ["W90", "OreoOS Gallery", "12.170", "720", "80.400", "92.102"],
];

const CONTRIBUTIONS = [
  ["Container", "A frame-independent, display-native RGB565 container with a host- and device-side validation contract."],
  ["Dual-core pipeline", "Core 1 inflates frame k+1 while core 0 scales and DMA-transfers frame k, removing decode from the critical path."],
  ["Schedulability from metadata", "Inflation time is linear in the stored payload length, so an admission threshold decides from the container which clips a path can play."],
  ["The price of independence", "Within Deflate, independent frames cost nothing; against explicit temporal prediction they cost 1.9–5.1× in size."],
  ["Integration anatomy", "Inside OreoOS the gap is serialized input, external-RAM placement, and blocking presentation — interpreter overhead is 0.8 ms."],
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
      {/* Hero */}
      <header className="container-page border-b border-border pb-16 pt-20 sm:pt-28">
        <p className="eyebrow">Paper · cs.AR · {ARXIV_ID ? `arXiv:${ARXIV_ID}` : "arXiv moderation"}</p>
        <h1 className="max-w-6xl font-display text-[clamp(2.4rem,5.2vw,5.4rem)] leading-[0.98]">
          RV565: cross-layer co-design for <em>frame-independent</em> video on ESP32-S3.
        </h1>
        <p className="mt-6 max-w-4xl text-sm leading-relaxed text-muted">{TITLE}</p>
        <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          {AUTHORS.map((a) => (
            <li key={a.email}>
              <a href={`mailto:${a.email}`} className="font-bold transition-opacity hover:opacity-55">{a.name}</a>
              <span className="block text-xs text-muted">{a.affiliation}</span>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap gap-3">
          {arxivUrl ? (
            <a href={arxivUrl} target="_blank" rel="noreferrer" className="btn-primary">
              Read on arXiv <ArrowUpRight className="h-4 w-4" />
            </a>
          ) : (
            <span className="btn-primary cursor-default opacity-60">arXiv link pending</span>
          )}
          <a href={`https://doi.org/${ZENODO_DOI}`} target="_blank" rel="noreferrer" className="btn-ghost">
            Artifact on Zenodo <ArrowUpRight className="h-4 w-4" />
          </a>
          <Link href="/docs/video-architecture/" className="btn-ghost">
            Architecture notes <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Headline numbers */}
      <section className="border-b border-border">
        <div className="container-page grid sm:grid-cols-2 lg:grid-cols-4">
          {HEADLINES.map((h, i) => (
            <div key={h.label} className={`py-10 pr-6 ${i > 0 ? "lg:border-l lg:border-border lg:pl-6" : ""}`}>
              <p className="font-display text-4xl">{h.value}</p>
              <p className="mt-2 max-w-[16rem] text-xs leading-relaxed text-muted">{h.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Abstract + status */}
      <section className="container-page grid gap-12 border-b border-border py-20 lg:grid-cols-[1.3fr_0.7fr]">
        <div>
          <p className="eyebrow">Abstract</p>
          <div className="space-y-5 text-[1.05rem] leading-[1.75] text-text-dim">
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
              metadata alone, which window the serial path cannot schedule. Inside OreoOS, firmware inflation
              alone reaches 12.2 FPS, and stage timing attributes the remaining cost to serialized input,
              external-RAM placement, and blocking presentation rather than the interpreter.
            </p>
          </div>
        </div>
        <aside className="self-start rounded-[1.4rem] border border-border bg-card p-6">
          <p className="eyebrow">Status</p>
          <dl className="space-y-4 text-sm">
            <div><dt className="text-xs text-muted">Venue</dt><dd className="font-semibold">arXiv preprint · cs.AR (cs.PF, cs.MM)</dd></div>
            <div><dt className="text-xs text-muted">Review</dt><dd className="font-semibold">{ARXIV_ID ? "Announced; not peer reviewed" : "Submitted; awaiting moderation"}</dd></div>
            <div><dt className="text-xs text-muted">Artifact</dt><dd><a href={`https://doi.org/${ZENODO_DOI}`} target="_blank" rel="noreferrer" className="font-semibold underline decoration-border underline-offset-4 hover:decoration-text">doi:{ZENODO_DOI}</a></dd></div>
            <div><dt className="text-xs text-muted">Workload</dt><dd className="font-semibold">Big Buck Bunny (CC BY 3.0), Blender Foundation</dd></div>
            <div><dt className="text-xs text-muted">Licence</dt><dd className="font-semibold">CC BY 4.0</dd></div>
          </dl>
        </aside>
      </section>

      {/* Contributions */}
      <section className="container-page border-b border-border py-20">
        <header className="mb-12 grid gap-6 lg:grid-cols-[1.15fr_0.65fr]">
          <h2 className="font-display text-[clamp(2.2rem,4.4vw,4.4rem)] leading-[0.98]">
            What the paper <em>establishes</em>.
          </h2>
          <p className="self-end text-sm leading-relaxed text-muted">
            RV565 does not propose a new entropy coder. The contribution is the co-design of representation,
            memory placement, scheduling, and display I/O — and the measurements that explain it.
          </p>
        </header>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CONTRIBUTIONS.map(([title, body], i) => (
            <li key={title} className="card-surface flex flex-col p-6">
              <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-4 font-display text-2xl leading-tight">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Results */}
      <section className="container-page border-b border-border py-20">
        <p className="eyebrow">Measured results</p>
        <h2 className="mb-10 max-w-4xl font-display text-[clamp(2rem,3.6vw,3.6rem)] leading-[1]">
          Ten independently reset runs per standalone configuration.
        </h2>
        <div className="overflow-x-auto rounded-[1.4rem] border border-border bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="p-4">Window</th><th className="p-4">Path</th><th className="p-4">FPS</th>
                <th className="p-4">Misses</th><th className="p-4">Mean (ms)</th><th className="p-4">Max (ms)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {RESULTS.map(([w, path, fps, misses, mean, max]) => (
                <tr key={`${w}-${path}`}>
                  <td className="p-4 font-mono">{w}</td>
                  <td className="p-4 font-semibold">{path}</td>
                  <td className="p-4">{fps}</td>
                  <td className={`p-4 ${misses === "0" ? "text-teal" : "text-primary"}`}>{misses}</td>
                  <td className="p-4">{mean}</td>
                  <td className="p-4">{max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5 max-w-4xl text-xs leading-relaxed text-muted">
          W90 and W360 are the 90–100 s and 360–370 s windows of Big Buck Bunny, encoded at 180×135 and
          24 FPS. The OreoOS row is one 720-frame run; Gallery slows playback instead of skipping frames.
        </p>
      </section>

      {/* Citation */}
      <section className="container-page py-20">
        <p className="eyebrow">Cite</p>
        <pre className="overflow-x-auto rounded-[1.4rem] border border-border bg-card p-6 font-mono text-xs leading-relaxed">
          {bibtex()}
        </pre>
      </section>
    </article>
  );
}
