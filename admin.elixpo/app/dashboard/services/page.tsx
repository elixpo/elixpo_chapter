import { type Health, healthOf } from "@/components/service/types";
import {
    classOf,
    internalTraffic,
    statusMatrix,
    visitorOnly,
} from "@/lib/diagnostics";
import { rangeWindow } from "@/lib/range";
import { listServices } from "@/lib/services";
import ServicesView, { type ServiceRow } from "./services-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function ServicesPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const { range } = await searchParams;
    const w = rangeWindow(range);
    const services = await listServices().catch(() => []);
    const zoneIds = Array.from(new Set(services.map((s) => s.zoneId)));

    const errors: string[] = [];
    const perZone = await Promise.all(
        zoneIds.map(async (z) => {
            const [mx, internal] = await Promise.all([
                statusMatrix(z, w),
                internalTraffic(z, w),
            ]);
            if (!mx.available) errors.push(mx.error || "status matrix failed");
            // Health is judged on what visitors received; Cloudflare-internal
            // requests (Early Hints lookups etc.) are excluded when available.
            return internal.available
                ? visitorOnly(mx.data, internal.data)
                : mx.data;
        }),
    );

    const byHost = new Map<string, Map<number, number>>();
    for (const rows of perZone)
        for (const r of rows) {
            const m = byHost.get(r.host) || new Map<number, number>();
            m.set(r.status, (m.get(r.status) || 0) + r.count);
            byHost.set(r.host, m);
        }

    const rows: ServiceRow[] = services.map((s) => {
        const codes = byHost.get(s.host) || new Map<number, number>();
        const byClass: Record<string, number> = {
            "1xx": 0,
            "2xx": 0,
            "3xx": 0,
            "4xx": 0,
            "5xx": 0,
        };
        let top: { code: number; count: number } | null = null;
        for (const [code, count] of codes) {
            byClass[classOf(code)] += count;
            const c = classOf(code);
            if (c !== "2xx" && c !== "1xx" && (!top || count > top.count))
                top = { code, count };
        }
        const total = Object.values(byClass).reduce((a, b) => a + b, 0);
        const health: Health = healthOf(byClass, total);
        return { service: s, total, byClass, topNon2xx: top, health };
    });

    return <ServicesView rows={rows} rangeLabel={w.label} error={errors[0]} />;
}
