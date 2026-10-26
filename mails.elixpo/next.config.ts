import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    // MUI v7's prebuilt ESM has a circular-init hazard that surfaces during
    // Next 15's page-data collection. Re-transpiling through Next's webpack
    // pipeline resolves the eval order. (Same fix as payouts/accounts.)
    transpilePackages: [
        "@mui/material",
        "@mui/system",
        "@mui/icons-material",
        "@mui/utils",
        "@mui/private-theming",
        "@mui/styled-engine",
        // WYSIWYG editor (BlockNote-based) — browser-only, loaded via ssr:false.
        "@elixpo/lixeditor",
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
    async headers() {
        const securityHeaders = [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "X-Frame-Options", value: "DENY" },
            { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
            {
                key: "Permissions-Policy",
                value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
            },
            { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ];
        // Authenticated and machine surfaces must never be indexed, even if a
        // crawler ignores robots.txt and reaches them through a shared link.
        const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];
        return [
            { source: "/:path*", headers: securityHeaders },
            ...["/api/:path*", "/dashboard/:path*", "/dashboard", "/workspace/:path*", "/workspace"]
                .concat(["/join/:path*", "/login", "/u/:path*", "/v1/:path*"])
                .map((source) => ({ source, headers: noindex })),
        ];
    },
};

export default nextConfig;
