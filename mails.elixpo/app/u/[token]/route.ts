export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { productNameById, suppress, verifyUnsub } from "@/lib/suppressions";
import type { NextRequest } from "next/server";

function page(title: string, body: string, status = 200): Response {
    const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<title>${title} · Elixpo Mails</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#fbfbf8;
         font-family:Arial,Helvetica,sans-serif; color:#142018; }
  .card { max-width:460px; width:calc(100% - 32px); box-sizing:border-box; padding:36px 32px; background:#fff;
          border:1px solid #d7dbd6; border-radius:1.4rem; text-align:left; box-shadow:0 18px 48px rgba(20,32,24,.09); }
  .eyebrow { margin:0 0 14px; color:#3a65c7; font:700 .68rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;
             letter-spacing:.19em; text-transform:uppercase; }
  h1 { font-size:2.3rem; font-weight:600; line-height:.98; letter-spacing:-.055em; margin:0 0 14px; }
  p { color:#5f6962; font-size:0.95rem; line-height:1.65; margin:0 0 22px; }
  strong { color:#142018; }
  button { font:inherit; font-size:.85rem; font-weight:700; color:#fff; border:0; cursor:pointer; padding:13px 24px;
           border-radius:999px; background:#142018; }
  button:hover { opacity:.82; }
  .muted { color:#7e8680; font-size:0.8rem; margin-top:18px; }
</style></head><body><main class="card"><p class="eyebrow">Elixpo Mails</p>${body}</main></body></html>`;
    return new Response(html, {
        status,
        headers: {
            "content-type": "text/html; charset=utf-8",
            "x-robots-tag": "noindex, nofollow",
            "cache-control": "no-store",
        },
    });
}

/** GET /u/:token — confirmation page with a one-click Unsubscribe button. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const data = await verifyUnsub(token);
    if (!data)
        return page(
            "Invalid link",
            "<h1>Link not valid</h1><p>This unsubscribe link is invalid or has been tampered with.</p>",
            400,
        );

    const db = await getDatabase();
    const product = await productNameById(db, data.productId);
    const name = product?.name ? product.name : "this sender";
    return page(
        "Unsubscribe",
        `<h1>Unsubscribe?</h1>
         <p>Stop emails to <strong>${escapeHtml(data.email)}</strong> from <strong>${escapeHtml(name)}</strong>.</p>
         <form method="POST"><button type="submit">Unsubscribe</button></form>
         <div class="muted">You can be re-added by ${escapeHtml(name)} if you opt back in.</div>`,
    );
}

/** POST /u/:token — performs the unsubscribe (browser form + RFC 8058 one-click). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const data = await verifyUnsub(token);
    if (!data)
        return page(
            "Invalid link",
            "<h1>Link not valid</h1><p>This unsubscribe link is invalid.</p>",
            400,
        );

    const db = await getDatabase();
    await suppress(db, data.productId, data.email, "unsubscribe");
    return page(
        "Unsubscribed",
        `<h1>You're unsubscribed</h1><p><strong>${escapeHtml(data.email)}</strong> won't receive further emails from this sender.</p>`,
    );
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
