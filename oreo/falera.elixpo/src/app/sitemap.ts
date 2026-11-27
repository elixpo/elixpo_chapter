import type { MetadataRoute } from "next";
import { ALL_CATALOG } from "@/data/apps";
import { HACK_GUIDES } from "@/data/hacks";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

// The build date: every deploy tells crawlers the pages changed (useful after
// the move from oreo.elixpo.com to falera.elixpo.com).
const lastModified = new Date();

const staticRoutes = [
  { path: "", priority: 1, changeFrequency: "weekly" as const },
  { path: "get-started", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "badge", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "supporters", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "apps", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "docs", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "docs/cli", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "docs/usb", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "docs/transfer", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "docs/apps", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "docs/video-architecture", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "rv565", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "paper", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "rv565/convert", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "hacks", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "contribute", priority: 0.7, changeFrequency: "monthly" as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${SITE_URL}/${route.path}${route.path ? "/" : ""}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const appPages: MetadataRoute.Sitemap = ALL_CATALOG.map((app) => ({
    url: `${SITE_URL}/apps/${app.urlSlug}/`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const hackPages: MetadataRoute.Sitemap = HACK_GUIDES.map((hack) => ({
    url: `${SITE_URL}/hacks/${hack.slug}/`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...pages, ...appPages, ...hackPages];
}
