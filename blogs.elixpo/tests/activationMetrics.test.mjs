import test from 'node:test';
import assert from 'node:assert/strict';
import { activationConversion, ACTIVATION_MILESTONES } from '../lib/activation.js';

test('activation milestone list is ordered and exact', () => {
  assert.deepEqual(ACTIVATION_MILESTONES, [
    'signup',
    'completed_profile',
    'first_draft',
    'first_publication',
  ]);
});

test('activation conversion rates use signup as the funnel base', () => {
  assert.deepEqual(activationConversion({
    signup: 100,
    completed_profile: 80,
    first_draft: 50,
    first_publication: 20,
  }), {
    signup: 100,
    completedProfile: 80,
    firstDraft: 50,
    firstPublication: 20,
    completedProfileRate: 0.8,
    firstDraftRate: 0.5,
    firstPublicationRate: 0.2,
  });
});

test('activation conversion safely handles an empty funnel', () => {
  const result = activationConversion({});
  assert.equal(result.signup, 0);
  assert.equal(result.completedProfileRate, 0);
  assert.equal(result.firstDraftRate, 0);
  assert.equal(result.firstPublicationRate, 0);
});

test('the admin funnel counts a signup cohort, not raw milestone events', async () => {
  const { readFile } = await import('node:fs/promises');
  const route = await readFile(new URL('../app/api/admin/activation/route.js', import.meta.url), 'utf8');
  assert.match(route, /JOIN activation_events s ON s\.user_id = e\.user_id AND s\.milestone = 'signup'/);
  assert.match(route, /WHERE s\.occurred_at >= \?/);
});
