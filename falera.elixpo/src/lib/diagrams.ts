/* Static SVG drawings of the Mermaid diagrams in CONTRIBUTING.md.
 *
 * GitHub draws ```mermaid blocks itself. The website renders the same
 * Markdown at build time (src/lib/markdown.ts), and Mermaid cannot lay out
 * a diagram without a browser DOM, so instead of shipping the ~1 MB
 * mermaid runtime to every visitor (or a headless browser to the build),
 * each diagram is drawn here once as plain SVG: no JavaScript, styled with
 * the site's Tailwind tokens.
 *
 * Each drawing carries the exact Mermaid source it was drawn from. When the
 * source in the Markdown changes, it no longer matches, the build prints a
 * warning and the page shows the Mermaid source as code instead of a stale
 * picture. Update the drawing and its `source` here together.
 */

type Drawing = { source: string; label: string; svg: string };

const norm = (s: string) =>
  s.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");

/* ── drawing helpers ─────────────────────────────────────────────────── */

const NODE = "fill-card stroke-border";
const TEXT = "fill-text";
const EDGE = "stroke-muted-deep";
const LABEL = "fill-text-dim";

function lines(cx: number, cy: number, text: string[], size = 13, klass = TEXT): string {
  const lh = size + 4;
  const top = cy - ((text.length - 1) * lh) / 2;
  return text
    .map((t, i) =>
      `<text x="${cx}" y="${top + i * lh}" font-size="${size}" text-anchor="middle" dominant-baseline="central" class="${klass}">${t}</text>`)
    .join("");
}

/** A box centred on (cx, cy). `accent` tints the border (Tailwind stroke class). */
function box(cx: number, cy: number, w: number, h: number, text: string[],
             { accent = "", round = 8 }: { accent?: string; round?: number } = {}): string {
  return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${round}" class="${NODE} ${accent}" stroke-width="1.5"/>` +
    lines(cx, cy, text);
}

function arrow(d: string, marker: string, { dashed = false, both = false } = {}): string {
  return `<path d="${d}" fill="none" class="${EDGE}" stroke-width="1.5"${dashed ? ' stroke-dasharray="5 4"' : ""}` +
    ` marker-end="url(#${marker})"${both ? ` marker-start="url(#${marker}-start)"` : ""}/>`;
}

function line(d: string): string {
  return `<path d="${d}" fill="none" class="${EDGE}" stroke-width="1.5"/>`;
}

function label(x: number, y: number, text: string[], anchor = "middle"): string {
  return text
    .map((t, i) =>
      `<text x="${x}" y="${y + i * 14}" font-size="11" text-anchor="${anchor}" class="${LABEL}">${t}</text>`)
    .join("");
}

