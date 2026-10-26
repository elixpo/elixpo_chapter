import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, fetchUserInfo, upsertUser, createSession, auditLog } from '@/lib/auth';
import { getKV } from '@/lib/db';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Surface the provider's actual error (access_denied, invalid_scope,
  // temporarily_unavailable, ...) instead of collapsing everything into
  // access_denied. /login renders an error page when `error` is present, so
  // this never re-enters the OAuth flow automatically.
  if (error) {
    if (state) await getKV().delete(`oauth_state:${state}`).catch(() => {});
    const dest = new URL('/login', request.url);
    dest.searchParams.set('error', error.slice(0, 64));
    const description = url.searchParams.get('error_description');
    if (description) dest.searchParams.set('error_description', description.slice(0, 300));
    return NextResponse.redirect(dest);
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=invalid_request', request.url));
  }

  // Verify state
  const kv = getKV();
  const storedState = await kv.get(`oauth_state:${state}`);
  if (!storedState) {
    return NextResponse.redirect(new URL('/login?error=invalid_state', request.url));
  }
  await kv.delete(`oauth_state:${state}`);
  let returnTo = '/dashboard';
  try {
    const parsed = JSON.parse(storedState) as { returnTo?: string };
    if (parsed.returnTo?.startsWith('/') && !parsed.returnTo.startsWith('//')) {
      returnTo = parsed.returnTo;
    }
  } catch {
    // Backward-compatible with state values issued before return paths were stored.
  }

  try {
    const tokens = await exchangeCode(code, request.url);
    const userInfo = await fetchUserInfo(tokens.access_token);
    const user = await upsertUser(userInfo);

    await createSession(user.id);
    await auditLog(user.id, 'user.login', 'user', String(user.id));

    return NextResponse.redirect(new URL(returnTo, request.url));
  } catch (e) {
    console.error('OAuth callback error:', e);
    return NextResponse.redirect(new URL('/login?error=server_error', request.url));
  }
}
