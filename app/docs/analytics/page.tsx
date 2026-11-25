import { docsMetadata } from '@/lib/docs-sections';
import Link from 'next/link';
import { Callout, CodeBlock, DocPage, DocTable, Endpoint } from '../_components/Doc';

export const metadata = docsMetadata('analytics');

export default function AnalyticsPage() {
  return (
    <DocPage
      slug="analytics"
      title="Click Analytics"
      lede="Redirect events are recorded asynchronously from Cloudflare's edge. Paid plans can query daily breakdowns within their plan window."
    >
      <h2 id="endpoint">Endpoint</h2>
      <Endpoint method="GET" path="/api/urls/{code}/analytics?days=30" />
      <CodeBlock label="cURL">{`curl https://lixrl.com/api/urls/my-link/analytics?days=30 \\
  -H "Authorization: Bearer elu_YOUR_KEY"`}</CodeBlock>

      <h2 id="response">Response</h2>
      <CodeBlock label="200 OK">{`{
  "summary": {"clicks": 42, "unique_visitor_days": 31, "filtered_bots": 6},
  "timeline":  [{"date": "2026-03-19", "count": 42}],
  "countries": [{"country": "US",       "count": 30}],
  "browsers":  [{"browser": "Chrome",   "count": 25}],
  "devices":   [{"device":  "desktop",  "count": 35}],
  "referers":  [{"referer": "twitter.com", "count": 12}]
}`}</CodeBlock>
      <p>
        Clicks and breakdowns exclude recognized crawlers and link-preview agents. <code>unique_visitor_days</code> is
        an approximation based on a keyed identifier that rotates daily; it is not a cross-day visitor profile.
      </p>

      <h2 id="windows">Time windows</h2>
      <DocTable
        caption="Supported analytics time windows"
        head={['Parameter', 'Window']}
        rows={[
          ['days=1', 'Last 24h, grouped by UTC date'],
          ['days=7', 'Last 7d, bucketed by day'],
          ['days=30', 'Last 30d, bucketed by day'],
          ['default', '7 days when the days parameter is omitted'],
        ]}
      />

      <h2 id="retention">Retention</h2>
      <p>
        Detailed analytics queries are available on Pro and higher plans. Pro can query 30 days, Business 365 days, and
        Enterprise 730 days. The limit is an access window; raw-event cleanup is described in the{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2 id="privacy">Privacy</h2>
      <p>
        Country / device / browser are inferred from the request headers at redirect time. Individual redirect events
        are stored so the API can aggregate them for the requested window.
      </p>
      <Callout title="No visitor tracking">
        We do not record visitor IPs in cleartext, fingerprint visitors, or sell click data.
      </Callout>
    </DocPage>
  );
}
