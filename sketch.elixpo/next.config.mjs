import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev'
import { createRequire } from 'module'

const require_ = createRequire(import.meta.url)

// The committed `.env` is SOPS-encrypted for maintainers. Next.js loads it
// before this file runs, so without a key every value in it arrives as an
// `ENC[...]` string. Outside production, drop those values so each feature
// falls back to its default instead of receiving ciphertext.
if (process.env.NODE_ENV !== 'production') {
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value.startsWith('ENC[')) {
      Reflect.deleteProperty(process.env, key)
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: [
    '@elixpo/lixeditor',
    '@blocknote/core',
    '@blocknote/react',
    '@blocknote/mantine',
  ],

  turbopack: {
    rules: {
      '*.md': {
        loaders: [require_.resolve('raw-loader')],
        as: '*.js',
      },
    },
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    })

    // Webpack 5 doesn't honor the `exports` field of
    // @handlewithcare/prosemirror-inputrules correctly — `import 'pkg'`
    // fails to resolve `.`. Point the bare specifier at the dist entry
    // we know exists in node_modules.
    try {
      const pkgPath = require_.resolve('@handlewithcare/prosemirror-inputrules/package.json')
      const pkgDir = pkgPath.replace(/\/package\.json$/, '')
      const pkg = require_(pkgPath)
      const main = pkg.module || pkg.main || 'dist/index.js'
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@handlewithcare/prosemirror-inputrules$': `${pkgDir}/${main}`,
      }
    } catch {}

    return config
  },
};

if (process.env.NODE_ENV === 'development') {
  // Keep Wrangler's platform proxy from reading the encrypted `.env` as
  // local variables.
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV ??= 'false'
  await setupDevPlatform({
    // Keep Next's local bindings separate from the collaboration worker.
    // Loading the production worker config here makes workerd look for the
    // RoomDurableObject class inside the Next runtime, where it cannot exist.
    configPath: 'wrangler.next.toml',
    // Wrangler v4 stores `--persist-to .wrangler/state` resources below its
    // v3 directory. Point Miniflare at that same directory so route handlers
    // see the schema applied by `npm run db:migrate:local`.
    persist: { path: '.wrangler/state/v3' },
  })
}

export default nextConfig;
