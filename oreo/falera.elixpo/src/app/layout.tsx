import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header         from "@/components/Header";
import Footer         from "@/components/Footer";
import JsonLd         from "@/components/JsonLd";
import { DISAMBIGUATION, OG_IMAGE, SITE_NAME, SITE_URL, WIKIDATA } from "@/lib/seo";
import { COVERAGE } from "@/data/press";

// SEO + social-card metadata. The og-banner.png referenced here is the
// same artwork used as the README banner on the main repo — generated
// from `prompts/site_assets.md` and dropped into /public/og-banner.png.
// Keeping a single image for both surfaces means a contributor only
// has to refresh one file when the brand shifts.

const SITE_TITLE       = "FaleraOS by Elixpo: an open-source MicroPython OS for the ESP32-S3 Falera Badge";
const SITE_DESCRIPTION =
    "FaleraOS by Elixpo is an open-source MicroPython operating system for the Falera Badge, an ESP32-S3 conference badge: apps, games, an on-device App Store, OTA updates, IR, RV565 video and USB file transfer. Featured on Adafruit; OSHWA-certified open hardware.";
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:  SITE_TITLE,
    template: "%s | FaleraOS by Elixpo",
  },
  description: SITE_DESCRIPTION,
  applicationName: "FaleraOS by Elixpo",
  category: "technology",
  authors: [{ name: "Elixpo", url: "https://github.com/elixpo" }],
  creator: "Elixpo",
  publisher: "Elixpo",
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  keywords: [
  "FaleraOS",
  "FaleraOS Elixpo",
  "Falera badge",
  "Elixpo Falera Badge",
  "FaleraOS MicroPython",
  "MicroPython operating system",
  "ESP32-S3 badge",
  "ESP32-S3 operating system",
  "RV565",
  "Elixpo Badge",
  "Open Source",
  "Open Source OS",
  "Open Hardware",
  "Embedded Systems",
  "MicroPython",
  "ESP32-S3",
  "open hardware",
  "Developer Badge",
  "Conference Badge",
  "IoT",
  "Wireless Development",
  "BLE",
  "WiFi",
  "Infrared",
  "File Sharing",
  "File Transfer",
  "App Store",
  "Developer Tools",
  "Makers",
  "Hackers",
  "Electronics",
  "Hardware Projects",
  "IR quest"
  ],
  // Per-route titles override `default` via Next's metadata API;
  // robots gets allow-everywhere here because the site is fully public.
  robots: {
    index: true, follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: SITE_TITLE,
    description:  "Explore FaleraOS, the open-source operating system powering the Elixpo Badge with MicroPython, wireless connectivity, apps, developer tools, and hardware integrations for makers and developers.",
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [{
      url:     OG_IMAGE,
      width:   1280,
      height:  720,
      alt:     "FaleraOS running on the open-source ESP32-S3 Falera Badge"
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description:  "Build, hack, and create with FaleraOS—an open-source operating system for the Elixpo Badge featuring MicroPython, apps, wireless connectivity, and developer-friendly tools.",
    images: [OG_IMAGE],
  },
  // Icons — generated from public/oreo.elixpo.png (the brand mark) into a
  // full favicon set. .ico carries 16/32/48 for legacy + tab pinning; the
  // PNG sizes cover modern browsers; apple-touch + 192/512 cover iOS and
  // PWA installs. Cloudflare Pages serves each file verbatim from /public.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-48x48.png", type: "image/png", sizes: "48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false, email: false, address: false },
};

// Next 14 moved themeColor / colorScheme out of `metadata` into a
// separate `viewport` export — they're per-render rather than static.
export const viewport: Viewport = {
  themeColor: "#FBFBF8",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col text-text">
        <JsonLd data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${SITE_URL}/#organization`,
              name: "Elixpo",
              url: SITE_URL,
              logo: `${SITE_URL}/icon-512.png`,
              sameAs: [
                "https://github.com/elixpo",
                "https://github.com/elixpo/falera",
              ],
            },
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              url: SITE_URL,
              name: SITE_NAME,
              alternateName: ["FaleraOS", "Falera Badge", "OreoOS"],
              description: SITE_DESCRIPTION,
              publisher: { "@id": `${SITE_URL}/#organization` },
              inLanguage: "en",
            },
            {
              "@type": ["SoftwareApplication", "SoftwareSourceCode"],
              "@id": `${SITE_URL}/#software`,
              name: "FaleraOS",
              alternateName: ["FaleraOS by Elixpo", "Elixpo FaleraOS", "OreoOS", "Oreo OS"],
              description: SITE_DESCRIPTION,
              disambiguatingDescription: DISAMBIGUATION,
              url: SITE_URL,
              applicationCategory: "OperatingSystem",
              operatingSystem: "MicroPython 1.28 on ESP32-S3",
              codeRepository: "https://github.com/elixpo/falera",
              license: "https://github.com/elixpo/falera/blob/main/LICENSE",
              programmingLanguage: ["Python", "C", "TypeScript"],
              runtimePlatform: "MicroPython on ESP32-S3",
              author: { "@id": `${SITE_URL}/#organization` },
              publisher: { "@id": `${SITE_URL}/#organization` },
              image: `${SITE_URL}/og-banner.png`,
              sameAs: [
                WIKIDATA,
                "https://github.com/elixpo/falera",
                "https://github.com/orgs/micropython/discussions/19847",
              ],
              subjectOf: COVERAGE.filter((c) => c.date).map((c) => ({
                "@type": "NewsArticle",
                headline: c.what,
                url: c.href,
                publisher: { "@type": "Organization", name: c.who },
              })),
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            },
            {
              "@type": "Product",
              "@id": `${SITE_URL}/badge/#product`,
              name: "Falera Badge",
              alternateName: "Elixpo Falera Badge",
              description:
                "An open-source ESP32-S3 conference badge with a 2.8-inch touch screen, eight buttons, IR, a motion sensor, a speaker and microSD, running FaleraOS. Certified open source hardware by OSHWA (IN000107).",
              brand: { "@type": "Brand", name: "Elixpo" },
              manufacturer: { "@id": `${SITE_URL}/#organization` },
              url: `${SITE_URL}/badge/`,
              image: [
                "https://raw.githubusercontent.com/elixpo/falera/main/circuit/elixpo/renders/top-angle.jpg",
                `${SITE_URL}/pcb_front.jpg`,
              ],
              sameAs: [
                "https://certification.oshwa.org/in000107.html",
                "https://www.hardlabs.io/boards/elixpo--oreo",
              ],
            },
            {
              "@type": "SoftwareSourceCode",
              "@id": `${SITE_URL}/rv565/#software`,
              name: "RV565",
              description:
                "Frame-independent RGB565 video for ESP32-S3 and RP2350 SPI displays, by Elixpo. Plays FaleraOS's Gallery videos.",
              codeRepository: "https://github.com/elixpo/rv565",
              author: { "@id": `${SITE_URL}/#organization` },
              citation: "https://arxiv.org/abs/2610.35935",
              sameAs: [
                "https://arxiv.org/abs/2610.35935",
                "https://pypi.org/project/rv565/",
                "https://components.espressif.com/components/elixpo/rv565",
              ],
            },
          ],
        }} />
        <a href="#main"
           className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-pill focus:bg-text focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-bg">
          Skip to content
        </a>
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
