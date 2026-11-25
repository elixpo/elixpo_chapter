/**
 * SEO for public fundraiser pages (/f/<slug>): metadata, structured data and
 * shared copy so search results and link previews describe a fundraiser the
 * same way everywhere.
 */

import type { Metadata } from "next";
import { type FundraiserRow, hasEnded, publicName } from "./fundraisers";
import {
    BRAND,
    CARD_SIZE,
    cardState,
    cardVersion,
    fundraiserDescription as describe,
    formatRupees,
    fundraiserPageTitle,
} from "./fundraiser-share";

export const SITE = "https://payouts.elixpo.com";

const inr = formatRupees;

/** Meta description: the fundraiser's own words, at most 125 characters. */
export function fundraiserDescription(row: FundraiserRow): string {
    return describe({ title: row.title, body_md: row.body_md, who: publicName(row), goal: row.goal_amount });
}

/** Path of the generated link-preview card, versioned by its numbers. */
export function fundraiserCardPath(row: FundraiserRow, raisedMinor: number, contributors: number): string {
    const state = cardState({ status: row.status, ended: hasEnded(row), raised: raisedMinor, goal: row.goal_amount });
    return `/f/${row.slug}/og.png?v=${cardVersion(raisedMinor, contributors, state)}`;
}

export function fundraiserMetadata(row: FundraiserRow, raisedMinor: number, contributors: number): Metadata {
    const who = publicName(row);
    const url = `/f/${row.slug}`;
    const description = fundraiserDescription(row);
    const image = {
        url: fundraiserCardPath(row, raisedMinor, contributors),
        width: CARD_SIZE.width,
        height: CARD_SIZE.height,
        type: "image/png",
        alt: `${row.title}: ${inr(raisedMinor)} raised of ${inr(row.goal_amount)} on ${BRAND}`,
    };
    return {
        // Absolute: skip the site-wide "| Elixpo Pay" template so the title stays under 60.
        title: { absolute: fundraiserPageTitle(row.title) },
        description,
        keywords: [row.title, who, "fundraiser", "donate", "crowdfunding", "support", "UPI donation", "Elixpo Pay"],
        authors: [{ name: who }],
        alternates: { canonical: url },
        // Live and closed pages are indexable (closed ones stay up as a record).
        robots: { index: true, follow: true, "max-image-preview": "large" } as Metadata["robots"],
        openGraph: {
            type: "website",
            siteName: "Elixpo Pay",
            locale: "en_IN",
            url,
            title: row.title,
            description,
            images: [image],
        },
        twitter: { card: "summary_large_image", title: row.title, description, images: [image] },
        other: { "og:see_also": SITE },
    };
}

/** JSON-LD: WebPage + DonateAction (recipient, goal) + breadcrumb. */
export function fundraiserJsonLd(row: FundraiserRow, raisedMinor: number, contributors: number): string {
    const who = publicName(row);
    const url = `${SITE}/f/${row.slug}`;
    const data = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                "@id": `${url}#page`,
                url,
                name: row.title,
                description: fundraiserDescription(row),
                inLanguage: "en-IN",
                isPartOf: { "@type": "WebSite", name: "Elixpo Pay", url: SITE },
                primaryImageOfPage: `${SITE}${fundraiserCardPath(row, raisedMinor, contributors)}`,
                ...(row.published_at ? { datePublished: `${row.published_at.replace(" ", "T")}Z` } : {}),
                dateModified: `${row.updated_at.replace(" ", "T")}Z`,
                breadcrumb: { "@id": `${url}#breadcrumb` },
                potentialAction: {
                    "@type": "DonateAction",
                    name: `Contribute to ${row.title}`,
                    target: url,
                    recipient: {
                        "@type": "Person",
                        name: who,
                        ...(row.link_url ? { url: row.link_url } : {}),
                    },
                    ...(row.status === "live" ? { actionStatus: "https://schema.org/PotentialActionStatus" } : { actionStatus: "https://schema.org/CompletedActionStatus" }),
                },
                about: {
                    "@type": "Thing",
                    name: row.title,
                    description: `Goal ${inr(row.goal_amount)}; ${inr(raisedMinor)} raised from ${contributors} ${contributors === 1 ? "supporter" : "supporters"}.`,
                },
            },
            {
                "@type": "BreadcrumbList",
                "@id": `${url}#breadcrumb`,
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Elixpo Pay", item: SITE },
                    { "@type": "ListItem", position: 2, name: "Fundraisers", item: `${SITE}/docs/fundraisers` },
                    { "@type": "ListItem", position: 3, name: row.title, item: url },
                ],
            },
        ],
    };
    // Safe to inline in <script>: no "</" can close the tag.
    return JSON.stringify(data).replace(/</g, "\\u003c");
}
