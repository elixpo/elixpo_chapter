import test from 'node:test';
import assert from 'node:assert/strict';
import { rankBlogs } from '../lib/recommendations.js';

const context = {
  language: 'en',
  region: 'global',
  explicitTopics: new Set(),
  topicWeights: new Map(),
};

function story(overrides = {}) {
  return {
    id: 'story',
    published_at: 1_000_000,
    language: 'en',
    region: 'global',
    tags: [],
    like_count: 0,
    comment_count: 0,
    clap_total: 0,
    view_count: 0,
    ...overrides,
  };
}

test('new stories receive a deterministic, exposure-decaying cold-start boost', () => {
  const now = 1_000_000 + 24 * 3600;
  const [unseen] = rankBlogs([story({ id: 'unseen' })], context, { now });
  const [seen] = rankBlogs([story({ id: 'seen', view_count: 40 })], context, { now });

  assert.equal(unseen.discovery_label, 'New');
  assert.equal(seen.discovery_label, 'New');
  assert.ok(unseen.recommendation_score > seen.recommendation_score);
  assert.deepEqual(rankBlogs([story()], context, { now }), rankBlogs([story()], context, { now }));
});

test('rising labels require real early engagement and new labels expire', () => {
  const risingNow = 1_000_000 + 48 * 3600;
  const [rising] = rankBlogs([story({ like_count: 2, comment_count: 1 })], context, { now: risingNow });
  const [old] = rankBlogs([story()], context, { now: 1_000_000 + 8 * 86400 });

  assert.equal(rising.discovery_label, 'Rising');
  assert.equal(old.discovery_label, null);
});
