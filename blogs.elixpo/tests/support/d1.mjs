// Offline stand-ins for the Cloudflare platform used by behavior tests. The
// production modules stay unchanged; only the platform imports are swapped by
// tests/support/platformLoader.mjs.

export function sqliteD1(sqlite) {
  const statement = (sql, params) => ({
    async all() {
      return { results: sqlite.prepare(sql).all(...params), success: true, meta: {} };
    },
    async first() {
      return sqlite.prepare(sql).get(...params) ?? null;
    },
    async run() {
      const info = sqlite.prepare(sql).run(...params);
      return { success: true, meta: { changes: Number(info.changes) } };
    },
  });
  return {
    prepare(sql) {
      const bound = (params) => {
        const prepared = statement(sql, params);
        prepared.bind = (...next) => bound(next);
        return prepared;
      };
      return bound([]);
    },
  };
}

// KV stores parsed JSON, matching what kv.get(key, 'json') returns on Cloudflare.
export function memoryKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  const puts = [];
  return {
    puts,
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value, options) {
      puts.push({ key, options });
      store.set(key, JSON.parse(value));
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

const CONTEXT = Symbol.for('lixblogs.test.requestContext');

export function useRequestContext(env) {
  const previous = globalThis[CONTEXT];
  const pending = [];
  globalThis[CONTEXT] = {
    env,
    ctx: {
      waitUntil(promise) {
        pending.push(Promise.resolve(promise));
      },
      passThroughOnException() {},
    },
    cf: {},
  };
  return {
    async settle() {
      await Promise.allSettled(pending);
    },
    restore() {
      if (previous === undefined) delete globalThis[CONTEXT];
      else globalThis[CONTEXT] = previous;
    },
  };
}
