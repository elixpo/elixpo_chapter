import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationList, notificationRead } from '../src/commands/notification/index.js';

test('notification list forwards pagination and unread filters', async () => {
  let received;
  const client = {
    list: async (options) => {
      received = options;
      return { data: [], meta: { unread: 0, hasMore: false, nextCursor: null } };
    },
  };
  await notificationList({ client, options: { limit: 10, cursor: 'OA', unread: true } });
  assert.deepEqual(received, { limit: 10, cursor: 'OA', unread: true });
});

test('notification read requires an id or all mode', async () => {
  await assert.rejects(
    notificationRead({ client: { markRead: async () => {} }, options: {} }),
    /notification ID is required/,
  );
  let received;
  const client = {
    markRead: async (options) => {
      received = options;
      return { data: { id: 'n-1', read: true } };
    },
  };
  await notificationRead({ client, id: 'n-1', options: { yes: true } });
  assert.deepEqual(received, { id: 'n-1', all: false, read: true });
});
