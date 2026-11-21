import { and, eq } from 'drizzle-orm';
import { agreements, users } from '../../../src/modules/accounts/schema';
import { betaAccess } from '../../../src/modules/beta/schema';
import { identityVerifications } from '../../../src/modules/verification/schema';
import { createDb } from '../../../src/platform/db/connect';

/**
 * A client our team asked to verify their ID (completion plan P2), kept apart from the seeded people other
 * tests sign in as: a copy of Ana with her own email and phone. Each run starts them over with only the
 * staff request (no checks, no biometric notice accepted).
 */

export const CLIENT_ASKED_FOR_ID = { id: 'usr_e2e_poster_id', email: 'e2e-poster-id@example.test' };

export async function askClientForId(): Promise<void> {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');
  const { db, pool } = createDb(url, { max: 1 });
  try {
    const [ana] = await db.select().from(users).where(eq(users.id, 'usr_ana'));
    if (!ana) throw new Error('The seeded client Ana is missing');
    await db
      .insert(users)
      .values({ ...ana, id: CLIENT_ASKED_FOR_ID.id, email: CLIENT_ASKED_FOR_ID.email, name: 'Ivy I.', firstName: 'Ivy', lastName: 'Irwin', phone: '+15125550698' })
      .onConflictDoNothing();
    // A client invite in her market, like the seeded clients': Austin is opening soon in the test world (J-V8).
    await db.insert(betaAccess).values({ userId: CLIENT_ASKED_FOR_ID.id, marketId: ana.homeMarketId, role: 'poster' }).onConflictDoNothing();
    await db.delete(identityVerifications).where(eq(identityVerifications.userId, CLIENT_ASKED_FOR_ID.id));
    await db.delete(agreements).where(and(eq(agreements.userId, CLIENT_ASKED_FOR_ID.id), eq(agreements.doc, 'biometric_consent')));
    const now = new Date();
    await db.insert(identityVerifications).values({
      id: `idv_e2e_request_${now.getTime()}`,
      userId: CLIENT_ASKED_FOR_ID.id,
      provider: 'dev',
      providerSessionId: null,
      status: 'not_started',
      requestedReason: 'staff_request',
      requestedByUserId: 'usr_morgan',
      createdAt: now,
      updatedAt: now,
    });
  } finally {
    await pool.end();
  }
}
