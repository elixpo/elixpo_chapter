"use client";

import { Box } from "@mui/material";
import {
    Code,
    DocH2,
    DocLead,
    DocList,
    DocP,
    DocTitle,
    DocActions,
} from "@/components/docs-prose";
import CodeBlock from "../../components/code-block";

const CHECKOUT = `POST /v1/checkout/sessions
Authorization: Bearer <ELIXPO_PAY_API_KEY>

{
  "tier": "pro",
  "interval": "month",
  "currency": "INR",
  "customer": { "uid": "u_123", "email": "asha@example.com" },
  "success_url": "https://yourapp.com/billing"
}`;

const TRIGGER = `POST https://mails.elixpo.com/v1/hooks/<key>
Content-Type: application/json
X-Elixpo-Signature: t=1763200000,v1=<hmac_sha256(secret, "t.body")>

{
  "to": "asha@example.com",
  "idempotency_key": "elixpo-pay:payment.receipt:txn_3f2a…",
  "variables": {
    "event": "payment.receipt",
    "app_name": "Acme Notes",
    "customer_name": "Asha",
    "plan": "pro",
    "product_name": "Acme Notes Pro",
    "amount": "₹1,499.00",
    "currency": "INR",
    "interval": "month",
    "is_renewal": "false",
    "transaction_id": "txn_3f2a…",
    "payment_id": "pay_Nx81…",
    "paid_at": "15 Nov 2026",
    "period_end": "15 Dec 2026",
    "manage_url": "https://yourapp.com/billing"
  }
}`;

const TEMPLATE = `Subject: Your {{product_name}} receipt — {{amount}}

Hi {{customer_name}},

Thanks for your payment of {{amount}} for {{product_name}}.
Your plan is active until {{period_end}}.

Payment ID: {{payment_id}}
Manage your plan: {{manage_url}}`;

export default function EmailsDocs() {
    return (
        <Box>
            <DocTitle>Buyer emails</DocTitle>
            <DocLead>
                Send receipts and subscription emails to your buyers, from your
                own mailbox, without writing any email code. Elixpo Pay knows
                when a payment event happens; Elixpo Mails renders your template
                and sends it.
            </DocLead>

            <DocH2>Events</DocH2>
            <DocList
                items={[
                    <>
                        <Code>payment.receipt</Code> — every successful charge,
                        first purchase and each autopay renewal (
                        <Code>is_renewal</Code> tells them apart).
                    </>,
                    <>
                        <Code>subscription.cancelled</Code> — the buyer cancelled;
                        access continues until <Code>period_end</Code>.
                    </>,
                    <>
                        <Code>payment.failed</Code> — autopay retries were
                        exhausted; ask the buyer to update their payment method.
                    </>,
                    <>
                        <Code>access.expired</Code> — the paid period ended and the
                        buyer was downgraded.
                    </>,
                ]}
            />

            <DocH2>Set it up</DocH2>
            <DocList
                items={[
                    <>
                        In <a href="https://mails.elixpo.com">Elixpo Mails</a>,
                        connect a sender, create a product, and design one
                        template per event using the variables below. Mark them{" "}
                        <strong>transactional</strong> so receipts are never
                        blocked by unsubscribes.
                    </>,
                    <>
                        Add a Mails webhook for each template and copy its
                        trigger URL (<Code>https://mails.elixpo.com/v1/hooks/…</Code>).
                    </>,
                    <>
                        In the Elixpo Pay dashboard open your product →{" "}
                        <strong>Buyer emails · Elixpo Mails</strong>, paste your
                        Mails product's signing secret and each trigger URL, then
                        press <strong>Send test</strong>.
                    </>,
                    <>
                        Pass the buyer's email when you create checkout sessions —
                        it's who the email goes to:
                    </>,
                ]}
            />
            <CodeBlock code={CHECKOUT} language="http" />
            <DocActions actions={[{ label: "Open Elixpo Mails", href: "https://mails.elixpo.com", hint: "Connect a sender and design your templates.", primary: true }, { label: "Open your app settings", href: "/dashboard/products", hint: "Your app → Buyer emails · Elixpo Mails → Send test." }]} />

            <DocH2>What Elixpo Pay sends to Mails</DocH2>
            <DocP>
                Requests follow the Mails trigger contract exactly: signed with
                your Mails product secret, with an idempotency key derived from the
                transaction or subscription period, so a retried payment webhook
                never emails a buyer twice.
            </DocP>
            <CodeBlock code={TRIGGER} language="http" />

            <DocH2>Example template</DocH2>
            <CodeBlock code={TEMPLATE} language="text" />

            <DocH2>Notes</DocH2>
            <DocList
                items={[
                    <>
                        Emails are best-effort and never block fulfilment: access
                        is granted even if Mails is down. Every attempt (
                        <Code>sent</Code>, <Code>queued</Code>,{" "}
                        <Code>suppressed</Code>, <Code>skipped</Code>,{" "}
                        <Code>failed</Code>) is listed under{" "}
                        <strong>Recent buyer emails</strong> on the product page.
                    </>,
                    <>
                        No email on the customer → <Code>skipped</Code>. Leave a
                        URL empty to not send that event.
                    </>,
                    <>
                        Prefer to send your own emails? Subscribe to the{" "}
                        <Code>entitlement.updated</Code> webhook instead — both
                        can run side by side.
                    </>,
                ]}
            />
        </Box>
    );
}
