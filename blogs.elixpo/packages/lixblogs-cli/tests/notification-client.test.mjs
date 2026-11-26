import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationClient } from '../src/api/NotificationClient.js';

test('notification client requires notifications read scope and forwards unread cursor', async () => {
  let required;
  let url;
  const http = {
    requireScopes: async (scopes) => { required = scopes; },
    request: async (requestUrl) => {
      url = requestUrl;
      return new Response(JSON.stringify({ data: [], meta: { unread: 0, hasMore: false } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
  const client = new NotificationClient(http);
  await client.list({ limit: 10, cursor: 'OA', unread: true });
  assert.deepEqual(required, ['lixblogs:notifications:read']);
  assert.match(url, /^\/api\/v1\/notifications\?/);
  assert.match(url, /limit=10/);
  assert.match(url, /cursor=OA/);
  assert.match(url, /unread=true/);
});

test('notification mark-read posts one id or all mode', async () => {
  const calls = [];
  const http = {
    requireScopes: async () => {},
    request: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ data: { id: 'n-1', read: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
  await new NotificationClient(http).markRead({ id: 'n-1', read: true });
  assert.equal(calls[0].url, '/api/v1/notifications');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body, JSON.stringify({ id: 'n-1', read: true }));
});
