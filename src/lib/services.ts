/**
 * Service catalog — every hostname the account serves (e.g. blogs.elixpo.com),
 * unioned from four live sources so nothing has to be hardcoded:
 *
 *   1. proxied DNS records (A / AAAA / CNAME) in each zone
 *   2. Pages project custom domains
 *   3. Worker custom domains
 *   4. Worker routes (host part of the pattern)
 *
 * A "service" is therefore a host plus whatever is known to back it. The
 * header's service switcher and /dashboard/services/[host] both read this.
 */

import { acctPath, cfList, safe } from "./cloudflare-api";
import { discoverAccount } from "./discovery";
import { cacheSet, cached } from "./kv";

export type ServiceBackend = "pages" | "worker" | "route" | "dns";

export interface Service {
    /** Fully-qualified hostname, e.g. "blogs.elixpo.com". */
    host: string;
    /** Short label for menus, e.g. "blogs" ("@" for the apex). */
    label: string;
    zoneId: string;
    zoneName: string;
    backends: ServiceBackend[];
    pagesProject?: string;
    workerScript?: string;
    /** Pages Functions script (pages-worker--N-production) for pagesProject. */
    functionScript?: string;
    /** Worker route patterns that match this host. */
    routes?: string[];
    dnsType?: string;
    dnsTarget?: string;
    proxied?: boolean;
}

interface DnsRecord {
    type: string;
    name: string;
    content: string;
    proxied?: boolean;
}
interface WorkerDomain {
    hostname: string;
    service: string;
    zone_id?: string;
}
interface WorkerRoute {
    pattern: string;
    script?: string;
}

const TTL = 300;
const SERVICES_KEY = "services:v1";

function labelFor(host: string, zone: string): string {
    if (host === zone) return "@";
    return host.endsWith(`.${zone}`) ? host.slice(0, -(zone.length + 1)) : host;
}

/** A hostname we'd want in the switcher (skips wildcards, _txt, bogus dupes). */
function isServiceHost(host: string, zone: string): boolean {
    if (!host || host.startsWith("*") || host.startsWith("_")) return false;
    if (host.includes("._")) return false;
    // e.g. "blog-collab.elixpo.com.elixpo.com" — a mistyped record name.
    if (host.endsWith(`.${zone}.${zone}`)) return false;
    return host === zone || host.endsWith(`.${zone}`);
}

export async function listServices(force = false): Promise<Service[]> {
    const build = async (): Promise<Service[]> => {
        const inv = await discoverAccount(force);
        const byHost = new Map<string, Service>();

        const zoneOf = (host: string) =>
            inv.zones
                .filter((z) => host === z.name || host.endsWith(`.${z.name}`))
                .sort((a, b) => b.name.length - a.name.length)[0];

        const upsert = (host: string): Service | null => {
            const h = host.toLowerCase().replace(/\.$/, "");
            const z = zoneOf(h);
            if (!z || !isServiceHost(h, z.name)) return null;
            let s = byHost.get(h);
            if (!s) {
                s = {
                    host: h,
                    label: labelFor(h, z.name),
                    zoneId: z.id,
                    zoneName: z.name,
                    backends: [],
                };
                byHost.set(h, s);
            }
            return s;
        };
        const tag = (s: Service, b: ServiceBackend) => {
            if (!s.backends.includes(b)) s.backends.push(b);
        };

        const [dns, domains, routes] = await Promise.all([
            Promise.all(
                inv.zones.map((z) =>
                    safe(() =>
                        cfList<DnsRecord>(`/zones/${z.id}/dns_records`, {
                            perPage: 100,
                        }),
                    ),
                ),
            ),
            safe(async () =>
                cfList<WorkerDomain>(await acctPath("/workers/domains")),
            ),
            Promise.all(
                inv.zones.map((z) =>
                    safe(() =>
                        cfList<WorkerRoute>(`/zones/${z.id}/workers/routes`),
                    ),
                ),
            ),
        ]);

        for (const r of dns) {
            if (!r.ok) continue;
            for (const rec of r.data) {
                if (!["A", "AAAA", "CNAME"].includes(rec.type)) continue;
                const s = upsert(rec.name);
                if (!s) continue;
                tag(s, "dns");
                s.dnsType ??= rec.type;
                s.dnsTarget ??= rec.content;
                s.proxied = s.proxied || !!rec.proxied;
            }
        }
        for (const p of inv.pages) {
            for (const d of p.domains || []) {
                if (d.endsWith(".pages.dev")) continue;
                const s = upsert(d);
                if (!s) continue;
                tag(s, "pages");
                s.pagesProject ??= p.name;
                s.functionScript ??= p.production_script_name;
            }
        }
        if (domains.ok) {
            for (const d of domains.data) {
                const s = upsert(d.hostname);
                if (!s) continue;
                tag(s, "worker");
                s.workerScript ??= d.service;
            }
        }
        for (const r of routes) {
            if (!r.ok) continue;
            for (const route of r.data) {
                const host = route.pattern.split("/")[0];
                const s = upsert(host);
                if (!s) continue;
                tag(s, "route");
                s.routes = [...(s.routes || []), route.pattern];
                if (route.script) s.workerScript ??= route.script;
            }
        }

        const zoneRank = (z: string) => (z === "elixpo.com" ? 0 : 1);
        return Array.from(byHost.values()).sort(
            (a, b) =>
                zoneRank(a.zoneName) - zoneRank(b.zoneName) ||
                a.zoneName.localeCompare(b.zoneName) ||
                (a.label === "@" ? -1 : b.label === "@" ? 1 : 0) ||
                a.label.localeCompare(b.label),
        );
    };
    if (!force) return cached(SERVICES_KEY, TTL, build);
    // Forced refresh: rebuild and overwrite the cache so the switcher updates.
    const fresh = await build();
    await cacheSet(SERVICES_KEY, fresh, TTL).catch(() => {});
    return fresh;
}

export async function getService(host: string): Promise<Service | null> {
    const all = await listServices();
    return all.find((s) => s.host === host.toLowerCase()) || null;
}
