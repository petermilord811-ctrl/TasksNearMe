import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // Task photos (up to 10 MB) are uploaded through a Server Action in development.
    // Before launch: presigned direct uploads to storage (decisions.md).
    serverActions: { bodySizeLimit: '11mb' },
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
