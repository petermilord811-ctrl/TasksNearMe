import { describe, expect, it } from 'vitest';
import { backgroundProviderFor, idDoubleCheckFor, payoutProviderFor, verificationProvidersFor } from './providers';

const persona = { PERSONA_API_KEY: 'persona_sandbox_key', PERSONA_INQUIRY_TEMPLATE_ID: 'itmpl_test', PERSONA_WEBHOOK_SECRET: 'wbhsec_test' };
const stripe = { STRIPE_SECRET_KEY: 'sk_test_key', STRIPE_PUBLISHABLE_KEY: 'pk_test_key' };
const checkr = { CHECKR_API_KEY: 'checkr_test_key', CHECKR_PACKAGE: 'tasker_standard' };

describe('the ID provider (completion plan 6.2)', () => {
  it('is Persona when its key, template and webhook secret are all set, even with Stripe keys', () => {
    expect(verificationProvidersFor({ ...persona, ...stripe })?.identity.provider).toBe('persona');
  });

  it('falls back to Stripe Identity when Persona is not fully set up', () => {
    expect(verificationProvidersFor({ ...persona, PERSONA_WEBHOOK_SECRET: '', ...stripe })?.identity.provider).toBe('stripe_identity');
    expect(verificationProvidersFor({ PERSONA_API_KEY: 'k', ...stripe })?.identity.provider).toBe('stripe_identity');
  });

  it('uses the stand-in outside production without either', () => {
    expect(verificationProvidersFor({ NODE_ENV: 'development' })?.identity.provider).toBe('dev');
    expect(verificationProvidersFor({ NODE_ENV: 'test', ...persona })?.identity.provider).toBe('persona');
  });

  it('needs one real ID provider in production (with payouts and background checks)', () => {
    expect(verificationProvidersFor({ NODE_ENV: 'production', ...checkr })).toBeNull();
    // Stripe's payment keys also open Stripe Identity.
    expect(verificationProvidersFor({ NODE_ENV: 'production', ...stripe, ...checkr })?.identity.provider).toBe('stripe_identity');
    expect(verificationProvidersFor({ NODE_ENV: 'production', ...persona, ...stripe, ...checkr })?.identity.provider).toBe('persona');
    expect(verificationProvidersFor({ NODE_ENV: 'production', ...persona, ...checkr })).toBeNull();
  });
});

describe('payouts and background checks on their own (2026-11-27)', () => {
  it('opens payouts with the Stripe keys alone in production, without opening the ID double check', () => {
    expect(payoutProviderFor({ NODE_ENV: 'production', ...stripe })?.provider).toBe('stripe');
    expect(payoutProviderFor({ NODE_ENV: 'production' })).toBeNull();
    expect(verificationProvidersFor({ NODE_ENV: 'production', ...stripe })).toBeNull();
    expect(idDoubleCheckFor({ NODE_ENV: 'production', ...stripe })).toBe(false);
  });

  it('opens background checks with Checkr alone in production', () => {
    expect(backgroundProviderFor({ NODE_ENV: 'production', ...checkr })).not.toBeNull();
    expect(backgroundProviderFor({ NODE_ENV: 'production', ...stripe })).toBeNull();
  });

  it('uses the stand-ins outside production', () => {
    expect(payoutProviderFor({ NODE_ENV: 'development' })?.provider).toBe('dev');
    expect(backgroundProviderFor({ NODE_ENV: 'development' })?.provider).toBe('dev');
  });
});
