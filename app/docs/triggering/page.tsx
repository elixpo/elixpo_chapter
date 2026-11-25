"use client";

export const runtime = "edge";

import { Box } from "@mui/material";
import { Fragment } from "react";
import CodeBlock from "../_components/code-block";
import {
    Callout,
    Code,
    DocH2,
    DocLead,
    DocList,
    DocP,
    DocTitle,
    NextLink,
} from "../_components/docs-prose";

const REQUEST = `POST https://mails.elixpo.com/v1/hooks/<endpoint_key>
Content-Type: application/json
X-Elixpo-Signature: t=<unix_seconds>,v1=<hex HMAC-SHA256>

{
  "to": "user@example.com",
  "variables": { "name": "Ada" },
  "idempotency_key": "optional-dedupe-key"
}`;

const SENT = `{
  "ok": true,
  "id": "del_...",
  "status": "sent",
  "to": "user@example.com",
  "subject": "Welcome, Ada"
}`;

const SUPPRESSED = `{
  "ok": false,
  "status": "suppressed",
  "to": "user@example.com"
}`;

const FAILED = `{
  "ok": false,
  "status": "failed",
  "error": "smtp: 535 authentication failed"
}`;

const CODE_EXAMPLE = `// 1. Configure client timeout >= 20s for cold paths & SMTP delivery
const res = await fetch("https://mails.elixpo.com/v1/hooks/<endpoint_key>", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Elixpo-Signature": \`t=\${t},v1=\${v1}\`,
  },
  body: payload,
  signal: AbortSignal.timeout(20000),
});

const result = await res.json();

// 2. MUST inspect result.ok — HTTP 200 does not guarantee delivery!
if (!result.ok) {
  if (result.status === "suppressed") {
    // Recipient unsubscribed; platform skipped delivery (successful no-op)
    console.log("Recipient is suppressed (unsubscribed):", result.to);
  } else {
    // Delivery failed (e.g. 502 SMTP error)
    console.error("Delivery failed:", result.error);
  }
} else {
  console.log("Email sent! Delivery ID:", result.id);
}`;

export default function Triggering() {
    return (
        <Box>
            <DocTitle>Triggering</DocTitle>
            <DocLead>
                Send an email by POSTing a signed request to the template's webhook endpoint. The{" "}
                <Code>endpoint_key</Code> is shown on each webhook.
            </DocLead>

            <DocH2>Endpoint</DocH2>
            <DocP>
                <Code>POST https://mails.elixpo.com/v1/hooks/&lt;endpoint_key&gt;</Code>
            </DocP>

            <DocH2>Request</DocH2>
            <CodeBlock code={REQUEST} language="http" />
            <DocList
                items={[
                    <Fragment key="to">
                        <Code>to</Code> — recipient email address. Required.
                    </Fragment>,
                    <Fragment key="variables">
                        <Code>variables</Code> — object of <Code>{"{{var}}"}</Code> values merged
                        into the template's subject and body.
                    </Fragment>,
                    <Fragment key="idempotency_key">
                        <Code>idempotency_key</Code> — optional dedupe key (or pass an{" "}
                        <Code>Idempotency-Key</Code> request header); the same key won't send twice
                        — a duplicate returns the original result (good for retries).
                    </Fragment>,
                ]}
            />

            <DocH2>Timeouts</DocH2>
            <DocP>
                Configure your HTTP client with a request timeout of{" "}
                <strong>at least 20 seconds</strong> (e.g.{" "}
                <Code>signal: AbortSignal.timeout(20000)</Code> in Fetch or equivalent in Axios /
                HTTP libraries).
            </DocP>
            <DocP>
                While warm cached sends execute in under a second, cold paths (suppression list
                lookups, dynamic template rendering, attachment fetching, and upstream SMTP socket
                handshakes over <Code>cloudflare:sockets</Code>) can take 6–15 seconds under load.
                Setting a client timeout below 20 seconds risks aborting the connection prematurely
                while the upstream worker is still actively processing and delivering the email.
            </DocP>

            <DocH2>Responses</DocH2>
            <Callout
                tone="warn"
                title="Always inspect result.ok — HTTP 200 does not guarantee delivery"
            >
                The trigger returns <Code>200 &#123; ok: true &#125;</Code> only on successful send.
                Crucially, a successful HTTP transport status (<Code>200 OK</Code>) does{" "}
                <em>not</em> guarantee that an email was delivered: unsubscribed recipients return{" "}
                <Code>200 &#123; ok: false, status: "suppressed" &#125;</Code>, and downstream
                failures return <Code>502 &#123; ok: false, status: "failed" &#125;</Code>.
                <br />
                <br />
                Callers <strong>must</strong> inspect the parsed JSON body's <Code>ok</Code> boolean
                (<Code>if (!result.ok)</Code>) rather than assuming an HTTP status &lt; 400 means
                the email was sent.
            </Callout>

            <DocP>
                <strong>200 — sent.</strong> The email was accepted by your sender's mailbox.
            </DocP>
            <CodeBlock code={SENT} language="json" />
            <DocP>
                <strong>200 — suppressed.</strong> The recipient previously unsubscribed, so a
                non-transactional send is skipped. This is a successful no-op, not an error — handle
                it as success.
            </DocP>
            <CodeBlock code={SUPPRESSED} language="json" />
            <DocP>
                <strong>502 — failed.</strong> A downstream send failure (e.g. the sender mailbox
                rejected it). Inspect <Code>error</Code>.
            </DocP>
            <CodeBlock code={FAILED} language="json" />

            <DocH2>Handling responses in code</DocH2>
            <DocP>
                Example in TypeScript / JavaScript demonstrating the 20-second timeout and proper
                response inspection:
            </DocP>
            <CodeBlock code={CODE_EXAMPLE} language="javascript" />

            <DocH2>Error statuses</DocH2>
            <DocList
                items={[
                    <Fragment key="401">
                        <Code>401</Code> — bad or missing signature.
                    </Fragment>,
                    <Fragment key="400">
                        <Code>400</Code> — invalid timestamp (outside the 5-minute tolerance) or
                        invalid recipient.
                    </Fragment>,
                    <Fragment key="403">
                        <Code>403</Code> — disabled webhook/product, or no signing secret
                        configured.
                    </Fragment>,
                    <Fragment key="404">
                        <Code>404</Code> — unknown <Code>endpoint_key</Code>.
                    </Fragment>,
                ]}
            />

            <NextLink href="/docs/templates" label="Templates" />
        </Box>
    );
}
