import { docsMetadata } from '@/lib/docs-sections';
import Link from 'next/link';
import { Callout, CodeBlock, DocPage, DocTable } from '../_components/Doc';

export const metadata = docsMetadata('keys');

export default function KeysPage() {
  return (
    <DocPage
      slug="keys"
      title="API Keys"
      lede="API keys authenticate machine-to-machine requests. Human users sign in through Elixpo Accounts SSO — keys are only for code that calls Lixrl on your behalf."
    >
      <h2 id="creating-a-key">Creating a key</h2>
      <p>
        Open <Link href="/profile/keys">Profile → API Keys</Link> and click <strong>Create key</strong>. Name it after
        the app or environment it&apos;s for (e.g. <em>blog-prod</em>, <em>ci-pipeline</em>) so you can rotate it later
        without guesswork.
      </p>

      <h2 id="format">Format</h2>
      <p>
        Keys contain 32 cryptographically random alphanumeric characters with the prefix <code>elu_</code>:
      </p>
      <CodeBlock label="Example key">elu_a1b2c3d4e5f67890abcdef1234567890</CodeBlock>
      <Callout tone="warning" title="Lost keys cannot be recovered">
        We hash keys on the server with SHA-256 and only the prefix is kept in the clear. If you lose a key, revoke it
        and mint a new one.
      </Callout>

      <h2 id="sending-the-key">Sending the key</h2>
      <CodeBlock label="Request header">Authorization: Bearer elu_YOUR_API_KEY</CodeBlock>
      <p>
        Anything else (query strings, cookies, custom headers) is ignored — keys go in <code>Authorization</code> only.
      </p>

      <h2 id="rotation">Rotation</h2>
      <ul>
        <li>Rotate keys at least every 90 days, or immediately if you suspect a leak.</li>
        <li>Create the new key first, deploy it, verify it works, then revoke the old one.</li>
        <li>Multiple active keys per account are fine — they&apos;re cheap to mint and revoke.</li>
      </ul>

      <h2 id="scopes">Scopes</h2>
      <DocTable
        caption="API key scopes"
        head={['Scope', 'Allows']}
        rows={[
          ['read', 'List, detail, analytics, and export requests.'],
          ['read,write', 'Everything in read, plus create, update, disable, and delete links.'],
        ]}
      />
      <p>A read-only key is rejected from mutation endpoints.</p>

      <h2 id="limits">Limits</h2>
      <p>
        Your tier&apos;s quota applies per account, not per key. See <Link href="/pricing">Pricing</Link> for current
        limits.
      </p>
    </DocPage>
  );
}
