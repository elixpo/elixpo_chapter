import { requireConfirmation } from '../../cli/contract.js';

export async function notificationList({ client, options = {} }) {
  return client.list({
    limit: options.limit,
    cursor: options.cursor,
    unread: options.unread,
  });
}

export async function notificationRead({ client, id, options = {} }) {
  if (options.all) {
    requireConfirmation(options, 'Marking all notifications as read');
  } else if (!id) {
    throw new Error('A notification ID is required unless --all is used.');
  }
  return client.markRead({ id, all: Boolean(options.all), read: options.read !== false });
}
