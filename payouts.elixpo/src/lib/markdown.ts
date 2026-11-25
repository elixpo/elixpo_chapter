/**
 * Minimal, XSS-safe markdown → HTML for creator-written text (fundraiser
 * reasons). Escape-first: every character of input is HTML-escaped BEFORE any
 * formatting is applied, so no raw HTML can survive. Supported subset:
 *   # / ## / ### headings, **bold**, *italic*, `code`, [text](https://url),
 *   "- " / "* " bullet lists, "1. " numbered lists, paragraphs, line breaks.
 * Links are limited to http(s) and open in a new tab with rel=noopener.
 */

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** Inline formatting on an ALREADY-ESCAPED line. */
function inline(escaped: string): string {
    // Protect inline code first so its contents aren't formatted.
    const codes: string[] = [];
    let s = escaped.replace(/`([^`]+)`/g, (_, c: string) => {
        codes.push(c);
        return `\u0000${codes.length - 1}\u0000`;
    });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text: string, url: string) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    // biome-ignore lint/suspicious/noControlCharactersInRegex: placeholder token
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${codes[Number(i)]}</code>`);
    return s;
}

export function renderMarkdown(src: string): string {
    const lines = escapeHtml(src.replace(/\r\n?/g, "\n")).split("\n");
    const out: string[] = [];
    let para: string[] = [];
    let list: { tag: "ul" | "ol"; items: string[] } | null = null;

    const flushPara = () => {
        if (para.length) out.push(`<p>${para.map(inline).join("<br/>")}</p>`);
        para = [];
    };
    const flushList = () => {
        if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
        list = null;
    };

    for (const raw of lines) {
        const line = raw.trimEnd();
        const h = /^(#{1,3})\s+(.+)$/.exec(line);
        const ul = /^\s*[-*]\s+(.+)$/.exec(line);
        const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
        if (!line.trim()) {
            flushPara();
            flushList();
        } else if (h) {
            flushPara();
            flushList();
            const level = h[1].length + 1; // # → h2 (the page title is the h1)
            out.push(`<h${level}>${inline(h[2])}</h${level}>`);
        } else if (ul || ol) {
            flushPara();
            const tag = ul ? "ul" : "ol";
            if (list && list.tag !== tag) flushList();
            if (!list) list = { tag, items: [] };
            list.items.push((ul ?? ol)?.[1] ?? "");
        } else {
            flushList();
            para.push(line);
        }
    }
    flushPara();
    flushList();
    return out.join("\n");
}
