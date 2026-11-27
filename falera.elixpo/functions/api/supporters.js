// Cloudflare Pages Function: GET /api/supporters
//
// The Falera badge fundraiser's progress and public supporters, read from
// payouts.elixpo.com server-side (its API sends no CORS header, so the
// supporters page can't read it from the browser) and trimmed to what the
// page shows. `wrangler pages deploy out` (npm run deploy) picks up this
// functions/ directory with the static site.

const SLUG = "falera-badge";
const API = `https://payouts.elixpo.com/api/fundraisers/${SLUG}`;
const PAGE = `https://payouts.elixpo.com/f/${SLUG}`;

export async function onRequestGet() {
  try {
    const r = await fetch(API, { cf: { cacheTtl: 30, cacheEverything: true } });
    if (!r.ok) throw new Error(`payouts ${r.status}`);
    const d = await r.json();
    const out = {
      title: d.title,
      status: d.status,
      goal: d.goal,
      raised: d.raised,
      contributors: d.contributors,
      ended: Boolean(d.ended),
      url: PAGE,
      supporters: (d.supporters || []).map((s) => ({
        name: s.name || null,
        message: s.message || null,
        amount: s.amount,
        currency: s.currency,
        paid_at: s.paid_at,
      })),
    };
    return new Response(JSON.stringify(out), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=30",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "unavailable", url: PAGE }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
}
