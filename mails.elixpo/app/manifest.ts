import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Elixpo Mails — Transactional email infrastructure",
        short_name: "Elixpo Mails",
        description:
            "Bring your own sender, design templates with {{variables}}, and trigger transactional email via webhook on Cloudflare's edge.",
        id: "/",
        start_url: "/dashboard",
        scope: "/",
        display: "standalone",
        background_color: "#fbfbf8",
        theme_color: "#fbfbf8",
        categories: ["business", "productivity", "developer"],
        icons: [
            { src: "/icon.png", sizes: "256x256", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
