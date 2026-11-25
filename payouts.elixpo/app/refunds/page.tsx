import FlowDiagram from "@/components/trust/flow-diagram";
import PolicyLinks from "@/components/trust/policy-links";
import LegalShell from "../components/legal-shell";

export default function RefundsPage() {
    return (
        <LegalShell
            title="Refund & Cancellation Policy"
            updated="18 November 2026"
            summary={[
                <>
                    Cancel a subscription any time under{" "}
                    <strong>My subscriptions</strong>. It stops the next
                    renewal; you keep access until the paid period ends.
                </>,
                <>
                    Charged twice or by mistake? Tell us within{" "}
                    <strong>7 days</strong> and you get a full refund.
                </>,
                <>
                    Paid but didn&apos;t get access? We will either grant
                    access or refund you in full.
                </>,
                <>
                    Fundraiser contributions are donations and are generally
                    not refundable — except duplicate or mistaken charges, or
                    fraud.
                </>,
                <>
                    Refunds go back to the original payment method through
                    Razorpay, typically within <strong>5–7 business days</strong>
                    .
                </>,
            ]}
        >
            <p>
                Elixpo Pay processes payments for digital subscriptions and
                products — Elixpo&apos;s own software products (such as Elixpo
                Blogs Member) and products sold by merchants who use Elixpo
                Pay — and contributions to fundraiser pages. Because products
                are digital, non-tangible services delivered immediately, the
                following policy applies to cancellations and refunds.
            </p>
            <p>
                Merchants who sell through Elixpo Pay may have their own refund
                policy for their products; where they do, it applies to those
                purchases. This page applies to Elixpo&apos;s own products and
                to fundraisers.
            </p>

            <h2>Cancellation</h2>
            <p>
                You can cancel a subscription at any time from{" "}
                <strong>My subscriptions</strong> in your Elixpo Pay dashboard,
                or from your account settings on the relevant Elixpo product.
                Cancellation stops the next renewal and the autopay mandate
                behind it (UPI AutoPay or card e-mandate) — your access
                continues until the end of the period you&apos;ve already paid
                for, after which the plan reverts to free. You will get an email
                confirming the cancellation.
            </p>

            <h2>Refunds for products & subscriptions</h2>
            <ul>
                <li>
                    <strong>Duplicate or accidental charges</strong> are fully
                    refunded. Contact us within <strong>7 days</strong> with
                    your payment reference.
                </li>
                <li>
                    <strong>Service not delivered</strong> — if a successful
                    payment did not unlock the purchased benefit, we will either
                    grant access or issue a full refund.
                </li>
                <li>
                    <strong>Unused time</strong> on a current billing period is
                    generally non-refundable, since access remains active for
                    the full paid period after cancellation.
                </li>
            </ul>

            <h2>Fundraiser contributions</h2>
            <p>
                A contribution to a fundraiser is a donation, not a purchase:
                nothing is promised in return, and it is not tax-deductible.
                Contributions are therefore <strong>generally non-refundable</strong>
                , except for:
            </p>
            <ul>
                <li>
                    <strong>Duplicate or erroneous charges</strong> — for
                    example, being charged twice for one contribution, or
                    charged an amount you did not choose.
                </li>
                <li>
                    <strong>Fraud</strong> — for example, a payment you did not
                    make, or a fundraiser found to be fraudulent.
                </li>
            </ul>
            <p>
                To request one, email{" "}
                <a href="mailto:hello@elixpo.com">hello@elixpo.com</a> with the
                payment reference from your email receipt. If you think a
                fundraiser is not genuine, you can also report the page — we
                may hold it (which stops new payments) while we look into it.
            </p>

            <h2>How a refund reaches you</h2>
            <FlowDiagram
                title="How a refund flows back to you"
                steps={[
                    {
                        icon: "mail",
                        title: "You ask",
                        body: "Email hello@elixpo.com with your payment reference.",
                    },
                    {
                        icon: "panda",
                        title: "We review",
                        body: "We check the payment and reply within 2 business days.",
                    },
                    {
                        icon: "shield",
                        title: "Razorpay refunds",
                        body: "Approved refunds are issued through Razorpay.",
                    },
                    {
                        icon: "refund",
                        title: "Back to you",
                        body: "To your original card, UPI or bank — typically in 5–7 business days.",
                    },
                ]}
            />
            <p>
                Approved refunds are returned to the original payment method,
                processed through our payment provider (Razorpay), and typically
                settle within <strong>5–7 business days</strong> depending on
                your bank. We never ask for your card number, UPI PIN or bank
                login to issue a refund.
            </p>

            <h2>How to request a refund</h2>
            <p>
                Email <a href="mailto:hello@elixpo.com">hello@elixpo.com</a>{" "}
                from your account email (or the email your receipt was sent to)
                with your payment/transaction reference and a short
                description. We respond within 2 business days.
            </p>

            <h2>Chargebacks & disputes</h2>
            <p>
                If you believe a charge is incorrect, please contact us first —
                we can resolve most issues faster than a bank dispute.
                Chargebacks are handled through the originating provider.
            </p>

            <h2>Contact</h2>
            <p>
                Questions about this policy? Email{" "}
                <a href="mailto:hello@elixpo.com">hello@elixpo.com</a> or visit
                our <a href="/contact">contact page</a>.
            </p>

            <PolicyLinks trust="refunds" lead="Related:" style={{ marginTop: "3rem" }} />
        </LegalShell>
    );
}
