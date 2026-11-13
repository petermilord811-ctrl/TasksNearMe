import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessions, users } from '@/modules/accounts/schema';
import { createAuth } from '@/platform/auth/config';
import { createDb } from '@/platform/db/connect';

/** Whatever the way in (an email code, a provider, a passkey), a suspended or deleted account gets no session. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const auth = createAuth(db, { nextCookies: false });
const ACTIVE = 'usr_tmp_guard_active';
const SUSPENDED = 'usr_tmp_guard_suspended';

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values([
    { ...chris!, id: ACTIVE, email: 'tmp-guard-active@example.test', phone: '+15125550616', status: 'active' },
    { ...chris!, id: SUSPENDED, email: 'tmp-guard-suspended@example.test', phone: '+15125550617', status: 'suspended' },
  ]);
});

afterAll(async () => {
  await db.delete(sessions).where(inArray(sessions.userId, [ACTIVE, SUSPENDED]));
  await db.delete(users).where(inArray(users.id, [ACTIVE, SUSPENDED]));
  await pool.end();
});

describe('sessions', () => {
  it('are made for an active account, and never for a suspended one', async () => {
    const context = await auth.$context;
    expect(await context.internalAdapter.createSession(ACTIVE)).toMatchObject({ userId: ACTIVE });
    await context.internalAdapter.createSession(SUSPENDED).catch(() => null);
    expect(await db.select().from(sessions).where(eq(sessions.userId, SUSPENDED))).toEqual([]);
    expect(await db.select().from(sessions).where(eq(sessions.userId, ACTIVE))).toHaveLength(1);
  });
});
