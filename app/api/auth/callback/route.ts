export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { getOrBootstrapMerchant } from "@/lib/merchant";
import { safeNext } from "@/lib/safe-redirect";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { exchangeCodeForUser, STATE_COOKIE } from "@/lib/sso";

const SESSION_TTL_SECONDS = 15 * 86400;

/** GET /api/auth/callback — Accounts redirects here with ?code&state. */
export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;
    const code = sp.get("code");
    const state = sp.get("state");
    const err = sp.get("error");
    const origin = request.nextUrl.origin;
    const secure = origin.startsWith("https://");

    // Every exit clears the one-shot state cookie so it can't be replayed.
    const fail = (reason: string, next?: string) => {
        const q = new URLSearchParams({ error: reason });
        if (next && next !== "/dashboard") q.set("next", next);
        const res = NextResponse.redirect(`${origin}/login?${q}`);
        res.cookies.delete(STATE_COOKIE);
        return res;
    };

    // Validate the state cookie (CSRF) before trusting anything else.
    const cookie = request.cookies.get(STATE_COOKIE)?.value || "";
    const sep = cookie.indexOf("|");
    const savedState = sep === -1 ? cookie : cookie.slice(0, sep);
    const next = safeNext(sep === -1 ? null : cookie.slice(sep + 1));

    if (err) {
        // `access_denied` = the user pressed Cancel on the consent screen.
        return fail(err === "access_denied" ? "access_denied" : "sso_failed", next);
    }
    if (!code || !state) return fail("missing_code", next);
    if (!savedState || savedState !== state) return fail("bad_state", next);

    try {
        // Must exactly match the redirect_uri sent in /api/auth/login.
        const redirectUri = `${origin}/api/auth/callback`;
        const user = await exchangeCodeForUser(code, redirectUri);
        if (!user.email) throw new Error("Accounts profile has no email");

        const db = await getDatabase();
        const merchant = await getOrBootstrapMerchant(
            db,
            user.id,
            user.email,
            user.displayName || user.username || undefined,
        );

        const token = await signSession(
            {
                uid: user.id,
                email: user.email,
                name: user.displayName || user.username || user.email,
                avatar: user.avatar ?? null,
                merchantId: merchant.id,
            },
            SESSION_TTL_SECONDS,
        );

        const res = NextResponse.redirect(`${origin}${next}`);
        res.cookies.set(SESSION_COOKIE, token, {
            httpOnly: true,
            secure,
            sameSite: "lax",
            maxAge: SESSION_TTL_SECONDS,
            path: "/",
        });
        res.cookies.delete(STATE_COOKIE);
        return res;
    } catch (e) {
        console.error("[auth/callback] error:", e);
        return fail("sso_failed", next);
    }
}
