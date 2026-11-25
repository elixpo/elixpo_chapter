/**
 * Product insights — per-product audience KPIs from three sources:
 *
 *  - edge  : Cloudflare edge analytics (httpRequestsAdaptiveGroups). Visitor
 *            traffic only (requestSource = eyeball) and humans only (no
 *            verified bots). "Visitors" are distinct client IPs — an estimate
 *            (NAT/VPNs merge people; sampling at long ranges under-counts).
 *  - rum   : Cloudflare Web Analytics (rumPageloadEventsAdaptiveGroups) — real
 *            browsers only, with referrers and page-load timing.
 *  - users : signed-in Elixpo accounts. accounts.elixpo's D1 (elixpo_auth)
 *            records which user was active on which OAuth app per month
 *            (app_usage_seen), and each user's own locale/country/device.
 *
 * Privacy: only aggregates leave this module. No emails, user ids or IPs are
 * returned to the page.
 *
 * Budget: Pages Functions allow ~50 subrequests per render, so the overview
 * uses a fixed handful of queries for ALL products and the detail page ~10.
 */

import { acctPath, cfGraphQL, cfRest, getAccountId } from "./cloudflare-api";
import { discoverAccount } from "./discovery";
import {
    type DayRow,
    type Dim,
    type EdgeAudience,
    type InsightsOverview,
    type Product,
    type ProductInsights,
    type ProductSummary,
    type RumAudience,
    type SignedInAudience,
    isNoisePath,
    mergeDims,
    normalizePath,
} from "./insights-core";
import { cached } from "./kv";
import type { RangeWindow } from "./range";
import { listServices } from "./services";

const TTL = 120;
const AUTH_TTL = 300;
const SSO_HOST = "accounts.elixpo.com";
const AUTH_DB_NAME = "elixpo_auth";

/* ------------------------------------------------------------- windows */

/** Insights only make sense over days: clamp to 7d or 30d (default 30d). */
export function insightsWindow(w: RangeWindow): {
    since: Date;
    until: Date;
    days: number;
    label: string;
} {
    const hours =
        (new Date(w.until).getTime() - new Date(w.since).getTime()) / 3600_000;
    const days = hours > 24 * 7 + 1 ? 30 : 7;
    // Hour-aligned for cache reuse; 30d is the max range the zones allow, so
    // stay an hour inside it.
    const until = new Date(Math.floor(Date.now() / 3600_000) * 3600_000);
    const since = new Date(until.getTime() - (days * 24 - 1) * 3600_000);
    return { since, until, days, label: days === 30 ? "30 days" : "7 days" };
}

/* ------------------------------------------------------------- products */

/** Words that can't identify a product: every app is "Elixpo …". */
const STEM_SKIP = new Set(["www", "api", "app", "elixpo"]);

/** "blogs" → "blog", "payouts" → "payout", "lixrl" → "lixrl". */
function stem(label: string): string {
    return label.length > 4 && label.endsWith("s") ? label.slice(0, -1) : label;
}

interface AuthClient {
    id: string;
    name: string;
    hosts: string[];
    active: boolean;
}

function matchApps(host: string, clients: AuthClient[]): AuthClient[] {
    const first = host.split(".")[0];
    const key = STEM_SKIP.has(first) ? "" : stem(first.toLowerCase());
    return clients.filter((c) => {
        if (c.hosts.includes(host)) return true;
        // Clients without a production host (CLIs) are matched by name,
        // e.g. "LixBlogs CLI (Prod)" → blogs, "Lixrl CLI" → lixrl.com.
        if (c.hosts.some((h) => !h.startsWith("localhost"))) return false;
        const name = c.name
            .toLowerCase()
            .replace(/elixpo/g, "")
            .replace(/[^a-z0-9]/g, "");
        return key.length >= 4 && name.includes(key);
    });
}

