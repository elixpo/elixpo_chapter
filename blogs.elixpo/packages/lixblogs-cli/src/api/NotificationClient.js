import { BlogApiError } from './BlogClient.js';

async function errorFrom(response) {
  const payload = await response.json().catch(() => ({}));
  throw new BlogApiError(
    payload?.error?.code || `http_${response.status}`,
    payload?.error?.message || `LixBlogs returned HTTP ${response.status}.`,
    { status: response.status, requestId: payload?.error?.requestId || response.headers.get('x-request-id') },
  );
}

export class NotificationClient {
  constructor(authenticatedClient) {
    this.http = authenticatedClient;
  }

  async list({ limit = 30, cursor, unread = false } = {}) {
    await this.http.requireScopes(['lixblogs:notifications:read']);
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    if (unread) query.set('unread', 'true');
    const response = await this.http.request(`/api/v1/notifications?${query}`);
    if (!response.ok) throw await errorFrom(response);
    const payload = await response.json();
    return payload;
  }

  async markRead({ id, all = false, read = true } = {}) {
    await this.http.requireScopes(['lixblogs:notifications:read']);
    const body = all ? { all: true } : { id, read };
    const response = await this.http.request('/api/v1/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await errorFrom(response);
    return response.json();
  }
}
