import { docsMetadata } from '@/lib/docs-sections';
import { CodeBlock, DocPage } from '../_components/Doc';

export const metadata = docsMetadata('self-hosting');

export default function SelfHostingPage() {
  return (
    <DocPage
      slug="self-hosting"
      title="Self-Hosting"
      lede="Lixrl is open source under MIT. Stand up your own instance on Cloudflare Pages in about ten minutes."
    >
      <h2 id="prerequisites">Prerequisites</h2>
      <ul>
        <li>Cloudflare account with Pages and D1 enabled.</li>
        <li>Node.js 22 or newer.</li>
        <li>
          <code>wrangler</code> CLI (<code>npm i -g wrangler</code>).
        </li>
        <li>An Elixpo Accounts OAuth app (or your own OAuth provider).</li>
      </ul>

      <h2 id="clone-and-install">1. Clone and install</h2>
      <CodeBlock label="Terminal">{`git clone https://github.com/elixpo/elixpourl.git
cd elixpourl
npm install`}</CodeBlock>

      <h2 id="provision-d1">2. Provision D1</h2>
      <CodeBlock label="Terminal">{`npx wrangler d1 create elixpourl
# paste the printed database_id into wrangler.toml
npm run db:migrate:local
npm run db:migrate:remote`}</CodeBlock>

      <h2 id="configure-env">3. Configure env</h2>
      <p>
        Copy <code>.env.example</code> → <code>.env</code> and fill in your OAuth client ID/secret, the session secret,
        and the public site URL.
      </p>

      <h2 id="deploy">4. Deploy</h2>
      <CodeBlock label="Terminal">./deploy.sh build deploy</CodeBlock>
      <p>
        The script builds with <code>@cloudflare/next-on-pages</code>, deploys to Cloudflare Pages on the{' '}
        <code>main</code> branch (override with <code>DEPLOY_BRANCH</code>), and refuses to run as root.
      </p>

      <h2 id="updates">Staying up to date</h2>
      <p>Pull from upstream, re-run migrations, rebuild. We keep migrations gapless so updates are predictable.</p>

      <h2 id="license-and-branding">License and branding</h2>
      <p>
        Code is MIT. The Elixpo wordmark, the Oreo mascot, and the brand palette stay with us — see{' '}
        <code>LICENSES/exceptions/Oreo-trademarks</code> in the repo. Self-hosted instances should ship with your own
        brand.
      </p>
    </DocPage>
  );
}
