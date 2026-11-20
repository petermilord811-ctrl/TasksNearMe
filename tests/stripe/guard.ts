/**
 * The Stripe check's guard (tests/stripe/stripe-test-mode.check.ts). The check moves test money through Stripe, so it
 * runs only when asked, only with test keys, and only on a local test database (which it resets first):
 * - `STRIPE_TEST_CHECK=1`: Stripe's test mode. The keys come from the shell, else `.env.stripe-test` (gitignored by
 *   `.env*`; not `.env.local`, which the dev server, e2e and every test:db file read), else `.env.local`.
 * - `STRIPE_TEST_CHECK=dry`: the same steps against an in-memory Stripe (tests/stripe/fake-stripe.ts): no network.
 * Keys are never printed; a refusal names only the kind of key it found.
 */

export type CheckMode = 'test' | 'dry';

export function loadCheckEnv(): void {
  // The shell wins over both files, and the check's own file over the app's (loadEnvFile never overrides).
  for (const file of ['.env.stripe-test', '.env.local']) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Not there: the shell (or the other file) provides it.
    }
  }
  // Tests never call Claude (docs/integration-points.md).
  delete process.env.ANTHROPIC_API_KEY;
}

/** What kind of Stripe key a value is, without any of its secret part. */
export function keyKind(value: string | undefined): string {
  const kind = /^(sk|rk|pk|whsec)_(test|live)?_?/.exec(value?.trim() ?? '')?.[0];
  return kind ? `${kind}…` : value?.trim() ? 'not a Stripe key' : 'not set';
}

function sameDatabase(a: string, b: string): boolean {
  try {
    const [x, y] = [new URL(a), new URL(b)];
    return x.hostname === y.hostname && (x.port || '5432') === (y.port || '5432') && x.pathname === y.pathname;
  } catch {
    return a === b;
  }
}

/** Throws unless the check may run; returns how it runs. */
export function checkMode(env: Record<string, string | undefined> = process.env): CheckMode {
  const asked = env.STRIPE_TEST_CHECK?.trim();
  if (asked !== '1' && asked !== 'dry') {
    throw new Error('The Stripe check moves test money through Stripe: run it with STRIPE_TEST_CHECK=1 (Stripe test mode) or STRIPE_TEST_CHECK=dry (in memory, no network).');
  }
  const url = env.TEST_DATABASE_URL?.trim();
  if (!url) throw new Error('TEST_DATABASE_URL is not set: the check needs a local test database (it resets it first).');
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('TEST_DATABASE_URL is not a database URL.');
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) throw new Error('TEST_DATABASE_URL must be a local database: the check resets it first.');
  if (env.DATABASE_URL && sameDatabase(url, env.DATABASE_URL)) throw new Error('TEST_DATABASE_URL is the app’s own database: the check needs a test database (it resets it first).');
  if (asked === 'dry') return 'dry';
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? '';
  const publishable = env.STRIPE_PUBLISHABLE_KEY?.trim() ?? '';
  if (!/^sk_test_[A-Za-z0-9]+$/.test(secret)) throw new Error(`STRIPE_SECRET_KEY must be a Stripe test secret key (sk_test_…); it is ${keyKind(secret)}. Put the test keys in .env.stripe-test.`);
  if (!/^pk_test_[A-Za-z0-9]+$/.test(publishable)) throw new Error(`STRIPE_PUBLISHABLE_KEY must be a Stripe test publishable key (pk_test_…); it is ${keyKind(publishable)}.`);
  const hook = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (hook && !hook.startsWith('whsec_')) throw new Error(`STRIPE_WEBHOOK_SECRET must be a webhook signing secret (whsec_…); it is ${keyKind(hook)}.`);
  return 'test';
}
