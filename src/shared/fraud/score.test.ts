import { describe, expect, it } from 'vitest';
import { fraudLevelOf, type AdminIpLocation, type IdentityAutoCheck } from '@/contracts';
import { accountFraud, addressFraud, backgroundFraud, combineFraud, identityFraud, ipFraud, ipsAreaFraud, networkKindOf, payoutFraud, scoreOf } from './score';

const comcast: AdminIpLocation = { countryCode: 'US', region: 'Florida', city: 'Gainesville', network: 'AS7922 Comcast Cable Communications, LLC' };
const keys = (score: { factors: { key: string }[] } | null) => score?.factors.map((factor) => factor.key);

describe('fraud levels', () => {
  it('are low under 30, medium under 60, high from 60', () => {
    expect([0, 29, 30, 59, 60, 100].map(fraudLevelOf)).toEqual(['low', 'low', 'medium', 'medium', 'high', 'high']);
  });

  it('sum the points, biggest first, capped at 100', () => {
    expect(scoreOf([{ key: 'ip_relay', points: 15 }, { key: 'ip_vpn', points: 45 }, { key: 'ip_outside_us', points: 0 }])).toEqual({
      score: 60,
      level: 'high',
      factors: [{ key: 'ip_vpn', points: 45 }, { key: 'ip_relay', points: 15 }],
    });
    expect(scoreOf([{ key: 'ip_tor', points: 70 }, { key: 'ip_outside_us', points: 30 }, { key: 'ip_shared', points: 35, count: 5 }]).score).toBe(100);
  });
});

describe('the network behind an address', () => {
  it('reads the kind from ipinfo.io paid flags, then the network number and name', () => {
    expect(networkKindOf(comcast)).toBe('residential');
    expect(networkKindOf({ network: 'AS16591 Google Fiber Inc.' })).toBe('residential');
    expect(networkKindOf({ network: 'AS21928 T-Mobile USA, Inc.' })).toBe('mobile');
    expect(networkKindOf({ network: 'AS22394 Cellco Partnership DBA Verizon Wireless' })).toBe('mobile');
    expect(networkKindOf({ network: 'AS9009 M247 Europe SRL' })).toBe('vpn');
    expect(networkKindOf({ network: 'AS64500 Some Fast VPN LLC' })).toBe('vpn');
    expect(networkKindOf({ network: 'AS16509 Amazon.com, Inc.' })).toBe('hosting');
    expect(networkKindOf({ network: 'AS64501 Example Hosting Ltd' })).toBe('hosting');
    expect(networkKindOf({ network: 'AS63949 Akamai Connected Cloud' })).toBe('hosting');
    expect(networkKindOf({ network: 'AS13335 Cloudflare, Inc.' })).toBe('relay');
    expect(networkKindOf({ network: 'AS36183 Akamai Technologies, Inc.' })).toBe('relay');
    expect(networkKindOf({ ...comcast, anonymous: true })).toBe('vpn');
    expect(networkKindOf({ ...comcast, hosting: true })).toBe('hosting');
    expect(networkKindOf({ network: 'AS64502 Example', hostname: 'tor-exit-7.example.org' })).toBe('tor');
    // A word that merely contains "tor" isn't Tor.
    expect(networkKindOf({ ...comcast, hostname: 'mentor-12.example.net' })).toBe('residential');
  });
});