/** Every deployed product (a host served by a Pages project or a Worker). */
export async function listProducts(): Promise<{
    products: Product[];
    clients: AuthClient[];
}> {
    const [services, auth] = await Promise.all([
        listServices().catch(() => []),
        authData(),
    ]);
    const clients = auth.ok ? auth.clients : [];
    const products = services
        .filter((s) => s.pagesProject || s.workerScript)
        .map(
            (s): Product => ({
                host: s.host,
                label: s.pagesProject || s.workerScript || s.label,
                zoneId: s.zoneId,
                pagesProject: s.pagesProject,
                workerScript: s.workerScript,
                apps: matchApps(s.host, clients).map((c) => ({
                    id: c.id,
                    name: c.name,
                })),
                isSso: s.host === SSO_HOST,
            }),
        );
    return { products, clients };
}

/* ------------------------------------------------- accounts.elixpo (D1) */

interface AuthUser {
    id: string;
    locale: string;
    country: string;
    device: string;
    browser: string;
    os: string;
    createdAt: string;
    lastLogin: string;
    verified: boolean;
}

interface AuthData {
    ok: boolean;
    error?: string;
    clients: AuthClient[];
    /** [clientId, userId, yearMonth] */
    seen: [string, string, string][];
    users: AuthUser[];
}

async function d1Query<T>(dbId: string, sql: string): Promise<T[]> {
    const env = await cfRest<{ results: T[] }[]>(
        await acctPath(`/d1/database/${dbId}/query`),
        { method: "POST", body: JSON.stringify({ sql }) },
    );
    return env.result?.[0]?.results ?? [];
}

const norm = (v: unknown) => {
    const s = v == null ? "" : String(v).trim();
    return s || "unknown";
};

/** Read-only snapshot of the SSO tables needed for insights (cached 5 min). */
/** Resolve the SSO database id: discovery cache first, then a direct lookup. */
async function authDbId(): Promise<string> {
    const inv = await discoverAccount().catch(() => null);
    const hit = inv?.d1.find((d) => d.name === AUTH_DB_NAME);
    if (hit) return hit.uuid;
    const env = await cfRest<{ uuid: string; name: string }[]>(
        await acctPath(`/d1/database?name=${AUTH_DB_NAME}`),
    );
    const db = (env.result || []).find((d) => d.name === AUTH_DB_NAME);
    if (!db) throw new Error(`D1 database ${AUTH_DB_NAME} not found`);
    return db.uuid;
}

/**
 * One in-flight load per isolate: the product list and the KPIs both need
 * this, and they must agree (and not double the D1 reads) within a request.
 */
let authInflight: { at: number; p: Promise<AuthData> } | null = null;

function authData(): Promise<AuthData> {
    if (authInflight && Date.now() - authInflight.at < 30_000)
        return authInflight.p;
    const p = loadAuthData();
    authInflight = { at: Date.now(), p };
    // A failure must not be reused for the whole window.
    p.then((r) => {
        if (!r.ok && authInflight?.p === p) authInflight = null;
    });
    return p;
}

