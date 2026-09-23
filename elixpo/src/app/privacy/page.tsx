import { createPageMetadata } from "@/lib/seo";
import { LegalHero } from "@/components/LegalHero";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";
import { VIDEOS } from "@/lib/media";

export const metadata = createPageMetadata({
  title: "Privacy Policy",
  description: "How Elixpo handles your data—a privacy-first approach to accounts, hosted services, open-source tools, and third-party integrations.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <>
      <LegalHero
        title="Privacy Policy"
        subtitle="Privacy-first by design. Here's exactly what we do - and don't - collect across the Elixpo ecosystem."
        video={VIDEOS.accounts}
        updated="June 2026"
        heightClass="h-[80vh] min-h-[560px]"
      />

      <article className="prose prose-invert max-w-3xl mx-auto px-6 py-16 prose-headings:font-serif prose-headings:text-white prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-white">
        <h2>Our approach</h2>
        <p>
          Elixpo operates under a <strong>privacy-first framework</strong>. Our
          client-side tools and public generation integrations proxy requests
          transparently, without storing prompt logs or building intrusive
          tracking profiles.
        </p>

        <h2>What we don&rsquo;t collect</h2>
        <ul>
          <li>We do not store your prompts or generation history.</li>
          <li>We do not sell or share personal data with advertisers.</li>
          <li>We do not require sign-up to use our public, open tools.</li>
        </ul>

        <h2>What we may process</h2>
        <p>
          To deliver features, minimal technical data (such as a request being
          proxied to an AI provider, or basic, aggregate usage needed to keep
          public APIs stable) may be processed transiently. Where you choose to
          create an Elixpo Account, we store only what&rsquo;s needed to provide
          that account.
        </p>

        <h2>Third-party services</h2>
        <p>
          Some features rely on infrastructure and compute partners - including{" "}
          <strong>Pollinations</strong>, Vercel, Cloudflare, DigitalOcean, and
          Firebase. When a request is routed to a provider to fulfil a feature,
          that provider&rsquo;s own privacy terms apply to that request.
        </p>

        <h2>Cookies &amp; analytics</h2>
        <p>
          We keep cookies to the minimum required for functionality. We avoid
          invasive cross-site tracking.
        </p>

        <h2>Your rights</h2>
        <p>
          If you hold an Elixpo Account, you can request access to or deletion of
          your account data at any time by contacting us.
        </p>

        <h2>Changes</h2>
        <p>
          We may update this policy; the &ldquo;last updated&rdquo; date above
          always reflects the current version.
        </p>

        <h2>Contact</h2>
        <p>
          Privacy questions? Email{" "}
          <a href={`mailto:${ELIXPO_LINKS.email}`}>{ELIXPO_LINKS.email}</a> or reach
          us in{" "}
          <a href={ELIXPO_LINKS.discussions}>GitHub Discussions</a>.
        </p>
      </article>
    </>
  );
}
