import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IpLookupResult } from '@/integrations/ipinfo';
import { agreements, sessions, signInEvents, users } from '@/modules/accounts/schema';
import { getAdminDetectedIps } from '@/modules/fraud/detected-ips';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Every address a person was seen on (owner, 2026-11-27: "show all detected ips"): sign-ins kept a year, sessions,
 * agreements and the audit log, one row per address with ipinfo.io's answer and its fraud score.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });

const USER = 'usr_tmp_fraud_ips';
const OTHER = 'usr_tmp_fraud_other';
const MANY = 'usr_tmp_fraud_many';
const PEOPLE = [USER, OTHER, MANY];
const joined = new Date('2026-10-01T12:00:00.000Z');
const now = new Date('2026-11-27T12:00:00.000Z');
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0.1 Mobile/15E148 Safari/604.1';
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const taylor: StaffActor = { id: 'usr_taylor', roles: ['trust_safety'] };
const at = (iso: string) => new Date(iso);

const event = (n: number, userId: string, ip: string | null, createdAt: Date, extra: Partial<typeof signInEvents.$inferInsert> = {}) => ({
  id: `sie_tmp_fraud_${userId.slice(-5)}_${n}`,
  userId,
  sessionId: `ses_tmp_fraud_gone_${userId.slice(-5)}_${n}`,
  ip,
  userAgent: null,
  method: 'email_code',
  createdAt,
  ...extra,
});

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values(
    PEOPLE.map((id) => ({ ...maya!, id, email: `${id.replaceAll('_', '-')}@example.test`, phone: null, homeMarketId: 'mkt_gainesville', createdAt: joined, updatedAt: joined })),
  );
  await db.insert(signInEvents).values([
    // The sign-up (Google), then a later sign-in from home; one from a VPN abroad that another account used too.
    event(1, USER, '203.0.113.24', new Date(joined.getTime() + 5_000), { method: 'google', userAgent: iphone }),
    event(2, USER, '203.0.113.24', at('2026-11-20T08:00:00.000Z')),
    event(3, USER, '198.51.100.7', at('2026-11-10T08:00:00.000Z'), { method: 'passkey' }),
    event(4, USER, null, at('2026-11-11T08:00:00.000Z')),
    event(1, OTHER, '198.51.100.7', at('2026-11-12T08:00:00.000Z')),
    ...Array.from({ length: 22 }, (_, i) => event(10 + i, MANY, `192.0.2.${100 + i}`, new Date(now.getTime() - (i + 1) * 3_600_000))),
  ]);
  // Signed in now from an address the history doesn't have (a session from before it began).
  await db.insert(sessions).values({ id: 'ses_tmp_fraud_live', token: 'tok_tmp_fraud_live', userId: USER, ipAddress: '192.0.2.10', userAgent: null, createdAt: at('2026-11-26T09:00:00.000Z'), updatedAt: at('2026-11-26T09:00:00.000Z'), expiresAt: at('2026-12-26T09:00:00.000Z') });
  await db.insert(agreements).values({ id: 'agr_tmp_fraud', userId: USER, doc: 'helper_agreement', version: 'test-fraud', acceptedAt: at('2026-10-02T10:00:00.000Z'), ip: '203.0.113.99', userAgent: iphone });
  await db.insert(auditLog).values({ id: 'aud_tmp_fraud', actorId: USER, actorRole: 'user', action: 'address.submitted', targetType: 'user', targetId: USER, metadata: {}, ip: '198.51.100.7', at: '2026-11-25T10:00:00.000Z' });
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.id, 'aud_tmp_fraud'));
  await db.delete(users).where(inArray(users.id, PEOPLE));
  await pool.end();
});

const fakeLookup = () =>
  vi.fn(async (ip: string): Promise<IpLookupResult> => {
    if (ip === '203.0.113.24') return { status: 'found', location: { countryCode: 'US', region: 'Florida', city: 'Gainesville', network: 'AS7922 Comcast Cable Communications, LLC' } };
    if (ip === '198.51.100.7') return { status: 'found', location: { countryCode: 'DE', region: 'Hesse', network: 'AS9009 M247 Europe SRL' } };
    if (ip === '192.0.2.10') return { status: 'unavailable', reason: 'limit' };
    return { status: 'found', location: { countryCode: 'US', region: 'Texas', network: 'AS7018 AT&T Services, Inc.' } };
  });

describe('getAdminDetectedIps', () => {
  it('is only for trust and safety, support leads and admins', async () => {
    const lookup = fakeLookup();
    expect(await getAdminDetectedIps(db, alex, USER, now, lookup)).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
    expect(await getAdminDetectedIps(db, taylor, 'usr_nobody_here', now, lookup)).toBeUndefined();
  });

  it('gathers every source into one row per address, newest first, each scored', async () => {
    const found = (await getAdminDetectedIps(db, taylor, USER, now, fakeLookup()))!;
    expect(found.ips.map((row) => row.ip)).toEqual(['192.0.2.10', '198.51.100.7', '203.0.113.24', '203.0.113.99']);
    expect(found.total).toBe(4);
    expect(found.recent).toBe(3);
    const [live, vpn, home, agreement] = found.ips;
    expect(live).toMatchObject({ signIns: 1, active: true, seenIn: ['sign_in'], lookup: { status: 'unavailable', reason: 'limit' }, otherAccounts: 0 });
    expect(live!.fraud).toBeUndefined();
    expect(vpn).toMatchObject({ signIns: 1, way: 'passkey', otherAccounts: 1, network: 'vpn', lastSeenAt: '2026-11-25T10:00:00.000Z', firstSeenAt: '2026-11-10T08:00:00.000Z' });
    expect(vpn!.seenIn.sort()).toEqual(['activity', 'sign_in']);
    expect(vpn!.fraud).toEqual({ score: 85, level: 'high', factors: [{ key: 'ip_vpn', points: 45 }, { key: 'ip_outside_us', points: 30 }, { key: 'ip_shared', points: 10, count: 1 }] });
    expect(home).toMatchObject({ signIns: 2, signUp: true, way: 'email_code', network: 'residential', fraud: { score: 0, level: 'low' } });
    // A documentation address isn't public: no ipinfo.io page to open.
    expect(home!.ipinfoUrl).toBeUndefined();
    expect(home!.device).toEqual({ browser: 'Safari', os: 'iPhone' });
    expect(agreement).toMatchObject({ signIns: 0, seenIn: ['agreement'] });
    expect(agreement!.signUp).toBeUndefined();
  });

  it('looks up only the 20 newest addresses (ipinfo.io has a daily limit) and counts the rest', async () => {
    const lookup = fakeLookup();
    const found = (await getAdminDetectedIps(db, taylor, MANY, now, lookup))!;
    expect(found.ips).toHaveLength(22);
    expect(lookup).toHaveBeenCalledTimes(20);
    expect(found.ips.slice(0, 20).every((row) => row.lookup?.status === 'found' && row.fraud)).toBe(true);
    expect(found.ips.slice(20).every((row) => row.lookup === undefined && row.fraud === undefined)).toBe(true);
    // Texas for a Gainesville account: another state.
    expect(found.ips[0]!.fraud?.factors).toEqual([{ key: 'ip_other_state', points: 10 }]);
  });
});
