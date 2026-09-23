import type { MetadataRoute } from "next";
import { ECOSYSTEM_PRODUCTS } from "@/lib/catalog";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

const ROUTES = [
  "/",
  "/projects",
  "/community",
  "/about",
  "/architecture",
  "/assets",
  "/features",
  "/resources",
  "/contributing",
  "/code-of-conduct",
  "/terms",
  "/privacy",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ROUTES.map((path) => ({ url: absoluteUrl(path) }));
  const productRoutes = ECOSYSTEM_PRODUCTS.map(({ slug }) => ({
    url: absoluteUrl(`/projects/${slug}`),
  }));

  return [...staticRoutes, ...productRoutes];
}
