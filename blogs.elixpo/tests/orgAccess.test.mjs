import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewOrg, isPrivateOrg } from '../lib/orgAccess.js';

function fakeDb(members = []) {
  return {
    prepare(sql) {
      return {
        bind(orgId, userId) {
          return {
            first: async () => (members.some((m) => m.orgId === orgId && m.userId === userId) ? { ok: 1 } : null),
          };
        },
      };
    },
  };
}

test('visibility is compared without case sensitivity', () => {
  assert.equal(isPrivateOrg({ visibility: 'private' }), true);
  assert.equal(isPrivateOrg({ visibility: 'PRIVATE' }), true);
  assert.equal(isPrivateOrg({ visibility: 'public' }), false);
  assert.equal(isPrivateOrg({ visibility: null }), false);
  assert.equal(isPrivateOrg(null), false);
});

test('public orgs are readable without a session', async () => {
  assert.equal(await canViewOrg(fakeDb(), { id: 'org', visibility: 'public' }, null), true);
});

test('private orgs reject signed-out and unrelated viewers', async () => {
  const org = { id: 'org', owner_id: 'owner', visibility: 'private' };
  assert.equal(await canViewOrg(fakeDb(), org, null), false);
  assert.equal(await canViewOrg(fakeDb(), org, 'stranger'), false);
});

test('private orgs allow the owner and members', async () => {
  const org = { id: 'org', owner_id: 'owner', visibility: 'private' };
  assert.equal(await canViewOrg(fakeDb(), org, 'owner'), true);
  assert.equal(await canViewOrg(fakeDb([{ orgId: 'org', userId: 'member' }]), org, 'member'), true);
});
