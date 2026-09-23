import { createPageMetadata } from "@/lib/seo";
import { LegalHero } from "@/components/LegalHero";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";
import { VIDEOS } from "@/lib/media";

export const metadata = createPageMetadata({
  title: "Terms of Service",
  description: "Read the terms governing Elixpo's hosted services, open-source tools, software packages, acceptable use, licensing, and reserved brand rights.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <>
      <LegalHero
        title="Terms of Service"
        subtitle="The terms that govern your use of the Elixpo ecosystem - our open-source tools, packages, and services."
        video={VIDEOS.sketch}
        updated="June 2026"
      />

      <article className="prose prose-invert max-w-3xl mx-auto px-6 py-16 prose-headings:font-serif prose-headings:text-white prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-white">
        <h2>1. Acceptance of terms</h2>
        <p>
          By accessing or using any Elixpo project - including Elixpo Art, Elixpo
          Blogs, LixSketch, LixEditor, Elixpo Chat, Elixpo Search, Elixpo
          Accounts, and related tools - you agree to these Terms. If you do not
          agree, please do not use the services.
        </p>

        <h2>2. Open source &amp; licensing</h2>
        <p>
          Elixpo is open source. Source code is provided under the{" "}
          <strong>MIT License (with Oreo-trademark exception)</strong> and visual
          assets under <strong>CC-BY-4.0</strong>, as set out in our{" "}
          <a href={`${ELIXPO_LINKS.githubChapter}/blob/main/LICENSE`}>LICENSE</a>.
          The Oreo mascot, the chest E-badge, and the &ldquo;Elixpo&rdquo; and
          &ldquo;Oreo&rdquo; names and brand palette are reserved and not granted
          for use outside Elixpo-aligned projects.
        </p>

        <h2>3. Acceptable use</h2>
        <p>
          You agree not to misuse the services: no unlawful activity, no attempts
          to disrupt or overload our infrastructure, and no use of generative
          features to produce harmful, infringing, or abusive content. We may
          rate-limit or restrict access to keep public APIs stable for everyone.
        </p>

        <h2>4. User content</h2>
        <p>
          You retain ownership of content you create with our tools. You are
          responsible for ensuring you have the rights to any inputs you provide,
          and for how you use the outputs.
        </p>

        <h2>5. No warranty</h2>
        <p>
          The services are provided <strong>&ldquo;as is&rdquo;</strong>, without
          warranties of any kind. As a community-run, free, open-source project we
          do not guarantee uptime, availability, or fitness for any particular
          purpose.
        </p>

        <h2>6. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, the Elixpo maintainers and
          contributors are not liable for any damages arising from your use of the
          services.
        </p>

        <h2>7. Changes</h2>
        <p>
          We may update these Terms over time. Material changes will be reflected
          by the &ldquo;last updated&rdquo; date above. Continued use after changes
          constitutes acceptance.
        </p>

        <h2>8. Contact</h2>
        <p>
          Questions about these Terms? Reach us at{" "}
          <a href={`mailto:${ELIXPO_LINKS.email}`}>{ELIXPO_LINKS.email}</a> or open
          a thread in our{" "}
          <a href={ELIXPO_LINKS.discussions}>GitHub Discussions</a>.
        </p>
      </article>
    </>
  );
}
