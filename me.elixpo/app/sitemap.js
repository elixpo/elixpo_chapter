import { getContentLastModified, getPortfolioPersons } from "@/lib/content";
import {
  getAbsoluteUrl,
  getMemberImagePath,
  getMemberSectionImagePath,
  isMemberSectionIndexable,
  MEMBER_SECTION_SLUGS,
  SITE_URL,
} from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap() {
  const memberPages = getPortfolioPersons().flatMap((person) => {
    const sections = MEMBER_SECTION_SLUGS.filter((section) =>
      isMemberSectionIndexable(person, section),
    );

    return [
      {
        url: getAbsoluteUrl(`/${person}`),
        lastModified: getContentLastModified(`content/${person}`, `public/assets/${person}`),
        changeFrequency: "weekly",
        priority: 0.9,
        images: [getAbsoluteUrl(getMemberImagePath(person))],
      },
      ...sections.map((section) => ({
        url: getAbsoluteUrl(`/${person}/${section}`),
        lastModified: getContentLastModified(
          `content/${person}/${section}.json`,
          `content/${person}/profile.json`,
        ),
        changeFrequency: "weekly",
        priority: 0.7,
        images: [getAbsoluteUrl(getMemberSectionImagePath(person, section))],
      })),
    ];
  });

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: getContentLastModified("content", "app/page.js", "components/LandingClient.js"),
      changeFrequency: "daily",
      priority: 1,
      images: [getAbsoluteUrl("/og-image.webp")],
    },
    ...memberPages,
  ];
}
