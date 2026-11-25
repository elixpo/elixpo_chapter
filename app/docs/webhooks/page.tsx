import { docsMetadata } from '@/lib/docs-sections';
import { Callout, DocCards, DocPage } from '../_components/Doc';

export const metadata = docsMetadata('webhooks');

export default function WebhooksPage() {
  return (
    <DocPage
      slug="webhooks"
      title="Webhooks"
      lede="Get HTTP callbacks when links are created, updated, or clicked. Coming on the Growth tier."
    >
      <Callout tone="soon">
        Webhook events will be HMAC-signed and delivered with at-least-once semantics. If you have a use case driving
        this work, drop us a line at <a href="mailto:hello@elixpo.com">hello@elixpo.com</a> — input from real
        integrations shapes the API.
      </Callout>

      <h2 id="in-the-meantime">In the meantime</h2>
      <p>Until webhooks ship, read link state and click activity from the existing endpoints.</p>
      <DocCards
        items={[
          { href: '/docs/api', title: 'Shortening API', body: 'List and inspect links, including click totals.' },
          { href: '/docs/analytics', title: 'Click Analytics', body: 'Daily click breakdowns for any link you own.' },
        ]}
      />
    </DocPage>
  );
}