describe("an address's score", () => {
  it('is clean for a home network in the home state', () => {
    expect(ipFraud({ location: comcast, otherAccounts: 0, homeState: 'FL' })).toEqual({ network: 'residential', fraud: { score: 0, level: 'low', factors: [] } });
  });

  it('adds a VPN abroad, another state, and other accounts on it', () => {
    const vpn = ipFraud({ location: { countryCode: 'DE', region: 'Hesse', network: 'AS9009 M247 Europe SRL' }, otherAccounts: 1, homeState: 'FL' });
    expect(vpn.network).toBe('vpn');
    expect(vpn.fraud).toEqual({ score: 85, level: 'high', factors: [{ key: 'ip_vpn', points: 45 }, { key: 'ip_outside_us', points: 30 }, { key: 'ip_shared', points: 10, count: 1 }] });
    expect(ipFraud({ location: comcast, otherAccounts: 0, homeState: 'TX' }).fraud).toMatchObject({ score: 10, factors: [{ key: 'ip_other_state', points: 10 }] });
    expect(ipFraud({ location: comcast, otherAccounts: 4, homeState: 'FL' }).fraud).toMatchObject({ score: 35, level: 'medium', factors: [{ key: 'ip_shared', points: 35, count: 4 }] });
  });

  it("counts shared phone-network addresses half (many people share one)", () => {
    const phone = ipFraud({ location: { countryCode: 'US', region: 'Florida', network: 'AS21928 T-Mobile USA, Inc.' }, otherAccounts: 3, homeState: 'FL' });
    expect(phone.fraud.factors).toEqual([{ key: 'ip_shared', points: 10, count: 3 }]);
  });

  it('matches regions by name, and judges nothing it can’t place', () => {
    expect(ipFraud({ location: { countryCode: 'US', region: 'District of Columbia', network: 'AS701 Verizon Business' }, otherAccounts: 0, homeState: 'DC' }).fraud.score).toBe(0);
    expect(ipFraud({ location: { countryCode: 'US', region: 'Somewhere', network: 'AS7922 Comcast' }, otherAccounts: 0, homeState: 'FL' }).fraud.score).toBe(0);
    expect(ipFraud({ location: { network: 'AS64500 Example Networks' }, otherAccounts: 0, homeState: 'FL' }).fraud.score).toBe(0);
  });

  it("makes the addresses' area from the riskiest one, counting each finding", () => {
    expect(ipsAreaFraud([])).toBeNull();
    const area = ipsAreaFraud([
      ipFraud({ location: comcast, otherAccounts: 0, homeState: 'FL' }).fraud,
      ipFraud({ location: { countryCode: 'DE', network: 'AS9009 M247' }, otherAccounts: 0, homeState: 'FL' }).fraud,
      ipFraud({ location: { countryCode: 'NL', network: 'AS60068 Datacamp Limited' }, otherAccounts: 2, homeState: 'FL' }).fraud,
    ]);
    expect(area).toEqual({
      score: 95,
      level: 'high',
      factors: [
        { key: 'ip_vpn', points: 45, count: 2 },
        { key: 'ip_outside_us', points: 30, count: 2 },
        { key: 'ip_shared', points: 20, count: 2 },
      ],
    });
  });
});

describe("an ID check's score", () => {
  const passing = (overrides: Partial<Record<string, string>> = {}): IdentityAutoCheck => ({
    readable: true,
    checks: (['readable', 'machine_readable', 'genuine', 'front_matches', 'name', 'adult', 'not_expired', 'face_match', 'live', 'unique'] as const).map((key) => ({ key, outcome: (overrides[key] ?? 'pass') as 'pass' })),
  });

  it('is null before anything was read, and 0 when every check passed', () => {
    expect(identityFraud({})).toBeNull();
    expect(identityFraud({ autoCheck: passing() })).toEqual({ score: 0, level: 'low', factors: [] });
  });

  it('weighs a fake ID, a face that doesn’t match and a duplicate most', () => {
    expect(identityFraud({ autoCheck: passing({ genuine: 'fail' }) })?.score).toBe(50);
    expect(identityFraud({ autoCheck: passing({ face_match: 'fail', genuine: 'unsure' }) })).toMatchObject({ score: 65, level: 'high' });
    expect(keys(identityFraud({ autoCheck: passing({ face_match: 'fail', genuine: 'unsure' }) }))).toEqual(['id_face_mismatch', 'id_barcode_doubtful']);
    expect(identityFraud({ autoCheck: passing(), duplicate: true })).toMatchObject({ score: 60, factors: [{ key: 'id_duplicate', points: 60 }] });
    expect(identityFraud({ autoCheck: passing({ unique: 'fail' }) })?.factors).toEqual([{ key: 'id_duplicate', points: 60 }]);
  });

  it('counts a tampering sign less when the face or liveness already failed', () => {
    expect(identityFraud({ autoCheck: { ...passing(), signals: ['photo_of_screen'] } })?.factors).toEqual([{ key: 'id_photo_tampered', points: 35 }]);
    expect(identityFraud({ autoCheck: { ...passing({ live: 'fail' }), signals: ['spoof_suspected'] } })?.factors).toEqual([
      { key: 'id_not_live', points: 35 },
      { key: 'id_photo_tampered', points: 15 },
    ]);
  });

  it('reads readings from before the ten checks, and earlier tries turned down (up to 30)', () => {
    expect(identityFraud({ autoCheck: { readable: true, nameMatches: false, isAdult: true, notExpired: false } })?.factors).toEqual([
      { key: 'id_name_differs', points: 20 },
      { key: 'id_expired', points: 15 },
    ]);
    expect(identityFraud({ rejectedBefore: 5 })).toEqual({ score: 30, level: 'medium', factors: [{ key: 'id_rejected_before', points: 30, count: 5 }] });
  });
});

