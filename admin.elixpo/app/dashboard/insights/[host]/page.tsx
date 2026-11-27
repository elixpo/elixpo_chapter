/**
 * Product insights for one deployed product: signed-in users (MAU, new vs
 * returning, locale/country/device), visitors (unique, returning, visits,
 * page views), what people use most, regions, acquisition and page speed.
 */

import { Empty, PageHeader } from "@/components/ui";
import { listProducts, productInsights } from "@/lib/insights";
import { rangeWindow } from "@/lib/range";
import { Box } from "@mui/material";
import ProductInsightsView from "./product-insights-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function ProductInsightsPage({
    params,
    searchParams,
}: {
    params: Promise<{ host: string }>;
    searchParams: Promise<{ range?: string }>;
}) {
    const { host } = await params;
    const { range } = await searchParams;
    const decoded = decodeURIComponent(host);
    const [data, list] = await Promise.all([
        productInsights(decoded, rangeWindow(range || "30d")),
        listProducts().catch(() => ({ products: [] })),
    ]);
    if (!data) {
        return (
            <Box>
                <PageHeader title={decoded} subtitle="Product insights" />
                <Empty message="Not a deployed product — only hosts served by a Pages project or a Worker have insights." />
            </Box>
        );
    }
    return (
        <ProductInsightsView
            data={data}
            products={list.products.map((p) => ({
                host: p.host,
                label: p.label,
            }))}
        />
    );
}
