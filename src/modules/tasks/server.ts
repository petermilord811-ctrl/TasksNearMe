import 'server-only';
import { eq } from 'drizzle-orm';
import { createTaskDrafter } from '@/integrations/ai/task-drafter';
import { createFakeGeocoder, createGeocoder } from '@/integrations/geocoding';
import { createFileStorage } from '@/integrations/storage';
import { loadPhoneCheck, phoneGatePasses } from '@/modules/accounts/phone-check';
import { users } from '@/modules/accounts/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { db } from '@/platform/db/client';
import { createTaskPosting, type TaskPosting } from './posting';
import { devHelpersOn } from '@/shared/dev-helpers';

/** App-wide instances of the task services (the app's database, providers, and keys). */
export const taskPosting = createTaskPosting({ db, geocoder: createGeocoder(), cipher: fieldCipherFromEnv() });
/** Posting with the sample addresses, for tests (the `tnm_geo_stand_in` cookie). Never in production. */
export const sampleAddressTaskPosting: TaskPosting | null =
  !devHelpersOn() ? null : createTaskPosting({ db, geocoder: createFakeGeocoder(), cipher: fieldCipherFromEnv() });
export const fileStorage = createFileStorage();
export const taskDrafter = createTaskDrafter();

export async function homeMarketIdOf(userId: string): Promise<string | null> {
  const [row] = await db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.marketId ?? null;
}

/**
 * Posting needs a verified phone (blueprint 06 §1) where texts work, unless the grace applies (plan 9.2,
 * `phone-check.ts`); the sign-in flow asks for one when needed.
 */
export async function phoneGateOpen(userId: string): Promise<boolean> {
  const phone = await loadPhoneCheck(db, userId);
  return phoneGatePasses(phone.check, phone.verified);
}
