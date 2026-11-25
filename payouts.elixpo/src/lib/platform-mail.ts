/**
 * Elixpo Pay's OWN transactional emails (not a merchant's buyer emails):
 * fundraiser thank-you receipts, "you got a contribution" alerts to creators,
 * and page-report alerts to admins. Sent through Elixpo Mails trigger hooks
 * configured on the Pay deployment:
 *
 *   PAY_MAILS_SIGNING_SECRET                    Mails product secret (Elixpo Pay product)
 *   PAY_MAILS_HOOK_FUNDRAISER_THANK_YOU         https://mails.elixpo.com/v1/hooks/<key>
 *   PAY_MAILS_HOOK_FUNDRAISER_NEW_CONTRIBUTION  "
 *   PAY_MAILS_HOOK_FUNDRAISER_REPORT            "
 *
 * Unset hook → the email is skipped (logged), never an error.
 */

import { getEnv } from "./env";
import { postToMails, validateHookUrl } from "./mail-notify";

export type PlatformMailEvent =
    | "fundraiser.thank_you"
    | "fundraiser.new_contribution"
    | "fundraiser.report";

const HOOK_ENV: Record<PlatformMailEvent, string> = {
    "fundraiser.thank_you": "PAY_MAILS_HOOK_FUNDRAISER_THANK_YOU",
    "fundraiser.new_contribution": "PAY_MAILS_HOOK_FUNDRAISER_NEW_CONTRIBUTION",
    "fundraiser.report": "PAY_MAILS_HOOK_FUNDRAISER_REPORT",
};

export type PlatformMailStatus = "sent" | "queued" | "suppressed" | "failed" | "skipped";

/** Best-effort send; returns the outcome for bookkeeping. Never throws. */
export async function sendPlatformMail(
    event: PlatformMailEvent,
    to: string | null | undefined,
    variables: Record<string, string>,
    idempotencyKey: string,
): Promise<PlatformMailStatus> {
    try {
        if (!to) return "skipped";
        const secret = await getEnv("PAY_MAILS_SIGNING_SECRET");
        const rawUrl = await getEnv(HOOK_ENV[event]);
        const url = rawUrl ? validateHookUrl(rawUrl) : null;
        if (!secret || !url) {
            console.warn("[platform-mail] %s not configured — skipped", event);
            return "skipped";
        }
        const res = await postToMails(
            { hook_url: url, signing_secret: secret },
            { to, variables: { event, ...variables }, idempotency_key: `elixpo-pay:${idempotencyKey}` },
        );
        if (res.error) {
            console.error("[platform-mail] %s failed: %s", event, res.error);
            return "failed";
        }
        if (res.status === 202 || res.json?.status === "queued") return "queued";
        if (res.json?.status === "suppressed") return "suppressed";
        return res.ok ? "sent" : "failed";
    } catch (err) {
        console.error("[platform-mail] %s error:", event, err);
        return "failed";
    }
}
