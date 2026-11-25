/**
 * Product insights — shared types + pure helpers (client-safe; no server
 * imports). The server side lives in ./insights.ts.
 *
 * Three independent sources, each labelled in the UI:
 *   edge   — Cloudflare edge analytics (every request; visitor = client IP)
 *   rum    — Cloudflare Web Analytics (real browsers; page views, referrers)
 *   users  — signed-in Elixpo accounts (accounts.elixpo D1: per-app monthly
 *            activity + the users' own locale / country / device)
 */

export interface Dim {
    label: string;
    value: number;
}

export interface Product {
    /** Host, also the URL key: /dashboard/insights/<host>. */
    host: string;
    label: string;
    zoneId: string;
    pagesProject?: string;
    workerScript?: string;
    /** OAuth apps on accounts.elixpo that belong to this product. */
    apps: { id: string; name: string }[];
    /** accounts.elixpo.com itself — its users ARE the SSO user base. */
    isSso?: boolean;
}

export interface DayRow {
    date: string;
    [metric: string]: number | string;
}

export interface EdgeAudience {
    available: boolean;
    error?: string;
    /** Distinct client IPs (humans, visitor traffic) — an estimate. */
    visitors: number;
    /** Distinct IPs seen on 2+ different days in the window. */
    returning: number;
    /** Distinct IPs by number of active days: 1, 2–3, 4–7, 8+. */
    loyalty: Dim[];
    visits: number;
    requests: number;
    pageViews: number;
    /** Share of all requests made by verified bots (0..1). */
    botShare: number;
    bots: Dim[];
    daily: DayRow[];
    countries: Dim[];
    devices: Dim[];
    browsers: Dim[];
    os: Dim[];
    pages: Dim[];
    /** API endpoints, ids collapsed: "POST /api/posts/:id". */
    features: Dim[];
    /** True when a visitor chunk hit the row limit (visitors are a floor). */
    truncated: boolean;
}

export interface RumAudience {
    available: boolean;
    error?: string;
    pageViews: number;
    visits: number;
    daily: DayRow[];
    pages: Dim[];
    referrers: Dim[];
    countries: Dim[];
    browsers: Dim[];
    os: Dim[];
    devices: Dim[];
    /** Milliseconds; null when no performance beacons. */
    loadP50: number | null;
    loadP90: number | null;
    fcpP50: number | null;
}

export interface MonthRow {
    month: string; // YYYY-MM
    users: number;
    newUsers: number;
    returningUsers: number;
}

export interface SignedInAudience {
    available: boolean;
    error?: string;
    /** No OAuth app is linked to this product. */
    unlinked: boolean;
    months: MonthRow[];
    currentMau: number;
    previousMau: number;
    allTime: number;
    /** Users active in 2+ different months (0..1 of allTime). */
    returningShare: number;
    locales: Dim[];
    countries: Dim[];
    devices: Dim[];
    browsers: Dim[];
    os: Dim[];
    /** SSO only: sign-ups per month and recently-active accounts. */
    signups?: { month: string; value: number }[];
    active30?: number;
    verified?: number;
}

export interface ProductInsights {
    product: Product;
    rangeLabel: string;
    days: number;
    edge: EdgeAudience;
    rum: RumAudience;
    users: SignedInAudience;
}

export interface ProductSummary {
    product: Product;
    visits: number;
    requests: number;
    pageViews: number;
    rumVisits: number;
    mau: number;
    mauPrev: number;
    allTimeUsers: number;
    returningShare: number;
    topCountry?: string;
    spark: number[];
}

export interface InsightsOverview {
    rangeLabel: string;
    days: number;
    products: ProductSummary[];
    unmappedApps: { name: string; mau: number }[];
    sso: { users: number; verified: number; active30: number } | null;
    errors: string[];
}

/* ---------------------------------------------------------------- helpers */

const ID_SEGMENT =
    /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[A-Za-z0-9_-]{22,}|cli_[A-Za-z0-9]+|[a-z0-9]{8,}\d[a-z0-9]*)$/i;

