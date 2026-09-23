import App from '../src/index';
import { getSession } from '../lib/auth';
import { listPublicStories, publicStoryPath } from '../lib/publicDiscovery';
import { safeJsonLd } from '../src/utils/seoContent';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export const metadata = {
  // Absolute: this is the landing page, so it carries the full brand statement and
  // must not pick up the "%s | LixBlogs" template on top of it.
  title: { absolute: 'LixBlogs: Open-source blogging and publishing platform' },
  description:
    'Read stories, technical tutorials and ideas from independent writers on LixBlogs, or create and automate your own publication from the web, CLI or API.',
  alternates: { canonical: 'https://blogs.elixpo.com' },
  openGraph: {
    type: 'website',
    title: 'LixBlogs: Open-source blogging and publishing platform',
    description: 'Write, collaborate and publish from the web, CLI or API. Explore original stories from independent writers, developers and teams.',
    url: 'https://blogs.elixpo.com',
    siteName: 'LixBlogs',
    images: ['/og-image.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LixBlogs: Open-source blogging and publishing platform',
    description: 'Write, collaborate and publish from the web, CLI or API.',
    images: ['/og-image.jpg'],
  },
};

export default async function Home() {
  const [discovery, session] = await Promise.all([
    listPublicStories({ page: 1, pageSize: 12 }).catch(() => ({ stories: [] })),
    getSession().catch(() => null),
  ]);
  const stories = discovery.stories || [];
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Recent stories on LixBlogs',
    itemListElement: stories.slice(0, 12).flatMap((story, index) => {
      const path = publicStoryPath(story);
      return path ? [{
        '@type': 'ListItem',
        position: index + 1,
        name: story.title,
        url: `https://blogs.elixpo.com${path}`,
      }] : [];
    }),
  };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(itemList) }} />
    <App initialPosts={stories} showBrandIntro={!session?.userId} />
  </>;
}
