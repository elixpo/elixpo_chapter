import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXIT_CODES, errorEnvelope, normalizeCommand, requireConfirmation } from '../src/cli/contract.js';
import { GLOBAL_HELP, commandHelp } from '../src/cli/help.js';

test('top-level authentication commands preserve auth aliases', () => {
  assert.deepEqual(normalizeCommand(['login']), ['auth', 'login']);
  assert.deepEqual(normalizeCommand(['whoami']), ['auth', 'whoami']);
  assert.deepEqual(normalizeCommand(['use', 'work']), ['auth', 'use', 'work']);
  assert.deepEqual(normalizeCommand(['blog', 'list']), ['blog', 'list']);
});

test('machine errors have a stable redaction-friendly shape', () => {
  assert.deepEqual(errorEnvelope({ code: 'invalid_input', message: 'Bad input', hint: 'Fix it', requestId: 'r1' }), {
    ok: false,
    error: { code: 'invalid_input', message: 'Bad input', hint: 'Fix it', requestId: 'r1' },
  });
});

test('state transitions fail closed without explicit approval', () => {
  assert.throws(
    () => requireConfirmation({}, 'Publishing this blog'),
    (error) => error.code === 'confirmation_required' && error.exitCode === EXIT_CODES.CONFIRMATION,
  );
  assert.doesNotThrow(() => requireConfirmation({ yes: true }, 'Publishing this blog'));
});

test('CLI entrypoint exposes bearer-authenticated Cloudinary integration commands', () => {
  const entrypoint = readFileSync(new URL('../bin/lixblogs.mjs', import.meta.url), 'utf8');
  assert.match(entrypoint, /'cloudinary-status':/);
  assert.match(entrypoint, /'cloudinary-disconnect':/);
  assert.match(entrypoint, /disconnect:/);
});

test('global help documents integrations, media, history, and comment controls', () => {
  assert.match(GLOBAL_HELP, /integrations cloudinary-status/);
  assert.match(GLOBAL_HELP, /integrations cloudinary-disconnect --yes/);
  assert.match(GLOBAL_HELP, /integrations pollinations-status/);
  assert.match(GLOBAL_HELP, /media generate\s+--prompt/);
  assert.match(GLOBAL_HELP, /media delete\s+<media-id> --yes/);
  assert.match(GLOBAL_HELP, /blog restore-version <id>/);
  assert.match(GLOBAL_HELP, /comment reply\s+<blog-id>/);
  assert.match(GLOBAL_HELP, /disconnect cloudinary --yes/);
});

test('command help resolves canonical commands and top-level aliases', () => {
  assert.match(commandHelp(['blog', 'list']), /^lixblogs blog list —/m);
  assert.match(commandHelp(['blog', 'get', 'abc']), /^lixblogs blog get —/m);
  assert.match(commandHelp(['login']), /^lixblogs login —/m);
  assert.match(commandHelp(['use', 'work']), /^lixblogs use —/m);
  assert.match(commandHelp(['register']), /^lixblogs register —/m);
  assert.match(commandHelp(['skill', 'install']), /--force/);
  assert.equal(commandHelp([]), null);
  assert.equal(commandHelp(['not-a-command']), null);
});

test('command help keeps README-documented contest and blog flags', () => {
  for (const flag of ['--problem', '--rules', '--allowed-target', '--require-bio', '--tag <topic>', '--eligible-user', '--clear-eligible-users']) {
    assert.match(commandHelp(['contest', 'create']) + commandHelp(['contest', 'edit']), new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const flag of ['--emoji', '--cover <url>', '--member-only', '--secret', '--dry-run']) {
    assert.match(commandHelp(['blog', 'create']), new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
