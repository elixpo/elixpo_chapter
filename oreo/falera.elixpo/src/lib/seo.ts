import type { Metadata } from "next";

export const SITE_URL = "https://falera.elixpo.com";
export const SITE_NAME = "FaleraOS by Elixpo";
// FaleraOS was OreoOS until November 2026. The description keeps the old
// name once, so searches for "OreoOS" find this site, and says it isn't the
// cookie or Android 8.0; the structured data links FaleraOS to its Wikidata
// entry and coverage.
export const DISAMBIGUATION =
  "FaleraOS (formerly OreoOS) is an open-source MicroPython operating system for the Elixpo Falera Badge, an ESP32-S3 conference badge. It is not related to Android 8.0 Oreo or to OREO cookies.";
export const WIKIDATA = "https://www.wikidata.org/wiki/Q141968869";
export const OG_IMAGE = "/og-banner.png";

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  type?: "website" | "article";
};

/** Consistent canonical, social, and crawler metadata for static routes. */
export function pageMetadata({
  title,
  description,
  path,
  keywords = [],
  type = "website",
}: PageMetadataOptions): Metadata {
  const canonical = path === "/" ? "/" : `/${path.replace(/^\/+|\/+$/g, "")}/`;

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      type,
      url: canonical,
      siteName: SITE_NAME,
      locale: "en_US",
      title,
      description,
      images: [{
        url: OG_IMAGE,
        width: 1280,
        height: 720,
        alt: "FaleraOS running on the open-source ESP32-S3 Falera Badge",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE],
    },
  };
}
