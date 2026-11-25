// Module hooks for offline Next/Cloudflare behavior tests. Registered with
// node:module register() before importing page/route modules. It swaps only the
// platform edges (request context, headers, navigation, in-process resolver)
// and transpiles the repo's JSX pages so tests execute the real page code.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const STUBS = {
  '@cloudflare/next-on-pages': 'stub:cloudflare',
  'next/headers': 'stub:next-headers',
  'next/navigation': 'stub:next-navigation',
};

const STUB_SOURCES = {
  'stub:cloudflare': `
const key = Symbol.for('lixblogs.test.requestContext');
export function getRequestContext() {
  const context = globalThis[key];
  if (!context) throw new Error('Test request context is not installed');
  return context;
}
export function getOptionalRequestContext() {
  return globalThis[key];
}
`,
  'stub:next-headers': `
export async function headers() {
  return new Headers(globalThis[Symbol.for('lixblogs.test.headers')]
    ?? { 'x-forwarded-proto': 'https', host: 'blogs.elixpo.com' });
}
export async function cookies() {
  return { get() { return undefined; }, set() {}, delete() {} };
}
`,
  'stub:next-navigation': `
export function notFound() {
  const error = new Error('NEXT_NOT_FOUND');
  error.digest = 'NEXT_HTTP_ERROR_FALLBACK;404';
  throw error;
}
export function permanentRedirect(location) {
  const error = new Error('NEXT_REDIRECT');
  error.digest = 'NEXT_REDIRECT;replace;' + location + ';307;';
  throw error;
}
export function redirect(location) { return permanentRedirect(location); }
`,
  'stub:page-client': 'export default function Client() { return null; }\n',
  'stub:resolve-route': `
export async function GET(request) {
  const handler = globalThis[Symbol.for('lixblogs.test.resolveHandler')];
  if (!handler) throw new Error('Resolve handler stub is not configured');
  return handler(request);
}
`,
  'stub:library-route': `
export async function GET(request) {
  const handler = globalThis[Symbol.for('lixblogs.test.libraryHandler')];
  if (!handler) throw new Error('Library handler stub is not configured');
  return handler(request);
}
`,
};

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) {
    return { url: STUBS[specifier], format: 'module', shortCircuit: true };
  }
  // Next's bundler resolves this extensionless alias; plain Node ESM does not.
  if (specifier === 'next/server') {
    return nextResolve('next/server.js', context);
  }
  if (specifier === './client' && context.parentURL?.endsWith('/page.jsx')) {
    return { url: 'stub:page-client', format: 'module', shortCircuit: true };
  }
  if (specifier.endsWith('/api/resolve/route')) {
    return { url: 'stub:resolve-route', format: 'module', shortCircuit: true };
  }
  if (specifier.endsWith('/api/library/public/route')) {
    return { url: 'stub:library-route', format: 'module', shortCircuit: true };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !/\.[cm]?jsx?$/.test(specifier)) {
      for (const extension of ['.js', '.jsx', '.mjs']) {
        const candidate = new URL(`${specifier}${extension}`, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate.href, shortCircuit: true };
        }
      }
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (STUB_SOURCES[url]) {
    return { format: 'module', shortCircuit: true, source: STUB_SOURCES[url] };
  }
  if (url.endsWith('.jsx')) {
    const filename = fileURLToPath(url);
    const source = await readFile(filename, 'utf8');
    const output = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        allowJs: true,
      },
    });
    return { format: 'module', shortCircuit: true, source: output.outputText };
  }
  return nextLoad(url, context);
}
