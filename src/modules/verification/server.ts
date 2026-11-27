import 'server-only';
import { createFakeGeocoder, createGeocoder } from '@/integrations/geocoding';
import { byteCipherFromEnv, fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { backgroundProviderFor, payoutProviderFor, verificationProvidersFor } from './providers';
import { devHelpersOn } from '@/shared/dev-helpers';

/**
 * Identity (Persona, or Stripe Identity), payouts (Stripe Connect), and background checks (Checkr). Until
 * provider keys exist (blocked.md), development uses stand-ins under /dev/providers; production has none,
 * so the provider steps can't start there yet.
 */
export const verificationProviders = verificationProvidersFor(process.env);
/** Stripe Connect (or development's stand-in), whatever the other providers: null until the Stripe keys are set. */
export const payoutProvider = payoutProviderFor(process.env);
/** Checkr (or development's stand-in), whatever the other providers: null until its keys are set. */
export const backgroundProvider = backgroundProviderFor(process.env);

/** Home address search and confirmation: Mapbox with `MAPBOX_TOKEN`, the sample addresses otherwise. */
export const homeGeocoder = createGeocoder();
/** The sample addresses, for tests (the `tnm_geo_stand_in` cookie). Never in production. */
export const sampleHomeGeocoder = !devHelpersOn() ? null : createFakeGeocoder();
export const verificationCipher = fieldCipherFromEnv();
/** Our own ID check's photos, encrypted at rest (decrypted only for a staff link and the one automatic reading). */
export const verificationFileCipher = byteCipherFromEnv();
/** Keys the selfie's prompt (`livenessPromptFor`). */
export const livenessSecret = process.env.BETTER_AUTH_SECRET ?? '';
