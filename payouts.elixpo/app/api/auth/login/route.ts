export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { safeNext } from "@/lib/safe-redirect";
import { getSession } from "@/lib/session";
import { buildAuthorizeUrl, STATE_COOKIE } from "@/lib/sso";

/**
 * GET /api/auth/login — kick off the Elixpo Accounts authorization-code flow.
 *
 * Already signed in → straight to `next`. Otherwise redirect to Accounts'
 * /oauth/authorize; Accounts sends the user back to /api/auth/callback.
 */
export async function GET(request: NextRequest) {
    const origin = request.nextUrl.origin;
    const next = safeNext(request.nextUrl.searchParams.get("next"));

    if (await getSession(request)) {
        return NextResponse.redirect(`${origin}${next}`);
    }

    // Derive the callback from the actual request origin so it's correct in
    // every environment (localhost in dev, payouts.elixpo.com in prod) without
    // depending on env vars. Both variants are registered on the OAuth client.
    const redirectUri = `${origin}/api/auth/callback`;

    const state = crypto.randomUUID();
    let url: string;
    try {
        url = await buildAuthorizeUrl(state, redirectUri);
    } catch (err) {
        console.error("[auth/login] cannot build authorize url:", err);
        return NextResponse.redirect(`${origin}/login?error=sso_unconfigured`);
    }

    const res = NextResponse.redirect(url);
    // Bind state + post-login destination to a short-lived cookie (CSRF guard).
    res.cookies.set(STATE_COOKIE, `${state}|${next}`, {
        httpOnly: true,
        secure: origin.startsWith("https://"),
        sameSite: "lax",
        maxAge: 600,
        path: "/",
    });
    return res;
}
