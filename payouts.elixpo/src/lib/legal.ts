/**
 * Public, verifiable facts about who runs Elixpo Pay. Defined once here and
 * shown on the fundraiser pages, the About page and the site footer.
 *
 * The Udyam registration is shown as text only: the Government of India
 * emblem, the Ministry of MSME logo and the Udyam logo are restricted marks
 * and must not be used on the site.
 */

export const LEGAL_ENTITY = "Elixpo";
export const LEGAL_COUNTRY = "India";
export const CONTACT_EMAIL = "hello@elixpo.com";

/** Udyam (MSME) registration, verifiable at "Print / Verify Udyam Certificate". */
export const UDYAM_NUMBER = "UDYAM-WB-07-0152337";
export const UDYAM_VERIFY_URL = "https://udyamregistration.gov.in";

/** The Elixpo GitHub organisation, verified for elixpo.com. */
export const GITHUB_ORG_URL = "https://github.com/elixpo";

/** Payment processor for every checkout and contribution. */
export const PAYMENT_PROCESSOR = "Razorpay";

/**
 * Fundraisers for projects certified by the Open Source Hardware Association.
 * The OSHWA certification mark may only be shown for the certified project.
 */
export const OSHWA_CERTIFIED: Record<string, { uid: string; url: string }> = {
    "falera-badge": { uid: "IN000107", url: "https://certification.oshwa.org/in000107.html" },
};

export function oshwaCertification(slug: string): { uid: string; url: string } | null {
    return OSHWA_CERTIFIED[slug.toLowerCase()] ?? null;
}
