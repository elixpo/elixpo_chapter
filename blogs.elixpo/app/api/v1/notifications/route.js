export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../lib/api/v1/responses';

const REQUIRED_SCOPE = 'lixblogs:notifications:read';

function parseCursor(value) {
  if (!value) return 0;
  try {
    const offset = Number.parseInt(atob(value), 10);
    if (!Number.isInteger(offset) || offset < 0) throw new Error();
    return offset;
  } catch {
    throw new Error('invalid_cursor');
  }
}

export async function GET(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, [REQUIRED_SCOPE], 'notifications.list');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;

  try {
    const params = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(Number.parseInt(params.get('limit') || '30', 10), 1), 50);
    const offset = parseCursor(params.get('cursor'));
    const unreadOnly = params.get('unread') === 'true';

    const unreadPredicate = unreadOnly ? 'AND n.read = 0' : '';
    const [notifications, unread] = await Promise.all([
      db.prepare(`
        SELECT n.id, n.type, n.actor_id, n.actor_name, n.actor_avatar,
          n.target_id, n.target_title, n.target_url, n.read, n.created_at,
          CASE WHEN n.type = 'blog_invite' THEN COALESCE(bc.status, 'declined') ELSE NULL END AS invite_status
        FROM notifications n
        LEFT JOIN blogs b ON n.type = 'blog_invite' AND b.id = n.target_id
        LEFT JOIN blog_co_authors bc ON n.type = 'blog_invite' AND bc.blog_id = n.target_id AND bc.user_id = n.user_id
        WHERE n.user_id = ?
          AND (n.type <> 'blog_invite' OR b.status IN ('published', 'unlisted'))
          ${unreadPredicate}
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ? OFFSET ?
      `).bind(auth.userId, limit + 1, offset).all(),
      db.prepare(`
        SELECT COUNT(*) AS count FROM notifications n
        WHERE n.user_id = ? AND n.read = 0
      `).bind(auth.userId).first(),
    ]);

    const rows = notifications?.results || [];
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((row) => ({
      id: row.id,
      type: row.type,
      actor: row.actor_id ? { id: row.actor_id, name: row.actor_name, avatarUrl: row.actor_avatar } : { name: row.actor_name, avatarUrl: row.actor_avatar },
      target: { id: row.target_id, title: row.target_title, url: row.target_url },
      read: Boolean(row.read),
      inviteStatus: row.invite_status,
      createdAt: row.created_at,
    }));
    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: 'notifications.list', resourceType: 'notification',
    });
    return apiSuccess(context, data, {
      meta: {
        unread: Number(unread?.count || 0),
        hasMore,
        nextCursor: hasMore ? btoa(String(offset + limit)) : null,
      },
      headers: rateHeaders,
    });
  } catch (error) {
    if (error.message === 'invalid_cursor') {
      return apiError(context, 'invalid_cursor', 'The notification cursor is invalid.', 400, { headers: rateHeaders });
    }
    console.error('[api/v1/notifications] list failed:', error?.message || error);
    return apiError(context, 'internal_error', 'Notifications could not be listed.', 500, { headers: rateHeaders });
  }
}

export async function POST(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, [REQUIRED_SCOPE], 'notifications.read');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.all === true) {
      await db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').bind(auth.userId).run();
      await recordApiAudit(db, {
        requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
        action: 'notifications.read_all', resourceType: 'notification',
      });
      return apiSuccess(context, { all: true }, { headers: rateHeaders });
    }
    const id = String(body?.id || '').trim();
    if (!id) return apiError(context, 'invalid_notification', 'A notification id or all=true is required.', 400, { headers: rateHeaders });
    const read = body?.read === false ? 0 : 1;
    await db.prepare('UPDATE notifications SET read = ? WHERE id = ? AND user_id = ?').bind(read, id, auth.userId).run();
    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: 'notifications.read', resourceType: 'notification', resourceId: id,
    });
    return apiSuccess(context, { id, read: read === 1 }, { headers: rateHeaders });
  } catch (error) {
    console.error('[api/v1/notifications] update failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The notification could not be updated.', 500, { headers: rateHeaders });
  }
}
