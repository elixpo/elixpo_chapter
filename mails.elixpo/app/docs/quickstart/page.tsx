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

const TRIGGER = `import crypto from "node:crypto";

const secret = "YOUR_PRODUCT_SECRET";
const url = "https://mails.elixpo.com/v1/hooks/whe_xxx";

// Build the body ONCE — sign and send the exact same bytes.
const payload = JSON.stringify({ to: "user@example.com", variables: { name: "Ada" } });
const t = Math.floor(Date.now() / 1000);
const v1 = crypto.createHmac("sha256", secret).update(\`\${t}.\${payload}\`).digest("hex");

// Configure client timeout >= 20s for cold paths & SMTP delivery
const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Elixpo-Signature": \`t=\${t},v1=\${v1}\`,
  },
  body: payload,
  signal: AbortSignal.timeout(20000),
});

const out = await res.json();

// ALWAYS inspect out.ok — HTTP 200 does not guarantee delivery!
if (!out.ok) {
  if (out.status === "suppressed") {
    // Recipient unsubscribed; platform skipped delivery (successful no-op)
    console.log("Recipient unsubscribed (suppressed):", out.to);
  } else {
    // Delivery failed (e.g. 502 SMTP error)
    console.error("Delivery failed:", out.error);
  }
} else {
  console.log("Email sent! Delivery ID:", out.id);
}`;

export default function Quickstart() {
    return (
        <Box>
            <DocTitle>Quickstart</DocTitle>
            <DocLead>
                Go from zero to a sent email: sign in, connect a sender, create a product, design a
                template, attach a webhook, and fire a signed trigger from your service.
            </DocLead>

            <DocH2>1. Sign in</DocH2>
            <DocP>
                Sign in to your workspace via <strong>Elixpo Accounts</strong> (SSO). Your workspace
                is your tenant — senders, products, and templates all live under it.
            </DocP>

            <DocH2>2. Add a sender</DocH2>
            <DocP>
                Connect the mailbox mail will be sent <em>from</em> — your Gmail or any SMTP
                account, using an <strong>app password</strong> (not your login password). Elixpo
                Mails never relays through a shared pool; every email goes out as you.
            </DocP>

            <DocH2>3. Create a product</DocH2>
            <DocP>
                A product groups your templates and carries one shared signing secret. On creation
                you receive a <Code>client_id</Code> and a <strong>shared secret shown once</strong>
                .
            </DocP>
            <Callout title="Save the secret now" tone="warn">
                The signing secret is shown a single time. Store it as a server-side environment
                variable — never ship it to the browser. You can roll it later from the product page
                (the old secret keeps working for a short grace window).
            </Callout>

            <DocH2>4. Design a template</DocH2>
            <DocP>
                Build the email in the <strong>lixeditor</strong> WYSIWYG editor. Drop{" "}
                <Code>{"{{variables}}"}</Code> into the subject and body — e.g.{" "}
                <Code>{"Hi {{name}}, your order {{order_id}} shipped"}</Code>. Elixpo Mails derives
                the variable list from the template automatically. Set the{" "}
                <Code>transactional</Code> flag for essential mail like receipts and password
                resets.
            </DocP>

            <DocH2>5. Add a webhook to the template</DocH2>
            <DocP>
                Attach a <strong>webhook</strong> to the template. You get a signed endpoint
                identified by an <Code>endpoint_key</Code> (shown on the webhook), which forms your
                trigger URL: <Code>https://mails.elixpo.com/v1/hooks/&lt;endpoint_key&gt;</Code>.
            </DocP>

            <DocH2>6. Sign &amp; POST a trigger</DocH2>
            <DocP>
                From your service, HMAC-sign the request with the product secret and POST the
                trigger. Build the JSON body once, sign over <Code>{"`${t}.${rawBody}`"}</Code>, and
                send the same bytes.
            </DocP>
            <Callout tone="warn" title="Client timeouts &amp; inspecting result.ok">
                <strong>Set client timeout ≥ 20s:</strong> Cold paths (suppression lookups, dynamic
                template rendering, and SMTP socket handshakes) can take 6–15 seconds. Configure
                your HTTP client with at least 20 seconds timeout (
                <Code>signal: AbortSignal.timeout(20000)</Code>) to avoid premature aborts.
                <br />
                <br />
                <strong>
                    Always inspect <Code>out.ok</Code>:
                </strong>{" "}
                An HTTP 200 status code does not guarantee delivery (e.g. suppressed recipients
                return <Code>200 &#123; ok: false, status: "suppressed" &#125;</Code>). You must
                inspect the parsed JSON body's <Code>ok</Code> field before assuming the email was
                sent.
            </Callout>
            <CodeBlock code={TRIGGER} language="javascript" />

            <DocList
                items={[
                    <Fragment key="sent">
                        <Code>200 {'{ ok: true, status: "sent" }'}</Code> — the email was sent.
                    </Fragment>,
                    <Fragment key="suppressed">
                        <Code>200 {'{ ok: false, status: "suppressed" }'}</Code> — recipient
                        unsubscribed; a successful no-op.
                    </Fragment>,
                    <Fragment key="failed">
                        <Code>502 {'{ ok: false, status: "failed", error }'}</Code> — downstream
                        send failure.
                    </Fragment>,
                ]}
            />

            <NextLink href="/docs/authentication" label="Authentication" />
        </Box>
    );
}
