import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commentAdd,
  commentDelete,
  commentList,
  commentReply,
} from '../src/commands/comment/index.js';

test('commentList validates blog ID and delegates to client.comments', async () => {
  await assert.rejects(
    commentList({ client: {}, id: '' }),
    /A blog ID is required\./,
  );

  let requestedId;
  const client = {
    comments: async (id) => {
      requestedId = id;
      return [{ id: 'c-1', content: 'Nice post' }];
    },
  };

  const result = await commentList({ client, id: 'blog-1' });
  assert.equal(requestedId, 'blog-1');
  assert.deepEqual(result, [{ id: 'c-1', content: 'Nice post' }]);
});

test('commentList propagates client errors', async () => {
  const client = {
    comments: async () => {
      throw new Error('network failure');
    },
  };

  await assert.rejects(
    commentList({ client, id: 'blog-1' }),
    /network failure/,
  );
});

test('commentAdd validates inputs, trims content, and delegates to client.comment', async () => {
  await assert.rejects(
    commentAdd({ client: {}, id: '', options: { content: 'Hello' } }),
    /A blog ID is required\./,
  );

  await assert.rejects(
    commentAdd({ client: {}, id: 'blog-1', options: { content: '   ' } }),
    /--content is required\./,
  );

  let request;
  const client = {
    comment: async (id, content) => {
      request = { id, content };
      return { id: 'c-2', content };
    },
  };

  const result = await commentAdd({
    client,
    id: 'blog-1',
    options: { content: '  Great writeup!  ' },
  });

  assert.deepEqual(request, { id: 'blog-1', content: 'Great writeup!' });
  assert.equal(result.id, 'c-2');
});

test('commentAdd propagates client errors', async () => {
  const client = {
    comment: async () => {
      throw new Error('failed to post comment');
    },
  };

  await assert.rejects(
    commentAdd({ client, id: 'blog-1', options: { content: 'Hello' } }),
    /failed to post comment/,
  );
});

test('commentReply validates inputs and passes parentId to client.comment', async () => {
  await assert.rejects(
    commentReply({ client: {}, id: '', options: { parent: 'c-1', content: 'Reply' } }),
    /A blog ID and --parent comment ID are required\./,
  );

  await assert.rejects(
    commentReply({ client: {}, id: 'blog-1', options: { content: 'Reply' } }),
    /A blog ID and --parent comment ID are required\./,
  );

  await assert.rejects(
    commentReply({ client: {}, id: 'blog-1', options: { parent: 'c-1', content: '  ' } }),
    /--content is required\./,
  );

  let request;
  const client = {
    comment: async (id, content, meta) => {
      request = { id, content, meta };
      return { id: 'c-3', parentId: meta.parentId, content };
    },
  };

  const result = await commentReply({
    client,
    id: 'blog-1',
    options: { parent: 'c-1', content: '  Thanks for sharing  ' },
  });

  assert.deepEqual(request, {
    id: 'blog-1',
    content: 'Thanks for sharing',
    meta: { parentId: 'c-1' },
  });
  assert.equal(result.parentId, 'c-1');
});

test('commentReply propagates client errors', async () => {
  const client = {
    comment: async () => {
      throw new Error('reply rejected');
    },
  };

  await assert.rejects(
    commentReply({
      client,
      id: 'blog-1',
      options: { parent: 'c-1', content: 'Reply' },
    }),
    /reply rejected/,
  );
});

test('commentDelete validates inputs, fails closed without approval, and deletes when confirmed', async () => {
  await assert.rejects(
    commentDelete({ client: {}, id: '', options: { comment: 'c-1', yes: true } }),
    /A blog ID and --comment ID are required\./,
  );

  await assert.rejects(
    commentDelete({ client: {}, id: 'blog-1', options: { yes: true } }),
    /A blog ID and --comment ID are required\./,
  );

  await assert.rejects(
    commentDelete({ client: {}, id: 'blog-1', options: { comment: 'c-1' } }),
    (error) => error.code === 'confirmation_required',
  );

  let deleted;
  const client = {
    deleteComment: async (id, commentId) => {
      deleted = { id, commentId };
      return { deleted: true };
    },
  };

  const result = await commentDelete({
    client,
    id: 'blog-1',
    options: { comment: 'c-1', yes: true },
  });

  assert.deepEqual(deleted, { id: 'blog-1', commentId: 'c-1' });
  assert.equal(result.deleted, true);
});

test('commentDelete propagates client errors', async () => {
  const client = {
    deleteComment: async () => {
      throw new Error('delete forbidden');
    },
  };

  await assert.rejects(
    commentDelete({
      client,
      id: 'blog-1',
      options: { comment: 'c-1', yes: true },
    }),
    /delete forbidden/,
  );
});