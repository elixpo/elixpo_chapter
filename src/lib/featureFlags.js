// The MCP connector (package MCP server docs, Remote MCP grants, header
// badge, API routes) is shown as "coming soon" everywhere unless
// NEXT_PUBLIC_ENABLE_MCP is exactly "true" (inlined at build time). Set it
// in .env.local to test the integration locally.
export const MCP_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MCP === 'true'
export const REMOTE_MCP_ENABLED = MCP_ENABLED


// Paid plans (pricing page, upgrade CTAs, Pro badges, billing tab, pricing
// links, sitemap entry) are hidden unless NEXT_PUBLIC_ENABLE_PAID_PLANS is
// exactly "true". NEXT_PUBLIC_* values are inlined at build time.
// This only hides UI: tier data and the server-side plan limits in
// src/lib/planLimits.js and the API routes are intentionally unchanged.
export const PAID_PLANS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAID_PLANS === 'true'
