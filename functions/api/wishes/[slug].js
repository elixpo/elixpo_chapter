// Birthday wish counter: GET /api/wishes/<slug> reads this year's count,
// POST /api/wishes/<slug> {"count": n} adds a batch of wishes from one visitor.
//
// The count lives on the member's Elixpo account (elixpo_auth `users.birthday_wishes`, schema in
// accounts.elixpo migration 0028). This function only touches rows with member = 1, and only these
// two statements run against that database.
// Clients batch clicks in localStorage and flush every few seconds, so one request can carry many
// wishes; the limits below keep a single visitor from inflating the count.
import members from "../../../content/portfolio-order.json";

const MAX_BATCH = 50; // wishes per request
const MAX_PER_MINUTE = 150; // wishes per visitor per member per minute (best effort, per isolate)
const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*elixpo\.com$|^http:\/\/localhost(:\d+)?$/;

const READ = "SELECT CASE WHEN birthday_wishes_year = ?2 THEN birthday_wishes ELSE 0 END AS count FROM users WHERE portfolio_slug = ?1 AND member = 1";
const ADD = "UPDATE users SET birthday_wishes = CASE WHEN birthday_wishes_year = ?2 THEN birthday_wishes + ?3 ELSE ?3 END, birthday_wishes_year = ?2 WHERE portfolio_slug = ?1 AND member = 1 RETURNING birthday_wishes AS count";

// visitor+member -> { minute, n }. Lives as long as the isolate; enough to blunt scripted floods.
const recent = new Map();

const yearInIndia = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date()));

function cors(request) {
  const origin = request.headers.get("Origin");
  return origin && ALLOWED_ORIGIN.test(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

const json = (request, body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(request), ...headers } });

function allowance(request, slug, wanted) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${request.headers.get("CF-Connecting-IP") || "unknown"}:${slug}`;
  const entry = recent.get(key);
  const used = entry?.minute === minute ? entry.n : 0;
  const granted = Math.max(0, Math.min(wanted, MAX_PER_MINUTE - used));
  recent.set(key, { minute, n: used + granted });
  if (recent.size > 5000) for (const [k, v] of recent) if (v.minute < minute) recent.delete(k);
  return granted;
}

export async function onRequest({ request, params, env }) {
  const slug = String(params.slug || "");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...cors(request), "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } });
  }
  if (!members.includes(slug)) return json(request, { error: "unknown member" }, 404);
  const year = yearInIndia();
  const db = env.ACCOUNTS_DB;

  if (request.method === "GET") {
    const count = (await db.prepare(READ).bind(slug, year).first("count")) ?? 0;
    // A short shared cache absorbs polling from many visitors at once.
    return json(request, { slug, year, count }, 200, { "Cache-Control": "public, max-age=10" });
  }
  if (request.method !== "POST") return json(request, { error: "method not allowed" }, 405, { Allow: "GET, POST, OPTIONS" });

  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGIN.test(origin)) return json(request, { error: "origin not allowed" }, 403);
  let body;
  try { body = await request.json(); } catch { return json(request, { error: "invalid JSON" }, 400); }
  const requested = Math.floor(Number(body?.count));
  if (!Number.isFinite(requested) || requested < 1) return json(request, { error: "count must be a positive integer" }, 400);

  const count = allowance(request, slug, Math.min(requested, MAX_BATCH));
  if (!count) return json(request, { error: "too many wishes, slow down", retryAfter: 60 }, 429, { "Retry-After": "60" });
  const total = await db.prepare(ADD).bind(slug, year, count).first("count");
  // No member account linked to this portfolio yet: nothing to store.
  if (total == null) return json(request, { error: "wishes are not open for this member yet" }, 409);
  return json(request, { slug, year, count: total, accepted: count });
}
