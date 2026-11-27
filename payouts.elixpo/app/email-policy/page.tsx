import FlowDiagram from "@/components/trust/flow-diagram";
import PolicyLinks from "@/components/trust/policy-links";
import LegalShell from "../components/legal-shell";

export default function EmailPolicyPage() {
    return (
        <LegalShell
            title="Email policy"
            updated="18 November 2026"
            summary={[
                <>
                    We send <strong>only transactional email</strong> —
                    receipts and notices about your payments. Never marketing.
                </>,
                <>
                    Your email address is <strong>never sold or shared</strong>
                    , and fundraiser contributors&apos; emails are never shown
                    to creators.
                </>,
                <>
                    Receipts can&apos;t be unsubscribed from because they are
                    your record of a payment. Anything else carries a one-click
                    unsubscribe link.
                </>,
                <>
                    Emails are delivered through Elixpo Mails. A
                    merchant&apos;s product emails come from the merchant&apos;s
                    own mailbox; fundraiser emails come from Elixpo.
                </>,
            ]}
        >
            <p>
                This policy explains which emails Elixpo Pay (
                <code>payouts.elixpo.com</code>), operated by Elixpo, sends,
                why, who they come from, and how your address is handled.
            </p>

            <h2>How an email reaches you</h2>
            <FlowDiagram
                title="How an Elixpo Pay email reaches your inbox"
                steps={[
                    {
                        icon: "check",
                        title: "Something happens",
                        body: "A payment succeeds, a renewal fails, or a subscription is cancelled.",
                    },
                    {
                        icon: "panda",
                        title: "Elixpo Pay",
                        body: "Prepares the matching transactional email — nothing else.",
                    },
                    {
                        icon: "mail",
                        title: "Elixpo Mails",
                        body: "Delivers it from the merchant's mailbox, or from Elixpo for fundraisers.",
                    },
                    {
                        icon: "phone",
                        title: "Your inbox",
                        body: "You get a record of what happened with your money.",
                    },
                ]}
            />

            <h2>The emails we send</h2>
            <p>
                Elixpo Pay sends <strong>only transactional email</strong> — a
                message is sent because something happened with your payment or
                account:
            </p>
            <ul>
                <li>
                    <strong>Payment receipts</strong> — when a purchase or
                    subscription payment succeeds.
                </li>
                <li>
                    <strong>Subscription cancellation confirmations</strong> —
                    when you cancel, confirming access lasts until the end of
                    your paid period.
                </li>
                <li>
                    <strong>Failed-renewal notices</strong> — when an autopay
                    renewal does not go through.
                </li>
                <li>
                    <strong>Access-expired notices</strong> — when a paid period
                    ends and access lapses.
                </li>
                <li>
                    <strong>Fundraiser thank-you receipts</strong> — to each
                    contributor after a contribution.
                </li>
                <li>
                    <strong>&quot;New contribution&quot; alerts</strong> — to a
                    fundraiser&apos;s creator when someone contributes.
                </li>
                <li>
                    <strong>Page-report alerts</strong> — to Elixpo admins when
                    a fundraiser page is reported.
                </li>
            </ul>
            <p>
                We do <strong>not</strong> send marketing email, newsletters or
                promotions from Elixpo Pay.
            </p>

            <h2>Who sends them</h2>
            <ul>
                <li>
                    All Elixpo Pay emails are delivered through{" "}
                    <strong>Elixpo Mails</strong> (
                    <code>mails.elixpo.com</code>).
                </li>
                <li>
                    Emails about a merchant&apos;s product (receipts,
                    subscription notices) are sent from{" "}
                    <strong>the merchant&apos;s own connected mailbox</strong>,
                    so they come from the business you paid.
                </li>
                <li>
                    Fundraiser emails are sent <strong>from Elixpo</strong>.
                </li>
            </ul>

            <h2>Your address stays private</h2>
            <ul>
                <li>
                    We <strong>never sell or share</strong> email addresses.
                </li>
                <li>
                    A fundraiser contributor&apos;s email is used only to send
                    their receipt and is{" "}
                    <strong>never shown to the creator</strong>.
                </li>
                <li>
                    Sign-in to Elixpo Pay is through Elixpo Accounts; Elixpo Pay
                    stores no passwords and never asks for one by email.
                </li>
            </ul>

            <h2>Unsubscribing</h2>
            <p>
                Transactional receipts and payment notices can&apos;t be
                unsubscribed from, because they are your record of a payment.
                Any email that is not transactional must carry an unsubscribe
                link — Elixpo Mails provides one-click unsubscribe.
            </p>

            <h2>Suspicious email?</h2>
            <p>
                Elixpo Pay emails never ask for your card number, UPI PIN or
                bank login — you only ever enter those on Razorpay&apos;s
                checkout. If an email claiming to be from Elixpo Pay looks
                wrong, forward it to{" "}
                <a href="mailto:hello@elixpo.com">hello@elixpo.com</a>.
            </p>

            <h2>Contact</h2>
            <p>
                Questions? Email{" "}
                <a href="mailto:hello@elixpo.com">hello@elixpo.com</a>.
            </p>

            <PolicyLinks trust="emails" lead="Related:" style={{ marginTop: "3rem" }} />
        </LegalShell>
    );
}
