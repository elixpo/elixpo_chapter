import type { MetadataRoute } from "next";

export const runtime = "edge";

const BASE_URL = "https://accounts.elixpo.com";

// Bump when the page content changes; a per-request `new Date()` would tell
// crawlers every page changes on every fetch.
const UPDATED = {
    product: new Date("2026-10-26"),
    docs: new Date("2026-10-26"),
    legal: new Date("2026-10-26"),
};

type Entry = {
    path: string;
    priority: number;
    changeFrequency: NonNullable<
        MetadataRoute.Sitemap[number]["changeFrequency"]
    >;
    lastModified: Date;
};

const PUBLIC_ROUTES: Entry[] = [
    {
        path: "",
        priority: 1,
        changeFrequency: "weekly",
        lastModified: UPDATED.product,
    },
    {
        path: "/pricing",
        priority: 0.9,
        changeFrequency: "weekly",
        lastModified: UPDATED.product,
    },
    {
        path: "/login",
        priority: 0.8,
        changeFrequency: "monthly",
        lastModified: UPDATED.product,
    },
    {
        path: "/register",
        priority: 0.8,
        changeFrequency: "monthly",
        lastModified: UPDATED.product,
    },
    {
        path: "/docs",
        priority: 0.9,
        changeFrequency: "weekly",
        lastModified: UPDATED.docs,
    },
    {
        path: "/docs/quickstart",
        priority: 0.9,
        changeFrequency: "weekly",
        lastModified: UPDATED.docs,
    },
    {
        path: "/docs/lixaccounts",
        priority: 0.9,
        changeFrequency: "weekly",
        lastModified: UPDATED.docs,
    },
    {
        path: "/docs/oauth",
        priority: 0.8,
        changeFrequency: "monthly",
        lastModified: UPDATED.docs,
    },
    {
        path: "/docs/users-api",
        priority: 0.8,
        changeFrequency: "monthly",
        lastModified: UPDATED.docs,
    },
    {
        path: "/docs/webhooks",
        priority: 0.8,
        changeFrequency: "monthly",
        lastModified: UPDATED.docs,
    },
    {
        path: "/docs/api-keys",
        priority: 0.7,
        changeFrequency: "monthly",
        lastModified: UPDATED.docs,
    },
    {
        path: "/docs/errors",
        priority: 0.6,
        changeFrequency: "monthly",
        lastModified: UPDATED.docs,
    },
    {
        path: "/docs/self-hosting",
        priority: 0.6,
        changeFrequency: "monthly",
        lastModified: UPDATED.docs,
    },
    {
        path: "/about",
        priority: 0.6,
        changeFrequency: "monthly",
        lastModified: UPDATED.product,
    },
    {
        path: "/privacy",
        priority: 0.3,
        changeFrequency: "yearly",
        lastModified: UPDATED.legal,
    },
    {
        path: "/terms",
        priority: 0.3,
        changeFrequency: "yearly",
        lastModified: UPDATED.legal,
    },
];

export default function sitemap(): MetadataRoute.Sitemap {
    return PUBLIC_ROUTES.map(
        ({ path, priority, changeFrequency, lastModified }) => ({
            url: `${BASE_URL}${path}`,
            lastModified,
            priority,
            changeFrequency,
        }),
    );
}
