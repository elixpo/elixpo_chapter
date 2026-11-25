# Security and money-flow audit — November 2026

Scope: every path where money moves (checkout, subscriptions, fundraisers, Razorpay
webhooks, Route payouts, refunds) and every authenticated surface (login, sessions,
dashboard and admin APIs, public fundraiser APIs). Done by reading the code and
checking production data and the live Razorpay account (read-only), before the
commercial launch. Report vulnerabilities through the GitHub security advisory
form (see `SECURITY.md`), not in public issues.

## Money reconciliation

The Falera fundraiser (`/f/falera-badge`, owned by the platform) was reconciled on
21 Nov 2026. 14 captured Razorpay payments totalling ₹362.01 matched 14 `paid`
contributions one-to-one. Razorpay took ₹8.61 in fees. ₹9.76 had already settled and
₹343.64 was waiting for settlement. Two other `paid` rows had no Razorpay payment.
They were offline amounts the owner entered through the developer test path (fixed
below), and the owner confirmed both.

## Fixed in this pass

| Area | Gap | Fix |
| --- | --- | --- |
| Fees | The 2% commission didn't cover Razorpay's ~2.36% fee (2% + GST), so every creator payment lost money | 5% all-in fee (`PLATFORM_COMMISSION_BPS = 500`) |
| Route onboarding | The code called the retired `/v1/accounts`, so no creator could be onboarded | v2 flow: account → stakeholder (PAN) → Route product → settlement bank (`src/lib/route-onboarding.ts`). It resumes after a failed step, and activation is polled while pending |
| Route onboarding | Changing bank details showed new digits but left payouts on the old account | Bank changes update the Razorpay settlement account. If that fails, the old details stay on screen |
| Route split | If the split order failed, the code retried without a split, so 100% settled to the platform silently | Fails with `payout_route_unavailable` and the buyer isn't charged |
| Route split | Non-INR prices could be sold through Route, which is INR-only | Rejected with `currency_not_supported_for_payouts` |
| Refunds | `refund.processed` and lost disputes were ignored, so totals and access stayed and the platform paid the refund | Contributions are marked refunded and drop out of totals. One-time product access is revoked and `entitlement.updated` is sent. Route transfers are reversed in proportion. Repeat deliveries do nothing |
| Refunds | A late `payment.captured` could flip a refunded contribution back to paid | The conditional update excludes `refunded` |
| Receipts | If a request was cut off after marking a payment paid, the receipt was never sent | Retried on the next webhook or confirm, and by the hourly cron sweep (Mails dedupes by idempotency key) |
| Test payments | Local `next dev` points at the production D1, so test paths could mark payments paid and grant access in live data | `testPaymentsAllowed()` is false whenever the database is production |
| Legacy handoff | The checkout amount came from the signed token, not the catalog | The catalog price is always used |
| Metadata | Caller metadata could overwrite `plan` and `source` | System keys are applied last |
| Abuse | No rate limits on contributions or reports, and every report emailed the admin | Exact per-IP and per-page limits using an atomic D1 upsert (`rate_limits`), tested with a concurrent burst. The admin is emailed only for a page's first open report |
| Sessions | Stateless cookies couldn't be revoked, so logout and account removal left them valid for up to 15 days | KV revocation checked in `requireDashboard`. Logout and the Accounts revoke webhook end all sessions. GET logout no longer signs out |
| Payouts | Changing or pausing payouts needed no recent sign-in | Sign-in within the last 15 minutes required |
| Payouts | The "self" owner-bank check let anyone confirm the owner's account number | Removed |
| Privacy | The shareable contribution-status API returned hidden contributor names | Name returned only when the contributor chose to show it |
| Headers | No Content-Security-Policy, anti-clickjacking or transport headers | Full CSP that allows only the origins in use (self, Razorpay Checkout, Cloudflare analytics, GitHub API; https images) with `object-src 'none'`, `base-uri 'self'`, `form-action` and `frame-ancestors 'none'`. Also `X-Frame-Options`, HSTS, `nosniff`, `Referrer-Policy` and `Permissions-Policy` |
| Moderation | "Unpublish" returned a page to draft, which the owner could re-publish at once | The page stays unpublished until an admin restores it. The owner can still edit it |
| Images | The share image fetched remote covers and followed redirects without re-validating them | The current share card (`/f/[slug]/og.png`) draws its own artwork and fetches no remote images |

## Checked and correct

- **Prices:** product prices always come from the catalog. The client sends only a session id, and order amount and currency come from the stored session.
- **Webhooks:** Razorpay webhooks are HMAC-verified over the raw body in constant time, de-duplicated by event id and by payment id, and ignore unknown ids.
- **Payment confirmation:** client handbacks for checkout and contributions verify Razorpay's signature and that the order id matches.
- **Contributions:** amounts are bounded server-side. The FX rate is fetched and bounded server-side, and each payment is counted exactly once (conditional update).
- **Closed fundraisers:** held, closed, ended and deleted fundraisers take no payments, and a fundraiser can't publish until payouts are active.
- **API keys:** stored as SHA-256 hashes and compared in constant time, scoped per app, with rotation grace. Outbound webhooks are HMAC-signed and https-only.
- **Login:** OAuth `state` is checked, and the `next` redirect is safe (no open redirect).
- **Session cookie:** HttpOnly, Secure, SameSite=Lax, HMAC-signed, expiry enforced.
- **Dashboard access:** every dashboard route scopes reads and writes to the signed-in merchant (no IDOR found). Moderation is admin-only, and the admin merchant is bound to its owner.
- **Bank and KYC data:** only the last 4 digits of the account number are stored. PAN, phone and address go to Razorpay only.
- **Public pages:** fundraiser markdown is escaped (no XSS), JSON-LD escapes `<`, and CSV export neutralises formulas and omits emails.
- **Secrets:** `.env` is SOPS-encrypted and `.env.local` is gitignored.

## Open items

1. **Route activation:** must be enabled on the live Razorpay account. It returns "Access Denied" today, and no creator can be paid until it's on.
2. **Webhook events:** the Razorpay webhook must be subscribed to `refund.processed`, `payment.dispute.created`, `payment.dispute.lost` and `subscription.charged`.
3. **Migrations:** `0013_route_v2_onboarding.sql` and `0014_rate_limits.sql` must be applied before deploying this code.
4. **Partial refunds:**
   - A partial refund of a product purchase records a refund row but keeps access.
   - Refunds of autopay renewals are recorded without changing access.
   - Refunds don't write a reversing ledger entry yet.
5. **Inline scripts:** the CSP allows them, because pages are statically rendered and can't carry a per-request nonce. External scripts are limited to the listed origins, and XSS is prevented by escaping (checked above).
