// Shared auth + rate-limit enforcement for AI endpoints

import { getLimits } from './tiers.js';
import { claimAIQuota } from './aiQuota.js';

/**
 * Validate session and enforce AI usage limits.
 * Returns { session, error } — if error is set, return it as the Response.
 */
function isLocalD1Unavailable(error) {
  if (process.env.NODE_ENV !== 'development') return false;

  const message = error instanceof Error ? error.message : String(error);

  return message.includes('D1 database binding is unavailable');
}
export async function enforceAILimits({
  requireMember = false,
  request = null,
  getSessionImpl = async () => {
    const { getSession } = await import('./auth.js');
    return getSession();
  },
  getDBImpl = async () => {
    const { getDB } = await import('./cloudflare.js');
    return getDB();
  },
} = {}) {
  let session = await getSessionImpl();
  if (!session?.userId && request?.headers?.get('authorization')?.startsWith('Bearer ')) {
    try {
      const { requireBearerAuth } = await import('./api/v1/bearerAuth.js');
      const { getDB } = await import('./cloudflare.js');
      const auth = await requireBearerAuth(request, ['lixblogs:media:write'], { db: getDB() });
      session = { ...auth, apiClientId: auth.clientId };
    } catch {}
  }
  if (!session?.userId) {
    return {
      session: null,
      error: new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 }),
    };
  }

  let db;

  try {
    db = await getDBImpl();

    if (!db) {
      throw new Error('D1 database binding is unavailable');
    }
  } catch (error) {
    if (!requireMember && isLocalD1Unavailable(error)) {
      return { session, error: null };
    }

    console.error('[ai/rate-limit] database unavailable:', error);

    return {
      session,
      error: new Response(JSON.stringify({
        error: requireMember
          ? 'AI access check unavailable'
          : 'AI quota check unavailable',
      }), { status: 503 }),
    };
  }

  try {
    const user = await db.prepare('SELECT tier FROM users WHERE id = ?')
      .bind(session.userId).first();

    if (!user) {
      return {
        session,
        error: new Response(JSON.stringify({ error: 'User account not found' }), { status: 403 }),
      };
    }

    if (requireMember && user.tier !== 'member') {
      return {
        session,
        error: new Response(JSON.stringify({
          error: 'AI image generation requires the Member plan',
          upgrade: true,
        }), { status: 403 }),
      };
    }

    const limits = getLimits(user.tier);

    // Check-and-increment in a single atomic statement. A read-then-write here
    // lets parallel requests all observe the same count and exceed the cap.
    const claimed = await claimAIQuota(db, session.userId, limits.aiRequestsPerDay);

    if (!claimed) {
      return {
        session,
        error: new Response(JSON.stringify({
          error: 'Daily AI limit reached',
          limit: limits.aiRequestsPerDay,
          tier: user.tier,
        }), { status: 429 }),
      };
    }
  } catch (error) {
    console.error('[ai/rate-limit] quota check failed:', error);

    return {
      session,
      error: new Response(JSON.stringify({
        error: requireMember
          ? 'AI access check unavailable'
          : 'AI quota check unavailable',
      }), { status: 503 }),
    };
  }

  return { session, error: null };
}