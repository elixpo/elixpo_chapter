import type { Metadata } from 'next';

/**
 * Shared SEO primitives. Edge-safe: no Node APIs, pure data.
 *
 * Every public page should build its metadata through `buildMetadata` so
 * canonical URLs, Open Graph, Twitter cards, and robots directives stay
 * consistent. JSON-LD helpers return plain objects; render them with
 * `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(obj) }} />`.
 */

export const SITE_URL = 'https://lixrl.com';
export const SITE_NAME = 'Lixrl';
export const BRAND_COLOR = '#3a65c7';
export const OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Lixrl — free URL shortener, QR code generator, and link analytics',
};
export const REPO_URL = 'https://github.com/elixpo/lixrl.com';
export const CLI_PACKAGE = '@elixpo/lixrl-cli';
export const CLI_INSTALL = `npm install --global ${CLI_PACKAGE}`;

export const DEFAULT_TITLE = 'Lixrl — Free URL Shortener, QR Code Generator & Link Analytics';
export const DEFAULT_DESCRIPTION =
  'Lixrl is a free, open URL shortener and QR code generator. Create custom short links, branded subdomains, and tracked QR codes, then measure every click with privacy-friendly link analytics, a REST API, and a developer CLI.';

export const DEFAULT_KEYWORDS = [
  'url shortener',
  'link shortener',
  'free url shortener',
  'custom short links',
  'free custom short links',
  'branded short links',
  'short url generator',
  'qr code generator',
  'free qr code generator',
  'url to qr code',
  'tracked qr codes',
  'link analytics',
  'click tracking',
  'link management',
  'url shortener api',
  'url shortener cli',
  'open source url shortener',
  'bitly alternative',
  'tinyurl alternative',
  'dub alternative',
];

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/' ? SITE_URL : `${SITE_URL}${normalized}`;
}

export interface BuildMetadataInput {
  title: string;
  description: string;
  /** Site-relative path, e.g. `/pricing`. Used for canonical + og:url. */
  path: string;
  keywords?: string[];
  /** Use the title verbatim instead of applying the `%s | Lixrl` template. */
  absoluteTitle?: boolean;
  /** Mark the page noindex (auth-gated, utility, or error pages). */
  noIndex?: boolean;
  ogType?: 'website' | 'article';
}

export function buildMetadata({
  title,
  description,
  path,
  keywords,
  absoluteTitle = false,
  noIndex = false,
  ogType = 'website',
}: BuildMetadataInput): Metadata {
  const socialTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    alternates: { canonical: path },
    openGraph: {
      type: ogType,
      locale: 'en_US',
      siteName: SITE_NAME,
      url: path,
      title: socialTitle,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@elixpo',
      creator: '@elixpo',
      title: socialTitle,
      description,
      images: [OG_IMAGE.url],
    },
    robots: noIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : { index: true, follow: true },
  };
}

/** Metadata for pages that must never be indexed (dashboard, admin, login...). */
export function noIndexMetadata(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

/** Serialize JSON-LD safely for inline `<script>` tags. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

export function howToJsonLd(input: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
}) {
  return {
    '@type': 'HowTo',
    name: input.name,
    description: input.description,
    step: input.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

export const ORGANIZATION_JSON_LD = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: 'Elixpo',
  url: 'https://elixpo.com',
  logo: `${SITE_URL}/icon1.png`,
  email: 'hello@elixpo.com',
  sameAs: ['https://github.com/elixpo', REPO_URL, `https://www.npmjs.com/package/${CLI_PACKAGE}`],
};

export const FREE_OFFER = {
  '@type': 'Offer',
  price: '0',
  priceCurrency: 'USD',
  description: 'Free plan — short links, unlimited basic QR codes, and click totals',
};

export const CLI_SOFTWARE_JSON_LD = {
  '@type': 'SoftwareApplication',
  '@id': `${SITE_URL}/docs/cli#software`,
  name: 'Lixrl CLI',
  alternateName: CLI_PACKAGE,
  description:
    'Command-line URL shortener and QR code generator. Create short links, export click analytics, manage API keys and branded subdomains, and render QR codes from your terminal or CI.',
  url: `${SITE_URL}/docs/cli`,
  downloadUrl: `https://www.npmjs.com/package/${CLI_PACKAGE}`,
  installUrl: `https://www.npmjs.com/package/${CLI_PACKAGE}`,
  applicationCategory: 'DeveloperApplication',
  applicationSubCategory: 'URL shortener CLI',
  operatingSystem: 'macOS, Linux, Windows',
  softwareRequirements: 'Node.js 20 or newer',
  softwareHelp: `${SITE_URL}/docs/cli`,
  codeRepository: `${REPO_URL}/tree/main/packages/lixrl-cli`,
  license: 'https://opensource.org/licenses/MIT',
  publisher: { '@id': `${SITE_URL}/#organization` },
  offers: { ...FREE_OFFER, description: `Free and open source. Install with: ${CLI_INSTALL}` },
};
