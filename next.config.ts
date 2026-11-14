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
  // CI's preview build (.github/workflows/ci.yml, scripts/preview/bundle.sh): a self-contained server folder.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  ...(devPublicHost ? { allowedDevOrigins: [devPublicHost] } : {}),
  env: {
    // The test clock (blueprint 10 §3.1, src/platform/clock): built into development and into builds made
    // with TEST_CLOCK=1 (preview, staging). Inlined at build time, so other production builds compile it out.
    TEST_CLOCK_BUILD: process.env.NODE_ENV === 'development' || process.env.TEST_CLOCK === '1' ? '1' : '0',
  },
  experimental: {
    // Task photos (up to 10 MB) are uploaded through a Server Action in development.
    // Before launch: presigned direct uploads to storage (decisions.md).
    serverActions: { bodySizeLimit: '11mb', ...(devPublicHost ? { allowedOrigins: [devPublicHost] } : {}) },
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
