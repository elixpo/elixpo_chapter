import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ALL_CATALOG, findApp } from "@/data/apps";
import { AppIcon } from "@/components/AppCard";
import JsonLd from "@/components/JsonLd";
import { Card, Fact, NextStep, Section } from "@/components/ui";

/* /apps/[slug]/ — per-app detail route.
 *
 * Static export means we need every reachable URL pre-generated at
 * build time. `generateStaticParams` returns one entry per app in
 * `ALL_CATALOG`; the build emits an HTML file for each, so Cloudflare
 * Pages can serve them as plain static assets — no runtime params.
 *
 * The page itself is a server component (no `use client`) because all
 * its data is build-time-known. The hero "blurred logo" backdrop is
 * pure CSS, no canvas, so the route loads instantly with zero JS
 * cost. The header / footer animations still come along via the root
 * layout.
 */

// `dynamicParams = false` locks the route to the slugs we declare —
// any other URL 404s instead of trying to render at request time.
// Required for `output: "export"` to know what to pre-render.
export const dynamicParams = false;

export async function generateStaticParams() {
  return ALL_CATALOG.map((a) => ({ slug: a.urlSlug }));
}

// Next 15 made `params` async — it's now a Promise that must be
// awaited before its fields can be read. The shape is otherwise
// unchanged. This was the single most common Next 14 → 15 migration
// gotcha; flagged here so future edits don't drop the await.
type RouteParams = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const app = findApp(slug);
  if (!app) return { title: "Not found" };
  const canonical = `/apps/${app.urlSlug}/`;
  const fullDescription = (app.details ?? app.blurb)
    .replace(/`/g, "")
    .replace(/\s+/g, " ");
  const description = fullDescription.length > 160
    ? `${fullDescription.slice(0, 157).replace(/\s+\S*$/, "")}…`
    : fullDescription;
  return {
    title:       `${app.name} App | FaleraOS`,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: "FaleraOS",
      title:       `${app.name} App for FaleraOS`,
      description,
      images: app.pngIcon ? [{ url: app.pngIcon }] : undefined,
    },
    twitter: {
      card: "summary",
      title: `${app.name} App for FaleraOS`,
      description,
      images: app.pngIcon ? [app.pngIcon] : undefined,
    },
  };
}

export default async function AppDetail({
  params,
}: {
  params: RouteParams;
}) {
  const { slug } = await params;
  const app = findApp(slug);
  if (!app) notFound();

  // Pick a few "related" apps in the same category for the bottom
  // strip. Keep the original ordering so it's deterministic across
  // builds (no Math.random).
  const related = ALL_CATALOG
    .filter((a) => a.urlSlug !== app.urlSlug && a.category === app.category)
    .slice(0, 3);

  const repoPath = `${app.category === "store" ? "apps_market" : "apps"}/${encodeURIComponent(app.slug)}`;

  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: app.name,
        description: app.details ?? app.blurb,
        applicationCategory: app.category === "game" ? "GameApplication" : "UtilitiesApplication",
        operatingSystem: "FaleraOS",
        softwareVersion: app.version,
        image: app.pngIcon ? `https://falera.elixpo.com${app.pngIcon}` : undefined,
        url: `https://falera.elixpo.com/apps/${app.urlSlug}/`,
        author: {
          "@type": "Person",
          name: app.author,
        },
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      }} />
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://falera.elixpo.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Apps",
            item: "https://falera.elixpo.com/apps/",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: app.name,
            item: `https://falera.elixpo.com/apps/${app.urlSlug}/`,
          },
        ],
      }} />
      <div className="border-b border-border">
        <div className="container-page page-top pb-12 sm:pb-16">
          <nav aria-label="Breadcrumb" className="label mb-8">
            <Link href="/apps/" className="hover:text-primary">Apps</Link>
            <span aria-hidden="true" className="mx-2">/</span>
            <span className="text-text">{app.name}</span>
          </nav>
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
            <AppIcon app={app} size="lg" />
            <div className="max-w-3xl">
              <p className="eyebrow">{app.category} · v{app.version}</p>
              <h1 className="h-display mt-3">{app.name}</h1>
              <p className="lede mt-4 max-w-prose-site">{app.blurb}</p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={`https://github.com/elixpo/falera/tree/main/${repoPath}`} target="_blank" rel="noreferrer" className="btn-primary">
              View source ↗
            </a>
            <a href={`https://github.com/elixpo/falera/blob/main/${repoPath}/manifest.json`} target="_blank" rel="noreferrer" className="btn-ghost">
              manifest.json ↗
            </a>
            {app.category === "store" && (
              <a href={`https://github.com/elixpo/falera/tree/main/apps_market/${encodeURIComponent(app.slug)}`} target="_blank" rel="noreferrer" className="btn-ghost">
                Store entry ↗
              </a>
            )}
          </div>
        </div>
      </div>

      <Section id="about">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
          <div className="max-w-prose-site">
            <h2 className="h-title">About</h2>
            <div className="mt-6 space-y-4 leading-relaxed text-text-dim">
              {(app.details ?? app.blurb).split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
          <div className="grid content-start gap-3">
            <Fact k="Author">{app.author}</Fact>
            <Fact k="Version">v{app.version}</Fact>
            <Fact k="Category">{app.category}</Fact>
            <Fact k="Path"><span className="break-all font-mono text-sm">{repoPath.replace(/%20/g, " ")}/</span></Fact>
          </div>
        </div>
      </Section>

      {related.length > 0 && (
        <Section id="related">
          <h2 className="h-title">More in <em>{app.category}</em></h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {related.map((r) => (
              <Card key={r.urlSlug} href={`/apps/${r.urlSlug}/`} className="flex items-center gap-4 p-5">
                <AppIcon app={r} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-text group-hover:text-primary">{r.name}</span>
                  <span className="block truncate text-xs text-text-dim">{r.blurb}</span>
                </span>
              </Card>
            ))}
          </div>
        </Section>
      )}

      <NextStep
        title={<>Write an app <em>like this one.</em></>}
        body="One manifest, one shim and a src/ tree. The launcher discovers it automatically."
        href="/docs/apps/"
        cta="Read the app guide"
      />
    </>
  );
}
