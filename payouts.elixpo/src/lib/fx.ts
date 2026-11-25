/**
 * Live USD→INR exchange rate for fundraisers (USD amounts are charged in INR
 * until an international route exists).
 *
 * Sources (free, no key, current market reference rates — refreshed at least
 * daily by the providers; true tick-level FX needs a paid feed):
 *   1. Frankfurter (ECB reference rates)  https://api.frankfurter.dev
 *   2. ExchangeRate-API open endpoint      https://open.er-api.com
 *
 * Caching: per-isolate memory (10 min) → KV `fx:USD:INR` (fresh for 1 h, kept
 * 2 days as last-known-good). If every source fails we use the last good rate,
 * then FUNDRAISER_USD_INR_RATE, then a built-in default — a rate outage never
 * blocks a contribution. Never throws.
 */

import { getEnv } from "./env";
import { getKV } from "./kv";

export interface FxRate {
    rate: number; // ₹ per $1
    as_of: string; // provider's rate date (ISO date or timestamp)
    source: "frankfurter" | "er-api" | "cache-stale" | "env" | "default";
    fetched_at: number; // ms epoch when we obtained it
}

const KV_KEY = "fx:USD:INR";
const FRESH_MS = 60 * 60 * 1000; // re-fetch after 1 h
const MEMORY_MS = 10 * 60 * 1000;
const KEEP_SECONDS = 2 * 24 * 60 * 60; // last-known-good window
const DEFAULT_RATE = 85;

let memo: FxRate | null = null;

const sane = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 50 && v < 200;

async function fetchJson(url: string): Promise<any | null> {
    try {
        const res = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "ElixpoPay-FX/1" },
            signal: AbortSignal.timeout(4000),
        });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

async function fetchLive(): Promise<FxRate | null> {
    const fr = await fetchJson("https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR");
    if (sane(fr?.rates?.INR)) {
        return { rate: fr.rates.INR, as_of: String(fr.date ?? ""), source: "frankfurter", fetched_at: Date.now() };
    }
    const er = await fetchJson("https://open.er-api.com/v6/latest/USD");
    if (er?.result === "success" && sane(er?.rates?.INR)) {
        const asOf = er.time_last_update_unix ? new Date(er.time_last_update_unix * 1000).toISOString() : "";
        return { rate: er.rates.INR, as_of: asOf, source: "er-api", fetched_at: Date.now() };
    }
    return null;
}

async function kvGet(): Promise<FxRate | null> {
    try {
        const raw = await (await getKV()).get(KV_KEY);
        const v = raw ? (JSON.parse(raw) as FxRate) : null;
        return v && sane(v.rate) ? v : null;
    } catch {
        return null;
    }
}

async function kvPut(v: FxRate): Promise<void> {
    try {
        await (await getKV()).put(KV_KEY, JSON.stringify(v), { expirationTtl: KEEP_SECONDS });
    } catch {
        // cache is best-effort
    }
}

export async function getUsdInrRate(): Promise<FxRate> {
    if (memo && Date.now() - memo.fetched_at < MEMORY_MS) return memo;

    const cached = await kvGet();
    if (cached && Date.now() - cached.fetched_at < FRESH_MS) {
        memo = cached;
        return cached;
    }

    const live = await fetchLive();
    if (live) {
        memo = live;
        await kvPut(live);
        return live;
    }

    console.warn("[fx] live USD→INR unavailable — using fallback");
    if (cached) return { ...cached, source: "cache-stale" };
    const env = Number(await getEnv("FUNDRAISER_USD_INR_RATE"));
    if (sane(env)) return { rate: env, as_of: "", source: "env", fetched_at: Date.now() };
    return { rate: DEFAULT_RATE, as_of: "", source: "default", fetched_at: Date.now() };
}
