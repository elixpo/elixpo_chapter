import type { Metadata, Viewport } from 'next';
import './globals.css';
import {
  BRAND_COLOR,
  DEFAULT_DESCRIPTION,
  DEFAULT_KEYWORDS,
  DEFAULT_TITLE,
  FREE_OFFER,
  jsonLd,
  OG_IMAGE,
  ORGANIZATION_JSON_LD,
  SITE_NAME,
  SITE_URL,
} from '@/lib/seo';

// Typography follows research.elixpo: system Arial/Helvetica for UI,
// Georgia for display accents, ui-monospace for code — no web-font download.
const siteUrl = SITE_URL;
const title = DEFAULT_TITLE;
const description = DEFAULT_DESCRIPTION;

// Search-engine ownership verification ("HTML tag" method). Set the content
// value each console gives you and rebuild; empty → no tag emitted. DNS-TXT
// verification is an alternative that needs no code change.
//   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION  — Google Search Console
//   NEXT_PUBLIC_BING_SITE_VERIFICATION    — Bing Webmaster Tools (msvalidate.01)
//   NEXT_PUBLIC_YANDEX_SITE_VERIFICATION  — Yandex Webmaster
const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || 'BNHixOaTOql4f1ae0czjnwhWoozDBupjA8HSPT8etAg';
const bingSiteVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || '';
const yandexSiteVerification = process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION || '';

const verification: Metadata['verification'] = {
  ...(googleSiteVerification ? { google: googleSiteVerification } : {}),
  ...(yandexSiteVerification ? { yandex: yandexSiteVerification } : {}),
  ...(bingSiteVerification ? { other: { 'msvalidate.01': bingSiteVerification } } : {}),
};

export const viewport: Viewport = {
  themeColor: BRAND_COLOR,
  colorScheme: 'light dark',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: '%s | Lixrl',
  },
  description,
  applicationName: SITE_NAME,
  manifest: '/manifest.webmanifest',
  keywords: DEFAULT_KEYWORDS,
  authors: [{ name: 'Elixpo', url: 'https://elixpo.com' }],
  creator: 'Elixpo',
  publisher: 'Elixpo',
  category: 'technology',
  ...(Object.keys(verification).length ? { verification } : {}),
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: SITE_NAME,
    title,
    description,
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [OG_IMAGE.url],
    creator: '@elixpo',
    site: '@elixpo',
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'default',
  },
  // Icons declared explicitly so they're emitted as <link> tags pointing
  // at static files in public/. Putting these files under app/ (the
  // Next.js icon convention) would compile them into route handlers,
  // which Cloudflare Pages can't run because they default to the Node
  // runtime — the same break that hit accounts.elixpo earlier.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon0.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon1.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    ORGANIZATION_JSON_LD,
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: SITE_NAME,
      alternateName: ['lixrl.com', 'Lixrl URL Shortener'],
      url: siteUrl,
      description,
      inLanguage: 'en',
      publisher: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@type': ['WebApplication', 'SoftwareApplication'],
      '@id': `${siteUrl}/#application`,
      name: 'Lixrl URL Shortener',
      url: siteUrl,
      description,
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'URL shortener',
      operatingSystem: 'Any',
      browserRequirements: 'Requires a modern web browser',
      isAccessibleForFree: true,
      image: `${siteUrl}${OG_IMAGE.url}`,
      publisher: { '@id': `${siteUrl}/#organization` },
      featureList: [
        'Free URL shortener',
        'Custom short links and slugs',
        'Branded lixrl.com subdomains',
        'Free QR code generator',
        'Tracked QR code scans',
        'Link click analytics: countries, referrers, devices',
        'Expiring links',
        'REST API with scoped API keys',
        'Developer CLI for short links and QR codes',
        'Open source and self-hostable',
      ],
      offers: FREE_OFFER,
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="overflow-x-hidden"
      suppressHydrationWarning
    >
      <body className="antialiased overflow-x-hidden font-sans">
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
        />
      </body>
    </html>
  );
}
