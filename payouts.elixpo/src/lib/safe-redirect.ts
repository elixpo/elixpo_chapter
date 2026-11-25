/**
 * Post-login destination guard. `next` comes from the query string, so it must
 * be a same-origin path: a leading single "/" and nothing that a browser would
 * resolve to another host ("//evil.com", "/\evil.com", "/%2F…" after decoding).
 */

export const DEFAULT_AFTER_LOGIN = "/dashboard";

export function safeNext(raw: string | null | undefined): string {
    if (!raw) return DEFAULT_AFTER_LOGIN;
    let value = raw.trim();
    try {
        value = decodeURIComponent(value);
    } catch {
        return DEFAULT_AFTER_LOGIN;
    }
    if (!value.startsWith("/")) return DEFAULT_AFTER_LOGIN;
    if (value.startsWith("//") || value.startsWith("/\\")) {
        return DEFAULT_AFTER_LOGIN;
    }
    // Control characters (tab/newline) are stripped by URL parsers and can
    // turn "/\t/evil.com" into "//evil.com".
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional
    if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_AFTER_LOGIN;
    // Never bounce back into the auth flow itself.
    if (value === "/login" || value.startsWith("/api/auth/")) {
        return DEFAULT_AFTER_LOGIN;
    }
    return value;
}

/**
 * Merchant-supplied return URL (checkout `success_url`, app `return_url`):
 * absolute https (http only for localhost). Rejects `javascript:`/`data:` etc.,
 * which would otherwise execute on the checkout origin when we redirect.
 */
export function safeReturnUrl(raw: unknown): string | null {
    if (typeof raw !== "string" || !raw.trim()) return null;
    let u: URL;
    try {
        u = new URL(raw.trim());
    } catch {
        return null;
    }
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol === "https:" || (u.protocol === "http:" && local)) {
        return u.toString();
    }
    return null;
}
