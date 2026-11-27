import { LumiTip } from "@/components/Lumi";
import { ListRow, NextStep, PageHeader, Section, SectionHeader } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "FaleraOS Documentation",
  description: "Developer guides and engineering deep dives for FaleraOS and the Falera Badge.",
  path: "/docs/",
  keywords: ["FaleraOS documentation", "ESP32-S3 development", "MicroPython documentation"],
});

const docs = [
  {
    href: "/docs/cli/",
    title: "The falera CLI",
    description: "Install falera-cli, then control the badge over USB: the full-screen view, Transfer, files, apps, Wi-Fi, profile setup, updates and troubleshooting.",
  },
  {
    href: "/docs/usb/",
    title: "Connecting the badge",
    description: "Which USB-C port, port names, Linux permissions, the CLI first, and raw mpremote for advanced use.",
  },
  {
    href: "/docs/transfer/",
    title: "The Transfer app",
    description: "Send photos, videos and documents with the code the badge shows; the safety checks and the protocol.",
  },
  {
    href: "/docs/apps/",
    title: "Writing FaleraOS apps",
    description: "App structure, lifecycle hooks, manifests, graphics, controls, and deployment.",
  },
  {
    href: "/docs/video-architecture/",
    title: "RV565 video architecture",
    description: "Independent RGB565 frames, firmware inflation, SPI2 GDMA stripes, and the measured path from 0.5 to 24 FPS.",
  },
  {
    href: "/paper/",
    title: "RV565 research paper",
    description: "Preview the forthcoming paper, authors, measured results, and scope of the cross-layer video architecture.",
  },
];

const guides = docs.filter((d) => !d.href.includes("video") && d.href !== "/paper/");
const deep = docs.filter((d) => d.href.includes("video") || d.href === "/paper/");

export default function DocsPage() {
  return (
    <>
      <PageHeader
        eyebrow="FaleraOS docs"
        title={<>Build on the badge. <em>Understand the system.</em></>}
        lede="Practical developer references and detailed accounts of the engineering decisions behind FaleraOS."
      />

      <Section id="guides">
        <SectionHeader eyebrow="Developer guides" title={<>Use the badge <em>from your computer.</em></>} />
        <ul className="mt-10">
          {guides.map((doc, i) => (
            <ListRow key={doc.href} n={String(i + 1).padStart(2, "0")} href={doc.href} title={doc.title} body={doc.description} />
          ))}
        </ul>
        <LumiTip pose="read">Most of these pages are built from Markdown files in the repo. Spotted a mistake? Fix it there.</LumiTip>
      </Section>

      <Section id="deep-dives" fill>
        <SectionHeader eyebrow="Engineering deep dives" title={<>How the video <em>path works.</em></>} />
        <ul className="mt-10">
          {deep.map((doc, i) => (
            <ListRow key={doc.href} n={String(guides.length + i + 1).padStart(2, "0")} href={doc.href} title={doc.title} body={doc.description} />
          ))}
        </ul>
      </Section>

      <NextStep
        title={<>Recipes, <em>step by step.</em></>}
        body="Put your name, photos and colours on the badge, read its sensors, and ship your own updates."
        href="/hacks/"
        cta="Browse the hacks"
      />
    </>
  );
}
