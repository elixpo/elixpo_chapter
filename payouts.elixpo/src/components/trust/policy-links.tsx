import Link from "next/link";
import type React from "react";

/**
 * Policy links shown at every point where money or personal data is involved.
 * Framework-agnostic (plain elements + CSS variables), so it works on the
 * public pages and inside the MUI dashboard alike. Server-component safe.
 *
 *   <PolicyLinks lead="By paying you agree to the" />
 */
export const POLICIES = [
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
    { href: "/refunds", label: "Refunds" },
    { href: "/email-policy", label: "Email policy" },
    { href: "/trust", label: "Trust & safety" },
] as const;

/** Sections of /trust that explain one flow end to end. */
export type TrustSection = "buying" | "contributing" | "payouts" | "emails" | "refunds" | "end-to-end" | "get-started";

export default function PolicyLinks({
    lead,
    trust = "end-to-end",
    newTab = false,
    align = "left",
    style,
}: {
    /** Which /trust section the "How it works" link opens. */
    trust?: TrustSection;
    /** Open links in a new tab (e.g. mid-checkout, so the payment page stays open). */
    newTab?: boolean;
    /** Optional sentence before the links, e.g. "By paying you agree to the". */
    lead?: string;
    align?: "left" | "center";
    style?: React.CSSProperties;
}) {
    return (
        <p
            className="policy-links"
            style={{
                margin: 0,
                fontSize: "0.75rem",
                lineHeight: 1.6,
                color: "var(--app-fg-muted)",
                textAlign: align,
                ...style,
            }}
        >
            {lead ? `${lead} ` : null}
            {POLICIES.map((p) => (
                <span key={p.href}>
                    <Link
                        href={p.href === "/trust" ? `/trust#${trust}` : p.href}
                        style={{ color: "var(--app-link)", fontWeight: 700, textDecoration: "none" }}
                        {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
                    >
                        {p.label}
                    </Link>
                    <span aria-hidden> · </span>
                </span>
            ))}
            <Link
                href={`/trust#${trust}`}
                style={{ color: "var(--app-link)", fontWeight: 700, textDecoration: "none" }}
                {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
            >
                How it works →
            </Link>
        </p>
    );
}
