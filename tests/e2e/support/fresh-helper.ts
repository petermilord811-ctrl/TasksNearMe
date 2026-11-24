import { randomInt, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { PEOPLE, type SeedPerson } from '../../../db/seeds/data/people';
import { upsertPeople, type Tx } from '../../../db/seeds/seed';
import { helperProfiles, helperServices, helperWorkSamples } from '../../../src/modules/profiles/schema';
import { files } from '../../../src/modules/tasks/schema';
import { addressVerifications, backgroundChecks, identityCaptures, identityVerifications, payoutAccounts } from '../../../src/modules/verification/schema';
import { agreements } from '../../../src/modules/accounts/schema';
import { createDb } from '../../../src/platform/db/connect';

/**
 * A helper of a test's own for onboarding: a copy of Priya as the seed makes her (a draft profile with her area and no
 * services, her phone verified at sign-up, a client invite in Austin), under a new account. A test that onboards one
 * can run again in the same run (a retry, `--repeat-each`) and beside other tests: seeded Priya, whom other specs read
 * before onboarding, is never touched. The global setup resets seeded Priya only once per run, so a retry that onboarded
 * her again found her services already saved.
 */
export interface FreshHelper {
  id: string;
  email: string;
  handle: string;
  /** First name and last initial, as pages and staff queues show it. */
  displayName: string;
}

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');
  return createDb(url, { max: 1 });
}

const isUniqueViolation = (error: unknown) => (error as { code?: string; cause?: { code?: string } }).code === '23505' || (error as { cause?: { code?: string } }).cause?.code === '23505';

export async function freshHelper(): Promise<FreshHelper> {
  const priya = PEOPLE.find((person) => person.id === 'usr_priya');
  if (!priya?.helper) throw new Error('Seeded Priya (a draft helper) is missing');
  const { db, pool } = database();
  try {
    // A phone number is one account's: a new one each time, retried in the unlikely case two runs drew the same.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = randomUUID().replaceAll('-', '').slice(0, 8);
      const person: SeedPerson = {
        ...priya,
        id: `usr_e2e_onb_${token}`,
        email: `onboarding-${token}@example.test`,
        // A distinct last name (the pages show its initial only), so no two copies look like one person to a check.
        lastName: `Sample${token}`,
        phone: `+1512555${randomInt(3000, 10_000)}`,
        helper: { ...priya.helper, handle: `priya-${token}` },
      };
      try {
        await db.transaction(async (tx) => {
          await upsertPeople(tx, [person]);
        });
        return { id: person.id, email: person.email, handle: person.helper!.handle, displayName: `${person.firstName} ${person.lastName.charAt(0)}.` };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error('No free phone number for a fresh helper after 5 tries');
  } finally {
    await pool.end();
  }
}

/**
 * Takes a helper back to before onboarding: services, work samples, the checks and their documents, payouts, the
 * agreements. The global reset uses it for seeded Priya.
 */
export async function clearHelperOnboarding(tx: Tx, userId: string): Promise<void> {
  await tx.delete(helperServices).where(eq(helperServices.userId, userId));
  await tx.delete(helperWorkSamples).where(eq(helperWorkSamples.userId, userId));
  await tx.delete(identityVerifications).where(eq(identityVerifications.userId, userId));
  // Our own ID check's photos and their file records (the encrypted files stay on the dev disk).
  await tx.delete(identityCaptures).where(eq(identityCaptures.userId, userId));
  await tx.delete(files).where(and(eq(files.ownerUserId, userId), inArray(files.kind, ['id_document', 'id_selfie'])));
  await tx.delete(payoutAccounts).where(eq(payoutAccounts.userId, userId));
  await tx.delete(backgroundChecks).where(eq(backgroundChecks.userId, userId));
  await tx.delete(addressVerifications).where(eq(addressVerifications.userId, userId));
  await tx.delete(agreements).where(eq(agreements.userId, userId));
}

/**
 * After the test: the copy goes back to a draft nobody sees (no public profile, nothing in the staff queues), so a dev
 * database that e2e ran against doesn't fill up with bookable copies of Priya.
 */
export async function retireFreshHelper(helper: FreshHelper): Promise<void> {
  const { db, pool } = database();
  try {
    await db.transaction(async (tx) => {
      await clearHelperOnboarding(tx, helper.id);
      await tx.update(helperProfiles).set({ status: 'draft', idVerifiedAt: null, addressVerifiedAt: null, payoutsReadyAt: null, backgroundCheckedAt: null }).where(eq(helperProfiles.userId, helper.id));
    });
  } finally {
    await pool.end();
  }
}
