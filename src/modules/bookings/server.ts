import 'server-only';
import { createPaymentProvider } from '@/integrations/payments';
import { db } from '@/platform/db/client';
import type { BookingDeps } from './confirm';

const provider = createPaymentProvider();

/** The app database and the payment provider (development stand-in), or null without a provider. */
export function bookingDeps(): BookingDeps | null {
  return provider ? { db, payments: provider } : null;
}
