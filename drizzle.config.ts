import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI and production provide DATABASE_URL directly.
}

export default defineConfig({
  dialect: 'postgresql',
  // Each module owns its tables (CLAUDE.md). Schema files use relative imports only.
  schema: ['./src/modules/*/schema.ts', './src/platform/*/schema.ts'],
  out: './db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
