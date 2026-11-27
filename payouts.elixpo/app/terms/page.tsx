import PolicyLinks from "@/components/trust/policy-links";
import LegalShell from "../components/legal-shell";

export default function TermsPage() {
    return (
        <LegalShell
            title="Terms of Service"
            updated="18 November 2026"
            summary={[
                <>
                    Payments run on <strong>Razorpay</strong>, an RBI-regulated
                    payment gateway. Your card, UPI and bank details go to
                    Razorpay, never to us.
                </>,
                <>
                    Merchants and creators keep each payment minus a{" "}
                    <strong>5% all-in Elixpo fee</strong> (which already includes the payment gateway charges), paid out by
                    Razorpay to a KYC-verified bank account.
                </>,
                <>
                    Money given to a fundraiser is a{" "}
                    <strong>donation, not a purchase</strong> — nothing is
                    promised in return, and it is not tax-deductible.
                </>,
                <>
                    Creators must describe their fundraiser honestly and use
                    the money as described. We can hold or unpublish pages
                    that break these terms.
                </>,
                <>
                    We only send transactional emails (receipts and account
                    notices) — never marketing.
                </>,
            ]}
        >
            <p>
                These terms govern your use of Elixpo Pay (
                <code>payouts.elixpo.com</code>) and the Elixpo Pay API,
                operated by Elixpo (<code>elixpo.com</code>). By paying through
                Elixpo Pay, creating a merchant account or fundraiser,
                connecting payouts, or integrating the API, you agree to them.
            </p>

            <h2>The service</h2>
            <p>
                Elixpo Pay is a payments and payouts platform: a hosted
                checkout, instant access notifications (signed webhooks),
                subscriptions, fundraiser pages, and creator payouts. We act as
                a technical facilitator between you, your customers or
                contributors, and the underlying payment provider.
            </p>
            <p>
                Payments are processed by <strong>Razorpay</strong>, an
                RBI-regulated payment gateway. Card numbers, UPI PINs and bank
                logins are entered on Razorpay&apos;s checkout and never reach
                or are stored by Elixpo. We only learn that a payment
                succeeded, its amount, and its payment reference.
            </p>

            <h2>Purchases & subscriptions</h2>
            <ul>
                <li>
                    When you buy from an app that uses Elixpo Pay, the app
                    sends you to our hosted checkout. On success we notify the
                    app with a signed webhook so your access is granted.
                </li>
                <li>
                    Recurring plans renew through an autopay mandate (UPI
                    AutoPay or a card e-mandate, under RBI rules) that you
                    approve at checkout.
                </li>
                <li>
                    You can see and cancel your subscriptions at any time
                    under <strong>My subscriptions</strong> in your dashboard.
                    Cancelling stops future renewals; your access continues
                    until the end of the period you have already paid for.
                </li>
                <li>
                    Refunds follow our{" "}
                    <a href="/refunds">Refund &amp; Cancellation Policy</a>.
                </li>
            </ul>

            <h2>Merchant responsibilities</h2>
            <ul>
                <li>
                    Provide accurate business and payout information, and keep
                    it current.
                </li>
                <li>
                    Comply with the terms of the payment provider (Razorpay)
                    and applicable law.
                </li>
                <li>
                    Sell only lawful products and honour the entitlements you
                    grant customers.
                </li>
                <li>
                    Keep your API keys and webhook secrets confidential. You are
                    responsible for activity under your keys. We store API keys
                    only as SHA-256 hashes, so we cannot show a lost key again
                    — create a new one instead.
                </li>
                <li>
                    Verify the signature on every webhook we send you; each one
                    is HMAC-signed with your webhook secret.
                </li>
            </ul>

            <h2>Fundraisers</h2>
            <p>
                Creators can publish a fundraiser page (
                <code>payouts.elixpo.com/f/…</code>) and collect contributions
                from anyone.
            </p>
            <h3>For contributors</h3>
            <ul>
                <li>
                    A contribution is a <strong>donation, not a purchase</strong>
                    . Nothing — goods, services, rewards or access — is
                    promised in return.
                </li>
                <li>
                    Contributions are <strong>not tax-deductible</strong>.
                </li>
                <li>
                    The minimum contribution is ₹10. Visitors outside India may
                    see a minimum of $1; this is charged in Indian rupees at a
                    live USD→INR rate that is shown to you before you pay.
                </li>
                <li>
                    Every contributor receives an email receipt. Your email is
                    used only for that receipt and is never shown to the
                    creator. Your name is shown publicly only if you choose to
                    show it.
                </li>
                <li>
                    Contributions are generally non-refundable — see the{" "}
                    <a href="/refunds">Refund Policy</a> for the exceptions.
                </li>
            </ul>
            <h3>For creators</h3>
            <ul>
                <li>
                    Describe your fundraiser honestly: who you are, what the
                    money is for, and how it will be used.
                </li>
                <li>
                    Do not promise goods, services, rewards or anything else in
                    return for a contribution.
                </li>
                <li>
                    Use the funds you receive for the purpose you described.
                </li>
                <li>
                    Do not use fundraisers for anything unlawful, deceptive, or
                    that impersonates another person or organisation.
                </li>
            </ul>
            <h3>Moderation</h3>
            <p>
                Anyone can report a fundraiser page. Elixpo may{" "}
                <strong>hold</strong> a page (which stops it taking payments)
                while we look into it, or <strong>unpublish</strong> it if it
                breaks these terms. Closed or deleted pages stop taking
                payments.
            </p>

            <h2>Fees</h2>
            <p>
                Elixpo Pay charges a single <strong>5% all-in fee</strong> on each
                payment that is paid out to a merchant or creator. It already
                includes Razorpay&apos;s payment-gateway charges and GST on them,
                so nothing else is deducted. There is no setup fee, monthly fee
                or payout fee. Buyers and contributors pay exactly the amount
                shown. The fee in effect for your account is shown in your
                dashboard; we will give at least 30 days&apos; notice by email
                before changing it.
            </p>

            <h2>Payouts</h2>
            <ul>
                <li>
                    To receive money, a merchant or creator connects a bank
                    account (account holder name, account number and IFSC).
                    Elixpo Pay then creates a <strong>Razorpay Route</strong>{" "}
                    linked account for you, and Razorpay carries out KYC
                    (identity verification).
                </li>
                <li>
                    Each payment is split by Razorpay Route: you receive the
                    amount minus the 5% all-in Elixpo fee, settled to your
                    bank by Razorpay on its settlement schedule.
                </li>
                <li>
                    We store only the last 4 digits of your account number,
                    plus the IFSC and account holder name for display.
                </li>
                <li>
                    Payments for Elixpo&apos;s own products and fundraisers
                    settle to Elixpo&apos;s own account.
                </li>
                <li>
                    Payouts are subject to Razorpay&apos;s settlement
                    schedules, payout thresholds, and KYC verification. Funds
                    may be held where required to investigate fraud, disputes,
                    or chargebacks.
                </li>
            </ul>

            <h2>Refunds & disputes</h2>
            <p>
                Refunds and chargebacks are processed through the originating
                provider (Razorpay) and go back to the original payment method.
                Merchants are responsible for their own refund policy and for
                resolving disputes with their customers. Our{" "}
                <a href="/refunds">Refund &amp; Cancellation Policy</a> covers
                Elixpo&apos;s own products and fundraisers.
            </p>

            <h2>Emails</h2>
            <p>
                Elixpo Pay sends only transactional emails, such as payment
                receipts, subscription notices and fundraiser alerts. We do not
                send marketing email and never sell or share your email
                address. See our <a href="/email-policy">Email policy</a> for
                the full list and how they are delivered.
            </p>

            <h2>Accounts & security</h2>
            <p>
                You sign in with Elixpo Accounts; Elixpo Pay stores no
                passwords. If you find a security issue, please report it
                privately through our{" "}
                <a href="https://github.com/elixpo/payouts.elixpo/security/advisories/new">
                    GitHub security advisory form
                </a>
                . Elixpo Pay&apos;s source code is open on{" "}
                <a href="https://github.com/elixpo/payouts.elixpo">GitHub</a>.
            </p>

            <h2>Availability & liability</h2>
            <p>
                The service is provided &quot;as is&quot; without warranties.
                To the maximum extent permitted by law, Elixpo&apos;s liability
                is limited to the fees you paid us in the preceding three
                months.
            </p>

            <h2>Changes</h2>
            <p>
                We may update these terms; material changes will be announced in
                the dashboard. Continued use after changes constitutes
                acceptance.
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
