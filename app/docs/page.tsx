import { DOCS_SECTIONS, docsHref, docsMetadata } from '@/lib/docs-sections';
import Link from 'next/link';
import { DocCards, DocPage, Facts } from './_components/Doc';

export const metadata = docsMetadata('');

export default function OverviewPage() {
  return (
    <DocPage
      slug=""
      title={
        <>
          Build with Lixrl, <em>from link to insight.</em>
        </>
      }
      lede="Lixrl is an open URL shortener built on Cloudflare's edge: short links, click analytics, and a developer-first REST API and CLI — for any app you ship, Elixpo or not."
    >
      <Facts
        items={[
          ['Base URL', 'https://lixrl.com'],
          ['API prefix', '/api'],
          ['Auth', 'Bearer API key'],
        ]}
      />

      <h2 id="get-started">Get started</h2>
      <p>Choose the dashboard, Developer CLI, or API depending on how you work. Every section is listed here and in the sidebar.</p>
      <DocCards
        items={DOCS_SECTIONS.filter((s) => s.slug).map((s) => ({
          href: docsHref(s.slug),
          title: s.label,
          body: s.summary,
          kicker: s.group,
        }))}
      />

      <h2 id="what-you-get">What you get</h2>
      <ul>
        <li>Edge-native redirects — short links resolve through Cloudflare&apos;s global network.</li>
        <li>Click analytics — counts, geo, referrers, devices, browsers; no third-party script.</li>
        <li>REST API + API keys with scoped permissions.</li>
        <li>Custom slugs, bulk deletion, activation controls, and link expiry.</li>
        <li>Sign in via Elixpo Accounts SSO — no separate password.</li>
      </ul>

      <h2 id="how-auth-works">How sign-in works</h2>
      <p>
        Lixrl doesn&apos;t store passwords. Every user signs in through{' '}
        <a href="https://accounts.elixpo.com">Elixpo Accounts SSO</a> — the same login that opens chat, art,
        blogs, and the rest of the ecosystem. Hit <a href="/api/auth/login">/api/auth/login</a> to start the
        OAuth flow; we handle the callback, set the session cookie, and bounce you to your dashboard.
      </p>
      <p>
        For machine-to-machine access, mint an <Link href="/docs/keys">API key</Link> from your dashboard and send
        it in the <code>Authorization</code> header.
      </p>

      <h2 id="conventions">Conventions</h2>
      <ul>
        <li>
          Base URL: <code>https://lixrl.com</code>
        </li>
        <li>
          API path prefix: <code>/api</code>
        </li>
        <li>All requests/responses are JSON unless stated otherwise.</li>
        <li>
          Errors follow the format <code>{'{ "error": "Human-readable message" }'}</code> — use the HTTP status for
          program flow and see the <Link href="/docs/errors">Error Reference</Link>.
        </li>
      </ul>
    </DocPage>
  );
}
