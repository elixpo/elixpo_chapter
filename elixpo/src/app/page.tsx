import { LandingHero } from "@/components/LandingHero";
import { AboutSection } from "@/components/AboutSection";
import { NominationSection } from "@/components/NominationSection";
import { FeaturesSection } from "@/components/FeaturesSection";
import { PackageCatalogSection } from "@/components/PackageCatalogSection";
import { ECOSYSTEM_PRODUCTS } from "@/lib/catalog";
import { serializeJsonLd } from "@/lib/seo";
import { NewsletterSection } from "@/components/NewsletterSection";
import { Contributors } from "@/components/Contributors";
import { FeatureProjectCTA } from "@/components/FeatureProjectCTA";

export const metadata = {
  alternates: { canonical: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Elixpo",
  url: "https://elixpo.com",
  logo: "https://elixpo.com/logos/logo.webp",
  description:
    "An open-source ecosystem spanning publishing, visual collaboration, AI-assisted search, identity, links, software distribution, and the Oreo open-hardware badge.",
  founder: {
    "@type": "Person",
    name: "Ayushman Bhattacharya",
    url: "https://github.com/Circuit-Overtime",
  },
  sameAs: ["https://github.com/elixpo", "https://github.com/elixpo/elixpo_chapter"],
  makesOffer: ECOSYSTEM_PRODUCTS.map((product) => ({
    "@type": "Offer",
    itemOffered: {
      "@type": product.schemaType ?? "SoftwareApplication",
      name: product.name,
      url: product.url,
      description: product.shortDescription,
      image: new URL(product.icon, "https://elixpo.com").toString(),
    },
  })),
};

export default function Home() {
  return (
    <main className="bg-black text-[#E1E0CC]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <LandingHero />
      <AboutSection />
      <NominationSection />
      <FeaturesSection />
      <PackageCatalogSection />
      <NewsletterSection />
      <Contributors />
      <FeatureProjectCTA />
    </main>
  );
}
