import { describe, expect, it } from 'vitest';
import { checkMode, keyKind } from '../stripe/guard';

/** The Stripe check moves test money: it runs only when asked, with test keys, on a local test database. */
describe('the Stripe check’s guard', () => {
  const db = 'postgres://app:secret@localhost:5432/tasksnearme_test';
  const keys = { STRIPE_SECRET_KEY: 'sk_test_51AbC', STRIPE_PUBLISHABLE_KEY: 'pk_test_51AbC' };

  it('runs only when asked', () => {
    expect(() => checkMode({ TEST_DATABASE_URL: db, ...keys })).toThrow(/STRIPE_TEST_CHECK=1/);
    expect(checkMode({ STRIPE_TEST_CHECK: '1', TEST_DATABASE_URL: db, ...keys })).toBe('test');
    expect(checkMode({ STRIPE_TEST_CHECK: 'dry', TEST_DATABASE_URL: db })).toBe('dry');
  });

  it('refuses live, restricted and missing keys, naming only their kind', () => {
    const run = (env: Record<string, string>) => () => checkMode({ STRIPE_TEST_CHECK: '1', TEST_DATABASE_URL: db, ...env });
    expect(run({ ...keys, STRIPE_SECRET_KEY: 'sk_live_51SecretPart' })).toThrow('it is sk_live_…');
    expect(run({ ...keys, STRIPE_SECRET_KEY: 'sk_live_51SecretPart' })).not.toThrow(/SecretPart/);
    expect(run({ ...keys, STRIPE_SECRET_KEY: 'rk_test_51AbC' })).toThrow('it is rk_test_…');
    expect(run({ ...keys, STRIPE_PUBLISHABLE_KEY: 'pk_live_51AbC' })).toThrow('it is pk_live_…');
    expect(run({ STRIPE_PUBLISHABLE_KEY: keys.STRIPE_PUBLISHABLE_KEY })).toThrow('it is not set');
    expect(run({ ...keys, STRIPE_WEBHOOK_SECRET: 'sk_test_x' })).toThrow(/whsec_/);
    expect(keyKind('hunter2')).toBe('not a Stripe key');
  });

  it('refuses a database that isn’t a local test database (it resets it)', () => {
    const run = (env: Record<string, string>) => () => checkMode({ STRIPE_TEST_CHECK: 'dry', ...env });
    expect(run({})).toThrow(/TEST_DATABASE_URL is not set/);
    expect(run({ TEST_DATABASE_URL: 'postgres://app:secret@db.example.com:5432/x' })).toThrow(/local database/);
    expect(run({ TEST_DATABASE_URL: db, DATABASE_URL: 'postgres://other:pw@localhost/tasksnearme_test' })).toThrow(/app’s own database/);
    expect(run({ TEST_DATABASE_URL: db, DATABASE_URL: 'postgres://app:secret@localhost:5432/tasksnearme' })()).toBe('dry');
  });
});
