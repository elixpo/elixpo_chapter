/**
 * D1 Client for Next.js
 * 
 * In a Cloudflare Pages/Workers environment, D1 is available via `env.DB`
 * In a Next.js local environment, we need to connect via the Cloudflare API
 * 
 * For development, this uses the local D1 instance or fetches from Cloudflare
 */

import type { D1Database } from '@cloudflare/workers-types';

let cachedDb: D1Database | null = null as any;

/**
 * Initialize and get D1 Database connection
 * In Cloudflare environment: Uses the runtime binding
 * In local environment: Uses Cloudflare API
 */
export async function getDatabase(): Promise<D1Database> {
  // Return cached connection if available
  if (cachedDb) {
    return cachedDb;
  }

  // In Cloudflare environment (Pages/Workers)
  if (typeof globalThis !== 'undefined' && 'env' in globalThis) {
    const env = (globalThis as any).env;
    if (env && env.DB) {
      cachedDb = env.DB;
      if (!cachedDb) {
        throw new Error('D1 Database binding (env.DB) is not available');
      }
      return cachedDb;
    }
  }

  // For local development: Create a mock D1 client that makes API calls
  // This requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID
  if (process.env.NODE_ENV === 'development') {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const databaseId = process.env.CLOUDFLARE_DATABASE_ID;

    if (accountId && apiToken && databaseId) {
      // Create mock D1 client for local development
      cachedDb = createLocalD1Client(accountId, apiToken, databaseId);
      return cachedDb;
    }
  }

  // Fallback: Create in-memory mock (for testing without D1)
  console.warn('[D1] Using in-memory mock database - not suitable for production');
  return createInMemoryMockDb();
}

/**
 * Create a local D1 client using Cloudflare API
 */
function createLocalD1Client(accountId: string, apiToken: string, databaseId: string): D1Database {
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`;

  return {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        run: async () => {
          const response = await fetch(`${baseUrl}/query`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sql,
              params: args,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(`D1 Query Error: ${error.errors?.[0]?.message || response.statusText}`);
          }

          const result = await response.json();
          return result.result?.[0] || { success: true };
        },
        first: async () => {
          const response = await fetch(`${baseUrl}/query`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sql,
              params: args,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(`D1 Query Error: ${error.errors?.[0]?.message || response.statusText}`);
          }

          const result = await response.json();
          const results = result.result?.[0]?.results || [];
          return results[0] || null;
        },
        all: async () => {
          const response = await fetch(`${baseUrl}/query`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sql,
              params: args,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(`D1 Query Error: ${error.errors?.[0]?.message || response.statusText}`);
          }

          const result = await response.json();
          return {
            results: result.result?.[0]?.results || [],
            success: true,
          };
        },
      }),
    }),
    batch: async (statements: any[]) => {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          statements: statements.map(stmt => ({
            sql: stmt.sql,
            params: stmt.params || [],
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`D1 Batch Error: ${error.errors?.[0]?.message || response.statusText}`);
      }

      return await response.json();
    },
    exec: async (sql: string) => {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`D1 Exec Error: ${error.errors?.[0]?.message || response.statusText}`);
      }

      return await response.json();
    },
  } as any;
}

/**
 * In-memory mock database for testing without D1 connection
 * WARNING: Data is not persisted between server restarts
 */
function createInMemoryMockDb(): D1Database {
  const data = new Map<string, any[]>();

  return {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        run: async () => {
          console.warn(`[Mock DB] Executing (no persistence): ${sql.substring(0, 50)}...`);
          return { success: true };
        },
        first: async () => {
          console.warn(`[Mock DB] Query first (no persistence): ${sql.substring(0, 50)}...`);
          return null;
        },
        all: async () => {
          console.warn(`[Mock DB] Query all (no persistence): ${sql.substring(0, 50)}...`);
          return { results: [], success: true };
        },
      }),
    }),
    batch: async () => ({ success: true }),
    exec: async () => ({ success: true }),
  } as any;
}

/**
 * Close database connection if needed
 */
export async function closeDatabase(): Promise<void> {
  cachedDb = null;
}
