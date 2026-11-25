/**
 * Settings — read-only view of everything the admin console runs on: the
 * Cloudflare account, your session, the API token and the scopes discovery
 * depends on, each zone's plan + key settings, runtime config (secret
 * PRESENCE only, never values), cache policy and plan limits.
 */

import { cfList, cfRest, getAccountId, safe } from "@/lib/cloudflare-api";
import { discoverAccount } from "@/lib/discovery";
import { getEnv } from "@/lib/env";
import { listServices } from "@/lib/services";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import SettingsView, { type SettingsData } from "./settings-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** Zone settings worth surfacing, in display order. */
const ZONE_KEYS = [
    "ssl",
    "always_use_https",
    "min_tls_version",
    "tls_1_3",
    "automatic_https_rewrites",
    "http3",
    "brotli",
    "early_hints",
    "security_level",
    "browser_check",
    "cache_level",
    "browser_cache_ttl",
    "always_online",
    "development_mode",
] as const;

const SECRET_NAMES = [
    "CF_API_TOKEN",
    "CF_ACCOUNT_ID",
    "CF_KV_NAMESPACE_ID",
    "ELIXPO_CLIENT_ID",
    "ELIXPO_CLIENT_SECRET",
    "SESSION_SECRET",
];

interface RawZone {
    id: string;
    name: string;
    status?: string;
    paused?: boolean;
    type?: string;
    plan?: { name?: string };
    activated_on?: string;
    name_servers?: string[];
}

export default async function SettingsPage() {
    const store = await cookies();
    const [session, inv, services, accountId] = await Promise.all([
        verifySession(store.get(SESSION_COOKIE)?.value),
        discoverAccount(),
        listServices().catch(() => []),
        getAccountId(),
    ]);

    const [token, account, zones, envs, kvBound] = await Promise.all([
        safe(async () => {
            const r = await cfRest<{
                id: string;
                status: string;
                expires_on?: string;
                not_before?: string;
            }>("/user/tokens/verify");
            return r.result;
        }),
        safe(async () => {
            const r = await cfRest<{
                name?: string;
                type?: string;
                created_on?: string;
            }>(`/accounts/${accountId}`);
            return r.result;
        }),
        safe(() => cfList<RawZone>(`/zones?account.id=${accountId}`)),
        Promise.all(
            [
                ...SECRET_NAMES,
                "ENVIRONMENT",
                "NEXT_PUBLIC_APP_URL",
                "NEXT_PUBLIC_ACCOUNTS_URL",
                "NEXT_PUBLIC_REDIRECT_URL",
            ].map(async (n) => [n, await getEnv(n)] as const),
        ),
        (async () => {
            try {
                const { getRequestContext } = await import(
                    /* webpackIgnore: true */ "@cloudflare/next-on-pages"
                );
                return !!(getRequestContext() as any)?.env?.KV;
            } catch {
                return false;
            }
        })(),
    ]);

    const zoneList = zones.ok ? zones.data : [];
    const zoneSettings = await Promise.all(
        zoneList.map((z) =>
            safe(async () => {
                const r = await cfRest<{ id: string; value: unknown }[]>(
                    `/zones/${z.id}/settings`,
                );
                const out: Record<string, string> = {};
                for (const s of r.result || []) {
                    if ((ZONE_KEYS as readonly string[]).includes(s.id))
                        out[s.id] =
                            typeof s.value === "object"
                                ? JSON.stringify(s.value)
                                : String(s.value);
                }
                return out;
            }),
        ),
    );

    const envMap = Object.fromEntries(envs);
    const count: Record<string, number> = {
        pages: inv.pages.length,
        workers: inv.workers.length,
        d1: inv.d1.length,
        kv: inv.kv.length,
        queues: inv.queues.length,
        durableObjects: inv.durableObjects.length,
        workflows: inv.workflows.length,
        zones: inv.zones.length,
    };

    const data: SettingsData = {
        now: Date.now(),
        accountId,
        account: account.ok
            ? {
                  ok: true,
                  name: account.data.name,
                  type: account.data.type,
                  createdOn: account.data.created_on,
              }
            : { ok: false, error: account.error },
        session: session
            ? {
                  email: session.email,
                  name: session.name,
                  avatar: session.avatar ?? null,
                  uid: session.uid,
                  isAdmin: session.isAdmin,
                  iat: session.iat,
                  exp: session.exp,
                  atExp: session.atExp,
              }
            : null,
        token: token.ok
            ? {
                  ok: true,
                  id: token.data.id,
                  status: token.data.status,
                  expiresOn: token.data.expires_on,
                  notBefore: token.data.not_before,
              }
            : { ok: false, error: token.error },
        discovery: {
            fetchedAt: inv.fetchedAt,
            services: services.length,
            sections: Object.keys(count).map((key) => ({
                key,
                count: count[key],
                error: inv.errors[key]?.error,
                status: inv.errors[key]?.status,
            })),
        },
        zones: zoneList.map((z, i) => ({
            id: z.id,
            name: z.name,
            status: z.paused ? "paused" : z.status || "unknown",
            plan: z.plan?.name || "—",
            type: z.type,
            activatedOn: z.activated_on,
            nameServers: z.name_servers || [],
            services: services.filter((s) => s.zoneId === z.id).length,
            settings: zoneSettings[i]?.ok ? zoneSettings[i].data : {},
            settingsError:
                zoneSettings[i] && !zoneSettings[i].ok
                    ? zoneSettings[i].error
                    : undefined,
        })),
        zonesError: zones.ok ? undefined : zones.error,
        runtime: {
            environment:
                envMap.ENVIRONMENT ||
                (process.env.NODE_ENV === "development"
                    ? "local dev"
                    : "unknown"),
            appUrl: envMap.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
            accountsUrl:
                envMap.NEXT_PUBLIC_ACCOUNTS_URL ||
                "https://accounts.elixpo.com",
            redirectUri:
                envMap.NEXT_PUBLIC_REDIRECT_URL || "(derived from app URL)",
            kvBinding: kvBound,
            // Presence only — values never leave the server.
            secrets: SECRET_NAMES.map((name) => ({
                name,
                set: !!envMap[name],
            })),
        },
    };

    return <SettingsView data={data} />;
}
