/**
 * Diagnostics core — the pure half of src/lib/diagnostics.ts (types, the
 * status-code knowledge base, aggregation and the `diagnose()` reasoning).
 *
 * No network, no env, no server-only imports, so it is safe to import from
 * "use client" components. src/lib/diagnostics.ts re-exports everything here,
 * so server code can keep importing from "@/lib/diagnostics".
 */

import type { Service } from "./services";

/* ------------------------------------------------------------------ types */

export type StatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx";
export const STATUS_CLASSES: StatusClass[] = [
    "1xx",
    "2xx",
    "3xx",
    "4xx",
    "5xx",
];

export function classOf(code: number): StatusClass {
    if (code >= 500) return "5xx";
    if (code >= 400) return "4xx";
    if (code >= 300) return "3xx";
    if (code >= 200) return "2xx";
    return "1xx";
}

export interface HostStatusRow {
    host: string;
    status: number;
    count: number;
}

export interface HostHealth {
    host: string;
    total: number;
    byClass: Record<StatusClass, number>;
    byStatus: { status: number; count: number }[];
    /** Share of requests that were not 2xx/3xx (0..1). */
    errorRate: number;
    avgOriginMs?: number;
}

export interface NonOkRow {
    host: string;
    status: number;
    originStatus: number;
    cacheStatus: string;
    securityAction: string;
    securitySource: string;
    requestSource: string;
    method: string;
    path: string;
    count: number;
}

/**
 * Requests that did NOT come from a visitor (requestSource ≠ eyeball):
 * Early Hints cache lookups, challenge-platform fetches, Worker subrequests.
 */
export interface SourceRow {
    host: string;
    status: number;
    requestSource: string;
    count: number;
}

export interface FunctionStatusRow {
    /** Worker script name or pages-worker--N-production. */
    script: string;
    kind: "worker" | "pages";
    status: string;
    requests: number;
    errors: number;
}

export interface TimelinePoint {
    ts: string;
    "1xx": number;
    "2xx": number;
    "3xx": number;
    "4xx": number;
    "5xx": number;
}

export interface Result<T> {
    available: boolean;
    error?: string;
    data: T;
}

/* ------------------------------------------------------------ aggregation */

