import { docsMetadata } from '@/lib/docs-sections';
import {
  breadcrumbJsonLd,
  CLI_INSTALL,
  CLI_SOFTWARE_JSON_LD,
  howToJsonLd,
  jsonLd,
} from '@/lib/seo';
import Link from 'next/link';
import { Callout, CodeBlock, DocPage, Steps } from '../_components/Doc';

export const runtime = 'edge';

export const metadata = docsMetadata('cli');

export default function CliDocsPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      CLI_SOFTWARE_JSON_LD,
      howToJsonLd({
        name: 'Shorten a URL from the command line with Lixrl',
        description: 'Install the Lixrl CLI, sign in, and create a short link and QR code from your terminal.',
        steps: [
          { name: 'Install the CLI', text: CLI_INSTALL },
          { name: 'Sign in', text: 'Run lixrl login and approve the request in your browser.' },
          { name: 'Shorten a URL', text: 'Run lixrl urls create https://example.com/launch' },
          { name: 'Generate a QR code', text: 'Run lixrl qr https://example.com --format png --output launch.png' },
        ],
      }),
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Docs', path: '/docs' },
        { name: 'Developer CLI', path: '/docs/cli' },
      ]),
    ],
  };


  return (
    <DocPage
      slug="cli"
      title={
        <>
          Short links and QR codes <em>from your terminal.</em>
        </>
      }
      lede="Create short URLs, generate QR codes, export analytics, and manage every production link from one command line. Keep work moving without switching between link tools, dashboards, and manual copy-paste steps."
      actions={
        <>
          <a
            href="https://www.npmjs.com/package/@elixpo/lixrl-cli"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            View npm package<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <Link href="#sign-in" className="btn-secondary">
            See secure sign-in
          </Link>
        </>
      }
    >
      <h2 id="install">Install</h2>
      <p>
        Node.js 20 or newer is required. The package <code>@elixpo/lixrl-cli</code> installs both <code>lixrl</code>{' '}
        and the compatible <code>shortner</code> alias.
      </p>
      <CodeBlock label="Terminal">{`npm install --global @elixpo/lixrl-cli
lixrl --version
lixrl --help`}</CodeBlock>

      <h2 id="why-cli">One link workflow for people and automation</h2>
      <p>
        Link work often begins in a terminal, deployment job, or writing agent, but finishes through disconnected
        browser steps. Lixrl keeps short URLs, QR assets, link status, and analytics in one predictable workflow while
        still giving you a clear dashboard whenever you want a visual view.
      </p>

      <h2 id="sign-in">Sign in and authenticate</h2>
      <p>
        Login first reuses a valid key already stored for the selected profile. Otherwise, choose browser-based device
        login or paste a raw key you already created. Both paths store the final Lixrl key in your operating-system
        keychain; passwords and browser cookies never enter the CLI.
      </p>

      <h3 id="device-login">Recommended: Accounts device login</h3>
      <Steps>
        <li>Run the command and choose whether to create a new key or paste an existing key.</li>
        <li>For a new key, the CLI displays a prefilled official Accounts URL and one-time code.</li>
        <li>
          Press Enter to open the URL, or use <code>--open</code> to launch it immediately.
        </li>
        <li>The CLI opens a Lixrl approval page where you choose the key name, read or read/write access, and an optional expiry.</li>
        <li>Lixrl enforces your plan&apos;s key limit, delivers the key directly to the waiting CLI, and stores only its hash.</li>
      </Steps>
      <CodeBlock label="Terminal">{`lixrl login
lixrl login --new-key --open
lixrl whoami`}</CodeBlock>
      <p>
        Running <code>lixrl login</code> again reuses a valid key already stored for the selected profile. Use{' '}
        <code>lixrl login --new-key</code> only when you intentionally want another key. The CLI cannot revoke account
        keys during device login; when the limit is full, revoke one in the browser, wait for the{' '}
        <strong>Revoked</strong> status, and then press Enter in the terminal.
      </p>
      <p>
        Read-only keys can list links, analytics, and exports without changing data. Read/write keys can also create,
        update, disable, and delete links. The approval screen shows the active-key allowance for your plan. If that
        allowance is full, the CLI offers to open key management and retry after you revoke an unused key.
      </p>
      <Callout title="What the code authorizes">
        The one-time code authorizes only the displayed Lixrl request. Temporary Accounts tokens remain in memory and
        are revoked before the Lixrl key is delivered. The CLI never receives your password, browser session, or MFA
        response.
      </Callout>

      <h3 id="direct-key-login">Paste an existing API key</h3>
      <p>
        If you or an administrator already created a restricted key under{' '}
        <Link href="/profile/keys">Profile → API Keys</Link>, choose option 2 during login or paste it through the
        masked prompt:
      </p>
      <CodeBlock label="Terminal">{`lixrl login --key
lixrl whoami`}</CodeBlock>
      <Callout tone="warning" title="Keep keys secret">
        Never place an <code>elu_…</code> key in a URL, source file, generated article, issue, or chat message. Lixrl
        stores only the key hash, so a dashboard row cannot reveal the raw value later.
      </Callout>
      <p>
        The CLI briefly retries transient login configuration and discovery failures. Persistent errors identify
        whether Lixrl configuration, Accounts timeout, network/DNS/TLS access, an HTTP response, or incompatible
        authorization metadata caused the failure.
      </p>

      <h3 id="profiles">Multiple accounts</h3>
      <CodeBlock label="Terminal">{`lixrl login --profile work --open
lixrl profiles
lixrl use work
lixrl whoami --profile work`}</CodeBlock>
      <p>
        Profile names are non-secret aliases. Each profile&apos;s API key remains in the keychain. Logging out removes
        only the selected local credential; revoke the key separately when it must stop working everywhere.
      </p>
      <CodeBlock label="Terminal">{`lixrl keys revoke 42 --yes
lixrl logout --profile work --yes`}</CodeBlock>

      <h3 id="ci-authentication">CI and non-interactive agents</h3>
      <p>
        Store the key in the CI provider&apos;s encrypted secret store and expose it only to the command process as{' '}
        <code>LIXRL_API_KEY</code>. Automation should always add <code>--json --no-input</code>.
      </p>
      <CodeBlock label="CI step">{`lixrl whoami --json --no-input
lixrl urls create "https://example.com/article" \
  --title "Article" --tag automation --json --no-input`}</CodeBlock>

      <h2 id="links">Manage short links</h2>
      <p>
        Interactive output uses green for completed operations, purple for status information, yellow for correctable
        input warnings, and red for failures. Set <code>NO_COLOR=1</code> for plain output. Commands and required flags
        are checked before authentication, so a typo or missing <code>--file</code> is reported without asking you to
        sign in. A compact spinner appears only while network, approval, keychain, or QR work is pending; JSON, quiet,
        and piped output never receive spinner frames.
      </p>
      <CodeBlock label="Terminal">{`# Create
lixrl urls create "https://example.com/launch" \
  --title "Launch" --campaign launch --tag release

# Search and inspect
lixrl urls list --search launch --limit 25
lixrl urls get abc123

# Update or pause without deleting
lixrl urls update abc123 --destination "https://example.com/new"
lixrl urls disable abc123
lixrl urls enable abc123

# Destructive operations require confirmation
lixrl urls delete abc123 --yes`}</CodeBlock>
      <p>
        Paid plans can add custom slugs and expiry dates with <code>--slug</code> and <code>--expires</code>. Bulk
        creation accepts a JSON array through <code>--file</code>.
      </p>

      <h2 id="analytics">Analytics and exports</h2>
      <CodeBlock label="Terminal">{`lixrl urls analytics abc123 --days 30 --json
lixrl urls export --output links.csv
lixrl urls export-clicks abc123 --output clicks.csv`}</CodeBlock>
      <p>
        Exports refuse to replace an existing file. An intentional replacement requires both <code>--force</code> and{' '}
        <code>--yes</code>.
      </p>

      <h2 id="qr-codes">Generate QR codes</h2>
      <p>
        Basic QR generation runs locally. SVG is the best default for print; PNG and JPEG are available for image
        workflows. Paid styles, center logos, and tracked QR links verify the active account plan. Prefer a browser?
        Use the <Link href="/generate">QR code generator</Link>.
      </p>
      <CodeBlock label="Terminal">{`lixrl qr "https://example.com" --format svg --output code.svg
lixrl qr "https://example.com" --format png --style rounded --size 1024 --output code.png
lixrl qr "https://example.com" --track --style aurora --title "Print campaign" --output tracked.svg`}</CodeBlock>

      <h2 id="domains-and-keys">API keys and branded subdomains</h2>
      <CodeBlock label="Terminal">{`lixrl keys list
lixrl keys create --name deploy --scopes read,write

lixrl domains list
lixrl domains claim team
lixrl domains verify 12
lixrl domains map 12 abc123 --slug launch`}</CodeBlock>
      <p>
        Key creation prints the secret once. Capture it directly into the intended secret store and do not include
        command output in logs. Subdomain commands follow your current plan entitlement.
      </p>

      <h2 id="agent-skills">Agent skills</h2>
      <p>
        The npm artifact includes focused skills for link management and QR generation. Nothing is copied during
        package installation; install only the skill the agent needs.
      </p>
      <CodeBlock label="Terminal">{`lixrl skills list
lixrl skills inspect lixrl-links
lixrl skills install lixrl-links
lixrl skills install lixrl-qr`}</CodeBlock>
      <p>
        The link skill contains a separate writing workflow: agents shorten only public canonical destinations
        selected by the author, preserve the original destination, and request approval before replacing a link in a
        post. LixBlogs OAuth tokens are never reused as Lixrl credentials.
      </p>

      <h2 id="automation-contract">Automation contract</h2>
      <ul>
        <li>
          <code>--json</code> returns stable machine-readable output.
        </li>
        <li>
          <code>--no-input</code> prevents hidden prompts in agents and CI.
        </li>
        <li>
          Deletion, revocation, unmapping, and overwrite operations require <code>--yes</code>.
        </li>
        <li>Exit code 2 means invalid usage, 4 means authentication is required, and 5 means confirmation is missing.</li>
        <li>API errors may include a request ID for support; credentials are redacted.</li>
      </ul>

      <h2 id="configuration">Configuration</h2>
      <p>
        Production defaults to <code>https://lixrl.com</code>. Use <code>--api-url</code> or{' '}
        <code>LIXRL_API_URL</code> only for an intentional Lixrl environment. Non-local HTTP origins are rejected.
      </p>
      <CodeBlock label="Terminal">{`lixrl --help
lixrl whoami --profile default --json --no-input`}</CodeBlock>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
    </DocPage>
  );
}
