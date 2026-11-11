import 'server-only';
import { eq } from 'drizzle-orm';
import { createTaskDrafter } from '@/integrations/ai/task-drafter';
import { createGeocoder } from '@/integrations/geocoding';
import { createFileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { db } from '@/platform/db/client';
import { createTaskPosting } from './posting';

/** App-wide instances of the task services (the app's database, providers, and keys). */
export const taskPosting = createTaskPosting({ db, geocoder: createGeocoder(), cipher: fieldCipherFromEnv() });
export const fileStorage = createFileStorage();
export const taskDrafter = createTaskDrafter();

export async function homeMarketIdOf(userId: string): Promise<string | null> {
  const [row] = await db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.marketId ?? null;
}