export function emptyClasses(): Record<StatusClass, number> {
    return { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
}

export function hostHealth(
    rows: HostStatusRow[],
    originMs: Record<string, number> = {},
): HostHealth[] {
    const by = new Map<string, HostHealth>();
    for (const r of rows) {
        const h = by.get(r.host) || {
            host: r.host,
            total: 0,
            byClass: emptyClasses(),
            byStatus: [],
            errorRate: 0,
            avgOriginMs: originMs[r.host],
        };
        h.total += r.count;
        h.byClass[classOf(r.status)] += r.count;
        const existing = h.byStatus.find((s) => s.status === r.status);
        if (existing) existing.count += r.count;
        else h.byStatus.push({ status: r.status, count: r.count });
        by.set(r.host, h);
    }
    for (const h of by.values()) {
        h.byStatus.sort((a, b) => b.count - a.count);
        h.errorRate = h.total
            ? (h.byClass["4xx"] + h.byClass["5xx"]) / h.total
            : 0;
    }
    return Array.from(by.values()).sort((a, b) => b.total - a.total);
}

/**
 * Subtract non-visitor requests (SourceRow) from a host×status matrix, leaving
 * only what real visitors received.
 */
export function visitorOnly(
    rows: HostStatusRow[],
    internal: SourceRow[],
): HostStatusRow[] {
    const minus = new Map<string, number>();
    for (const r of internal) {
        const k = `${r.host}\u0000${r.status}`;
        minus.set(k, (minus.get(k) || 0) + r.count);
    }
    const out: HostStatusRow[] = [];
    for (const r of rows) {
        const k = `${r.host}\u0000${r.status}`;
        const left = r.count - (minus.get(k) || 0);
        if (left > 0) out.push({ ...r, count: left });
    }
    return out;
}

/* -------------------------------------------------------- status knowledge */

export interface StatusInfo {
    code: number;
    name: string;
    meaning: string;
    /** Generic likely causes; findings add evidence-specific ones. */
    causes: string[];
    fixes: string[];
    /** Whether this code is normally benign (e.g. 304, 301 on www). */
    benign?: boolean;
}

const KB: Record<number, Omit<StatusInfo, "code">> = {
    200: {
        name: "OK",
        meaning: "Request succeeded.",
        causes: [],
        fixes: [],
        benign: true,
    },
    201: {
        name: "Created",
        meaning: "A resource was created (POST/PUT succeeded).",
        causes: [],
        fixes: [],
        benign: true,
    },
    202: {
        name: "Accepted",
        meaning: "Accepted for asynchronous processing.",
        causes: [],
        fixes: [],
        benign: true,
    },
    204: {
        name: "No Content",
        meaning: "Succeeded with an empty body (beacons, preflight, deletes).",
        causes: [],
        fixes: [],
        benign: true,
    },
    206: {
        name: "Partial Content",
        meaning: "A byte range was served (media/large downloads).",
        causes: [],
        fixes: [],
        benign: true,
    },
    301: {
        name: "Moved Permanently",
        meaning: "Permanent redirect.",
        causes: [
            "Canonical host redirect (www → apex)",
            "HTTP → HTTPS upgrade",
            "Trailing-slash normalisation",
        ],
        fixes: [
            "Benign if intentional; link to the final URL to save a round-trip",
        ],
        benign: true,
    },
    302: {
        name: "Found",
        meaning: "Temporary redirect.",
        causes: [
            "Auth redirect to the login/SSO page",
            "Cloudflare challenge flow (/cdn-cgi/challenge-platform)",
            "App-level redirect",
        ],
        fixes: ["Expected for gated routes; check for loops if volume is high"],
        benign: true,
    },
    303: {
        name: "See Other",
        meaning: "Redirect after a POST (form submit → result page).",
        causes: ["Post/redirect/get pattern"],
        fixes: ["Benign"],
        benign: true,
    },
    304: {
        name: "Not Modified",
        meaning: "Browser cache revalidated — nothing to send.",
        causes: ["ETag / Last-Modified revalidation"],
        fixes: ["Healthy — this saves bandwidth"],
        benign: true,
    },
    307: {
        name: "Temporary Redirect",
        meaning: "Temporary redirect that preserves the method.",
        causes: ["HSTS / HTTPS upgrade", "OAuth / app redirect"],
        fixes: ["Usually benign"],
        benign: true,
    },
    308: {
        name: "Permanent Redirect",
        meaning: "Permanent redirect that preserves the method.",
        causes: [
            "Redirect Rule or Bulk Redirect",
            "Wildcard DNS (*.zone) catching unknown subdomains and redirecting them",
            "Next.js/Pages trailing-slash redirect",
        ],
        fixes: [
            "If the host is not a real service, remove it from DNS or let the wildcard 404 instead",
            "If intentional, nothing to do",
        ],
        benign: true,
    },
    400: {
        name: "Bad Request",
        meaning: "The request was malformed.",
        causes: [
            "Client sent invalid JSON/params",
            "Missing/invalid OAuth parameters",
            "Oversized header or cookie",
        ],
        fixes: ["Inspect the failing path; validate inputs client-side"],
    },
    401: {
        name: "Unauthorized",
        meaning: "Authentication missing or invalid.",
        causes: [
            "Logged-out visitors hitting session endpoints",
            "Expired session / token",
            "Unauthenticated API probes",
        ],
        fixes: [
            "Expected for protected APIs; investigate if a logged-in flow hits it",
        ],
    },
    403: {
        name: "Forbidden",
        meaning: "Request refused.",
        causes: [
            "Cloudflare security (WAF managed rules, Bot Fight, IP rule) blocked it",
            "App-level permission check",
            "Upstream API refusing a Worker subrequest",
        ],
        fixes: [
            "If securityAction is block/challenge, review Security → Events",
            "Otherwise check the app's authz",
        ],
    },
    404: {
        name: "Not Found",
        meaning: "No resource at that path.",
        causes: [
            "Broken/old links or removed pages",
            "Scanners probing /wp-admin, /.env, etc.",
            "Missing static asset after a deploy",
            "API route missing or unknown resource id",
        ],
        fixes: [
            "Look at top 404 paths — real paths need a redirect; scanner noise can be ignored or blocked",
        ],
    },
    405: {
        name: "Method Not Allowed",
        meaning: "Path exists but not for this HTTP method.",
        causes: ["POST to a static page", "API route missing a handler"],
        fixes: ["Add the handler or fix the caller"],
    },
    408: {
        name: "Request Timeout",
        meaning: "Client was too slow to send the request.",
        causes: ["Slow/mobile clients", "Large uploads"],
        fixes: ["Usually client-side"],
    },
    409: {
        name: "Conflict",
        meaning: "State conflict (duplicate, version clash).",
        causes: ["Concurrent writes", "Duplicate create"],
        fixes: ["Check idempotency of the endpoint"],
    },
    413: {
        name: "Payload Too Large",
        meaning: "Body exceeds the limit (100 MB on Free).",
        causes: ["Large upload"],
        fixes: ["Chunk uploads or use R2 presigned URLs"],
    },
    429: {
        name: "Too Many Requests",
        meaning: "Rate limited.",
        causes: [
            "Cloudflare rate-limit rule",
            "App-level rate limiter",
            "Upstream API throttling",
        ],
        fixes: [
            "Check whether securitySource is a rate-limit rule; tune thresholds",
        ],
    },
    499: {
        name: "Client Closed Request",
        meaning:
            "Visitor disconnected before the response finished (Cloudflare-specific code).",
        causes: [
            "User navigated away / closed the tab",
            "Slow origin made the client give up",
            "Browser cancelled a prefetch or duplicate request",
        ],
        fixes: [
            "If paired with high origin time or clientDisconnected Function outcomes, speed up the origin",
        ],
    },
    500: {
        name: "Internal Server Error",
        meaning: "The origin/Function crashed while handling the request.",
        causes: [
            "Unhandled exception in a Worker / Pages Function (error 1101)",
            "Bad deploy",
        ],
        fixes: [
            "Check Functions outcomes for scriptThrewException and tail the Worker logs",
        ],
    },
    502: {
        name: "Bad Gateway",
        meaning: "Cloudflare got an invalid response from the origin.",
        causes: [
            "Origin returned garbage or reset the connection",
            "Worker subrequest failed",
        ],
        fixes: ["Check the origin / Worker subrequest target"],
    },
    503: {
        name: "Service Unavailable",
        meaning: "Origin is overloaded, down, or the Worker was killed.",
        causes: [
            "Worker / Pages Function exceeded CPU or memory limits (error 1102 → 503)",
            "App returned 503 itself (maintenance, upstream unavailable)",
            "Overloaded origin",
        ],
        fixes: [
            "Check Functions outcomes for exceededResources and plan limits",
        ],
    },
    504: {
        name: "Gateway Timeout",
        meaning: "The origin did not answer in time.",
        causes: [
            "Early Hints cache lookup miss (requestSource earlyHintsCache) — internal, not visitor-facing",
            "Pages Function / Worker exceeded CPU or memory (exceededResources)",
            "Slow upstream fetch (DB, third-party API)",
            "Origin unreachable",
        ],
        fixes: [
            "Split by requestSource first: earlyHintsCache rows are noise",
            "For visitor (eyeball) 504s, look for exceededResources on the Function behind this host",
            "Add timeouts + caching around slow upstream calls",
        ],
    },
    520: {
        name: "Unknown Error (CF)",
        meaning: "Origin returned an empty/unknown response.",
        causes: ["Origin crashed mid-response", "Response headers too large"],
        fixes: ["Check origin logs"],
    },
    521: {
        name: "Web Server Is Down (CF)",
        meaning: "Origin refused the connection.",
        causes: ["Origin server offline", "Firewall blocking Cloudflare IPs"],
        fixes: ["Bring the origin up / allowlist Cloudflare IPs"],
    },
    522: {
        name: "Connection Timed Out (CF)",
        meaning: "TCP handshake to origin timed out.",
        causes: [
            "Origin overloaded or unreachable",
            "Wildcard / stale DNS record pointing at an IP that no longer serves",
        ],
        fixes: [
            "Check origin health / network",
            "Remove DNS records whose origin is gone",
        ],
    },
    523: {
        name: "Origin Is Unreachable (CF)",
        meaning: "No route to the origin.",
        causes: ["Wrong DNS target", "Origin IP changed"],
        fixes: ["Fix the DNS record"],
    },
    524: {
        name: "A Timeout Occurred (CF)",
        meaning: "Origin accepted the connection but took >100s.",
        causes: ["Long-running request"],
        fixes: ["Move long work to a Queue / Workflow"],
    },
    525: {
        name: "SSL Handshake Failed (CF)",
        meaning: "TLS to origin failed.",
        causes: ["Origin cert/cipher mismatch"],
        fixes: ["Check SSL/TLS mode and origin cert"],
    },
    526: {
        name: "Invalid SSL Certificate (CF)",
        meaning: "Origin cert invalid under Full (strict).",
        causes: ["Expired/self-signed origin cert"],
        fixes: ["Renew the origin cert or use an Origin CA cert"],
    },
    530: {
        name: "Origin DNS Error (CF)",
        meaning:
            "Cloudflare could not resolve the origin (often with 1xxx error).",
        causes: ["Dangling CNAME to a deleted Pages/Worker project"],
        fixes: ["Remove or repoint the DNS record"],
    },
};

export function statusInfo(code: number): StatusInfo {
    const k = KB[code];
    if (k) return { code, ...k };
    const cls = classOf(code);
    const generic: Record<StatusClass, Omit<StatusInfo, "code">> = {
        "1xx": {
            name: "Informational",
            meaning: "Interim response.",
            causes: [],
            fixes: [],
            benign: true,
        },
        "2xx": {
            name: "Success",
            meaning: "Request succeeded.",
            causes: [],
            fixes: [],
            benign: true,
        },
        "3xx": {
            name: "Redirect",
            meaning: "Client was sent elsewhere.",
            causes: ["Redirect rule or app redirect"],
            fixes: ["Usually benign"],
            benign: true,
        },
        "4xx": {
            name: "Client error",
            meaning: "The request was rejected.",
            causes: ["Bad input, auth or missing resource"],
            fixes: ["Inspect top paths for this code"],
        },
        "5xx": {
            name: "Server error",
            meaning: "The origin failed.",
            causes: ["Origin or Function failure"],
            fixes: ["Check Functions outcomes and origin health"],
        },
    };
    return { code, ...generic[cls] };
}

/** What each `requestSource` value means. */
export const REQUEST_SOURCE_INFO: Record<
    string,
    { label: string; meaning: string; visitor: boolean }
> = {
    eyeball: {
        label: "Visitor",
        meaning: "A real client request (browser, bot, API caller).",
        visitor: true,
    },
    earlyHintsCache: {
        label: "Early Hints lookup",
        meaning:
            "Cloudflare's own lookup in the Early Hints cache for an HTML navigation. A 504 with origin status 0 here just means no hints were cached for that URL — the visitor's page request is logged separately.",
        visitor: false,
    },
    inBrowserChallenge: {
        label: "Challenge platform",
        meaning:
            "Fetches made by a Cloudflare JS / managed challenge running in the visitor's browser (/cdn-cgi/challenge-platform).",
        visitor: false,
    },
    edgeWorkerFetch: {
        label: "Worker subrequest",
        meaning:
            "An outbound fetch() made by one of your Workers. The Worker is the client, so the host may not even be yours (e.g. api.github.com).",
        visitor: false,
    },
    edgeWorkerCacheAPI: {
        label: "Worker Cache API",
        meaning: "A cache.match/put made by a Worker.",
        visitor: false,
    },
};

export function requestSourceInfo(src: string) {
    return (
        REQUEST_SOURCE_INFO[src] || {
            label: src,
            meaning: "Internal Cloudflare request source.",
            visitor: src === "eyeball",
        }
    );
}

/** Readable names for `securitySource`. */
export const SECURITY_SOURCE_INFO: Record<string, string> = {
    firewallManaged: "Cloudflare Managed Ruleset (WAF)",
    firewallCustom: "a custom WAF rule",
    firewallRules: "a firewall rule",
    waf: "the WAF",
    botFight: "Bot Fight Mode",
    botManagement: "Bot Management",
    l7ddos: "HTTP DDoS protection",
    rateLimit: "a rate-limiting rule",
    securityLevel: "Security Level (IP reputation)",
    bic: "Browser Integrity Check",
    hot: "Hotlink Protection",
    uaBlock: "a User-Agent block rule",
    zoneLockdown: "Zone Lockdown",
    ip: "an IP Access rule",
    ipRange: "an IP-range Access rule",
    asn: "an ASN Access rule",
    country: "a country Access rule",
    validation: "request validation (malformed request)",
    apiShield: "API Shield",
};

/** What each Workers / Pages Functions invocation outcome means. */
export const FUNCTION_OUTCOME_INFO: Record<
    string,
    { label: string; meaning: string; severity: Severity }
> = {
    success: {
        label: "Success",
        meaning:
            "The script ran to completion. The response it produced may still be a 4xx/5xx written by your own code.",
        severity: "info",
    },
    clientDisconnected: {
        label: "Client disconnected",
        meaning:
            "The visitor went away before the script finished (closed tab, navigated, gave up). Usually benign; a high share alongside slow responses means users are giving up (shows as 499).",
        severity: "info",
    },
    exceededResources: {
        label: "Exceeded resources",
        meaning:
            "Killed for exceeding the CPU-time limit (10 ms per invocation on the Free plan) or the 128 MB memory limit. The visitor gets Cloudflare error 1102 (HTTP 503).",
        severity: "critical",
    },
    exceededCpu: {
        label: "Exceeded CPU",
        meaning:
            "Killed for exceeding the CPU-time limit. Visitor gets error 1102 (HTTP 503).",
        severity: "critical",
    },
    exceededMemory: {
        label: "Exceeded memory",
        meaning:
            "Killed for exceeding the 128 MB memory limit. Visitor gets error 1102 (HTTP 503).",
        severity: "critical",
    },
    scriptThrewException: {
        label: "Threw exception",
        meaning:
            "An uncaught exception escaped the handler. The visitor gets Cloudflare error 1101 (HTTP 500).",
        severity: "critical",
    },
    responseStreamDisconnected: {
        label: "Stream disconnected",
        meaning: "The response stream was cut off mid-body.",
        severity: "warning",
    },
    internal: {
        label: "Internal error",
        meaning:
            "Cloudflare-side runtime failure; retry, and contact support if persistent.",
        severity: "warning",
    },
};

export function functionOutcomeInfo(status: string) {
    return (
        FUNCTION_OUTCOME_INFO[status] || {
            label: status,
            meaning: "Non-success invocation outcome.",
            severity: "warning" as Severity,
        }
    );
}

/* --------------------------------------------------------------- findings */

export type Severity = "critical" | "warning" | "info";

export interface Finding {
    id: string;
    severity: Severity;
    host: string;
    status: number;
    count: number;
    /** Share of the host's traffic (0..1). */
    share: number;
    title: string;
    /** Evidence-backed reasoning, one sentence each. */
    reasons: string[];
    fixes: string[];
    topPaths: { path: string; count: number }[];
    /** Requests in this group that came from real visitors (eyeball). */
    visitorCount?: number;
    /** Requests that were Cloudflare-internal / Worker subrequests. */
    internalCount?: number;
}

const SCANNER =
    /(wp-|wordpress|\.env|\.git|phpmyadmin|\.php|xmlrpc|cgi-bin|\.aspx?|\/admin\.|\.sql|\/vendor\/|\.ds_store|\.netrc|\.terraform|\.aws|\.ssh|\/actuator|\/boaform|\/owa\/)/i;
const AUTH_PATH =
    /(login|signin|sign-in|signup|sign-up|register|\/auth\/|session|oauth)/i;
const SESSION_PROBE = /(\/auth\/me|\/session|\/user\/me|\/whoami|\/api\/me)\b/i;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const n = (x: number) => x.toLocaleString("en-US");

/** Host headers that cannot be a real service (port, trailing dot, doubled zone). */
function hostAnomaly(host: string, zones: string[]): string | null {
    if (/:\d+$/.test(host))
        return `The Host header carries an explicit port (${host.split(":").pop()}) — real browsers never send that for HTTPS on 443; this is scanner traffic.`;
    if (host.endsWith("."))
        return "The Host header has a trailing dot (fully-qualified form) — almost always scanners or misconfigured clients.";
    for (const z of zones)
        if (host.endsWith(`.${z}.${z}`))
            return `The hostname repeats the zone (${host}) — a DNS record was created with the full name typed into the "name" field. Rename or delete that record.`;
    return null;
}

/**
 * Turn raw evidence into ranked findings. Pure — works on data already fetched,
 * so pages can call it on the server with whatever window/host they loaded.
 */
export function diagnose(input: {
    health: HostHealth[];
    nonOk: NonOkRow[];
    functions: FunctionStatusRow[];
    services: Service[];
    /** Optional non-visitor rows (see internalTraffic) — sharpens severity. */
    internal?: SourceRow[];
}): Finding[] {
    const { health, nonOk, functions, services, internal = [] } = input;
    const svc = new Map(services.map((s) => [s.host, s]));
    const zones = Array.from(new Set(services.map((s) => s.zoneName)));
    const inZone = (host: string) =>
        zones.some((z) => host === z || host.endsWith(`.${z}`));
    const fnByScript = new Map<string, FunctionStatusRow[]>();
    for (const f of functions) {
        fnByScript.set(f.script, [...(fnByScript.get(f.script) || []), f]);
    }
    const out: Finding[] = [];

    for (const h of health) {
        const s = svc.get(h.host);
        const anomaly = hostAnomaly(h.host, zones);
        for (const { status, count } of h.byStatus) {
            const cls = classOf(status);
            if (cls === "2xx" || cls === "1xx" || status === 304) continue;
            const share = h.total ? count / h.total : 0;
            const info = statusInfo(status);
            const rows = nonOk.filter(
                (r) => r.host === h.host && r.status === status,
            );
            const rowTotal = rows.reduce((a, r) => a + r.count, 0) || 1;
            const frac = (pred: (r: NonOkRow) => boolean) =>
                rows.filter(pred).reduce((a, r) => a + r.count, 0) / rowTotal;

            // --- who sent these? (visitor vs Cloudflare-internal)
            const intRows = internal.filter(
                (r) => r.host === h.host && r.status === status,
            );
            let internalCount = intRows.reduce((a, r) => a + r.count, 0);
            if (!internal.length && rows.length) {
                // Fall back to the sampled detail rows.
                internalCount = Math.round(
                    count * frac((r) => r.requestSource !== "eyeball"),
                );
            }
            internalCount = Math.min(internalCount, count);
            const visitorCount = count - internalCount;
            const internalShare = count ? internalCount / count : 0;
            const bySource = new Map<string, number>();
            for (const r of intRows)
                bySource.set(
                    r.requestSource,
                    (bySource.get(r.requestSource) || 0) + r.count,
                );
            if (!intRows.length)
                for (const r of rows)
                    if (r.requestSource !== "eyeball")
                        bySource.set(
                            r.requestSource,
                            (bySource.get(r.requestSource) || 0) + r.count,
                        );
            const topSource = Array.from(bySource).sort(
                (a, b) => b[1] - a[1],
            )[0]?.[0];

            const reasons: string[] = [];
            const fixes: string[] = [];

            if (anomaly) reasons.push(anomaly);
            const wildcard = !s && !anomaly && inZone(h.host);
            const wildZone =
                zones.find((z) => h.host.endsWith(`.${z}`)) ?? "zone";
            if (wildcard && cls !== "3xx")
                reasons.push(
                    `${h.host} is not a known service (no DNS record, Pages domain or Worker of its own) — it is answered by the wildcard *.${wildZone} record, so this is almost certainly bots enumerating subdomains.`,
                );
            if (wildcard && cls === "5xx" && status >= 520)
                reasons.push(
                    `Cloudflare could not reach the origin behind the wildcard record for this name (${status}).`,
                );

            // --- not even our host: Worker subrequest to a third party
            if (!inZone(h.host) && topSource === "edgeWorkerFetch") {
                reasons.push(
                    `${h.host} is not one of your hosts — these are outbound fetch() subrequests from one of your Workers, and ${h.host} answered ${status}.`,
                );
                if (status === 403 || status === 429)
                    fixes.push(
                        "The upstream API is refusing/throttling the Worker: send an auth token and a User-Agent, and cache its responses.",
                    );
            }

            // --- internal-source evidence (biggest source of noise)
            if (internalShare > 0.5 && topSource) {
                const src = requestSourceInfo(topSource);
                if (topSource === "earlyHintsCache") {
                    reasons.push(
                        `${pct(internalShare)} (${n(internalCount)}) are Cloudflare's own Early Hints cache lookups (requestSource = earlyHintsCache), not visitor responses. A ${status}${status === 504 ? " with origin status 0" : ""} there means "no Link hints cached for this URL"; the visitor's real page load is logged separately as an eyeball request.`,
                    );
                    fixes.push(
                        "Not user-facing. To remove the noise, turn off Early Hints (Speed → Optimization → Content Optimization) or filter to visitor requests.",
                    );
                } else if (topSource === "inBrowserChallenge") {
                    reasons.push(
                        `${pct(internalShare)} come from Cloudflare's challenge platform running in the browser (requestSource = inBrowserChallenge) — part of a JS/managed challenge, not your app.`,
                    );
                } else if (topSource !== "edgeWorkerFetch" || inZone(h.host)) {
                    reasons.push(
                        `${pct(internalShare)} are ${src.label.toLowerCase()} requests (requestSource = ${topSource}): ${src.meaning}`,
                    );
                }
            } else if (internalCount > 0 && cls === "5xx") {
                reasons.push(
                    `${n(visitorCount)} of ${n(count)} reached real visitors; the other ${n(internalCount)} were internal (${topSource ?? "non-eyeball"}) requests.`,
                );
            }

            // --- origin evidence (look at visitor rows when we have them)
            const vis = rows.filter((r) => r.requestSource === "eyeball");
            const vTotal = vis.reduce((a, r) => a + r.count, 0);
            const vFrac = (pred: (r: NonOkRow) => boolean) =>
                vTotal
                    ? vis.filter(pred).reduce((a, r) => a + r.count, 0) / vTotal
                    : 0;
            const noOrigin = vFrac((r) => r.originStatus === 0);
            const originSame = vFrac((r) => r.originStatus === status);
            if (vTotal && cls === "5xx" && noOrigin > 0.5) {
                reasons.push(
                    `${pct(noOrigin)} of the visitor requests had origin status 0 — Cloudflare never got a response from the origin / Function.`,
                );
            } else if (vTotal && originSame > 0.5 && cls !== "3xx") {
                reasons.push(
                    `${pct(originSame)} were returned by the origin itself (origin status ${status}), so the app generated this response, not Cloudflare.`,
                );
            }

            // --- security evidence
            const sec = rows.filter(
                (r) =>
                    r.securityAction !== "unknown" &&
                    r.securityAction !== "" &&
                    r.securityAction !== "allow",
            );
            if (sec.length) {
                const top = [...sec].sort((a, b) => b.count - a.count)[0];
                const by =
                    SECURITY_SOURCE_INFO[top.securitySource] ||
                    top.securitySource;
                reasons.push(
                    `Cloudflare security answered instead of your app: ${top.securityAction} by ${by} on ${pct(frac((r) => sec.includes(r)))} of them (origin never contacted).`,
                );
                const authPost = sec.filter(
                    (r) => r.method === "POST" && AUTH_PATH.test(r.path),
                );
                const authShare =
                    authPost.reduce((a, r) => a + r.count, 0) /
                    (sec.reduce((a, r) => a + r.count, 0) || 1);
                if (authShare > 0.4)
                    reasons.push(
                        `${pct(authShare)} of the blocked requests are POSTs to login / sign-up / auth endpoints — the pattern of credential-stuffing and form-spam bots.`,
                    );
                fixes.push(
                    authShare > 0.4
                        ? "Probably working as intended. If real users log in on this host, add a WAF skip rule for that exact path instead of loosening the managed ruleset."
                        : "Review Security → Events for the matching rule; add a skip rule if these are real users.",
                );
            }

            // --- challenge platform flow
            const challenge = frac((r) =>
                r.path.startsWith("/cdn-cgi/challenge-platform"),
            );
            if (
                rows.length &&
                challenge > 0.5 &&
                !(internalShare > 0.5 && topSource === "inBrowserChallenge")
            )
                reasons.push(
                    `${pct(challenge)} are /cdn-cgi/challenge-platform fetches — part of a Cloudflare challenge, not your app.`,
                );
            const emailProt = frac((r) =>
                r.path.startsWith("/cdn-cgi/l/email-protection"),
            );
            if (rows.length && emailProt > 0.3)
                reasons.push(
                    `${pct(emailProt)} are /cdn-cgi/l/email-protection — bots following Email Obfuscation links without running its JS. Harmless.`,
                );

            // --- Functions evidence
            const script = s?.functionScript || s?.workerScript;
            const fnRows = script ? fnByScript.get(script) || [] : [];
            const bad = fnRows.filter((f) => f.status !== "success");
            const fnName =
                s?.pagesProject && s.functionScript === script
                    ? `Pages Function (${s.pagesProject})`
                    : `Worker ${script}`;
            for (const f of [...bad].sort((a, b) => b.requests - a.requests)) {
                if (f.status === "clientDisconnected") {
                    if (status === 499)
                        reasons.push(
                            `${fnName} logged ${n(f.requests)} × clientDisconnected — the visitor left before the Function finished, which Cloudflare records as 499.`,
                        );
                    continue;
                }
                if (cls !== "5xx") continue;
                const o = functionOutcomeInfo(f.status);
                const matches =
                    (status === 503 && f.status.startsWith("exceeded")) ||
                    (status === 500 && f.status === "scriptThrewException");
                reasons.push(
                    `${fnName} logged ${n(f.requests)} × ${f.status}${matches ? " — this is the direct cause: " : " — "}${o.meaning}`,
                );
            }
            if (
                cls === "5xx" &&
                bad.some((f) => f.status.startsWith("exceeded"))
            ) {
                fixes.push(
                    "Profile the Function: move heavy work (markdown/HTML rendering, crypto, big JSON) off the request path, cache upstream calls, or move to Workers Paid (30 s CPU).",
                );
            }
            if (
                cls === "5xx" &&
                bad.some((f) => f.status === "scriptThrewException")
            ) {
                fixes.push(
                    "Run `wrangler pages deployment tail` / `wrangler tail` to capture the stack trace and wrap the handler in try/catch.",
                );
            }
            if (status === 499) {
                const ms = h.avgOriginMs ?? 0;
                if (ms > 800)
                    reasons.push(
                        `Average origin time on ${h.host} is ${Math.round(ms)} ms — slow responses make visitors give up.`,
                    );
            }

            // --- redirect / wildcard evidence
            if (cls === "3xx") {
                const originRedirect = frac((r) => r.originStatus === status);
                if (s && !s.pagesProject && !s.workerScript) {
                    reasons.push(
                        `${h.host} has no Pages project or Worker attached — it is only answered by DNS${s.dnsTarget ? ` (${s.dnsType} → ${s.dnsTarget})` : ""}, so ${originRedirect > 0.5 ? "the origin behind that record" : "a redirect rule"} is sending it elsewhere.`,
                    );
                } else if (wildcard) {
                    reasons.push(
                        `${h.host} has no DNS record of its own — it is caught by the wildcard (*.${wildZone}) record${originRedirect > 0.5 ? `, and the origin behind the wildcard answers every path with ${status}` : " and redirected"}.`,
                    );
                    fixes.push(
                        "If nobody should use this host, make the wildcard target return 404 (or remove the wildcard) so bots stop getting a redirect to follow.",
                    );
                } else if (originRedirect > 0.5) {
                    reasons.push(
                        `${pct(originRedirect)} carried origin status ${status} — your app issued the redirect (e.g. trailing slash, canonical host, auth).`,
                    );
                }
                if (rows.length && share > 0.9)
                    reasons.push(
                        `${pct(share)} of all traffic to ${h.host} is this redirect — the host does nothing but redirect.`,
                    );
            }

            // --- path evidence
            const paths = new Map<string, number>();
            for (const r of rows)
                paths.set(r.path, (paths.get(r.path) || 0) + r.count);
            const topPaths = Array.from(paths, ([path, c]) => ({
                path,
                count: c,
            }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 6);
            const scan = rows.length ? frac((r) => SCANNER.test(r.path)) : 0;
            if (scan > 0.3)
                reasons.push(
                    `${pct(scan)} target scanner paths (wp-, .env, .git, .php…) — bots probing for vulnerabilities, not broken links.`,
                );
            if (status === 404 && rows.length) {
                const apiRows = rows.filter(
                    (r) => r.path.startsWith("/api/") && !SCANNER.test(r.path),
                );
                const api = apiRows.reduce((a, r) => a + r.count, 0) / rowTotal;
                const topApi = [...apiRows].sort(
                    (a, b) => b.count - a.count,
                )[0];
                if (api > 0.1 && topApi)
                    reasons.push(
                        `${pct(api)} are under /api/ (top: ${topApi.method} ${topApi.path}) — the app's API router answered 404, i.e. a client calls a route that is not deployed or asks for a resource id that does not exist. These are real app calls, not scanners.`,
                    );
                if (api > 0.1)
                    fixes.push(
                        "Compare the top /api/ paths against the routes in the current deploy; return 410/empty results instead of 404 for expected misses.",
                    );
            }
            if (status === 401 && rows.length) {
                const probe = frac((r) => SESSION_PROBE.test(r.path));
                if (probe > 0.4)
                    reasons.push(
                        `${pct(probe)} are session checks (/api/auth/me, /session…) from logged-out visitors — the expected answer when nobody is signed in.`,
                    );
            }
            if (topPaths[0] && rows.length) {
                const p = topPaths[0];
                const pShare = p.count / rowTotal;
                if (pShare > 0.4)
                    reasons.push(
                        `Concentrated on one path: ${p.path} accounts for ${pct(pShare)} of them.`,
                    );
            }

            if (!reasons.length) reasons.push(info.meaning);
            for (const f of info.fixes) if (!fixes.includes(f)) fixes.push(f);

            // --- severity (judged on what visitors actually got)
            const vShare = h.total ? visitorCount / h.total : 0;
            let severity: Severity = "info";
            if (
                anomaly ||
                (!inZone(h.host) && topSource === "edgeWorkerFetch")
            ) {
                severity =
                    cls === "5xx" && visitorCount >= 25 ? "warning" : "info";
            } else if (cls === "5xx") {
                if (visitorCount < 5) severity = "info";
                else if (wildcard)
                    severity = visitorCount >= 50 ? "warning" : "info";
                else
                    severity =
                        visitorCount >= 25 &&
                        (vShare > 0.02 || visitorCount > 100)
                            ? "critical"
                            : "warning";
            } else if (wildcard) {
                severity = "info";
            } else if (cls === "4xx") {
                if (anomaly || scan > 0.5 || (status === 401 && share < 0.5))
                    severity = "info";
                else if (status === 403 && sec.length)
                    severity = vShare > 0.1 ? "warning" : "info";
                else if (status === 404 || status === 401)
                    severity = vShare > 0.25 ? "warning" : "info";
                else if (status === 499)
                    severity = vShare > 0.05 ? "warning" : "info";
                else severity = vShare > 0.05 ? "warning" : "info";
            }

            const suffix =
                internalShare > 0.9 ? " (internal, not visitor-facing)" : "";
            out.push({
                id: `${h.host}:${status}`,
                severity,
                host: h.host,
                status,
                count,
                share,
                title: `${h.host} → ${status} ${info.name}${suffix}`,
                reasons,
                fixes,
                topPaths,
                visitorCount,
                internalCount,
            });
        }
    }

    const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
    return out.sort(
        (a, b) =>
            rank[a.severity] - rank[b.severity] ||
            (b.visitorCount ?? b.count) - (a.visitorCount ?? a.count) ||
            b.count - a.count,
    );
}
