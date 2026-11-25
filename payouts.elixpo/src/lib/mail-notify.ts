/**
 * Buyer emails through Elixpo Mails (mails.elixpo.com).
 *
 * Elixpo Pay knows WHEN something happened to a buyer's payment; Elixpo Mails
 * knows HOW to email them (templates, the merchant's own sender, unsubscribe,
 * delivery log). A merchant wires the two together per app by pasting, for each
 * event below, a Mails trigger URL plus the Mails product's signing secret.
 *
 * ── Contract (Elixpo Mails POST /v1/hooks/:key) ─────────────────────────────
 *   X-Elixpo-Signature: t=<unix>,v1=<hex hmac_sha256(secret, `${t}.${rawBody}`)>
 *   Body: { to, variables, idempotency_key }
 *   200 sent | 200 suppressed (unsubscribed) | 202 queued for retry | 4xx/502 fail
 *
 * Every send is best-effort: a mail failure is logged in `mail_deliveries` and
 * never breaks fulfillment. `idempotency_key` is derived from the event's
 * subject (transaction, subscription period, entitlement version), so a
 * re-delivered provider webhook can't email a buyer twice — Mails dedups on it.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { hmacSha256Hex } from "./crypto";
import { newId } from "./ids";

export const MAIL_EVENTS = [
    {
        type: "payment.receipt",
        label: "Payment receipt",
        description:
            "Every successful charge — first purchase and each renewal.",
    },
    {
        type: "subscription.cancelled",
        label: "Subscription cancelled",
        description:
            "The buyer cancelled. Access continues until {{period_end}}.",
    },
    {
        type: "payment.failed",
        label: "Renewal payment failed",
        description:
            "Autopay retries were exhausted — ask the buyer to update their payment method.",
    },
    {
        type: "access.expired",
        label: "Access expired",
        description: "The paid period ended and the buyer was downgraded.",
    },
] as const;

export type MailEvent = (typeof MAIL_EVENTS)[number]["type"];
const KNOWN = new Set<string>(MAIL_EVENTS.map((e) => e.type));
export const isMailEvent = (v: unknown): v is MailEvent =>
    typeof v === "string" && KNOWN.has(v);

/**
 * Every variable a Mails template can use, with a sample value. Shown in the
 * dashboard and docs, and used verbatim for "send test".
 */
export const MAIL_VARIABLE_SAMPLES: Record<string, string> = {
    event: "payment.receipt",
    app_name: "Acme Notes",
    customer_name: "Asha",
    customer_email: "asha@example.com",
    plan: "pro",
    product_name: "Acme Notes Pro",
    amount: "₹1,499.00",
    amount_minor: "149900",
    currency: "INR",
    interval: "month",
    is_renewal: "false",
    transaction_id: "txn_3f2a…",
    payment_id: "pay_Nx81…",
    paid_at: "15 Nov 2026",
    period_end: "15 Dec 2026",
    manage_url: "https://acme.example/billing",
};

export interface MailHookRow {
    id: string;
    app_id: string;
    event: string;
    hook_url: string;
    signing_secret: string;
    status: string;
}

/** Validate a Mails trigger URL: https (or http on localhost), /v1/hooks/<key>. */
export function validateHookUrl(raw: string): string | null {
    let u: URL;
    try {
        u = new URL(raw.trim());
    } catch {
        return null;
    }
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) {
        return null;
    }
    if (!/^\/v1\/hooks\/[^/]+\/?$/.test(u.pathname)) return null;
    u.hash = "";
    return u.toString();
}

export function formatMoney(minor: number, currency: string): string {
    try {
        return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
            style: "currency",
            currency,
        }).format(minor / 100);
    } catch {
        return `${(minor / 100).toFixed(2)} ${currency}`;
    }
}