describe("a proof of address's score", () => {
  it('weighs signs of editing most, then a name or address that differs', () => {
    expect(addressFraud({})).toBeNull();
    expect(addressFraud({ autoCheck: { readable: true, checks: [{ key: 'unedited', outcome: 'fail' }, { key: 'name', outcome: 'pass' }] } })).toMatchObject({ score: 50, level: 'medium' });
    expect(addressFraud({ autoCheck: { readable: true, checks: [{ key: 'unedited', outcome: 'unsure' }] } })?.factors).toEqual([{ key: 'address_edit_doubtful', points: 10 }]);
    expect(addressFraud({ autoCheck: { readable: true, nameMatches: true, addressMatches: false, recent: false } })?.factors).toEqual([
      { key: 'address_differs', points: 25 },
      { key: 'address_old', points: 10 },
    ]);
    expect(addressFraud({ autoCheck: { readable: false }, rejectedBefore: 1 })?.factors).toEqual([
      { key: 'address_unreadable', points: 10 },
      { key: 'address_rejected_before', points: 10, count: 1 },
    ]);
  });
});

describe('payouts, background checks and the account', () => {
  it('scores what the providers said, and nothing before they did', () => {
    expect(payoutFraud('not_started')).toBeNull();
    expect(payoutFraud('pending')).toBeNull();
    expect(payoutFraud('active')?.score).toBe(0);
    expect(payoutFraud('restricted')?.score).toBe(40);
    expect(backgroundFraud({ status: 'not_started' })).toBeNull();
    expect(backgroundFraud({ status: 'clear' })?.score).toBe(0);
    expect(backgroundFraud({ status: 'consider' })?.factors).toEqual([{ key: 'background_consider', points: 30 }]);
    expect(backgroundFraud({ status: 'consider', adjudication: 'pre_adverse' })?.factors).toEqual([{ key: 'background_adverse', points: 50 }]);
    expect(backgroundFraud({ status: 'consider', adjudication: 'engaged' })?.score).toBe(0);
  });

  it('adds a brand-new account, a hold, a suspension, strikes, many addresses and no verified phone', () => {
    const now = new Date('2026-11-27T12:00:00.000Z');
    expect(accountFraud({ createdAt: new Date('2026-01-01'), now, phoneVerified: true })).toEqual({ score: 0, level: 'low', factors: [] });
    expect(
      accountFraud({ createdAt: new Date('2026-11-26T12:00:00.000Z'), now, status: 'suspended', contactHold: true, strikes: 4, phoneVerified: false, recentIps: 16 }).factors,
    ).toEqual([
      { key: 'account_suspended', points: 40 },
      { key: 'account_contact_hold', points: 30 },
      { key: 'account_strikes', points: 30, count: 4 },
      { key: 'account_new', points: 10 },
      { key: 'account_many_ips', points: 10, count: 16 },
      { key: 'phone_unverified', points: 5 },
    ]);
  });
});

describe("the person's final score", () => {
  it('adds independent signs the way chances do, ignoring areas without a score', () => {
    const area = (score: number) => scoreOf([{ key: 'ip_vpn', points: score }]);
    expect(combineFraud([])).toEqual({ score: 0, level: 'low', factors: [] });
    expect(combineFraud([null, area(0)]).score).toBe(0);
    expect(combineFraud([area(30), null, area(30)])).toMatchObject({ score: 51, level: 'medium' });
    expect(combineFraud([area(50), area(50)])).toMatchObject({ score: 75, level: 'high' });
    expect(combineFraud([area(100), area(10)]).score).toBe(100);
    // A clean area never lowers another.
    expect(combineFraud([area(45), area(0), area(0)]).score).toBe(45);
  });
});
