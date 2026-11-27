import type React from "react";
import { GITHUB_ORG_URL, UDYAM_NUMBER, UDYAM_VERIFY_URL, oshwaCertification } from "@/lib/legal";

/**
 * A small row of verifiable facts shown where people pay, under the
 * contribute form (which already says "Secured by Razorpay"): the receipt
 * email, the verified GitHub organisation and the Udyam registration (text
 * only, no government marks). Fundraisers for an OSHWA-certified
 * project also show the certification mark. Plain elements + CSS variables,
 * server-component safe.
 *
 *   <TrustStrip slug={view.slug} />
 */

const ICON_PROPS = {
    viewBox: "0 0 24 24",
    width: 14,
    height: 14,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
} as const;

const ICONS: Record<"mail" | "building", React.ReactNode> = {
    mail: (
        <svg {...ICON_PROPS}>
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <path d="m4 7 8 6 8-6" />
        </svg>
    ),
    building: (
        <svg {...ICON_PROPS}>
            <path d="M4 20.5V5.5l8-3 8 3v15" />
            <path d="M2.5 20.5h19M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 20.5v-3.5h4v3.5" />
        </svg>
    ),
};

/** GitHub mark (used only to link to the Elixpo organisation). */
function GitHubMark() {
    return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
    );
}

export default function TrustStrip({ slug }: { slug?: string }) {
    const oshwa = slug ? oshwaCertification(slug) : null;
    return (
        <div className="trust-strip">
            <ul>
                <li>
                    {ICONS.mail}
                    <span>Email receipt for every contribution</span>
                </li>
                <li>
                    <GitHubMark />
                    <a
                        href={GITHUB_ORG_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="The Elixpo GitHub organisation is verified for elixpo.com"
                    >
                        Verified on GitHub
                    </a>
                </li>
                <li>
                    {ICONS.building}
                    <a
                        href={UDYAM_VERIFY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Check it under “Print / Verify Udyam Certificate” on udyamregistration.gov.in"
                    >
                        Udyam-registered MSME · {UDYAM_NUMBER}
                    </a>
                </li>
            </ul>
            {oshwa && (
                <a
                    className="trust-strip-oshwa"
                    href={oshwa.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Certified open source hardware, OSHWA UID ${oshwa.uid}`}
                >
                    <img src="/oshw-mark.png" alt={`OSHW ${oshwa.uid}`} width={84} height={16} />
                    <span>Certified open source hardware</span>
                </a>
            )}
            <style>{`
                .trust-strip { margin-top: 1rem; padding-top: 0.85rem; border-top: 1px solid var(--app-border); color: var(--app-fg-muted); font-size: 0.7rem; line-height: 1.4; }
                .trust-strip ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 0.4rem 0.9rem; }
                .trust-strip li { display: inline-flex; align-items: center; gap: 0.35rem; }
                .trust-strip svg { flex-shrink: 0; }
                .trust-strip a { color: inherit; text-decoration: underline; text-decoration-color: var(--app-border); text-underline-offset: 2px; }
                .trust-strip a:hover { color: var(--app-fg); }
                .trust-strip a.trust-strip-oshwa { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 0.6rem; text-decoration: none; }
                .trust-strip-oshwa img { display: block; height: 16px; width: auto; padding: 3px 6px; border-radius: 6px; background: #fff; box-sizing: content-box; }
                .trust-strip-oshwa span { text-decoration: underline; text-decoration-color: var(--app-border); text-underline-offset: 2px; }
            `}</style>
        </div>
    );
}