export function formatDate(sqlOrIso: string | null | undefined): string {
    if (!sqlOrIso) return "";
    const iso = sqlOrIso.includes("T")
        ? sqlOrIso
        : `${sqlOrIso.replace(" ", "T")}Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return sqlOrIso;
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(d);
}

/** Sign + POST one trigger to Elixpo Mails. Never throws. */
/**
 * Elixpo Mails substitutes {{variables}} into the HTML body AND the subject
 * verbatim, so user-written text (names, messages, titles, report details)
 * could inject markup into an Elixpo-branded email. Neutralise the characters
 * that create tags/attributes instead of entity-escaping, which would leak
 * "&amp;" into plain-text subject lines.
 */
export function neutralizeForEmail(value: string): string {
    return (
        value
            .replace(/</g, "‹")
            .replace(/>/g, "›")
            .replace(/"/g, "”")
            // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control chars
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    );
}

/** Full HTML escape — only for building the trusted `*_html` blocks below. */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * An optional quote block for a template: empty string when there's no text,
 * so a template can write {{message_html}} and never show an empty box.
 */
export function quoteBlockHtml(text: string | null | undefined, label?: string): string {
    const t = (text ?? "").trim();
    if (!t) return "";
    const body = escapeHtml(t).replace(/\n/g, "<br>");
    const head = label
        ? `<div style="font:700 11px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:#5f6962;margin-bottom:6px">${escapeHtml(label)}</div>`
        : "";
    return `<div style="margin:16px 0;padding:14px 16px;border-left:3px solid #142018;background:#f5f6f2;border-radius:0 10px 10px 0;color:#142018;line-height:1.6">${head}${body}</div>`;
}

export async function postToMails(
    hook: Pick<MailHookRow, "hook_url" | "signing_secret">,
    body: { to: string; variables: Record<string, string>; idempotency_key: string },
): Promise<{ status: number; ok: boolean; json: any; error?: string }> {
    // Every value is neutralised except Pay-built `*_html` blocks (escaped at
    // construction), so no caller can forget to sanitise user text.
    const variables: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.variables)) {
        variables[k] = k.endsWith("_html") ? String(v ?? "") : neutralizeForEmail(String(v ?? ""));
    }
    const rawBody = JSON.stringify({ ...body, variables });
    const t = Math.floor(Date.now() / 1000);
    const v1 = await hmacSha256Hex(hook.signing_secret, `${t}.${rawBody}`);
    try {
        const res = await fetch(hook.hook_url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Elixpo-Signature": `t=${t},v1=${v1}`,
                "Idempotency-Key": body.idempotency_key,
                "User-Agent": "ElixpoPay-Mailer/1",
            },
            body: rawBody,
            signal: AbortSignal.timeout(10_000),
        });
        const text = await res.text().catch(() => "");
        let json: any = null;
        try {
            json = JSON.parse(text);
        } catch {
            json = { raw: text.slice(0, 500) };
        }
        return { status: res.status, ok: res.ok, json };
    } catch (err) {
        return {
            status: 0,
            ok: false,
            json: null,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

function outcome(status: number, json: any): string {
    if (status === 202 || json?.status === "queued") return "queued";
    if (json?.status === "suppressed") return "suppressed";
    if (status >= 200 && status < 300 && json?.ok !== false) return "sent";
    return "failed";
}

async function logDelivery(
    db: D1Database,
    row: {
        appId: string;
        event: string;
        to: string | null;
        key: string;
        status: string;
        responseStatus?: number | null;
        responseBody?: string | null;
        mailId?: string | null;
    },
) {
    try {
        await db
            .prepare(
                `INSERT INTO mail_deliveries
                   (id, app_id, event, to_email, idempotency_key, status, response_status, response_body, mail_delivery_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                newId("mailDelivery"),
                row.appId,
                row.event,
                row.to,
                row.key,
                row.status,
                row.responseStatus ?? null,
                row.responseBody ? row.responseBody.slice(0, 1000) : null,
                row.mailId ?? null,
            )
            .run();
    } catch (err) {
        console.error("[mail-notify] could not log delivery:", err);
    }
}