function markers(id: string): string {
  return `<defs>` +
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="fill-muted-deep"/></marker>` +
    `<marker id="${id}-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10 0 L0 5 L10 10 z" class="fill-muted-deep"/></marker>` +
    `</defs>`;
}

function figure(label: string, viewBox: string, maxWidth: number, body: string): string {
  return `<figure class="my-8 overflow-x-auto rounded-inner border border-border bg-card-sub p-4 sm:p-6">` +
    `<svg viewBox="${viewBox}" role="img" aria-label="${label}" class="mx-auto block h-auto w-full font-sans" style="max-width:${maxWidth}px;min-width:520px">` +
    `<title>${label}</title>${body}</svg>` +
    `<figcaption class="mt-4 text-center text-xs text-muted">${label}</figcaption></figure>`;
}

/* ── 1. How a contribution goes ──────────────────────────────────────── */

const FLOW_SOURCE = `
flowchart TD
    start(["Pick a path"]) --> app["Write an app"]
    start --> bug["Fix a bug"]
    start --> hack["Write a hack"]
    start --> osx["Improve the OS"]
    app --> form["Open the matching issue form"]
    bug --> form
    hack --> form
    osx --> form
    form --> badge{"Have a badge?"}
    badge -->|"no"| host["Host tests, validate_app.py,<br/>CLI tests with the fake badge"]
    badge -->|"yes"| device["./deploy --board,<br/>then try it with falera"]
    host --> branch["Branch from main"]
    device --> branch
    branch --> checks["Run the checks"]
    checks --> pr["Pull request: what you tested,<br/>what to check on a badge"]
    pr --> review["Review"]
    review -->|"changes requested"| branch
    review -->|"approved"| merge(["Squash merge"])
`;

function flowSvg(): string {
  const m = "oreo-flow-arrow";
  const paths = [
    { x: 105, t: "Write an app", a: "stroke-primary" },
    { x: 275, t: "Fix a bug", a: "stroke-teal" },
    { x: 445, t: "Write a hack", a: "stroke-gold" },
    { x: 615, t: "Improve the OS", a: "stroke-lilac" },
  ];
  let b = markers(m);
  // Pick a path → the four paths
  b += box(360, 38, 170, 36, ["Pick a path"], { round: 18, accent: "stroke-text" });
  b += line("M360 56 V76 M105 76 H615");
  for (const p of paths) {
    b += arrow(`M${p.x} 76 V94`, m);
    b += box(p.x, 116, 150, 40, [p.t], { accent: p.a });
  }
  // → the issue form
  b += line("M105 136 V156 M275 136 V156 M445 136 V156 M615 136 V156 M105 156 H615");
  b += arrow("M360 156 V174", m);
  b += box(360, 196, 270, 40, ["Open the matching issue form"]);
  // Have a badge?
  b += arrow("M360 216 V230", m);
  b += `<path d="M360 232 L450 266 L360 300 L270 266 Z" class="${NODE}" stroke-width="1.5"/>` +
    lines(360, 266, ["Have a badge?"]);
  b += arrow("M270 266 H190 V338", m);
  b += label(232, 258, ["no"]);
  b += arrow("M450 266 H530 V338", m);
  b += label(490, 258, ["yes"]);
  b += box(190, 366, 290, 52, ["Host tests, validate_app.py,", "CLI tests with the fake badge"]);
  b += box(530, 366, 290, 52, ["./deploy --board,", "then try it with falera"]);
  // → branch, checks, PR, review, merge
  b += line("M190 392 V412 M530 392 V412 M190 412 H530");
  b += arrow("M360 412 V430", m);
  b += box(360, 452, 200, 40, ["Branch from main"]);
  b += arrow("M360 472 V500", m);
  b += box(360, 522, 200, 40, ["Run the checks"]);
  b += arrow("M360 542 V570", m);
  b += box(360, 598, 330, 52, ["Pull request: what you tested,", "what to check on a badge"]);
  b += arrow("M360 624 V652", m);
  b += box(360, 674, 160, 40, ["Review"]);
  b += arrow("M440 674 H650 V452 H462", m);
  b += label(545, 666, ["changes requested"]);
  b += arrow("M360 694 V732", m);
  b += label(368, 717, ["approved"], "start");
  b += box(360, 752, 180, 36, ["Squash merge"], { round: 18, accent: "stroke-primary" });
  return b;
}

/* ── 2. How the pieces connect ───────────────────────────────────────── */

const ARCH_SOURCE = `
flowchart LR
    subgraph computer["Your computer"]
        checkout["FaleraOS checkout:<br/>./deploy, tests"]
        cli["falera CLI"]
    end
    subgraph badge["Falera badge"]
        oreoos["FaleraOS and apps"]
        firmware["MicroPython firmware<br/>with the RV565 decoder"]
    end
    checkout -->|"USB: deploy"| oreoos
    cli <-->|"USB: files, Transfer,<br/>setup, update"| oreoos
    oreoos -->|"Wi-Fi: internet only"| internet["Internet: GitHub,<br/>App Store, OTA"]
    rv565["RV565 library<br/>elixpo/rv565"] -.->|"video format"| cli
    rv565 -.->|"video format"| firmware
`;

function archSvg(): string {
  const m = "oreo-arch-arrow";
  const group = (x: number, y: number, w: number, h: number, title: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" class="fill-bg stroke-border" stroke-width="1.5" stroke-dasharray="2 3"/>` +
    `<text x="${x + 14}" y="${y + 22}" font-size="12" font-weight="600" class="fill-muted">${title}</text>`;
  let b = markers(m);
  b += group(10, 20, 200, 270, "Your computer");
  b += group(360, 20, 200, 270, "Falera badge");
  b += box(110, 90, 170, 48, ["FaleraOS checkout:", "./deploy, tests"]);
  b += box(110, 170, 170, 40, ["falera CLI"], { accent: "stroke-primary" });
  b += box(460, 130, 170, 120, ["FaleraOS and apps"], { accent: "stroke-primary" });
  b += box(460, 240, 170, 48, ["MicroPython firmware", "with the RV565 decoder"]);
  // USB
  b += arrow("M195 90 H373", m);
  b += label(284, 82, ["USB: deploy"]);
  b += arrow("M197 170 H373", m, { both: true });
  b += label(284, 140, ["USB: files, Transfer,", "setup, update"]);
  // Wi-Fi
  b += box(730, 90, 170, 48, ["Internet: GitHub,", "App Store, OTA"], { accent: "stroke-teal" });
  b += arrow("M545 90 H643", m);
  b += label(596, 108, ["Wi-Fi:", "internet only"]);
  // RV565
  b += box(285, 345, 180, 48, ["RV565 library", "elixpo/rv565"], { accent: "stroke-lilac" });
  b += arrow("M195 345 H110 V192", m, { dashed: true });
  b += label(152, 337, ["video format"]);
  b += arrow("M375 345 H460 V266", m, { dashed: true });
  b += label(418, 337, ["video format"]);
  return b;
}

const DRAWINGS: Drawing[] = [
  {
    source: FLOW_SOURCE,
    label: "How a contribution goes, from picking a path to the squash merge",
    svg: figure("How a contribution goes, from picking a path to the squash merge",
                "0 0 720 780", 720, flowSvg()),
  },
  {
    source: ARCH_SOURCE,
    label: "How the badge, the falera CLI and RV565 connect",
    svg: figure("How the badge, the falera CLI and RV565 connect",
                "0 0 820 380", 820, archSvg()),
  },
];

const BY_SOURCE = new Map(DRAWINGS.map((d) => [norm(d.source), d.svg]));

/** The `diagram` hook for renderMarkdown: the drawing for a Mermaid source,
 * or null (with a build warning) when there is none. */
export function mermaidDrawing(source: string): string | null {
  const svg = BY_SOURCE.get(norm(source));
  if (!svg) {
    console.warn(
      "[diagrams] no drawing for this Mermaid block; the page shows its source. " +
      "Update src/lib/diagrams.ts:\n" + source,
    );
    return null;
  }
  return svg;
}
