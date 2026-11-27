import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RepoDoc from "@/components/RepoDoc";
import { HACK_GUIDES } from "@/data/hacks";
import { pageMetadata } from "@/lib/seo";

// Rendered from docs/hacks/<slug>.md at build time; edit that file, not
// this page. The cards on /hacks list the guides (src/data/hacks.ts).

export const dynamicParams = false;

export function generateStaticParams() {
  return HACK_GUIDES.map((h) => ({ slug: h.slug }));
}

type Props = { params: Promise<{ slug: string }> };

const find = (slug: string) => HACK_GUIDES.find((h) => h.slug === slug);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hack = find((await params).slug);
  if (!hack) return {};
  return pageMetadata({
    title: hack.title,
    description: hack.lead ?? hack.body,
    path: `/hacks/${hack.slug}/`,
    keywords: ["Falera Badge hack", "FaleraOS", hack.title],
    type: "article",
  });
}

export default async function HackPage({ params }: Props) {
  const hack = find((await params).slug);
  if (!hack) notFound();
  const others = HACK_GUIDES.filter((h) => h.slug !== hack.slug).slice(0, 2);
  return (
    <RepoDoc
      file={`docs/hacks/${hack.doc}`}
      chip={`hack · ${hack.difficulty} · ${hack.mins < 60 ? `${hack.mins} min` : `${Math.round(hack.mins / 60)} h`}`}
      title={hack.title}
      lead={hack.lead ?? hack.body}
      quickLinks={[{ label: "All hacks", href: "/hacks/" }]}
      related={others.map((h) => ({ href: `/hacks/${h.slug}/`, title: h.title, description: h.body }))}
    />
  );
}
