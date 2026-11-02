import { atomResponse, createAtomFeed, toAtomDate } from "@/lib/feeds";
import { RESEARCH_LAST_VERIFIED, RESEARCH_RECORDS, researchRecordPath } from "@/lib/research";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

export function GET() {
  const fallbackUpdated = toAtomDate(RESEARCH_LAST_VERIFIED);
  const entries = RESEARCH_RECORDS
    .map((record) => ({
      id: absoluteUrl(researchRecordPath(record)),
      url: absoluteUrl(researchRecordPath(record)),
      title: record.title,
      summary: record.abstract,
      updated: record.releasedAt ? toAtomDate(record.releasedAt) : fallbackUpdated,
      authors: record.authors.map((author) => author.name),
      categories: [record.researchStatus, record.reviewStatus],
    }))
    .sort((a, b) => b.updated.localeCompare(a.updated));

  return atomResponse(createAtomFeed({
    title: "Elixpo Research",
    subtitle: "Research records, experiments, papers, artifacts, and reproducibility updates published by Elixpo.",
    path: "/research",
    updated: fallbackUpdated,
    entries,
  }));
}
