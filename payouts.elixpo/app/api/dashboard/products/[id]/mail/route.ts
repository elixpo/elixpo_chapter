export const runtime = "edge";

import type { D1Database } from "@cloudflare/workers-types";
import { type NextRequest, NextResponse } from "next/server";
import { requireDashboard } from "@/lib/dashboard-auth";
import { newId } from "@/lib/ids";
import {
    isMailEvent,
    MAIL_EVENTS,
    MAIL_VARIABLE_SAMPLES,
    type MailHookRow,
    postToMails,
    validateHookUrl,
} from "@/lib/mail-notify";

/**
 * Buyer-email settings (Elixpo Mails) for a product's app.
 *
 *   GET  → events, configured hooks, masked secret, template variables, recent sends
 *   PUT  → { signing_secret?, hooks: { "<event>": "<mails hook url>" | "" } }
 *          "" removes that event's hook; omit signing_secret to keep the current one
 *   POST → { event } send a sample email for that event to the signed-in merchant
 */

async function appForProduct(
    db: D1Database,
    merchantId: string,
    productId: string,
): Promise<{ id: string; name: string } | null> {
    return (await db
        .prepare(
            `SELECT a.id, a.name FROM products p JOIN apps a ON p.app_id = a.id
             WHERE p.id = ? AND a.merchant_id = ?`,
        )
        .bind(productId, merchantId)
        .first()) as { id: string; name: string } | null;
}

async function loadHooks(db: D1Database, appId: string): Promise<MailHookRow[]> {
    const res = await db
        .prepare("SELECT * FROM mail_hooks WHERE app_id = ? ORDER BY event")
        .bind(appId)
        .all();
    return (res.results ?? []) as unknown as MailHookRow[];
}

const mask = (s: string) => (s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : "••••");

async function context(request: NextRequest, params: Promise<{ id: string }>) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { id } = await params;
    const app = await appForProduct(ctx.db, ctx.merchantId, id);
    if (!app) {
        return NextResponse.json(
            { error: "not_found", error_description: "Product not found" },
            { status: 404 },
        );
    }
    return { ...ctx, app };
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const c = await context(request, params);
    if (c instanceof NextResponse) return c;

    const hooks = await loadHooks(c.db, c.app.id);
    const deliveries = await c.db
        .prepare(
            `SELECT id, event, to_email, status, response_status, response_body, created_at
             FROM mail_deliveries WHERE app_id = ? ORDER BY created_at DESC LIMIT 20`,
        )
        .bind(c.app.id)
        .all();

    return NextResponse.json({
        events: MAIL_EVENTS,
        variables: MAIL_VARIABLE_SAMPLES,
        secret_preview: hooks[0] ? mask(hooks[0].signing_secret) : null,
        hooks: Object.fromEntries(
            hooks.map((h) => [h.event, { url: h.hook_url, status: h.status }]),
        ),
        deliveries: deliveries.results ?? [],
    });
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const c = await context(request, params);
    if (c instanceof NextResponse) return c;

    const body: any = await request.json().catch(() => null);
    if (!body || typeof body.hooks !== "object" || body.hooks === null) {
        return NextResponse.json(
            { error: "invalid_request", error_description: "hooks object is required" },
            { status: 400 },
        );
    }

    const existing = await loadHooks(c.db, c.app.id);
    const newSecret =
        typeof body.signing_secret === "string" ? body.signing_secret.trim() : "";
    const secret = newSecret || existing[0]?.signing_secret || "";

    const upserts: { event: string; url: string }[] = [];
    const removals: string[] = [];
    for (const [event, raw] of Object.entries(body.hooks)) {
        if (!isMailEvent(event)) {
            return NextResponse.json(
                { error: "invalid_request", error_description: `Unknown event '${event}'` },
                { status: 400 },
            );
        }
        const value = typeof raw === "string" ? raw.trim() : "";
        if (!value) {
            removals.push(event);
            continue;
        }
        const url = validateHookUrl(value);
        if (!url) {
            return NextResponse.json(
                {
                    error: "invalid_hook_url",
                    error_description: `'${event}' must be an Elixpo Mails trigger URL like https://mails.elixpo.com/v1/hooks/<key>`,
                },
                { status: 400 },
            );
        }
        upserts.push({ event, url });
    }

    if (upserts.length && secret.length < 16) {
        return NextResponse.json(
            {
                error: "missing_signing_secret",
                error_description:
                    "Paste the signing secret of your Elixpo Mails product (Mails → Products → Secret).",
            },
            { status: 400 },
        );
    }

    const stmts = [
        ...removals.map((event) =>
            c.db
                .prepare("DELETE FROM mail_hooks WHERE app_id = ? AND event = ?")
                .bind(c.app.id, event),
        ),
        ...upserts.map(({ event, url }) =>
            c.db
                .prepare(
                    `INSERT INTO mail_hooks (id, app_id, event, hook_url, signing_secret)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(app_id, event) DO UPDATE SET
                        hook_url = excluded.hook_url,
                        signing_secret = excluded.signing_secret,
                        status = 'active',
                        updated_at = datetime('now')`,
                )
                .bind(newId("mailHook"), c.app.id, event, url, secret),
        ),
    ];
    // A new secret applies to every hook of this app (one Mails product).
    if (newSecret) {
        stmts.push(
            c.db
                .prepare(
                    "UPDATE mail_hooks SET signing_secret = ?, updated_at = datetime('now') WHERE app_id = ?",
                )
                .bind(newSecret, c.app.id),
        );
    }
    if (stmts.length) await c.db.batch(stmts);

    return NextResponse.json({ ok: true });
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const c = await context(request, params);
    if (c instanceof NextResponse) return c;

    const body: any = await request.json().catch(() => ({}));
    if (!isMailEvent(body?.event)) {
        return NextResponse.json(
            { error: "invalid_request", error_description: "event is required" },
            { status: 400 },
        );
    }
    const hook = (await c.db
        .prepare("SELECT * FROM mail_hooks WHERE app_id = ? AND event = ?")
        .bind(c.app.id, body.event)
        .first()) as MailHookRow | null;
    if (!hook) {
        return NextResponse.json(
            { error: "not_configured", error_description: "Save a hook URL for this event first." },
            { status: 404 },
        );
    }

    const to = c.session.email;
    const res = await postToMails(hook, {
        to,
        variables: {
            ...MAIL_VARIABLE_SAMPLES,
            event: body.event,
            app_name: c.app.name,
            customer_email: to,
        },
        // Unique per click — a test should always actually send.
        idempotency_key: `elixpo-pay:test:${crypto.randomUUID()}`,
    });

    return NextResponse.json(
        {
            ok: res.ok,
            to,
            status: res.status,
            mails: res.json,
            ...(res.error ? { error: res.error } : {}),
        },
        { status: res.ok ? 200 : 502 },
    );
}
