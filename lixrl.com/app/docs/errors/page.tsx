import { docsMetadata } from '@/lib/docs-sections';
import { CodeBlock, DocPage, DocTable } from '../_components/Doc';

const ERRORS: Array<[number, string, string]> = [
  [400, 'Invalid URL', 'Request JSON or a field is invalid.'],
  [401, 'Unauthorized', 'The API key is missing, invalid, expired, or lacks the required scope.'],
  [403, 'Expiring links require Pro tier or above', 'The account plan does not include the requested capability.'],
  [404, 'Not found', 'The resource does not exist for this account.'],
  [409, 'Short code already taken', 'Choose another custom code.'],
  [422, 'That URL is flagged as phishing by Google Safe Browsing', 'The destination failed a safety check.'],
  [429, 'Too many requests', 'Wait for Retry-After or the returned available_at time.'],
  [500, 'Could not create the short link', 'Retry with exponential backoff.'],
];

export const metadata = docsMetadata('errors');

export default function ErrorsPage() {
  return (
    <DocPage
      slug="errors"
      title="Error Reference"
      lede={
        <>
          Error responses contain a human-readable <code>error</code> string. Use the HTTP status for program flow;
          error text may become more specific as validation improves.
        </>
      }
    >
      <h2 id="format">Format</h2>
      <CodeBlock label="Error body">{`{
  "error": "Short code already taken"
}`}</CodeBlock>

      <h2 id="codes">Codes</h2>
      <DocTable
        caption="API error codes"
        head={['HTTP', 'Example error', 'Meaning']}
        monoColumns={[1]}
        rows={ERRORS.map(([status, example, meaning]) => [String(status), example, meaning])}
      />

      <h2 id="retrying">Retrying</h2>
      <p>
        4xx errors are deterministic — fix the request and retry. HTTP 429 responses include a{' '}
        <code>Retry-After</code> header in seconds. For 5xx, retry with exponential backoff (250ms · 500ms · 1s · 2s ·
        4s, max 5 tries).
      </p>
    </DocPage>
  );
}
