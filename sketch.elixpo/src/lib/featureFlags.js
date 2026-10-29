// Remote workspace MCP is still under validation. Keep local development
// available for testing, but do not expose grants or remote edits in a
// production deployment until the integration is explicitly released.
export const REMOTE_MCP_ENABLED = process.env.NODE_ENV !== 'production'


// Paid plans (pricing page, upgrade CTAs, Pro badges, billing tab, pricing
// links, sitemap entry) are hidden unless NEXT_PUBLIC_ENABLE_PAID_PLANS is
// exactly "true". NEXT_PUBLIC_* values are inlined at build time.
// This only hides UI: tier data and the server-side plan limits in
// src/lib/planLimits.js and the API routes are intentionally unchanged.
export const PAID_PLANS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAID_PLANS === 'true'
