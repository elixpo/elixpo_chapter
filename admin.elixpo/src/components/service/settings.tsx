"use client";

import { Pill } from "@/components/service/kit";
import type React from "react";

/** Render a zone-setting value from GET /zones/:id/settings. */
export function settingValue(v: unknown, kind?: "ttl"): React.ReactNode {
    if (v === undefined || v === null) return "—";
    if (v === "on") return <Pill tone="green">on</Pill>;
    if (v === "off") return <Pill>off</Pill>;
    if (kind === "ttl" && typeof v === "number") {
        if (v === 0) return "respect origin";
        if (v >= 86400) return `${+(v / 86400).toFixed(1)} d`;
        if (v >= 3600) return `${+(v / 3600).toFixed(1)} h`;
        if (v >= 60) return `${Math.round(v / 60)} min`;
        return `${v} s`;
    }
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
}

/** Tone for the SSL mode — flexible means origin traffic is unencrypted. */
export function sslTone(v: unknown): "green" | "warn" | "error" | "neutral" {
    if (v === "strict" || v === "full") return "green";
    if (v === "flexible") return "warn";
    if (v === "off") return "error";
    return "neutral";
}

export const SSL_MEANING: Record<string, string> = {
    off: "No HTTPS between visitors and Cloudflare.",
    flexible:
        "Visitor ↔ Cloudflare is HTTPS, but Cloudflare ↔ origin is plain HTTP.",
    full: "HTTPS to the origin, certificate not validated.",
    strict: "HTTPS to the origin with a validated certificate (Full strict).",
};
