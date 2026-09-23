import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, SOCIAL_IMAGE, SPACE_URL } from '@/lib/site-metadata';

export default function StructuredData() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'Elixpo',
        url: 'https://elixpo.com',
        sameAs: ['https://github.com/pollinations', 'https://pollinations.ai'],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: 'en',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#application`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: 'SearchApplication',
        operatingSystem: 'Any',
        isAccessibleForFree: true,
        image: `${SITE_URL}${SOCIAL_IMAGE.url}`,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        codeRepository: 'https://github.com/pollinations/lixsearch',
        sameAs: [SPACE_URL, 'https://github.com/pollinations/lixsearch'],
        installUrl: SPACE_URL,
        featureList: [
          'Live web search', 'Cited answers', 'Deep research',
          'OpenAI-compatible API', 'Streaming responses', 'Semantic memory',
        ],
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
