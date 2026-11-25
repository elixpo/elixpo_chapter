/**
 * Server-side session revocation. Sessions are stateless signed cookies, so a
 * stolen cookie or a user removed in Elixpo Accounts would otherwise keep
 * working until it expires. Revoking stores "sessions issued before T are dead"
 * per user in KV; requireDashboard rejects any session with iat < T.
 *
 * Fails open on KV errors (availability over a best-effort extra check; the
 * cookie is still HMAC-verified and time-limited).
 */

import { getKV } from "./kv";

const TTL_SECONDS = 16 * 24 * 60 * 60; // longer than the longest session

const key = (uid: string) => `sessrev:${uid}`;

/** Invalidate every session this user holds right now (all devices). */
export async function revokeSessions(uid: string): Promise<void> {
    try {
        const kv = await getKV();
        await kv.put(key(uid), String(Math.floor(Date.now() / 1000)), { expirationTtl: TTL_SECONDS });
    } catch (err) {
        console.error("[session] revoke failed for %s:", uid, err);
    }
}

export async function isSessionRevoked(session: { uid: string; iat: number }): Promise<boolean> {
    try {
        const kv = await getKV();
        const v = Number((await kv.get(key(session.uid))) || 0);
        return v > 0 && session.iat < v;
    } catch {
        return false;
    }
}
