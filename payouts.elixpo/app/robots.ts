import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            // Auth/transactional/API surfaces shouldn't be indexed.
            // Fundraiser pages (/f/<slug>) are public; their thank-you receipts aren't.
            disallow: ["/dashboard", "/api/", "/checkout", "/v1/", "/f/*/thanks"],
        },
        sitemap: "https://payouts.elixpo.com/sitemap.xml",
        host: "https://payouts.elixpo.com",
    };
}
