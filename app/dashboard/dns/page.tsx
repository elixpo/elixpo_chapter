import { discoverAccount } from "@/lib/discovery";
import { dnsAnalytics, dnsBreakdown } from "@/lib/metrics";
import { rangeWindow } from "@/lib/range";
import DnsView, { type DnsZone } from "./dns-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function DnsPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const inv = await discoverAccount();
    const { range } = await searchParams;
    const w = rangeWindow(range);

    const zones: DnsZone[] = await Promise.all(
        inv.zones.map(async (z) => {
            const [series, bd] = await Promise.all([
                dnsAnalytics(z.id, w),
                dnsBreakdown(z.id, w),
            ]);
            return { name: z.name, id: z.id, series, bd };
        }),
    );

    return <DnsView zones={zones} />;
}
