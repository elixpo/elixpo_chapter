import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';

// The committed `.env` is SOPS-encrypted for maintainers. Next.js loads it
// before this file runs, so without a key every value in it arrives as an
// `ENC[...]` string. Outside production, drop those values so each feature
// falls back to its default instead of receiving ciphertext.
if (process.env.NODE_ENV !== 'production') {
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value.startsWith('ENC[')) {
      Reflect.deleteProperty(process.env, key);
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/docs/editor-overview', destination: '/docs/lixeditor#editor-overview', permanent: true },
      { source: '/docs/installation', destination: '/docs/lixeditor#installation', permanent: true },
      { source: '/docs/quick-start', destination: '/docs/lixeditor#quick-start', permanent: true },
      { source: '/docs/props', destination: '/docs/lixeditor#props', permanent: true },
      { source: '/docs/imperative-api', destination: '/docs/lixeditor#imperative-api', permanent: true },
      { source: '/docs/block-model', destination: '/docs/lixeditor#block-model', permanent: true },
      { source: '/docs/markdown-shortcuts', destination: '/docs/lixeditor#markdown-shortcuts', permanent: true },
      { source: '/docs/rendering', destination: '/docs/lixeditor#rendering', permanent: true },
    ];
  },
};

if (process.env.NODE_ENV === 'development') {
  const { existsSync } = await import('node:fs');
  if (existsSync('.dev.vars')) {
    throw new Error(
      'Remove .dev.vars before starting local development; .env.local is the authoritative local secret file.',
    );
  }

  const { config } = await import('dotenv');
  const localEnv = config({ path: '.env.local', override: true, quiet: true });

  if (localEnv.error) {
    // "No keys" mode: public pages work without .env.local. Sign-in and
    // features that need a key stay off until their values are set.
    console.warn(
      '[next.config] No .env.local found; starting in "no keys" mode. Sign-in and features that need keys are disabled. See README "Warm-up (no keys)".',
    );
  }

  // Wrangler's platform proxy would otherwise read the encrypted `.env` as
  // local variables. process.env (forwarded below) already holds .env.local.
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV ??= 'false';

  // setupDevPlatform uses Wrangler's platform proxy for D1/KV. Forward the
  // already-loaded .env.local values so Cloudflare bindings and process.env
  // see the same local configuration. A .dev.vars file must not be present,
  // because Wrangler gives it precedence over dotenv files.
  process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'true';
  await setupDevPlatform();
}

export default nextConfig;
