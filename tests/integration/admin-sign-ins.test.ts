import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IpLookupResult } from '@/integrations/ipinfo';
import { sessions, users } from '@/modules/accounts/schema';
import { getAdminSignIns } from '@/modules/accounts/sign-in-locations';
import type { StaffActor } from '@/modules/support/staff';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });

const USER = 'usr_tmp_signins';
const LATE = 'usr_tmp_signins_late';
const joined = new Date('2026-10-01T12:00:00.000Z');
const now = new Date('2026-11-21T12:00:00.000Z');
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0.1 Mobile/15E148 Safari/604.1';
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const taylor: StaffActor = { id: 'usr_taylor', roles: ['trust_safety'] };
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };

const at = (iso: string) => new Date(iso);
const session = (n: number, createdAt: Date, ipAddress: string | null, extra: Partial<typeof sessions.$inferInsert> = {}) => ({
  id: `ses_tmp_signins_${n}`,
  token: `tok_tmp_signins_${n}`,
  userId: USER,
  createdAt,
  updatedAt: createdAt,
  expiresAt: new Date(createdAt.getTime() + 30 * 86_400_000),
  ipAddress,
  userAgent: null,
  ...extra,
});

/** Throwaway people (copies of Maya): one with a sign-up session and eleven later ones (the page shows 10 + the sign-up). */
beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values([
    { ...maya!, id: USER, email: 'tmp-signins@example.test', phone: null, createdAt: joined, updatedAt: joined },
    { ...maya!, id: LATE, email: 'tmp-signins-late@example.test', phone: null, createdAt: joined, updatedAt: joined },
  ]);
  const ips = ['8.8.8.8', '10.0.0.4', null, '2001:4860:4860::8888'];
  const later = Array.from({ length: 11 }, (_, i) =>
    session(i + 1, at(`2026-11-${String(i + 5).padStart(2, '0')}T08:00:00.000Z`), ips[i % ips.length]!, i === 0 ? { expiresAt: at('2026-11-20T08:00:00.000Z') } : {}),
  );
  await db.insert(sessions).values([
    session(0, new Date(joined.getTime() + 5_000), '9.9.9.9', { userAgent: iphone, expiresAt: at('2026-12-01T12:00:00.000Z') }),
    ...later,
    // An account whose oldest remaining session came long after it was made: no sign-up row.
    { ...session(20, at('2026-11-10T08:00:00.000Z'), '8.8.8.8'), userId: LATE },
  ]);
});

afterAll(async () => {
  await db.delete(sessions).where(eq(sessions.userId, USER));
  await db.delete(sessions).where(eq(sessions.userId, LATE));
  await db.delete(users).where(eq(users.id, USER));
  await db.delete(users).where(eq(users.id, LATE));
  await pool.end();
});

const fakeLookup = () =>
  vi.fn(async (ip: string): Promise<IpLookupResult> => (ip === '10.0.0.4' ? { status: 'private' } : { status: 'found', location: { countryCode: ip === '9.9.9.9' ? 'CH' : 'US' } }));

describe('getAdminSignIns', () => {
  it('is only for trust and safety, support leads and admins', async () => {
    const lookup = fakeLookup();
    expect(await getAdminSignIns(db, alex, USER, now, lookup)).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
    expect(await getAdminSignIns(db, riley, USER, now, lookup)).toHaveLength(11);
  });

  it('lists the 10 newest, then the sign-up, each address looked up', async () => {
    const lookup = fakeLookup();
    const rows = (await getAdminSignIns(db, taylor, USER, now, lookup))!;
    expect(rows.map((row) => row.id)).toEqual([...Array.from({ length: 10 }, (_, i) => `ses_tmp_signins_${11 - i}`), 'ses_tmp_signins_0']);
    expect(rows.at(-1)).toMatchObject({
      signUp: true,
      ip: '9.9.9.9',
      lookup: { status: 'found', location: { countryCode: 'CH' } },
      ipinfoUrl: 'https://ipinfo.io/9.9.9.9',
      device: { browser: 'Safari', os: 'iPhone' },
      userAgent: iphone,
      at: new Date(joined.getTime() + 5_000).toISOString(),
    });
    expect(rows.filter((row) => row.signUp)).toHaveLength(1);
    // A private address is answered "private" and gets no ipinfo.io link; a sign-in without an address isn't looked up.
    const local = rows.find((row) => row.ip === '10.0.0.4')!;
    expect(local).toMatchObject({ lookup: { status: 'private' } });
    expect(local.ipinfoUrl).toBeUndefined();
    const noAddress = rows.find((row) => row.id === 'ses_tmp_signins_11')!;
    expect(noAddress.ip).toBeUndefined();
    expect(noAddress.lookup).toBeUndefined();
    expect(noAddress.device).toEqual({});
    expect(lookup).toHaveBeenCalledTimes(rows.filter((row) => row.ip).length);
  });

  it('marks a listed sign-in past its expiry', async () => {
    const rows = (await getAdminSignIns(db, taylor, USER, now, fakeLookup()))!;
    expect(rows.find((row) => row.id === 'ses_tmp_signins_1')).toBeUndefined(); // the 11th newest isn't listed
    expect(rows.filter((row) => row.expired)).toHaveLength(0);
    await db.delete(sessions).where(eq(sessions.id, 'ses_tmp_signins_11'));
    const shorter = (await getAdminSignIns(db, taylor, USER, now, fakeLookup()))!;
    expect(shorter.find((row) => row.id === 'ses_tmp_signins_1')).toMatchObject({ expired: true, expiresAt: '2026-11-20T08:00:00.000Z' });
    expect(shorter.filter((row) => row.expired)).toHaveLength(1);
  });

  it('flags no sign-up when the oldest remaining session isn’t from sign-up, and nothing for an unknown person', async () => {
    const rows = (await getAdminSignIns(db, taylor, LATE, now, fakeLookup()))!;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.signUp).toBeUndefined();
    expect(await getAdminSignIns(db, taylor, 'usr_nobody_here', now, fakeLookup())).toBeUndefined();
  });
});
