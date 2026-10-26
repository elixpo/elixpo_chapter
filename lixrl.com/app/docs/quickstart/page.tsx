import { docsMetadata } from '@/lib/docs-sections';
import Link from 'next/link';
import { CodeBlock, DocCards, DocPage } from '../_components/Doc';

export const metadata = docsMetadata('quickstart');

export default function QuickstartPage() {
  return (
    <DocPage
      slug="quickstart"
      title={
        <>
          Your first short link, <em>in five minutes.</em>
        </>
      }
      lede="Sign in through Elixpo Accounts, mint an API key, and shorten a URL from the command line."
    >
      <h2 id="1-sign-in">1. Sign in with Elixpo</h2>
      <p>
        Lixrl uses your Elixpo account — no separate password to manage. Hit the sign-in button in the navbar or go
        directly to <a href="/api/auth/login">/api/auth/login</a>. You&apos;ll be redirected back to your dashboard
        after the OAuth round-trip completes.
      </p>

      <h2 id="2-mint-an-api-key">2. Mint an API key</h2>
      <p>
        From your dashboard, open <Link href="/profile/keys">Profile → API Keys</Link> and click{' '}
        <strong>Create key</strong>. Copy the key the moment it appears — we hash it on save and you won&apos;t see
        it again.
      </p>
      <CodeBlock label="Example key">elu_a1b2c3d4e5f6…  (example, your key will differ)</CodeBlock>

      <h2 id="3-shorten-your-first-url">3. Shorten your first URL</h2>
      <p>
        Send a <code>POST /api/urls</code> with your destination URL and (optionally) a custom slug.
      </p>
      <CodeBlock label="cURL">{`curl -X POST https://lixrl.com/api/urls \\
  -H "Authorization: Bearer elu_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/your-long-url",
    "title": "Launch announcement",
    "custom_code": "launch"
  }'`}</CodeBlock>
      <p>You&apos;ll get back the resolved short link:</p>
      <CodeBlock label="201 Created">{`{
  "short_url": "https://lixrl.com/launch",
  "short_code": "launch",
  "original_url": "https://example.com/your-long-url",
  "title": "Launch announcement",
  "created_at": "2026-03-20T12:00:00Z"
}`}</CodeBlock>

      <h2 id="4-watch-clicks">4. Watch clicks roll in</h2>
      <p>
        Every redirect is tracked on Cloudflare&apos;s edge. Pull analytics for any link with{' '}
        <code>GET /api/urls/{'{code}'}/analytics</code> or open it in your dashboard for the visual breakdown — see{' '}
        <Link href="/docs/analytics">Click Analytics</Link>.
      </p>

      <h2 id="whats-next">What&apos;s next</h2>
      <DocCards
        items={[
          { href: '/docs/api', title: 'Shortening API reference', body: 'All endpoints and parameters.' },
          { href: '/docs/keys', title: 'API Keys', body: 'Rotation, scopes, and key hygiene.' },
          { href: '/docs/webhooks', title: 'Webhooks', body: 'Get notified when a link is created or clicked.' },
        ]}
      />
    </DocPage>
  );
}
