import type { MetadataRoute } from "next";

export const runtime = "edge";

const BASE_URL = "https://accounts.elixpo.com";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: [
                    "/",
                    "/login",
                    "/register",
                    "/about",
                    "/pricing",
                    "/docs/",
                    "/privacy",
                    "/terms",
                    "/.well-known/openid-configuration",
                    "/.well-known/oauth-authorization-server",
                    "/llms.txt",
                ],
                // Private pages (dashboard, authorize, device, mfa, verify, ...)
                // stay crawlable on purpose: they are linked from other sites
                // and CLIs, and crawlers must fetch them to see their noindex
                // (meta + X-Robots-Tag). Disallowing them would let the bare
                // URLs get indexed. Only pure endpoints are blocked.
                disallow: ["/api/", "/callback/"],
            },
        ],
        sitemap: `${BASE_URL}/sitemap.xml`,
        host: BASE_URL,
    };
}
