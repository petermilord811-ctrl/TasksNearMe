import 'server-only';
import { createFakeGeocoder, createGeocoder } from '@/integrations/geocoding';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { verificationProvidersFor } from './providers';

/**
 * Identity (Stripe Identity), payouts (Stripe Connect), and background checks (Checkr). Until provider
 * keys exist (blocked.md), development uses stand-ins under /dev/providers; production has none, so the
 * provider steps can't start there yet.
 */
export const verificationProviders = verificationProvidersFor(process.env);

/** Home address search and confirmation: Mapbox with `MAPBOX_TOKEN`, the sample addresses otherwise. */
export const homeGeocoder = createGeocoder();
/** The sample addresses, for tests (the `tnm_geo_stand_in` cookie). Never in production. */
export const sampleHomeGeocoder = process.env.NODE_ENV === 'production' ? null : createFakeGeocoder();
export const verificationCipher = fieldCipherFromEnv();
