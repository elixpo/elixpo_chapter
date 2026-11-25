export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getSession, SESSION_COOKIE } from "@/lib/session";
import { revokeSessions } from "@/lib/session-revocation";

function clearSession(res: NextResponse) {
    res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
}

/**
 * POST /api/auth/logout — signs out everywhere: clears this cookie and revokes
 * every session the user holds server-side, so a copied cookie stops working.
 */
export async function POST(request: NextRequest) {
    const session = await getSession(request);
    if (session) await revokeSessions(session.uid);
    return clearSession(NextResponse.json({ ok: true }));
}

/**
 * GET is not a logout (a cross-site link or image must not be able to sign
 * someone out). It just sends the visitor to the dashboard, where the sign-out
 * button POSTs.
 */
export async function GET(request: NextRequest) {
    return NextResponse.redirect(`${request.nextUrl.origin}/dashboard`);
}
