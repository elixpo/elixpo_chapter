import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";
import { ECOSYSTEM_PRODUCTS, getProduct } from "@/lib/catalog";
import { serializeJsonLd } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return ECOSYSTEM_PRODUCTS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = getProduct((await params).slug);
  if (!product) return {};
  const path = `/projects/${product.slug}`;
  return {
    title: `${product.name} — ${product.eyebrow}`,
    description: product.shortDescription,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      title: `${product.name} | Elixpo`,
      description: product.shortDescription,
      images: [{ url: "/og-image.webp", width: 1852, height: 813, alt: `${product.name} by Elixpo` }],
    },
    twitter: { card: "summary_large_image", title: `${product.name} | Elixpo`, description: product.shortDescription, images: ["/og-image.webp"] },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = getProduct((await params).slug);
  if (!product) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": product.schemaType ?? "SoftwareApplication",
    name: product.name,
    description: product.description,
    url: product.url,
    image: new URL(product.icon, "https://elixpo.com").toString(),
    ...(product.schemaType !== "Product" && { applicationCategory: product.eyebrow, operatingSystem: "Web" }),
    isPartOf: { "@type": "Organization", name: "Elixpo", url: "https://elixpo.com" },
  };

  return (
    <main className="bg-black text-[#E1E0CC] pt-32 pb-24 px-4 sm:px-6 lg:px-8 min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <article className="max-w-5xl mx-auto">
        <Link href="/projects" className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#DEDBC8]/50 hover:text-white transition-colors mb-14">
          <ArrowLeft size={13} /> All products
        </Link>

        <header className="max-w-4xl mb-16">
          <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-primary/75 block mb-4">{product.eyebrow}</span>
          <h1 className="text-5xl sm:text-6xl md:text-8xl font-serif italic text-white tracking-tight mb-7">{product.name}</h1>
          <p className="text-xl sm:text-2xl text-[#DEDBC8]/75 leading-relaxed">{product.shortDescription}</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_0.8fr] gap-6">
          <section className="rounded-2xl bg-[#111] border border-white/10 p-6 sm:p-9">
            <h2 className="text-xs uppercase tracking-[0.18em] font-mono text-white/45 mb-6">About the product</h2>
            <p className="text-base sm:text-lg text-[#DEDBC8]/80 leading-relaxed mb-10">{product.description}</p>
            <h2 className="text-xs uppercase tracking-[0.18em] font-mono text-white/45 mb-6">Core capabilities</h2>
            <ul className="space-y-4">
              {product.capabilities.map((capability) => (
                <li key={capability} className="flex gap-3 text-sm text-[#DEDBC8]/75 leading-relaxed">
                  <Check size={15} className="text-primary mt-0.5 shrink-0" /> {capability}
                </li>
              ))}
            </ul>
          </section>

          <aside className="rounded-2xl bg-[#111] border border-white/10 p-6 sm:p-8 h-fit">
            <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-white/40 mb-3">Designed for</p>
            <p className="text-sm text-[#DEDBC8]/75 leading-relaxed mb-8">{product.audience}</p>
            {product.relatedPackages.length > 0 && (
              <div className="mb-8">
                <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-white/40 mb-3">Related npm packages</p>
                <ul className="space-y-2">{product.relatedPackages.map((name) => <li key={name} className="text-xs font-mono text-primary/80">{name}</li>)}</ul>
              </div>
            )}
            <a href={product.url} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-black font-semibold px-5 py-3 text-sm hover:opacity-90 transition-opacity">
              Open {product.name} <ArrowUpRight size={15} />
            </a>
          </aside>
        </div>
      </article>
    </main>
  );
}