export interface MailNotifyInput {
    appId: string;
    event: MailEvent;
    /** Buyer in the app's namespace — used to find their email. */
    externalUid: string;
    /** Stable reference for dedup (txn id, sub id + period, ent version…). */
    ref: string;
    tier?: string | null;
    productId?: string | null;
    amount?: number | null;
    currency?: string | null;
    interval?: string | null;
    isRenewal?: boolean;
    transactionId?: string | null;
    paymentId?: string | null;
    periodEnd?: string | null;
}

/**
 * Email the buyer about a payment event, if the app has a Mails hook for it.
 * Best-effort: never throws, every outcome is recorded in `mail_deliveries`.
 */
export async function notifyBuyer(
    db: D1Database,
    input: MailNotifyInput,
): Promise<void> {
    try {
        const hook = (await db
            .prepare(
                "SELECT * FROM mail_hooks WHERE app_id = ? AND event = ? AND status = 'active'",
            )
            .bind(input.appId, input.event)
            .first()) as MailHookRow | null;
        if (!hook) return; // not wired up — nothing to do

        const key = `elixpo-pay:${input.event}:${input.ref}`;

        const ctx = (await db
            .prepare(
                `SELECT a.name AS app_name, a.homepage_url, a.pricing_url, a.return_url,
                        c.email, c.name AS customer_name
                 FROM apps a
                 LEFT JOIN customers c ON c.app_id = a.id AND c.external_uid = ?
                 WHERE a.id = ?`,
            )
            .bind(input.externalUid, input.appId)
            .first()) as {
            app_name: string;
            homepage_url: string | null;
            pricing_url: string | null;
            return_url: string | null;
            email: string | null;
            customer_name: string | null;
        } | null;

        const to = ctx?.email?.trim() || null;
        if (!to) {
            await logDelivery(db, {
                appId: input.appId,
                event: input.event,
                to: null,
                key,
                status: "skipped",
                responseBody:
                    "No buyer email on file — pass customer.email when creating the checkout session.",
            });
            return;
        }

        let productName = "";
        if (input.productId) {
            const p = (await db
                .prepare("SELECT name FROM products WHERE id = ?")
                .bind(input.productId)
                .first()) as { name: string } | null;
            productName = p?.name ?? "";
        }

        const currency = input.currency || "";
        const variables: Record<string, string> = {
            event: input.event,
            app_name: ctx?.app_name ?? "",
            customer_name: ctx?.customer_name || to.split("@")[0],
            customer_email: to,
            plan: input.tier ?? "",
            product_name: productName || ctx?.app_name || "",
            amount:
                input.amount != null && currency
                    ? formatMoney(input.amount, currency)
                    : "",
            amount_minor: input.amount != null ? String(input.amount) : "",
            currency,
            interval: input.interval ?? "",
            is_renewal: input.isRenewal ? "true" : "false",
            transaction_id: input.transactionId ?? "",
            payment_id: input.paymentId ?? "",
            paid_at: formatDate(new Date().toISOString()),
            period_end: formatDate(input.periodEnd),
            manage_url:
                ctx?.pricing_url || ctx?.return_url || ctx?.homepage_url || "",
        };

        const res = await postToMails(hook, {
            to,
            variables,
            idempotency_key: key,
        });
        await logDelivery(db, {
            appId: input.appId,
            event: input.event,
            to,
            key,
            status: res.error ? "failed" : outcome(res.status, res.json),
            responseStatus: res.status || null,
            responseBody: res.error ?? JSON.stringify(res.json),
            mailId: res.json?.id ?? null,
        });
    } catch (err) {
        console.error(
            "[mail-notify] %s for app=%s failed (non-fatal): %s",
            input.event,
            input.appId,
            err instanceof Error ? err.message : String(err),
        );
    }
}
