import 'server-only';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { homeMarketIdOf } from '@/modules/tasks/server';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { db } from '@/platform/db/client';
import type { OwnerDeps } from './owner';

const cipher = fieldCipherFromEnv();

/** The poster's view dependencies: the app database, the address key, and their market's fees. */
export async function ownerDepsFor(userId: string): Promise<OwnerDeps | null> {
  const marketId = await homeMarketIdOf(userId);
  const policy = marketId ? await getPublishedPolicy(marketId) : null;
  return policy ? { db, cipher, fees: policy.fees } : null;
}