async function loadAuthData(): Promise<AuthData> {
    return cached<AuthData>("insights:auth:v1", AUTH_TTL, async () => {
        try {
            const db = { uuid: await authDbId() };
            const [clients, seen, users] = await Promise.all([
                d1Query<{
                    client_id: string;
                    name: string;
                    redirect_uris: string;
                    is_active: number;
                }>(
                    db.uuid,
                    "SELECT client_id, name, redirect_uris, is_active FROM oauth_clients",
                ),
                d1Query<{ c: string; u: string; m: string }>(
                    db.uuid,
                    "SELECT client_id AS c, user_id AS u, year_month AS m FROM app_usage_seen LIMIT 200000",
                ),
                d1Query<Record<string, unknown>>(
                    db.uuid,
                    "SELECT id, locale, country, device_type, browser, os, created_at, last_login, email_verified FROM users LIMIT 200000",
                ),
            ]);
            return {
                ok: true,
                clients: clients.map((c) => ({
                    id: c.client_id,
                    name: c.name.trim(),
                    active: !!c.is_active,
                    hosts: Array.from(
                        new Set(
                            (
                                String(c.redirect_uris).match(
                                    /https?:\/\/[^/"\s,\]]+/g,
                                ) || []
                            ).map((u) =>
                                u.replace(/^https?:\/\//, "").toLowerCase(),
                            ),
                        ),
                    ),
                })),
                seen: seen.map((r) => [r.c, r.u, r.m]),
                users: users.map((u) => ({
                    id: String(u.id),
                    locale: norm(u.locale),
                    country: norm(u.country),
                    device: norm(u.device_type),
                    browser: norm(u.browser),
                    os: norm(u.os),
                    createdAt: String(u.created_at || ""),
                    lastLogin: String(u.last_login || ""),
                    verified: !!u.email_verified,
                })),
            };
        } catch (e) {
            return {
                ok: false,
                error: (e as Error).message,
                clients: [],
                seen: [],
                users: [],
            };
        }
    });
}

function countBy(users: AuthUser[], key: keyof AuthUser, limit = 12): Dim[] {
    const m = new Map<string, number>();
    for (const u of users) {
        const k = String(u[key]);
        m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m, ([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
}

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

function signedIn(product: Product, auth: AuthData): SignedInAudience {
    const base: SignedInAudience = {
        available: auth.ok,
        error: auth.error,
        unlinked: !product.isSso && product.apps.length === 0,
        months: [],
        currentMau: 0,
        previousMau: 0,
        allTime: 0,
        returningShare: 0,
        locales: [],
        countries: [],
        devices: [],
        browsers: [],
        os: [],
    };
    if (!auth.ok) return base;

    const now = new Date();
    const cur = monthKey(now);
    const prev = monthKey(
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
    );
    const byId = new Map(auth.users.map((u) => [u.id, u]));

    if (product.isSso) {
        // The SSO's audience is every account; activity = last login.
        const signups = new Map<string, number>();
        for (const u of auth.users) {
            const m = u.createdAt.slice(0, 7);
            if (m) signups.set(m, (signups.get(m) || 0) + 1);
        }
        const since30 = Date.now() - 30 * 86400_000;
        const active30 = auth.users.filter(
            (u) =>
                u.lastLogin &&
                Date.parse(`${u.lastLogin.replace(" ", "T")}Z`) >= since30,
        ).length;
        // Monthly actives across ALL apps, deduped per user.
        const perMonth = new Map<string, Set<string>>();
        for (const [, u, m] of auth.seen) {
            if (!perMonth.has(m)) perMonth.set(m, new Set());
            perMonth.get(m)?.add(u);
        }
        const months = monthsFrom(perMonth);
        return {
            ...base,
            months,
            currentMau: perMonth.get(cur)?.size || 0,
            previousMau: perMonth.get(prev)?.size || 0,
            allTime: auth.users.length,
            returningShare: returningShareOf(
                auth.seen.map(([, u, m]) => [u, m]),
            ),
            locales: countBy(auth.users, "locale"),
            countries: countBy(auth.users, "country"),
            devices: countBy(auth.users, "device"),
            browsers: countBy(auth.users, "browser"),
            os: countBy(auth.users, "os"),
            signups: Array.from(signups, ([month, value]) => ({ month, value }))
                .sort((a, b) => a.month.localeCompare(b.month))
                .slice(-12),
            active30,
            verified: auth.users.filter((u) => u.verified).length,
        };
    }

    if (base.unlinked) return base;
    const ids = new Set(product.apps.map((a) => a.id));
    const rows = auth.seen.filter(([c]) => ids.has(c));
    const perMonth = new Map<string, Set<string>>();
    const userIds = new Set<string>();
    for (const [, u, m] of rows) {
        if (!perMonth.has(m)) perMonth.set(m, new Set());
        perMonth.get(m)?.add(u);
        userIds.add(u);
    }
    const audience = [...userIds]
        .map((id) => byId.get(id))
        .filter((u): u is AuthUser => !!u);
    return {
        ...base,
        months: monthsFrom(perMonth),
        currentMau: perMonth.get(cur)?.size || 0,
        previousMau: perMonth.get(prev)?.size || 0,
        allTime: userIds.size,
        returningShare: returningShareOf(rows.map(([, u, m]) => [u, m])),
        locales: countBy(audience, "locale"),
        countries: countBy(audience, "country"),
        devices: countBy(audience, "device"),
        browsers: countBy(audience, "browser"),
        os: countBy(audience, "os"),
    };
}

/** Per-month actives with new (first month ever) vs returning, last 12. */
function monthsFrom(perMonth: Map<string, Set<string>>) {
    const ordered = [...perMonth.keys()].sort();
    const seenBefore = new Set<string>();
    const out = ordered.map((month) => {
        const users = perMonth.get(month) || new Set<string>();
        let newUsers = 0;
        for (const u of users) if (!seenBefore.has(u)) newUsers++;
        for (const u of users) seenBefore.add(u);
        return {
            month,
            users: users.size,
            newUsers,
            returningUsers: users.size - newUsers,
        };
    });
    return out.slice(-12);
}

function returningShareOf(pairs: [string, string][]): number {
    const months = new Map<string, Set<string>>();
    for (const [u, m] of pairs) {
        if (!months.has(u)) months.set(u, new Set());
        months.get(u)?.add(m);
    }
    if (!months.size) return 0;
    let ret = 0;
    for (const s of months.values()) if (s.size >= 2) ret++;
    return ret / months.size;
}

/* -------------------------------------------------------- edge analytics */

const HUMAN = `requestSource:"eyeball",verifiedBotCategory:""`;

const dims = (
    rows: any[],
    key: string,
    metric: "count" | "visits" = "count",
): Dim[] =>
    (rows || []).map((r) => ({
        label: String(r.dimensions?.[key] ?? "unknown") || "unknown",
        value: metric === "visits" ? (r.sum?.visits ?? 0) : (r.count ?? 0),
    }));

async function edgeAudience(
    product: Product,
    win: ReturnType<typeof insightsWindow>,
): Promise<EdgeAudience> {
    const empty: EdgeAudience = {
        available: false,
        visitors: 0,
        returning: 0,
        loyalty: [],
        visits: 0,
        requests: 0,
        pageViews: 0,
        botShare: 0,
        bots: [],
        daily: [],
        countries: [],
        devices: [],
        browsers: [],
        os: [],
        pages: [],
        features: [],
        truncated: false,
    };
    const key = `insights:edge:${product.host}:${win.since.toISOString()}`;
    return cached<EdgeAudience>(key, TTL, async () => {
        try {
            const vars = {
                z: product.zoneId,
                s: win.since.toISOString(),
                u: win.until.toISOString(),
                h: product.host,
            };
            const f = (extra = "") =>
                `filter:{datetime_geq:$s,datetime_leq:$u,clientRequestHTTPHost:$h,${HUMAN}${extra}}`;
            const g = (
                alias: string,
                dim: string,
                limit: number,
                extra = "",
                order = "count_DESC",
            ) =>
                `${alias}:httpRequestsAdaptiveGroups(limit:${limit},${f(extra)},orderBy:[${order}]){count sum{visits} dimensions{${dim}}}`;
            const data = await cfGraphQL<any>(
                `query($z:String!,$s:Time!,$u:Time!,$h:string!){viewer{zones(filter:{zoneTag:$z}){
                    ${g("daily", "date", 100, "", "date_ASC")}
                    ${g("dailyHtml", "date", 100, ',edgeResponseContentTypeName:"html"', "date_ASC")}
                    ${g("country", "clientCountryName", 25)}
                    ${g("device", "clientDeviceType", 8)}
                    ${g("browser", "userAgentBrowser", 12)}
                    ${g("os", "userAgentOS", 12)}
                    ${g("pages", "clientRequestPath", 150, ',edgeResponseContentTypeName:"html"')}
                    ${g("api", "clientRequestHTTPMethodName clientRequestPath", 300, ',edgeResponseContentTypeName:"json"')}
                    bots:httpRequestsAdaptiveGroups(limit:10,filter:{datetime_geq:$s,datetime_leq:$u,clientRequestHTTPHost:$h,requestSource:"eyeball",verifiedBotCategory_neq:""},orderBy:[count_DESC]){count dimensions{verifiedBotCategory}}
                }}}`,
                vars,
            );
            const z = data?.viewer?.zones?.[0] || {};

            const htmlByDate = new Map<string, number>(
                (z.dailyHtml || []).map((r: any) => [
                    r.dimensions.date,
                    r.count ?? 0,
                ]),
            );
            const daily: DayRow[] = (z.daily || []).map((r: any) => ({
                date: r.dimensions.date,
                requests: r.count ?? 0,
                visits: r.sum?.visits ?? 0,
                pageViews: htmlByDate.get(r.dimensions.date) ?? 0,
                visitors: 0,
            }));
            const requests = daily.reduce((a, d) => a + Number(d.requests), 0);
            const bots = dims(z.bots, "verifiedBotCategory");
            const botTotal = bots.reduce((a, b) => a + b.value, 0);

            const ips = await visitorsByIp(product, win);
            for (const d of daily)
                d.visitors = ips.perDay.get(String(d.date)) || 0;

            return {
                available: true,
                visitors: ips.visitors,
                returning: ips.returning,
                loyalty: ips.loyalty,
                visits: daily.reduce((a, d) => a + Number(d.visits), 0),
                requests,
                pageViews: daily.reduce((a, d) => a + Number(d.pageViews), 0),
                botShare:
                    requests + botTotal ? botTotal / (requests + botTotal) : 0,
                bots,
                daily,
                countries: dims(z.country, "clientCountryName"),
                devices: dims(z.device, "clientDeviceType"),
                browsers: dims(z.browser, "userAgentBrowser"),
                os: dims(z.os, "userAgentOS"),
                pages: mergeDims(
                    (z.pages || [])
                        .filter(
                            (r: any) =>
                                !isNoisePath(
                                    String(r.dimensions.clientRequestPath),
                                ),
                        )
                        .map((r: any) => ({
                            label: String(r.dimensions.clientRequestPath).split(
                                "?",
                            )[0],
                            value: r.count ?? 0,
                        })),
                    25,
                ),
                features: mergeDims(
                    (z.api || [])
                        .filter(
                            (r: any) =>
                                !isNoisePath(
                                    String(r.dimensions.clientRequestPath),
                                ),
                        )
                        .map((r: any) => ({
                            label: `${r.dimensions.clientRequestHTTPMethodName} ${normalizePath(String(r.dimensions.clientRequestPath))}`,
                            value: r.count ?? 0,
                        })),
                    25,
                ),
                truncated: ips.truncated,
            };
        } catch (e) {
            return { ...empty, error: (e as Error).message };
        }
    });
}

/**
 * Distinct client IPs per day, fetched in ≤6-day chunks so each stays under
 * the 10k-row limit. Only aggregates are returned — never the IPs.
 */
async function visitorsByIp(
    product: Product,
    win: ReturnType<typeof insightsWindow>,
) {
    const chunkMs = 6 * 86400_000;
    const chunks: [Date, Date][] = [];
    for (let t = win.since.getTime(); t < win.until.getTime(); t += chunkMs) {
        chunks.push([
            new Date(t),
            new Date(Math.min(t + chunkMs, win.until.getTime())),
        ]);
    }
    const LIMIT = 10000;
    const results = await Promise.all(
        chunks.map(([s, u]) =>
            cfGraphQL<any>(
                `query($z:String!,$s:Time!,$u:Time!,$h:string!){viewer{zones(filter:{zoneTag:$z}){
                    g:httpRequestsAdaptiveGroups(limit:${LIMIT},filter:{datetime_geq:$s,datetime_leq:$u,clientRequestHTTPHost:$h,${HUMAN}},orderBy:[count_DESC]){
                        dimensions{clientIP date}
                    }
                }}}`,
                {
                    z: product.zoneId,
                    s: s.toISOString(),
                    u: u.toISOString(),
                    h: product.host,
                },
            ).then((d) => (d?.viewer?.zones?.[0]?.g ?? []) as any[]),
        ),
    );
    const daysPerIp = new Map<string, Set<string>>();
    const perDayIps = new Map<string, Set<string>>();
    let truncated = false;
    for (const rows of results) {
        if (rows.length >= LIMIT) truncated = true;
        for (const r of rows) {
            const ip = String(r.dimensions.clientIP);
            const date = String(r.dimensions.date);
            if (!daysPerIp.has(ip)) daysPerIp.set(ip, new Set());
            daysPerIp.get(ip)?.add(date);
            if (!perDayIps.has(date)) perDayIps.set(date, new Set());
            perDayIps.get(date)?.add(ip);
        }
    }
    const buckets = [
        { label: "1 day", test: (n: number) => n === 1 },
        { label: "2–3 days", test: (n: number) => n >= 2 && n <= 3 },
        { label: "4–7 days", test: (n: number) => n >= 4 && n <= 7 },
        { label: "8+ days", test: (n: number) => n >= 8 },
    ];
    const counts = [...daysPerIp.values()].map((s) => s.size);
    return {
        visitors: daysPerIp.size,
        returning: counts.filter((n) => n >= 2).length,
        loyalty: buckets.map((b) => ({
            label: b.label,
            value: counts.filter(b.test).length,
        })),
        perDay: new Map([...perDayIps].map(([d, s]) => [d, s.size])),
        truncated,
    };
}

/* -------------------------------------------------- web analytics (RUM) */

async function rumAudience(
    product: Product,
    win: ReturnType<typeof insightsWindow>,
): Promise<RumAudience> {
    const empty: RumAudience = {
        available: false,
        pageViews: 0,
        visits: 0,
        daily: [],
        pages: [],
        referrers: [],
        countries: [],
        browsers: [],
        os: [],
        devices: [],
        loadP50: null,
        loadP90: null,
        fcpP50: null,
    };
    const key = `insights:rum:${product.host}:${win.since.toISOString()}`;
    return cached<RumAudience>(key, TTL, async () => {
        try {
            const a = await getAccountId();
            const f = "filter:{datetime_geq:$s,datetime_leq:$u,requestHost:$h}";
            const g = (
                alias: string,
                dim: string,
                limit: number,
                order = "count_DESC",
            ) =>
                `${alias}:rumPageloadEventsAdaptiveGroups(limit:${limit},${f},orderBy:[${order}]){count sum{visits} dimensions{${dim}}}`;
            const data = await cfGraphQL<any>(
                `query($a:String!,$s:Time!,$u:Time!,$h:string!){viewer{accounts(filter:{accountTag:$a}){
                    ${g("daily", "date", 100, "date_ASC")}
                    ${g("pages", "requestPath", 50)}
                    ${g("ref", "refererHost", 30)}
                    ${g("country", "countryName", 25)}
                    ${g("browser", "userAgentBrowser", 12)}
                    ${g("os", "userAgentOS", 12)}
                    ${g("device", "deviceType", 6)}
                    perf:rumPerformanceEventsAdaptiveGroups(limit:1,${f}){count quantiles{pageLoadTimeP50 pageLoadTimeP90 firstContentfulPaintP50}}
                }}}`,
                {
                    a,
                    s: win.since.toISOString(),
                    u: win.until.toISOString(),
                    h: product.host,
                },
            );
            const acc = data?.viewer?.accounts?.[0] || {};
            const daily: DayRow[] = (acc.daily || []).map((r: any) => ({
                date: r.dimensions.date,
                pageViews: r.count ?? 0,
                visits: r.sum?.visits ?? 0,
            }));
            const q = acc.perf?.[0]?.quantiles;
            // RUM timings are microseconds.
            const ms = (v: unknown) =>
                typeof v === "number" && v > 0 ? Math.round(v / 1000) : null;
            return {
                available: true,
                pageViews: daily.reduce((s, d) => s + Number(d.pageViews), 0),
                visits: daily.reduce((s, d) => s + Number(d.visits), 0),
                daily,
                pages: dims(acc.pages, "requestPath").filter(
                    (d) => !isNoisePath(d.label),
                ),
                // Self-referrals are navigation inside the product, not acquisition.
                referrers: dims(acc.ref, "refererHost", "visits")
                    .filter((d) => d.label !== product.host && d.value > 0)
                    .map((d) => ({
                        ...d,
                        label:
                            d.label === "unknown" ? "Direct / none" : d.label,
                    })),
                countries: dims(acc.country, "countryName"),
                browsers: dims(acc.browser, "userAgentBrowser"),
                os: dims(acc.os, "userAgentOS"),
                devices: dims(acc.device, "deviceType"),
                loadP50: ms(q?.pageLoadTimeP50),
                loadP90: ms(q?.pageLoadTimeP90),
                fcpP50: ms(q?.firstContentfulPaintP50),
            };
        } catch (e) {
            return { ...empty, error: (e as Error).message };
        }
    });
}

/* --------------------------------------------------------------- public */

export async function productInsights(
    host: string,
    w: RangeWindow,
): Promise<ProductInsights | null> {
    const win = insightsWindow(w);
    const [{ products }, auth] = await Promise.all([
        listProducts(),
        authData(),
    ]);
    const product = products.find((p) => p.host === host.toLowerCase());
    if (!product) return null;
    const [edge, rum] = await Promise.all([
        edgeAudience(product, win),
        rumAudience(product, win),
    ]);
    return {
        product,
        rangeLabel: win.label,
        days: win.days,
        edge,
        rum,
        users: signedIn(product, auth),
    };
}

/** All products at once with a fixed query budget (≈5 subrequests). */
export async function insightsOverview(
    w: RangeWindow,
): Promise<InsightsOverview> {
    const win = insightsWindow(w);
    const [{ products, clients }, auth] = await Promise.all([
        listProducts(),
        authData(),
    ]);
    const errors: string[] = [];
    if (!auth.ok && auth.error) errors.push(`Signed-in users: ${auth.error}`);

    const zones = Array.from(new Set(products.map((p) => p.zoneId)));
    const hosts = products.map((p) => p.host);
    const [edgeRows, rumRows] = await Promise.all([
        Promise.all(
            zones.map((z) =>
                cached(
                    `insights:ov:edge:${z}:${win.since.toISOString()}:${hosts.length}`,
                    TTL,
                    async () => {
                        try {
                            const d = await cfGraphQL<any>(
                                `query($z:String!,$s:Time!,$u:Time!,$h:[string!]){viewer{zones(filter:{zoneTag:$z}){
                                daily:httpRequestsAdaptiveGroups(limit:10000,filter:{datetime_geq:$s,datetime_leq:$u,clientRequestHTTPHost_in:$h,${HUMAN}},orderBy:[date_ASC]){count sum{visits} dimensions{date clientRequestHTTPHost}}
                                html:httpRequestsAdaptiveGroups(limit:2000,filter:{datetime_geq:$s,datetime_leq:$u,clientRequestHTTPHost_in:$h,${HUMAN},edgeResponseContentTypeName:"html"},orderBy:[count_DESC]){count dimensions{clientRequestHTTPHost}}
                                country:httpRequestsAdaptiveGroups(limit:2000,filter:{datetime_geq:$s,datetime_leq:$u,clientRequestHTTPHost_in:$h,${HUMAN}},orderBy:[count_DESC]){count dimensions{clientRequestHTTPHost clientCountryName}}
                            }}}`,
                                {
                                    z,
                                    s: win.since.toISOString(),
                                    u: win.until.toISOString(),
                                    h: hosts,
                                },
                            );
                            return {
                                available: true,
                                z: d?.viewer?.zones?.[0] || {},
                            };
                        } catch (e) {
                            return {
                                available: false,
                                error: (e as Error).message,
                                z: {} as any,
                            };
                        }
                    },
                ),
            ),
        ),
        cached(`insights:ov:rum:${win.since.toISOString()}`, TTL, async () => {
            try {
                const a = await getAccountId();
                const d = await cfGraphQL<any>(
                    `query($a:String!,$s:Time!,$u:Time!){viewer{accounts(filter:{accountTag:$a}){
                        g:rumPageloadEventsAdaptiveGroups(limit:500,filter:{datetime_geq:$s,datetime_leq:$u},orderBy:[count_DESC]){count sum{visits} dimensions{requestHost}}
                    }}}`,
                    {
                        a,
                        s: win.since.toISOString(),
                        u: win.until.toISOString(),
                    },
                );
                return {
                    available: true,
                    rows: d?.viewer?.accounts?.[0]?.g ?? [],
                };
            } catch (e) {
                return {
                    available: false,
                    error: (e as Error).message,
                    rows: [] as any[],
                };
            }
        }),
    ]);

    for (const r of edgeRows)
        if (!r.available && "error" in r && r.error)
            errors.push(`Edge analytics: ${r.error}`);
    if (!rumRows.available && "error" in rumRows && rumRows.error)
        errors.push(`Web Analytics: ${rumRows.error}`);

    const daily = new Map<
        string,
        Map<string, { requests: number; visits: number }>
    >();
    const html = new Map<string, number>();
    const topCountry = new Map<string, Dim>();
    for (const { z } of edgeRows) {
        for (const r of z.daily || []) {
            const h = r.dimensions.clientRequestHTTPHost;
            if (!daily.has(h)) daily.set(h, new Map());
            daily.get(h)?.set(r.dimensions.date, {
                requests: r.count ?? 0,
                visits: r.sum?.visits ?? 0,
            });
        }
        for (const r of z.html || [])
            html.set(r.dimensions.clientRequestHTTPHost, r.count ?? 0);
        for (const r of z.country || []) {
            const h = r.dimensions.clientRequestHTTPHost;
            // Ordered by count desc, so the first row per host is the top one.
            if (!topCountry.has(h))
                topCountry.set(h, {
                    label: r.dimensions.clientCountryName,
                    value: r.count ?? 0,
                });
        }
    }
    const rum = new Map<string, number>(
        rumRows.rows.map((r: any) => [
            r.dimensions.requestHost,
            r.sum?.visits ?? 0,
        ]),
    );

    const dayKeys: string[] = [];
    for (let i = win.days - 1; i >= 0; i--)
        dayKeys.push(
            new Date(win.until.getTime() - i * 86400_000)
                .toISOString()
                .slice(0, 10),
        );

    const summaries: ProductSummary[] = products.map((product) => {
        const d = daily.get(product.host);
        const u = signedIn(product, auth);
        let requests = 0;
        let visits = 0;
        for (const v of d?.values() ?? []) {
            requests += v.requests;
            visits += v.visits;
        }
        return {
            product,
            visits,
            requests,
            pageViews: html.get(product.host) || 0,
            rumVisits: rum.get(product.host) || 0,
            mau: u.currentMau,
            mauPrev: u.previousMau,
            allTimeUsers: u.allTime,
            returningShare: u.returningShare,
            topCountry: topCountry.get(product.host)?.label,
            spark: dayKeys.map((k) => d?.get(k)?.visits ?? 0),
        };
    });
    summaries.sort((a, b) => b.visits - a.visits || b.mau - a.mau);

    const mapped = new Set(products.flatMap((p) => p.apps.map((a) => a.id)));
    const cur = monthKey(new Date());
    const unmappedApps = clients
        .filter((c) => c.active && !mapped.has(c.id))
        .map((c) => ({
            name: c.name,
            mau: new Set(
                auth.seen
                    .filter(([cid, , m]) => cid === c.id && m === cur)
                    .map(([, u]) => u),
            ).size,
        }))
        .sort((a, b) => b.mau - a.mau || a.name.localeCompare(b.name));

    const since30 = Date.now() - 30 * 86400_000;
    return {
        rangeLabel: win.label,
        days: win.days,
        products: summaries,
        unmappedApps,
        sso: auth.ok
            ? {
                  users: auth.users.length,
                  verified: auth.users.filter((x) => x.verified).length,
                  active30: auth.users.filter(
                      (x) =>
                          x.lastLogin &&
                          Date.parse(`${x.lastLogin.replace(" ", "T")}Z`) >=
                              since30,
                  ).length,
              }
            : null,
        errors,
    };
}