/** "/api/posts/8f3e…/likes" → "/api/posts/:id/likes". */
export function normalizePath(path: string): string {
    const clean = path.split("?")[0] || "/";
    return (
        clean
            .split("/")
            .map((seg) => (seg && ID_SEGMENT.test(seg) ? ":id" : seg))
            .join("/") || "/"
    );
}

/** Vulnerability-scanner probes and well-known files — not product usage. */
const NOISE =
    /(\.env|\.git|wp-|wordpress|phpmyadmin|xmlrpc|\.php|\.asp|cgi-bin|\.sql|\.bak|\.ds_store|\/vendor\/|\/\.well-known\/|^\/robots\.txt$|^\/sitemap[^/]*\.xml$|^\/favicon|^\/apple-touch-icon|^\/cdn-cgi\/)/i;

export function isNoisePath(path: string): boolean {
    return NOISE.test(path.split("?")[0] || "");
}

/** Merge rows with the same label (after normalising) and sort desc. */
export function mergeDims(rows: Dim[], limit = 15): Dim[] {
    const by = new Map<string, number>();
    for (const r of rows) by.set(r.label, (by.get(r.label) || 0) + r.value);
    return Array.from(by, ([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
}

const regionNames =
    typeof Intl !== "undefined" && "DisplayNames" in Intl
        ? new Intl.DisplayNames(["en"], { type: "region" })
        : null;
const languageNames =
    typeof Intl !== "undefined" && "DisplayNames" in Intl
        ? new Intl.DisplayNames(["en"], { type: "language" })
        : null;

/** "IN" → "India"; full names pass through. */
export function countryName(code: string): string {
    if (!code || code === "unknown" || code === "XX" || code === "T1")
        return code === "T1" ? "Tor network" : "Unknown";
    if (code.length !== 2) return code;
    try {
        return regionNames?.of(code.toUpperCase()) || code;
    } catch {
        return code;
    }
}

/** "en-GB" → "English (United Kingdom)". */
export function localeName(tag: string): string {
    if (!tag || tag === "unknown") return "Not set";
    try {
        return languageNames?.of(tag) || tag;
    } catch {
        return tag;
    }
}

/** Primary language spoken in a country — used to INFER locale from edge geo. */
const COUNTRY_LANGUAGE: Record<string, string> = {
    US: "en",
    GB: "en",
    CA: "en",
    AU: "en",
    NZ: "en",
    IE: "en",
    IN: "en",
    SG: "en",
    PH: "en",
    NG: "en",
    ZA: "en",
    KE: "en",
    PK: "ur",
    BD: "bn",
    CN: "zh",
    TW: "zh",
    HK: "zh",
    JP: "ja",
    KR: "ko",
    VN: "vi",
    TH: "th",
    ID: "id",
    MY: "ms",
    DE: "de",
    AT: "de",
    CH: "de",
    FR: "fr",
    BE: "fr",
    ES: "es",
    MX: "es",
    AR: "es",
    CO: "es",
    CL: "es",
    PE: "es",
    IT: "it",
    PT: "pt",
    BR: "pt",
    NL: "nl",
    SE: "sv",
    NO: "nb",
    DK: "da",
    FI: "fi",
    PL: "pl",
    CZ: "cs",
    SK: "sk",
    HU: "hu",
    RO: "ro",
    BG: "bg",
    GR: "el",
    TR: "tr",
    RU: "ru",
    UA: "uk",
    BY: "ru",
    KZ: "ru",
    UZ: "uz",
    IL: "he",
    SA: "ar",
    AE: "ar",
    EG: "ar",
    MA: "ar",
    IR: "fa",
    NP: "ne",
    LK: "si",
};

/** Edge countries → inferred languages (clearly an approximation). */
export function inferLanguages(countries: Dim[]): Dim[] {
    return mergeDims(
        countries.map((c) => {
            const lang = COUNTRY_LANGUAGE[c.label.toUpperCase()];
            return {
                label: lang ? localeName(lang) : "Other / unknown",
                value: c.value,
            };
        }),
        10,
    );
}

export const pct = (n: number, d: number, digits = 1) =>
    d > 0 ? `${((n / d) * 100).toFixed(digits)}%` : "—";
