import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Execute the real DELETE handler with only its three edges replaced: the
// session, D1, and NextResponse. Everything else (routing, role branches,
// scoped SQL) is the shipped route code.
const seams = {
  session: 'export async function getSession() { return globalThis.__orgInviteSession ?? null; }',
  db: 'export function getDB() { return globalThis.__orgInviteDb; }',
  server: 'export const NextResponse = { json: (body, init) => new Response(JSON.stringify(body), init) };',
};

const dataUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;

// The route imports lib/* without extensions (Next resolves those), so match
// the specifier before Node's stricter ESM resolver rejects it.
const seamFor = (specifier) => {
  const path = specifier.replace(/\.js$/, '');
  if (specifier === 'next/server') return seams.server;
  if (path.endsWith('/lib/auth')) return seams.session;
  if (path.endsWith('/lib/cloudflare')) return seams.db;
  return null;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const seam = seamFor(specifier);
    if (seam) return { url: dataUrl(seam), shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const route = await import(new URL('../app/api/orgs/invite/route.js', import.meta.url).href);

// Minimal in-memory stand-in for the three D1 statements the handler issues.
// Deletes honour both bound ids, so a missing org binding shows up as a deleted row.
function fakeDb({ orgs = [], members = [], invites = [] } = {}) {
  const deletes = [];
  const queries = [];
  return {
    deletes,
    queries,
    invites,
    prepare(sql) {
      return {
        bind(...values) {
          queries.push({ sql, values });
          return {
            async first() {
              if (sql.includes('FROM org_invites')) {
                return invites.find((invite) => invite.id === values[0] && invite.org_id === values[1]) ?? null;
              }
              if (sql.includes('FROM org_members')) {
                return members.find((member) => member.org_id === values[0] && member.user_id === values[1]) ?? null;
              }
              if (sql.includes('FROM orgs')) {
                return orgs.find((org) => org.id === values[0]) ?? null;
              }
              throw new Error(`unexpected query: ${sql}`);
            },
            async run() {
              if (!sql.startsWith('DELETE FROM org_invites')) throw new Error(`unexpected write: ${sql}`);
              deletes.push(values);
              const index = invites.findIndex((invite) => invite.id === values[0] && invite.org_id === values[1]);
              if (index !== -1) invites.splice(index, 1);
              return { success: true };
            },
          };
        },
      };
    },
  };
}

function invite(id, role, orgId = 'org-1') {
  return { id, org_id: orgId, role, created_by: 'owner-1', uses: 0, max_uses: null, expires_at: null };
}

function orgWorld({ viewer, role = null, invites = [] }) {
  return fakeDb({
    orgs: [{ id: 'org-1', owner_id: 'owner-1' }],
    members: role ? [{ org_id: 'org-1', user_id: viewer, role }] : [],
    invites,
  });
}

let inviteSeq = 0;
async function callDelete({ db, session, body }) {
  globalThis.__orgInviteSession = session;
  globalThis.__orgInviteDb = db;
  return route.DELETE(new Request(`https://blogs.elixpo.test/api/orgs/invite?t=${inviteSeq++}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

test('maintainers can revoke non-admin invites', async () => {
  for (const role of ['maintain', 'write', 'read']) {
    const id = `invite-${role}`;
    const db = orgWorld({ viewer: 'maintainer-1', role: 'maintain', invites: [invite(id, role)] });
    const res = await callDelete({ db, session: { userId: 'maintainer-1' }, body: { inviteId: id, orgId: 'org-1' } });
    assert.equal(res.status, 200, `maintainer revoking a ${role} invite`);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(db.deletes, [[id, 'org-1']]);
    assert.deepEqual(db.invites, []);
  }
});

test('maintainers cannot revoke an admin invite', async () => {
  const db = orgWorld({ viewer: 'maintainer-1', role: 'maintain', invites: [invite('invite-admin', 'admin')] });
  const res = await callDelete({ db, session: { userId: 'maintainer-1' }, body: { inviteId: 'invite-admin', orgId: 'org-1' } });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'Not authorized' });
  assert.deepEqual(db.deletes, []);
  assert.deepEqual(db.invites.map((row) => row.id), ['invite-admin']);
});

test('read, write and non-member users cannot revoke invites', async () => {
  for (const role of ['read', 'write', null]) {
    const db = orgWorld({ viewer: 'member-1', role, invites: [invite('invite-write', 'write')] });
    const res = await callDelete({ db, session: { userId: 'member-1' }, body: { inviteId: 'invite-write', orgId: 'org-1' } });
    assert.equal(res.status, 403, `role ${role ?? 'none'} must be denied`);
    assert.deepEqual(db.deletes, []);
    assert.deepEqual(db.invites.map((row) => row.id), ['invite-write']);
  }
});

test('owners and admins keep admin-invite access', async () => {
  const asOwner = orgWorld({ viewer: 'owner-1', invites: [invite('invite-admin', 'admin')] });
  const ownerRes = await callDelete({ db: asOwner, session: { userId: 'owner-1' }, body: { inviteId: 'invite-admin', orgId: 'org-1' } });
  assert.equal(ownerRes.status, 200);
  assert.deepEqual(asOwner.deletes, [['invite-admin', 'org-1']]);

  const asAdmin = orgWorld({ viewer: 'admin-1', role: 'admin', invites: [invite('invite-admin', 'admin')] });
  const adminRes = await callDelete({ db: asAdmin, session: { userId: 'admin-1' }, body: { inviteId: 'invite-admin', orgId: 'org-1' } });
  assert.equal(adminRes.status, 200);
  assert.deepEqual(asAdmin.deletes, [['invite-admin', 'org-1']]);
});

test('owner status wins over a lower membership role', async () => {
  const db = orgWorld({ viewer: 'owner-1', role: 'read', invites: [invite('invite-admin', 'admin')] });
  const res = await callDelete({ db, session: { userId: 'owner-1' }, body: { inviteId: 'invite-admin', orgId: 'org-1' } });
  assert.equal(res.status, 200);
  assert.deepEqual(db.deletes, [['invite-admin', 'org-1']]);
});

test('rejects unauthenticated and incomplete requests', async () => {
  const db = orgWorld({ viewer: 'owner-1', invites: [invite('invite-write', 'write')] });

  const signedOut = await callDelete({ db, session: null, body: { inviteId: 'invite-write', orgId: 'org-1' } });
  assert.equal(signedOut.status, 401);
  assert.deepEqual(await signedOut.json(), { error: 'Not authenticated' });

  const noInvite = await callDelete({ db, session: { userId: 'owner-1' }, body: { orgId: 'org-1' } });
  assert.equal(noInvite.status, 400);
  assert.deepEqual(await noInvite.json(), { error: 'Missing params' });

  const noOrg = await callDelete({ db, session: { userId: 'owner-1' }, body: { inviteId: 'invite-write' } });
  assert.equal(noOrg.status, 400);
  assert.deepEqual(db.deletes, []);
  assert.deepEqual(db.invites.map((row) => row.id), ['invite-write']);
});

test('an invite from another org is never deleted', async () => {
  const forOwner = fakeDb({
    orgs: [{ id: 'org-1', owner_id: 'owner-1' }, { id: 'org-2', owner_id: 'owner-2' }],
    invites: [invite('invite-b', 'admin', 'org-2')],
  });
  const ownerRes = await callDelete({ db: forOwner, session: { userId: 'owner-1' }, body: { inviteId: 'invite-b', orgId: 'org-1' } });
  assert.equal(ownerRes.status, 200);
  assert.deepEqual(forOwner.deletes, [['invite-b', 'org-1']]);
  assert.deepEqual(forOwner.invites.map((row) => row.id), ['invite-b']);

  const forMaintainer = fakeDb({
    orgs: [{ id: 'org-1', owner_id: 'owner-1' }, { id: 'org-2', owner_id: 'owner-2' }],
    members: [{ org_id: 'org-1', user_id: 'maintainer-1', role: 'maintain' }],
    invites: [invite('invite-b', 'admin', 'org-2')],
  });
  // No-op success keeps repeat deletes idempotent; the other org's row survives.
  const maintainerRes = await callDelete({ db: forMaintainer, session: { userId: 'maintainer-1' }, body: { inviteId: 'invite-b', orgId: 'org-1' } });
  assert.equal(maintainerRes.status, 200);
  assert.deepEqual(forMaintainer.deletes, [['invite-b', 'org-1']]);
  assert.deepEqual(forMaintainer.invites.map((row) => row.id), ['invite-b']);
  const roleLookup = forMaintainer.queries.find(({ sql }) => sql.includes('FROM org_invites'));
  assert.deepEqual(roleLookup.values, ['invite-b', 'org-1']);
});
