/**
 * Link-preview helpers for fundraisers (src/lib/fundraiser-share.ts): rupee
 * formatting, progress, the ended state, and the title / description limits
 * that OpenGraph checkers enforce. Pure functions, no database.
 * Run with `npm run test:e2e`.
 */
import {
    cardState,
    cardVersion,
    DESCRIPTION_MAX,
    formatRupees,
    fundraiserDescription,
    fundraiserPageTitle,
    markdownToPlain,
    progressPercent,
    stripEmoji,
    supportersLabel,
    TITLE_MAX,
    truncateAtWord,
} from "@/lib/fundraiser-share";

let failures = 0;
function eq(actual: unknown, expected: unknown, name: string) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    if (!pass) failures++;
    console.log(`${pass ? "PASS " : "FAIL "} ${name}${pass ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}
function ok(cond: boolean, name: string, detail?: unknown) {
    if (!cond) failures++;
    console.log(`${cond ? "PASS " : "FAIL "} ${name}${cond ? "" : `  ${JSON.stringify(detail)}`}`);
}

// ── Rupees, Indian grouping ──────────────────────────────────────────────
eq(formatRupees(0), "₹0", "zero");
eq(formatRupees(80_100), "₹801", "paise to rupees");
eq(formatRupees(800_000), "₹8,000", "thousands");
eq(formatRupees(10_000_000), "₹1,00,000", "lakh grouping");
eq(formatRupees(1_234_567_800), "₹1,23,45,678", "crore grouping");
eq(formatRupees(80_150), "₹802", "rounds to the rupee");
eq(formatRupees(Number.NaN), "₹0", "NaN reads as zero");

// ── Progress, clamped 0–100 ──────────────────────────────────────────────
eq(progressPercent(80_100, 800_000), 10, "₹801 of ₹8,000 is 10%");
eq(progressPercent(799_999, 800_000), 99, "floored: 100% only when the goal is met");
eq(progressPercent(1_600_000, 800_000), 100, "over the goal clamps to 100");
eq(progressPercent(-500, 800_000), 0, "negative clamps to 0");
eq(progressPercent(500, 0), 0, "no goal is 0%");

// ── Ended state ──────────────────────────────────────────────────────────
eq(cardState({ status: "live", ended: false, raised: 100, goal: 800_000 }), "live", "live shows the call to action");
eq(cardState({ status: "live", ended: false, raised: 900_000, goal: 800_000 }), "live", "met but still open stays live");
eq(cardState({ status: "closed", ended: false, raised: 800_000, goal: 800_000 }), "funded", "closed at the goal is funded");
eq(cardState({ status: "closed", ended: false, raised: 100, goal: 800_000 }), "ended", "closed short of the goal is ended");
eq(cardState({ status: "live", ended: true, raised: 100, goal: 800_000 }), "ended", "past its end date is ended");
eq(supportersLabel(1), "1 supporter", "singular supporter");
eq(supportersLabel(15), "15 supporters", "plural supporters");
ok(cardVersion(80_100, 3, "live") !== cardVersion(90_100, 3, "live"), "card version changes with the amount");
ok(cardVersion(80_100, 3, "live") !== cardVersion(80_100, 3, "ended"), "card version changes with the state");

// ── Truncation ───────────────────────────────────────────────────────────
eq(truncateAtWord("Short title", 20), "Short title", "fits: unchanged");
eq(truncateAtWord("Build the first Falera badges together", 20), "Build the first…", "cut at a word boundary");
eq(truncateAtWord("One, two, three four", 11), "One, two…", "no dangling comma before the ellipsis");
eq(truncateAtWord("Supercalifragilisticexpialidocious", 10), "Supercali…", "a single long word is cut");
ok(truncateAtWord("a ".repeat(200), 50).length <= 50, "never longer than the limit");

// ── Page title: under 60 ─────────────────────────────────────────────────
eq(fundraiserPageTitle("Build the first Falera badges"), "Build the first Falera badges · Elixpo Payouts", "short title keeps its suffix");
const longTitle = fundraiserPageTitle("Help our school robotics team travel to the national championship in Bengaluru");
ok(longTitle.length <= TITLE_MAX && longTitle.endsWith("… · Elixpo Payouts"), "long title shortened under 60", longTitle);
eq(fundraiserPageTitle("Panda rescue 🐼"), "Panda rescue · Elixpo Payouts", "emoji dropped from the title");

// ── Description: at most 125, from the body ──────────────────────────────
eq(markdownToPlain("# Help us 🐼\n\nHi, I'm **Ayushman**. See [GitHub](https://github.com).\n\n- ₹100 buys buttons"), "Help us. Hi, I'm Ayushman. See GitHub. ₹100 buys buttons", "markdown to plain text");
const body = "# Help us bring Falera to life 🐼\n\nHi, I'm Ayushman. For the past six months, after classes and late into the night, I've been building something I always wished existed: **an open, hackable badge**.";
const d = fundraiserDescription({ title: "Build the first Falera badges", body_md: body, who: "Ayushman", goal: 800_000 });
ok(d.length <= DESCRIPTION_MAX && d.startsWith("Help us bring Falera to life. Hi, I'm Ayushman.") && d.endsWith("…"), "description from the body, cut at a word", d);
const short = fundraiserDescription({ title: "Club trip", body_md: "Thanks!", who: "Asha", goal: 500_000 });
eq(short, "Asha is raising ₹5,000 for Club trip. Thanks!", "short body falls back to who/what");
const empty = fundraiserDescription({ title: "Club trip", body_md: "", who: "Asha", goal: 500_000 });
ok(empty.length <= DESCRIPTION_MAX && empty.startsWith("Asha is raising ₹5,000"), "empty body gets a default line", empty);
eq(stripEmoji("Hi 👋🏽 there ❤️"), "Hi there", "emoji with modifiers removed");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
