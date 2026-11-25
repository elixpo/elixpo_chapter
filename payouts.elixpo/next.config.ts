import type { NextConfig } from "next";

/**
 * Content-Security-Policy. Every origin below is one the app actually loads:
 *   - Razorpay Checkout: checkout.js from checkout.razorpay.com, its modal frames
 *     api.razorpay.com, and it reports to lumberjack*.razorpay.com.
 *   - Cloudflare Web Analytics (auto-injected beacon), and api.github.com for
 *     the navbar's star count.
 *   - Images: fundraiser covers and Google/GitHub avatars are arbitrary https
 *     URLs, plus data:/blob: for QR codes and previews.
 * Scripts keep 'unsafe-inline' because pages are statically rendered (no
 * per-request nonce) and Next.js, the theme script and JSON-LD are inline; no
 * external script origin outside this list can load. 'unsafe-eval' is only
 * allowed in `next dev`, which needs it for fast refresh.
 */
const isDev = process.env.NODE_ENV !== "production";
const CSP = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://lumberjack-cx.razorpay.com https://cloudflareinsights.com https://api.github.com",
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    "worker-src 'self' blob:",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://api.razorpay.com",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
].join("; ");

// Fundraisers whose slug was renamed: old slug -> new slug. Links already
// shared (posts, emails, press, printed boards) keep working through a
// permanent redirect. 308 keeps the method, so a POST to the old contribute
// endpoint still reaches the fundraiser.
const RENAMED_FUNDRAISERS: Record<string, string> = {
    "oreo-badge": "falera-badge", // OreoOS was renamed FaleraOS, 19 Nov 2026
};

const nextConfig: NextConfig = {
    output: "standalone",
    async redirects() {
        return Object.entries(RENAMED_FUNDRAISERS).flatMap(([from, to]) => [
            { source: `/f/${from}`, destination: `/f/${to}`, permanent: true },
            { source: `/f/${from}/:path*`, destination: `/f/${to}/:path*`, permanent: true },
            { source: `/api/fundraisers/${from}`, destination: `/api/fundraisers/${to}`, permanent: true },
            {
                source: `/api/fundraisers/${from}/:path*`,
                destination: `/api/fundraisers/${to}/:path*`,
                permanent: true,
            },
        ]);
    },
    // MUI v7's prebuilt ESM has a circular-init hazard that surfaces during
    // Next 15's page-data collection. Re-transpiling through Next's webpack
    // pipeline resolves the eval order. (Same fix as accounts.elixpo.)
    transpilePackages: [
        "@mui/material",
        "@mui/system",
        "@mui/icons-material",
        "@mui/utils",
        "@mui/private-theming",
        "@mui/styled-engine",
    ],
    // Rewrite barrel imports to deep paths so we never load the MUI barrel
    // module (the source of the circular init crash above).
    modularizeImports: {
        "@mui/material": {
            transform: "@mui/material/{{member}}",
        },
        "@mui/icons-material": {
            transform: "@mui/icons-material/{{member}}",
        },
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    // Security headers on every response, including a full Content-Security-Policy.
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "Content-Security-Policy", value: CSP },
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
                    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
                ],
            },
        ];
    },
};

export default nextConfig;
