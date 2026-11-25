
import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceAILimits } from '../lib/aiRateLimit.js';

const session = { userId: 'u1' };

async function withNodeEnv(value, callback) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;

  try {
    await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
}

// Test 1: Production must fail closed when the database is unavailable.
test('production returns 503 when the database is unavailable', async () => {
  await withNodeEnv('production', async () => {
    const result = await enforceAILimits({
      getSessionImpl: async () => session,
      getDBImpl: async () => {
        throw new Error('Database connection failed');
      },
    });

    assert.equal(result.error.status, 503);
    assert.deepEqual(await result.error.json(), {
      error: 'AI quota check unavailable',
    });
  });
});

// Test 2: Local development should preserve the fallback when D1 is absent.
test('local development allows requests when D1 is absent', async () => {
  await withNodeEnv('development', async () => {
    const result = await enforceAILimits({
      getSessionImpl: async () => session,
      getDBImpl: async () => null,
    });

    assert.equal(result.error, null);
    assert.equal(result.session, session);
  });
});
// Test 3: Development must fail closed when the database connection fails.
test('local development returns 503 when the database connection fails', async () => {
  await withNodeEnv('development', async () => {
    const result = await enforceAILimits({
      getSessionImpl: async () => session,
      getDBImpl: async () => {
        throw new Error('Database connection failed');
      },
    });

    assert.equal(result.error.status, 503);
    assert.deepEqual(await result.error.json(), {
      error: 'AI quota check unavailable',
    });
  });
});
// Test 4: Quota query failures must return 503.
test('returns 503 when the quota database query fails', async () => {
  const db = {
    prepare(sql) {
      if (sql.includes('SELECT tier')) {
        return {
          bind() {
            return {
              async first() {
                return { tier: 'free' };
              },
            };
          },
        };
      }

      return {
        bind() {
          return {
            async run() {
              throw new Error('Quota storage unavailable');
            },
          };
        },
      };
    },
  };

  await withNodeEnv('production', async () => {
    const result = await enforceAILimits({
      getSessionImpl: async () => session,
      getDBImpl: async () => db,
    });

    assert.equal(result.error.status, 503);
    assert.deepEqual(await result.error.json(), {
      error: 'AI quota check unavailable',
    });
  });
});
