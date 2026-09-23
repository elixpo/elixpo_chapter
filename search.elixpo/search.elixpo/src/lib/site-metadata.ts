import type { Metadata } from 'next';

export const SITE_URL = 'https://search.elixpo.com';
export const SITE_NAME = 'OreoLook';
export const SPACE_URL =
  process.env.NEXT_PUBLIC_OREOLOOK_SPACE_URL || 'https://huggingface.co/spaces/Elixpo/OreoLook';
export const SITE_TITLE = 'OreoLook — Search the web. Get the answer. Keep the receipts.';
export const SITE_DESCRIPTION =
  'OreoLook is an open-source AI answer engine that searches live sources, reads the useful pages, and streams a grounded answer with citations. Use it through Pollinations or any OpenAI-compatible client.';
export const SOCIAL_IMAGE = {
  url: '/og-image.png',
  width: 1280,
  height: 720,
  alt: 'OreoLook — the open-source AI answer engine with receipts.',
};

export function absoluteUrl(path = '/') {
  return new URL(path, SITE_URL).toString();
}

export function pageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, images: [SOCIAL_IMAGE] },
    twitter: { title, description, images: [SOCIAL_IMAGE.url] },
  };
}
