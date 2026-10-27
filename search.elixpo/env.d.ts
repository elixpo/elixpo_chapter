interface CloudflareEnv {
  DB: D1Database;
  KV: KVNamespace;
  BACKEND_URL: string;
  INTERNAL_API_KEY: string;
  XID: string;
  API_KEY: string;
  GUEST_REQUEST_LIMIT: string;
  SSO_CLIENT_ID: string;
  SSO_CLIENT_SECRET: string;
  SSO_REDIRECT_URI: string;
}

declare module '@cloudflare/next-on-pages' {
  export function getRequestContext(): {
    env: CloudflareEnv;
    ctx: ExecutionContext;
  };
}
