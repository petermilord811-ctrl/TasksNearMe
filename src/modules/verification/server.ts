import 'server-only';
import { createDevVerificationProviders, type VerificationProviders } from './service';

/**
 * Identity (Stripe Identity), payouts (Stripe Connect), and background checks (Checkr). Until
 * provider keys exist (blocked.md), development uses stand-ins under /dev/providers; production
 * has none, so the provider steps can't start there yet.
 */
export const verificationProviders: VerificationProviders | null =
  process.env.NODE_ENV === 'production' ? null : createDevVerificationProviders();
