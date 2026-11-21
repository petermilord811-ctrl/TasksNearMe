import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// The dev server's public hostname behind a reverse proxy (on the VPS: Caddy), e.g.
// app.40-160-239-201.sslip.io. Unset: only localhost.
const devPublicHost = process.env.DEV_PUBLIC_HOST?.trim() || undefined;

const nextConfig: NextConfig = {
  cacheComponents: true,
  // 'use cache' entries stay in each process; tag invalidations are shared through Postgres so every web instance
  // sees an updateTag made on another (cache-handlers/shared-tags.mjs, decisions.md 2026-11-14).
  // SHARED_CACHE_HANDLER=off falls back to Next's built-in handler (one instance only).
  ...(process.env.SHARED_CACHE_HANDLER === 'off' ? {} : { cacheHandlers: { default: require.resolve('./cache-handlers/shared-tags.mjs') } }),
  // The e2e build skips Next's own type check: the gate's `check` step runs it, and another session's unfinished
  // types in the shared tree (often in tests) mustn't stop an e2e run. Every other build checks types.
  ...(process.env.TNM_E2E_BUILD === '1' ? { typescript: { ignoreBuildErrors: true } } : {}),
  // CI's preview build (.github/workflows/ci.yml, scripts/preview/bundle.sh): a self-contained server folder.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  // The server's document readers (src/integrations/ocr/engine.ts) load Tesseract, its English data, zxing-wasm's
  // barcode reader and unpdf in a short-lived process of their own at run time, out of the bundler's sight, so the
  // standalone folder is told to keep them. Only the LSTM builds of Tesseract's core (the readers' engine mode), and
  // only zxing's CommonJS reader with its WebAssembly binary (the process reads it from here: nothing is downloaded).
  outputFileTracingIncludes: {
    '/**': [
      './node_modules/tesseract.js/package.json',
      './node_modules/tesseract.js/src/**',
      './node_modules/tesseract.js-core/package.json',
      './node_modules/tesseract.js-core/tesseract-core-*lstm.{js,wasm}',
      './node_modules/@tesseract.js-data/eng/4.0.0_best_int/**',
      './node_modules/{regenerator-runtime,is-url,wasm-feature-detect,bmp-js}/**',
      './node_modules/zxing-wasm/package.json',
      './node_modules/zxing-wasm/dist/cjs/package.json',
      './node_modules/zxing-wasm/dist/cjs/share.js',
      './node_modules/zxing-wasm/dist/cjs/reader/index.js',
      './node_modules/zxing-wasm/dist/reader/zxing_reader.wasm',
      './node_modules/unpdf/package.json',
      './node_modules/unpdf/dist/**',
    ],
  },
  ...(devPublicHost ? { allowedDevOrigins: [devPublicHost] } : {}),
  env: {
    // The test clock (blueprint 10 §3.1, src/platform/clock): built into development, into builds made
    // with TEST_CLOCK=1 (preview, staging) and into the e2e build. Inlined at build time, so other production
    // builds compile it out.
    TEST_CLOCK_BUILD: process.env.NODE_ENV === 'development' || process.env.TEST_CLOCK === '1' || process.env.TNM_E2E_BUILD === '1' ? '1' : '0',
    // The e2e suite's production build (`npm run e2e:build`, src/shared/dev-helpers.ts): inlined at build time,
    // so no variable set when another build runs can switch its development helpers on.
    TNM_E2E_BUILD: process.env.TNM_E2E_BUILD === '1' ? '1' : '0',
  },
  experimental: {
    // Task photos (up to 10 MB) are uploaded through a Server Action in development.
    // Before launch: presigned direct uploads to storage (decisions.md).
    serverActions: { bodySizeLimit: '11mb', ...(devPublicHost ? { allowedOrigins: [devPublicHost] } : {}) },
    // Next's MCP endpoint (/_next/mcp: the routes, which file each Server Action is in, compiling on demand) answers
    // anyone who reaches the dev server, through the public dev address too (sweep 2026-11-20, security review).
    mcpServer: false,
  },
  // Partial Prefetching is enabled per segment (`prefetch = 'partial'` on the app and admin
  // layouts). Globally it embedded a second copy of each public page's payload (decisions.md).
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default withNextIntl(nextConfig);
