/**
 * Sanitise hand-written template HTML (raw-HTML mode) on save. Tenants author
 * their own templates, but the HTML is previewed in the dashboard and opened
 * by recipients' mail clients, so remove anything active:
 *   - <script>, <iframe>, <object>, <embed>, <applet>, <frame(set)>, <base>,
 *     <meta http-equiv>, <link rel=import> — elements AND their content
 *   - on*="…" event-handler attributes
 *   - javascript:/vbscript:/data:text/html URLs in href/src/action/etc.
 *   - <form> wrappers (contents kept) — forms don't work in email anyway
 * Styling (inline style, <style>, tables, classes) is preserved.
 */

export const MAX_RAW_HTML_BYTES = 512 * 1024;

const BLOCKED_WITH_CONTENT = [
    "script",
    "iframe",
    "object",
    "embed",
    "applet",
    "frameset",
    "frame",
    "noscript",
];

export function sanitizeEmailHtml(input: string): string {
    let html = String(input ?? "");
    for (const tag of BLOCKED_WITH_CONTENT) {
        html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
        html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
    }
    html = html.replace(/<base\b[^>]*>/gi, "");
    html = html.replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "");
    html = html.replace(/<link\b[^>]*rel\s*=\s*["']?import[^>]*>/gi, "");
    html = html.replace(/<\/?form\b[^>]*>/gi, "");
    // Event handlers: on…= with quoted or bare values.
    // Apply repeatedly to avoid incomplete multi-character sanitization bypasses.
    let previousHtml: string;
    do {
        previousHtml = html;
        html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    } while (html !== previousHtml);
    // Dangerous URL schemes in any URL-bearing attribute (allow for entity/space obfuscation).
    html = html.replace(
        /\s(href|src|action|formaction|background|poster|xlink:href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
        (full, attr: string, _q, dq?: string, sq?: string, bare?: string) => {
            const val = (dq ?? sq ?? bare ?? "")
                // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control chars used to obfuscate "java\nscript:"
                .replace(/&#x?[0-9a-f]+;?|[\s\u0000-\u001f]/gi, "")
                .toLowerCase();
            return /^(javascript|vbscript|data:text\/html)/.test(val) ? ` ${attr}="#"` : full;
        },
    );
    // CSS expression()/javascript: inside style attributes or blocks (old IE / Outlook vectors).
    html = html
        .replace(/expression\s*\(/gi, "(")
        .replace(/url\s*\(\s*["']?\s*javascript:/gi, "url(#");
    return html;
}
