import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/*
 * Ownership boundaries (see CLAUDE.md and AGENTS.md):
 *   src/ui/**                Codex — may import only @/ui, @/contracts, @/shared (+ @/fixtures in previews/tests)
 *   src/contracts, src/shared, src/fixtures   Claude — isomorphic, depend on nothing app-specific
 *   src/app/**               Claude — routes; never import fixtures
 */

const SERVER_ONLY_PATHS = [
  { name: 'server-only', message: 'This code must stay isomorphic.' },
  { name: 'next/headers', message: 'UI and contract code must not read request data. The app passes data as props.' },
  { name: 'next/cache', message: 'UI and contract code must not touch caching.' },
];

const APP_INTERNALS = [
  '@/app',
  '@/app/**',
  '@/modules',
  '@/modules/**',
  '@/platform',
  '@/platform/**',
  '@/integrations',
  '@/integrations/**',
  '@/i18n',
  '@/i18n/**',
];

const FIXTURES = ['@/fixtures', '@/fixtures/**'];

const UI_MESSAGE =
  'src/ui may import only @/ui, @/contracts, @/shared and UI libraries (previews/tests may also use @/fixtures). Need data or behavior? Add a contract request to your summary.';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'artifacts/**',
    'playwright-report/**',
    'test-results/**',
    '.scaffold-tmp/**',
    // Claude Code's agent worktrees: full copies of the repo, each checked in its own tree.
    '.claude/**',
  ]),
  {
    // `_`-prefixed parameters are intentionally unused (e.g. a bound Server Action argument).
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    ignores: ['src/ui/previews/**', 'src/ui/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: SERVER_ONLY_PATHS,
          patterns: [{ group: [...APP_INTERNALS, ...FIXTURES], message: UI_MESSAGE }],
        },
      ],
    },
  },
  {
    files: ['src/ui/previews/**/*.{ts,tsx}', 'src/ui/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: SERVER_ONLY_PATHS,
          patterns: [{ group: APP_INTERNALS, message: UI_MESSAGE }],
        },
      ],
    },
  },
  {
    files: ['src/contracts/**/*.ts', 'src/shared/**/*.ts', 'src/fixtures/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: SERVER_ONLY_PATHS,
          patterns: [
            {
              group: [...APP_INTERNALS, '@/ui', '@/ui/**'],
              message: 'contracts, shared and fixtures must stay isomorphic and independent of app, modules, platform, integrations and ui.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: FIXTURES, message: 'Routes must not import fixtures. Read data through module queries.' }],
        },
      ],
    },
  },
]);

export default eslintConfig;
