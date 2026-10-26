import { docsMetadata } from '@/lib/docs-sections';
import Link from 'next/link';
import { Callout, CodeBlock, DocPage, DocTable, Endpoint, Facts, FieldTable } from '../_components/Doc';

export const metadata = docsMetadata('api');

export default function ApiPage() {
  return (
    <DocPage
      slug="api"
      title="Shortening API"
      lede="Create and manage account-owned short links, or use the browser-only guest flow for one temporary link. This reference documents request fields, response bodies, tier restrictions, pagination, expiry, and failure behavior as implemented by the edge routes."
    >
      <Facts
        items={[
          ['Base URL', 'https://lixrl.com'],
          ['Content type', 'application/json'],
          ['Authentication', 'Bearer API key'],
        ]}
      />

      <h2 id="authentication">Authentication</h2>
      <p>
        Account endpoints accept a scoped API key in the standard Bearer header. Create a key under{' '}
        <Link href="/profile/keys">Profile → API Keys</Link>. Never place API keys in URLs or browser-delivered
        JavaScript.
      </p>
      <CodeBlock label="Request header">Authorization: Bearer elu_YOUR_API_KEY</CodeBlock>
      <Callout title="Guest requests">
        The guest endpoint does not accept an API key. It is protected by a same-origin browser check, risk scoring,
        and a 24-hour D1 quota, so it is not a replacement for the authenticated integration API.
      </Callout>

      <h2 id="guest-shortening">Guest shortening</h2>
      <Endpoint method="POST" path="/api/guest/urls" />
      <p>
        Creates one temporary short link from the public landing page. The service fixes the expiry at 24 hours,
        generates the code, stores no click analytics, and returns <code>429</code> while the derived guest identity
        is still inside its quota window.
      </p>
      <FieldTable
        caption="Guest shortening request fields"
        rows={[
          ['url', 'string', 'Yes', 'Absolute HTTP or HTTPS destination, maximum 2,048 characters. Private, loopback, unsafe, and denylisted hosts are rejected.'],
        ]}
      />
      <CodeBlock label="Same-origin browser request">{`fetch('/api/guest/urls', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com/article' })
})`}</CodeBlock>
      <CodeBlock label="201 Created">{`{
  "short_url": "https://lixrl.com/gA1b2C3",
  "short_code": "gA1b2C3",
  "original_url": "https://example.com/article",
  "expires_at": "2026-08-02T10:30:00.000Z",
  "guest": true
}`}</CodeBlock>
      <h3 id="guest-limit-response">Guest quota response</h3>
      <CodeBlock label="429 Too Many Requests">{`{
  "error": "Your guest link has already been used. Sign in for persistent links.",
  "account_required": true,
  "available_at": "2026-08-02T10:30:00.000Z"
}`}</CodeBlock>
      <p>
        The response includes <code>Retry-After</code> in seconds. Guest links cannot be listed, edited, recovered,
        or converted into account links after creation.
      </p>

      <h2 id="create-a-short-link">Create an account link</h2>
      <Endpoint method="POST" path="/api/urls" />
      <FieldTable
        caption="Create link request fields"
        rows={[
          ['url', 'string', 'Yes', 'Absolute HTTP or HTTPS destination. The same private-network and safe-content checks used by guest shortening apply.'],
          ['title', 'string', 'No', 'Human-readable label between 1 and 255 characters.'],
          ['custom_code', 'string', 'No', 'Pro or higher. A unique 3–32 character slug containing letters, digits, hyphens, or underscores.'],
          ['expires_at', 'ISO 8601', 'No', 'Pro or higher. A future timestamp; null/omitted links do not expire.'],
          ['campaign', 'string', 'No', 'A campaign label between 1 and 64 characters.'],
          ['tags', 'string[]', 'No', 'Up to 10 normalized tags, each no longer than 24 characters.'],
          ['utm', 'object', 'No', 'Optional source, medium, campaign, term, and content values appended as UTM parameters.'],
        ]}
      />
      <CodeBlock label="cURL">{`curl -X POST https://lixrl.com/api/urls \\
  -H "Authorization: Bearer elu_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/long-url",
    "title": "Launch announcement",
    "custom_code": "launch",
    "expires_at": "2026-12-31T23:59:59.000Z"
  }'`}</CodeBlock>
      <CodeBlock label="201 Created">{`{
  "short_url": "https://lixrl.com/launch",
  "short_code": "launch",
  "original_url": "https://example.com/long-url",
  "title": "Launch announcement",
  "created_at": "2026-08-01 10:30:00",
  "expires_at": "2026-12-31T23:59:59.000Z"
}`}</CodeBlock>
      <p>
        Free accounts can own up to 25 links. A duplicate custom code returns <code>409</code>; unavailable tier
        features and exhausted account quotas return <code>403</code>.
      </p>

      <h2 id="bulk-create">Bulk create account links</h2>
      <Endpoint method="POST" path="/api/urls/bulk-create" />
      <p>
        Submit up to 25 ordinary create-link payloads. Each item is validated, safety checked, quota checked, and
        returned with its own HTTP-style status. A fully successful batch returns 201; a partial batch returns 207 so
        callers can retry only failed rows.
      </p>
      <CodeBlock label="Request body">{`{
  "links": [
    {"url":"https://example.com/a","campaign":"launch","tags":["email"]},
    {"url":"https://example.com/b","utm":{"source":"newsletter","medium":"email"}}
  ]
}`}</CodeBlock>

      <h2 id="list-your-links">List account links</h2>
      <Endpoint method="GET" path="/api/urls" />
      <FieldTable
        caption="List links query parameters"
        rows={[
          ['limit', 'integer', 'No', 'Page size from 1–100. Defaults to 50.'],
          ['offset', 'integer', 'No', 'Number of matching records to skip. Defaults to 0; maximum 100,000.'],
          ['search', 'string', 'No', 'Case-insensitive match against short code, destination, or title. Input is capped at 100 characters.'],
        ]}
      />
      <CodeBlock label="cURL">{`curl 'https://lixrl.com/api/urls?limit=20&offset=0&search=example' \\
  -H "Authorization: Bearer elu_YOUR_KEY"`}</CodeBlock>
      <CodeBlock label="200 OK">{`{
  "urls": [
    {
      "id": 42,
      "user_id": 7,
      "short_code": "launch",
      "original_url": "https://example.com/long-url",
      "title": "Launch announcement",
      "is_active": 1,
      "clicks": 18,
      "created_at": "2026-08-01 10:30:00",
      "updated_at": "2026-08-01 10:30:00",
      "expires_at": null
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}`}</CodeBlock>

      <h2 id="get-a-link">Get an account link</h2>
      <Endpoint method="GET" path="/api/urls/{code}" />
      <p>
        Returns the complete URL record shown in the list response. Ownership is enforced: an unknown code or a code
        belonging to another account returns <code>404</code>.
      </p>
      <CodeBlock label="cURL">{`curl https://lixrl.com/api/urls/launch \\
  -H "Authorization: Bearer elu_YOUR_KEY"`}</CodeBlock>

      <h2 id="update-a-link">Update an account link</h2>
      <Endpoint method="PATCH" path="/api/urls/{code}" />
      <p>Send at least one mutable field. The short code itself cannot be changed.</p>
      <FieldTable
        caption="Update link request fields"
        rows={[
          ['url', 'string', 'No', 'New validated HTTP or HTTPS destination.'],
          ['title', 'string | null', 'No', 'New 1–255 character title, or null to remove it.'],
          ['is_active', 'boolean', 'No', 'False disables redirects without deleting the record or analytics.'],
          ['expires_at', 'ISO 8601 | null', 'No', 'Future timestamp, or null to remove expiry.'],
        ]}
      />
      <CodeBlock label="cURL">{`curl -X PATCH https://lixrl.com/api/urls/launch \\
  -H "Authorization: Bearer elu_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/new","title":null,"is_active":true}'`}</CodeBlock>
      <CodeBlock label="200 OK">{`{
  "success": true
}`}</CodeBlock>

      <h2 id="delete-a-link">Delete an account link</h2>
      <Endpoint method="DELETE" path="/api/urls/{code}" />
      <p>
        Permanently removes the link and its click records. Use <code>is_active: false</code> when you may need to
        restore the redirect later.
      </p>
      <Callout tone="warning" title="Irreversible">
        Deleting a link also deletes its analytics. There is no undo.
      </Callout>
      <CodeBlock label="cURL">{`curl -X DELETE https://lixrl.com/api/urls/launch \\
  -H "Authorization: Bearer elu_YOUR_KEY"`}</CodeBlock>
      <CodeBlock label="200 OK">{`{
  "success": true
}`}</CodeBlock>

      <h2 id="status-codes">Status codes and retries</h2>
      <DocTable
        caption="HTTP status codes returned by the shortening API"
        head={['Status', 'Meaning', 'Action']}
        rows={[
          ['400', 'Malformed input or unsupported field value.', 'Correct the request before retrying.'],
          ['401', 'Missing, invalid, expired, or revoked credentials.', 'Replace the API key.'],
          ['403', 'Tier restriction, quota, risk rejection, or CSRF failure.', 'Read the error string; signing in or upgrading may be required.'],
          ['404', 'The account does not own a matching short code.', 'Verify the code and credentials.'],
          ['409', 'Requested custom code is already taken.', 'Choose another code or omit custom_code.'],
          ['422', 'Safe Browsing rejected the destination.', 'Use a safe destination; do not retry unchanged.'],
          ['429', 'Rate or guest quota exceeded.', 'Wait for Retry-After before retrying.'],
          ['500/503', 'Transient service or configuration failure.', 'Retry with capped exponential backoff.'],
        ]}
      />
      <p>
        See the dedicated <Link href="/docs/errors">error reference</Link> for response conventions and retry
        guidance.
      </p>
    </DocPage>
  );
}
