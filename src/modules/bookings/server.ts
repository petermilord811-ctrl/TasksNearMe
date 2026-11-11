import 'server-only';
import { createPaymentProvider } from '@/integrations/payments';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { db } from '@/platform/db/client';
import type { BookingDeps } from './confirm';
import type { HubDeps } from './hub';

const provider = createPaymentProvider();

/** The app database and the payment provider (development stand-in), or null without a provider. */
export function bookingDeps(): BookingDeps | null {
  return provider ? { db, payments: provider } : null;
}

const cipher = fieldCipherFromEnv();

/** The booking page's dependencies: the database and the address key. */
export function hubDeps(): HubDeps {
  return { db, cipher };
}
