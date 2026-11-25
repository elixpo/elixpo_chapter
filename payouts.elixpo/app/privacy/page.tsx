import PolicyLinks from "@/components/trust/policy-links";
import LegalShell from "../components/legal-shell";

export default function PrivacyPage() {
    return (
        <LegalShell
            title="Privacy Policy"
            updated="18 November 2026"
            summary={[
                <>
                    We <strong>never see or store</strong> your card number,
                    UPI PIN or bank login — you enter those on Razorpay&apos;s
                    checkout.
                </>,
                <>
                    We keep only what we need to run payments: who paid, how
                    much, the payment reference, and what it unlocked.
                </>,
                <>
                    For payouts we store only the{" "}
                    <strong>last 4 digits</strong> of a bank account, plus IFSC
                    and holder name.
                </>,
                <>
                    Fundraiser contributors&apos; emails are{" "}
                    <strong>never shown to creators</strong>, and names appear
                    publicly only if you choose.
                </>,
                <>
                    We do not sell or share your data for marketing, and we
                    send no marketing email.
                </>,
            ]}
        >
            <p>
                Elixpo Pay (&quot;Elixpo Pay&quot;, &quot;we&quot;,
                &quot;us&quot;), operated by Elixpo (<code>elixpo.com</code>),
                provides payments and payouts infrastructure for the Elixpo
                ecosystem and third-party merchants. This policy explains what
                we collect, why, and how we handle it. It applies to{" "}
                <code>payouts.elixpo.com</code>, fundraiser pages, and the
                Elixpo Pay API.
            </p>

            <h2>What we collect</h2>
            <h3>If you buy something or subscribe</h3>
            <ul>
                <li>
                    <strong>Customer references</strong> — the external user id
                    (uid) the merchant&apos;s app passes us at checkout, plus
                    optional email (used for your receipt and subscription
                    notices). We do not require end-customers to create an
                    Elixpo account.
                </li>
                <li>
                    <strong>Transaction metadata</strong> — amounts, currency,
                    provider order/payment ids, status, and timestamps.
                </li>
                <li>
                    <strong>Entitlements & subscriptions</strong> — the tier
                    and expiry granted after a successful payment, and the
                    status of any autopay mandate (active, cancelled, failed
                    renewal).
                </li>
            </ul>
            <h3>If you contribute to a fundraiser</h3>
            <ul>
                <li>
                    <strong>Your email</strong> — used only to send your
                    receipt. It is <strong>never shown to the creator</strong>.
                </li>
                <li>
                    <strong>Your name and message</strong> — only if you enter
                    them. Your name is shown publicly only if you choose to
                    show it; otherwise the page shows &quot;Anonymous&quot;.
                    The creator can see the name you entered in their
                    dashboard. A message you leave, and the amount, appear in
                    the page&apos;s list of recent supporters.
                </li>
                <li>
                    <strong>The payment</strong> — amount, currency (and the
                    exchange rate, if you paid in dollars), payment reference,
                    status, and time.
                </li>
            </ul>
            <h3>If you are a merchant or fundraiser creator</h3>
            <ul>
                <li>
                    <strong>Account data</strong> — your Elixpo Accounts
                    identity (user id, email, display name) used to sign in and
                    own your workspace. Sign-in happens through Elixpo
                    Accounts; Elixpo Pay stores no passwords.
                </li>
                <li>
                    <strong>Payout details</strong> — when you connect payouts,
                    you give us the account holder name, account number and
                    IFSC so we can create your Razorpay Route linked account.
                    We then keep only the <strong>last 4 digits</strong> of the
                    account number, plus the IFSC and holder name for display.
                    Razorpay carries out KYC and holds the full details.
                </li>
                <li>
                    <strong>Your pages and products</strong> — fundraiser
                    content, products, plans, and webhook settings you create.
                </li>
                <li>
                    <strong>API keys</strong> — stored only as SHA-256 hashes,
                    never in readable form.
                </li>
            </ul>

            <h2>What we never store</h2>
            <ul>
                <li>Card numbers, CVVs or expiry dates.</li>
                <li>UPI PINs or net-banking logins.</li>
                <li>Your full bank account number (only the last 4 digits).</li>
                <li>Passwords (sign-in is handled by Elixpo Accounts).</li>
                <li>API keys in readable form (only SHA-256 hashes).</li>
            </ul>
            <p>
                Payment instruments are handled entirely by Razorpay, an
                RBI-regulated payment gateway, keeping card and bank data out
                of our systems. We learn only that a payment succeeded, its
                amount, and its payment reference.
            </p>

            <h2>How we use it</h2>
            <ul>
                <li>
                    To process payments and record the resulting entitlements.
                </li>
                <li>
                    To deliver signed (HMAC) webhooks back to the
                    merchant&apos;s application so your access is granted.
                </li>
                <li>
                    To send transactional emails such as receipts and
                    subscription notices — see our{" "}
                    <a href="/email-policy">Email policy</a>.
                </li>
                <li>To pay out merchants and creators through Razorpay Route.</li>
                <li>To power your dashboard and reporting.</li>
                <li>
                    To detect fraud, review reported pages, reconcile against
                    provider reports, and meet legal/tax obligations.
                </li>
            </ul>

            <h2>Who processes your data</h2>
            <ul>
                <li>
                    <strong>Razorpay</strong> — processes payments, autopay
                    mandates, refunds, KYC and payouts.
                </li>
                <li>
                    <strong>Elixpo Mails</strong> (<code>mails.elixpo.com</code>)
                    — delivers our transactional emails.
                </li>
                <li>
                    <strong>Elixpo Accounts</strong> — handles sign-in.
                </li>
                <li>
                    <strong>Cloudflare</strong> — hosts Elixpo Pay and its data
                    (Cloudflare Pages, D1 database and KV storage).
                </li>
                <li>
                    <strong>The merchant</strong> whose product you bought —
                    receives a signed notice that your payment succeeded so it
                    can grant your access.
                </li>
            </ul>
            <p>
                We share data with these services strictly to run the
                transactions you initiate. We do not sell personal data, and we
                never sell or share email addresses.
            </p>

            <h2>Retention</h2>
            <p>
                Financial records are retained as required for accounting and
                regulatory compliance. You may request deletion of non-essential
                data; some records — such as records of payments — must be
                retained to satisfy legal obligations. Closing a fundraiser or
                deleting a page stops it taking payments, but records of the
                payments it received are kept.
            </p>

            <h2>Your choices</h2>
            <ul>
                <li>
                    Cancel a subscription any time under{" "}
                    <strong>My subscriptions</strong> in your dashboard.
                </li>
                <li>
                    Contribute to a fundraiser without showing your name
                    publicly, and without leaving a message.
                </li>
                <li>
                    Ask us what we hold about you, or to delete non-essential
                    data, by emailing{" "}
                    <a href="mailto:hello@elixpo.com">hello@elixpo.com</a>.
                </li>
            </ul>

            <h2>Security</h2>
            <p>
                Elixpo Pay&apos;s source code is open on{" "}
                <a href="https://github.com/elixpo/payouts.elixpo">GitHub</a>.
                If you find a security issue, please report it privately
                through our{" "}
                <a href="https://github.com/elixpo/payouts.elixpo/security/advisories/new">
                    GitHub security advisory form
                </a>
                .
            </p>

            <h2>Contact</h2>
            <p>
                Questions? Email{" "}
                <a href="mailto:hello@elixpo.com">hello@elixpo.com</a>.
            </p>

            <PolicyLinks lead="Related:" style={{ marginTop: "3rem" }} />
        </LegalShell>
    );
}
