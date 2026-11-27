/**
 * Pure helpers for how a fundraiser looks when shared: the page title and
 * description that link previews show, and the numbers on the generated card
 * (app/f/[slug]/og.png). No database or runtime imports, so they're tested
 * directly (tests/e2e/fundraiser-share.e2e.ts).
 */

/** Brand name used in page titles and on the card. */
export const BRAND = "Elixpo Payouts";
/** The generated link-preview card (app/f/[slug]/og.png). */
export const CARD_SIZE = { width: 1200, height: 630 };
/** Link-preview checkers flag titles of 60+ characters. */
export const TITLE_MAX = 59;
/** og:description and meta description length (checkers suggest ~125). */
export const DESCRIPTION_MAX = 125;

/** Paise → "₹8,000", rounded to the rupee, Indian digit grouping (₹1,00,000). */
export function formatRupees(minor: number): string {
    const rupees = Math.round((Number.isFinite(minor) ? minor : 0) / 100);
    const digits = String(Math.abs(rupees));
    const grouped =
        digits.length <= 3 ? digits : `${digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${digits.slice(-3)}`;
    return `${rupees < 0 ? "-" : ""}₹${grouped}`;
}

/** Whole percent of the goal reached, clamped to 0–100 (floored, so 100 means met). */
export function progressPercent(raised: number, goal: number): number {
    if (!(goal > 0) || !Number.isFinite(raised)) return 0;
    return Math.min(100, Math.max(0, Math.floor((raised / goal) * 100)));
}

export type CardState = "live" | "funded" | "ended";

/** "live" shows the call to action; a closed or past-its-end fundraiser shows "Funded" or "Ended". */
export function cardState(f: { status: string; ended: boolean; raised: number; goal: number }): CardState {
    if (f.status !== "closed" && !f.ended) return "live";
    return f.goal > 0 && f.raised >= f.goal ? "funded" : "ended";
}

/** "1 supporter", "12 supporters". */
export function supportersLabel(n: number): string {
    return `${n} ${n === 1 ? "supporter" : "supporters"}`;
}

/** Drop emoji and joiners: the card's font has no glyphs for them, and they read badly in titles. */
export function stripEmoji(s: string): string {
    return s
        .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Shorten to at most `max` characters, cutting at a word boundary and ending
 * with "…". Text that already fits is returned unchanged.
 */
export function truncateAtWord(text: string, max: number): string {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const room = t.slice(0, max - 1); // leave space for the ellipsis
    const space = room.lastIndexOf(" ");
    // A single very long word: cut it rather than leave almost nothing.
    const cut = space >= max * 0.5 ? room.slice(0, space) : room;
    return `${cut.replace(/[\s,;:.!?\-–—(]+$/u, "")}…`;
}

/** "<title> · Elixpo Payouts", under 60 characters, the title shortened if needed. */
export function fundraiserPageTitle(title: string): string {
    const suffix = ` · ${BRAND}`;
    return `${truncateAtWord(stripEmoji(title), TITLE_MAX - suffix.length)}${suffix}`;
}

/** Markdown → one line of plain text: headings end as sentences, links keep their text. */
export function markdownToPlain(md: string): string {
    const lines = md
        .split(/\r?\n/)
        .map((line) => {
            const heading = /^\s{0,3}#{1,6}\s+/.test(line);
            let t = line
                .replace(/^\s{0,3}#{1,6}\s+/, "")
                .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "") // list markers
                .replace(/^\s*>\s?/, "") // quotes
                .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
                .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
                .replace(/(\*\*|__|\*|_|~~|`)/g, "");
            t = stripEmoji(t);
            if (heading && t && !/[.!?:]$/.test(t)) t += ".";
            return t;
        })
        .filter(Boolean);
    return lines.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The description for meta/og/twitter: the fundraiser's own words when it has
 * enough of them, else a plain "who is raising what" line; at most 125 characters.
 */
export function fundraiserDescription(f: { title: string; body_md: string; who: string; goal: number }): string {
    const body = markdownToPlain(f.body_md || "");
    if (body.length >= 40) return truncateAtWord(body, DESCRIPTION_MAX);
    const lead = `${f.who} is raising ${formatRupees(f.goal)} for ${stripEmoji(f.title)}.`;
    return truncateAtWord(`${lead} ${body || "Contribute with UPI or a card, no account needed."}`, DESCRIPTION_MAX);
}

/** Changes whenever the card's numbers change, so social caches fetch a fresh image. */
export function cardVersion(raised: number, supporters: number, state: CardState): string {
    return `${Math.max(0, Math.round(raised / 100))}-${supporters}-${state[0]}`;
}
