import { docsMetadata } from '@/lib/docs-sections';
import Link from 'next/link';
import { Callout, CodeBlock, DocPage, DocTable, Steps } from '../_components/Doc';

export const runtime = 'edge';

export const metadata = docsMetadata('subdomains');

export default function SubdomainsDocsPage() {
  return (
    <DocPage
      slug="subdomains"
      title={
        <>
          Branded subdomains, <em>your name on every link.</em>
        </>
      }
      lede={
        <>
          Publish paid-plan links at a single-level address such as <code>brand.lixrl.com/go</code> while keeping a
          canonical <code>lixrl.com</code> fallback.
        </>
      }
    >
      <h2 id="availability">Availability and limits</h2>
      <DocTable
        caption="Branded subdomain allowance by plan"
        head={['Plan', 'Branded subdomains']}
        keyColumn={false}
        rows={[
          ['Free', 'Cannot claim or activate subdomains'],
          ['Pro', 'One branded subdomain'],
          ['Business', 'Three branded subdomains'],
          ['Enterprise', 'Arranged separately'],
        ]}
      />
      <p>Labels are 3–32 lowercase letters, numbers, or interior hyphens with no additional dots.</p>

      <h2 id="setup">Setup</h2>
      <Steps>
        <li>
          Open <Link href="/dashboard/domains">Dashboard → Subdomains</Link>.
        </li>
        <li>Claim an available label. Claims are atomic; another account cannot hold the same live hostname.</li>
        <li>
          Select <strong>Verify route</strong>. Lixrl checks wildcard DNS, TLS, the redirect Worker, and the claim token
          over HTTPS.
        </li>
        <li>Make the verified hostname your default or map individual existing links to branded codes.</li>
      </Steps>
      <Callout title="No DNS changes">
        No customer DNS changes are required because the hostname remains under lixrl.com.
      </Callout>

      <h2 id="api">API workflow</h2>
      <CodeBlock label="cURL">{`# Claim
curl -X POST https://lixrl.com/api/subdomains \\
  -H "Authorization: Bearer elu_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"label":"brand"}'

# Verify wildcard routing and TLS
curl -X POST https://lixrl.com/api/subdomains/42/verify \\
  -H "Authorization: Bearer elu_YOUR_API_KEY"

# Map an owned fallback link to a domain-specific code
curl -X POST https://lixrl.com/api/subdomains/42/links \\
  -H "Authorization: Bearer elu_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url_code":"a1b2c3","short_code":"launch"}'`}</CodeBlock>

      <h2 id="routing">Routing and isolation</h2>
      <p>
        Branded links are resolved by hostname and code. The same code can belong to different verified subdomains. D1
        checks ownership, plan status, domain state, and link state before a cached redirect is used; cache keys
        include both the domain ID and its revision.
      </p>
      <p>
        Destination safety checks, expiry, bot filtering, click analytics, QR destinations, and API ownership rules
        remain the same as canonical links.
      </p>

      <h2 id="lifecycle">Removal, downgrade, and recovery</h2>
      <p>
        Removing a claim or losing the paid entitlement disables branded routing and increments its route revision
        immediately. Canonical <code>lixrl.com/code</code> links continue to work. A renewed account must verify and
        reactivate a suspended claim explicitly.
      </p>
      <p>
        A failed verification normally means wildcard DNS, certificate issuance, or the router deployment is not ready.
        Wait for propagation, retry verification, and check the production deployment logs. Removed names require a
        fresh claim and verification before reuse.
      </p>
    </DocPage>
  );
}
