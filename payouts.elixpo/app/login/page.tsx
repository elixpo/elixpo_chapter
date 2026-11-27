export const runtime = "edge";

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-redirect";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import LoginError from "./login-error";

export const metadata: Metadata = {
    title: "Sign in",
    robots: { index: false },
};

/**
 * /login — no interstitial. Signed in → `next` (default /dashboard).
 * Signed out → straight to Elixpo Accounts via /api/auth/login.
 * The card UI only renders when the callback bounced back with ?error=.
 */
export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const first = (v: string | string[] | undefined) =>
        Array.isArray(v) ? v[0] : v;
    const next = safeNext(first(sp.next));
    const error = first(sp.error);

    if (error) return <LoginError error={error} next={next} />;

    const session = await verifySession(
        (await cookies()).get(SESSION_COOKIE)?.value,
    );
    redirect(
        session ? next : `/api/auth/login?next=${encodeURIComponent(next)}`,
    );
}
