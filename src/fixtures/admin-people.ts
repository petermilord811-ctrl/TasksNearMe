import { devonVerification, fakeAdminVerificationHandlers, jordanVerification, priyaVerification } from './admin-verification';
import type {
  AdminRewardRow,
  AdminRewardsHandlers,
  AdminRewardsPageData,
  AdminSignInRow,
  AdminUserHandlers,
  AdminUserPageData,
  AdminUserRow,
  AdminUsersPageData,
  PersonSummary,
} from '@/contracts';
import { adminCasesPageData } from './admin';
import { jordan, maya } from './people';

/**
 * Staff reward reviews and people pages (UI-020; ui-contract `admin.reward_review`): Jordan's welcome reward
 * waits for review after the desk, and Devon's welcome reward is flagged: Devon and the client Dana share a
 * card and both accounts are new (the self-dealing pair from blueprint 05 §3). Previews use `ADMIN_NOW`.
 */

const person = (p: PersonSummary): PersonSummary => ({ id: p.id, displayName: p.displayName, initials: p.initials, memberSince: p.memberSince, phoneVerified: p.phoneVerified });
const dana: PersonSummary = { id: 'usr_dana', displayName: 'Dana K.', initials: 'DK', memberSince: '2026-11-18T15:00:00.000Z', phoneVerified: true };
const devon: PersonSummary = { id: 'usr_devon', displayName: 'Devon K.', initials: 'DK', memberSince: '2026-11-17T15:00:00.000Z', phoneVerified: true };

/** Jordan's welcome gift card: earned by the three checks (no booking), out of the line for review on Nov 27. */
const jordanWelcome: AdminRewardRow = {
  id: 'rwd_jordan_welcome',
  program: 'welcome',
  amountCents: 5000,
  status: 'in_review',
  helper: person(jordan),
  holdUntil: '2026-11-27T15:02:00.000Z',
  createdAt: '2026-11-27T15:02:00.000Z',
  signals: [],
  actions: ['approve_review', 'reject_review', 'void'],
};

/** Devon's third booking with Dana: a repeat reward the risk signals sent to review. */
const devonRepeat: AdminRewardRow = {
  id: 'rwd_devon_repeat',
  program: 'repeat',
  amountCents: 1000,
  status: 'in_review',
  helper: devon,
  booking: { id: 'bkg_dana', title: 'Assemble a chair', client: dana, priceCents: 4000, completedAt: '2026-11-19T20:00:00.000Z' },
  holdUntil: '2026-11-26T20:00:00.000Z',
  createdAt: '2026-11-18T16:00:00.000Z',
  signals: ['new_client_account', 'new_helper_account', 'shared_card'],
  actions: ['approve_review', 'reject_review', 'void'],
};

const failedGiftCard: AdminRewardRow = {
  id: 'rwd_sam_repeat',
  program: 'repeat',
  amountCents: 1000,
  status: 'failed',
  helper: { id: 'usr_sam', displayName: 'Sam K.', initials: 'SK', memberSince: '2024-05-20T15:00:00.000Z', phoneVerified: true },
  booking: { id: 'bkg_sam_3', title: 'Mount two floating shelves', client: person(maya), priceCents: 5000, completedAt: '2026-11-10T18:00:00.000Z' },
  createdAt: '2026-11-08T16:00:00.000Z',
  signals: ['repeat_pair'],
  actions: ['reissue', 'void'],
};

/** The welcome gift card's monthly budget: $100 left the line this month, $200 waits for next month's. */
const budgets: AdminRewardsPageData['budgets'] = [
  { program: 'welcome', budgetCents: 500_000, period: 'month', releasedThisMonthCents: 10_000, queuedCents: 20_000, committedCents: 45_000, deliveredCents: 5_000 },
  { program: 'repeat', committedCents: 2_000, deliveredCents: 0 },
];

/** The oldest first: Devon's flagged repeat reward, then Jordan's welcome gift card. */
export const adminRewardsReviewData: AdminRewardsPageData = { filter: 'in_review', rows: [devonRepeat, jordanWelcome], counts: { in_review: 2, failed: 1, all: 6 }, budgets };
export const adminRewardsFailedData: AdminRewardsPageData = { ...adminRewardsReviewData, filter: 'failed', rows: [failedGiftCard] };
export const adminRewardsEmptyData: AdminRewardsPageData = { filter: 'in_review', rows: [], counts: { in_review: 0, failed: 0, all: 0 }, budgets };

const jordanRow: AdminUserRow = { id: 'usr_jordan', person: person(jordan), email: 'jordan@example.test', roles: [], helperStatus: 'active', openCases: 1, strikes: 0 };
const mayaRow: AdminUserRow = { id: 'usr_maya', person: person(maya), email: 'maya@example.test', roles: [], helperStatus: 'none', openCases: 1, strikes: 0 };
const devonRow: AdminUserRow = { id: 'usr_devon', person: devon, email: 'devon@example.test', roles: [], helperStatus: 'active', openCases: 0, strikes: 1 };

export const adminUsersData: AdminUsersPageData = { query: '', rows: [devonRow, jordanRow, mayaRow], totalCount: 3 };
export const adminUsersSearchData: AdminUsersPageData = { query: 'jor', rows: [jordanRow], totalCount: 1 };
export const adminUsersEmptyData: AdminUsersPageData = { query: 'nobody', rows: [], totalCount: 0 };

/** Jordan, as trust and safety sees them (can suspend). */
export const adminUserJordanData: AdminUserPageData = {
  user: { ...jordanRow, phone: { last4: '0201', verified: true } },
  bookings: [
    { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', role: 'helper', status: 'disputed', start: '2026-11-21T16:30:00.000Z', amountCents: 5400 },
    { id: 'bkg_tv', title: 'Anchor a tall bookshelf to the wall', role: 'helper', status: 'confirmed', start: '2026-11-25T18:00:00.000Z', amountCents: 7200 },
  ],
  cases: adminCasesPageData.cases.slice(0, 1),
  rewards: [jordanWelcome],
  strikes: [
    { id: 'stk_jordan_noshow', bookingId: 'bkg_bench', reason: 'no_show', at: '2026-11-18T16:35:00.000Z' },
    { id: 'stk_jordan_late', bookingId: 'bkg_shelf', reason: 'late_cancellation', at: '2026-11-02T15:00:00.000Z', reversedAt: '2026-11-03T18:20:00.000Z' },
  ],
  canReverseStrikes: true,
  deliveries: [
    { id: 'dlv_jordan_sms', channel: 'sms', type: 'problem_reported', status: 'held', reason: 'quiet_hours', attempts: 0, at: '2026-11-22T04:10:00.000Z', nextTryAt: '2026-11-22T14:00:00.000Z' },
    { id: 'dlv_jordan_email', channel: 'email', type: 'problem_reported', status: 'failed', reason: 'Mailbox unavailable (550)', attempts: 2, at: '2026-11-22T04:40:00.000Z', nextTryAt: '2026-11-22T06:40:00.000Z' },
    { id: 'dlv_jordan_offer', channel: 'email', type: 'booking_confirmed', status: 'sent', attempts: 1, at: '2026-11-20T15:02:00.000Z' },
    { id: 'dlv_jordan_offer_sms', channel: 'sms', type: 'offer_declined', status: 'skipped', reason: 'preference_off', attempts: 0, at: '2026-11-19T18:00:00.000Z' },
  ],
  actions: ['suspend_helper'],
  verification: jordanVerification,
};

/** Devon, suspended after the reward review. */
export const adminUserSuspendedData: AdminUserPageData = {
  user: { ...devonRow, helperStatus: 'suspended' },
  bookings: [{ id: 'bkg_dana', title: 'Assemble a chair', role: 'helper', status: 'completed', start: '2026-11-19T17:00:00.000Z', amountCents: 3600 }],
  cases: [],
  rewards: [{ ...devonRepeat, status: 'voided', actions: [] }],
  strikes: [{ id: 'stk_devon', bookingId: 'bkg_dana', reason: 'linked_accounts', at: '2026-11-27T16:00:00.000Z' }],
  canReverseStrikes: true,
  deliveries: [],
  suspension: { reason: 'Shares a card with the client on their only booking.', at: '2026-11-27T16:00:00.000Z', byDisplayName: 'Taylor B.' },
  actions: ['reinstate_helper'],
  verification: { ...devonVerification, actions: [] },
};

/** A support agent sees the page but can't suspend. */
export const adminUserReadOnlyData: AdminUserPageData = { ...adminUserJordanData, actions: [], canReverseStrikes: false, verification: { ...jordanVerification, actions: [] } };

/** Priya, with a proof of address to review. */
export const adminUserPriyaData: AdminUserPageData = { ...adminUserJordanData, user: { ...adminUserJordanData.user, id: 'usr_priya', person: { id: 'usr_priya', displayName: 'Priya S.', initials: 'PS', memberSince: '2026-11-14T15:00:00.000Z', phoneVerified: true }, email: 'priya@example.test', helperStatus: 'draft', phone: { last4: '0204', verified: true } }, bookings: [], cases: [], rewards: [], strikes: [], deliveries: [], actions: [], verification: priyaVerification };

const ua = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
  samsung: 'Mozilla/5.0 (Linux; Android 15; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  monitor: 'TasksNearMe-Monitor/1.0',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
};

/**
 * Jordan's sign-ins as trust and safety sees them, one of each kind of ipinfo.io answer. Addresses are from the
 * documentation blocks (RFC 5737, RFC 3849), so none is a real person's.
 */
export const adminSignInRows: AdminSignInRow[] = [
  {
    id: 'ses_jordan_phone', at: '2026-11-23T14:05:00.000Z', expiresAt: '2026-12-23T14:05:00.000Z', device: { browser: 'Safari', os: 'iPhone' }, userAgent: ua.iphone, ip: '203.0.113.24',
    lookup: { status: 'found', location: { countryCode: 'US', region: 'Florida', city: 'Gainesville', network: 'AS7922 Comcast Cable Communications, LLC', hostname: 'c-203-0-113-24.hsd1.fl.comcast.net' } },
    ipinfoUrl: 'https://ipinfo.io/203.0.113.24',
  },
  {
    id: 'ses_jordan_vpn', at: '2026-11-22T03:12:00.000Z', expiresAt: '2026-12-22T03:12:00.000Z', device: { browser: 'Chrome', os: 'Windows' }, userAgent: ua.windowsChrome, ip: '198.51.100.7',
    lookup: { status: 'found', location: { countryCode: 'DE', region: 'Hesse', city: 'Frankfurt am Main', network: 'AS9009 M247 Europe SRL', anonymous: true, hosting: true } },
    ipinfoUrl: 'https://ipinfo.io/198.51.100.7',
  },
  { id: 'ses_jordan_limit', at: '2026-11-20T18:40:00.000Z', expiresAt: '2026-12-20T18:40:00.000Z', device: { browser: 'Firefox', os: 'Mac' }, userAgent: ua.macFirefox, ip: '192.0.2.10', lookup: { status: 'unavailable', reason: 'limit' }, ipinfoUrl: 'https://ipinfo.io/192.0.2.10' },
  { id: 'ses_jordan_failed', at: '2026-11-18T12:00:00.000Z', expiresAt: '2026-12-18T12:00:00.000Z', device: { browser: 'Edge', os: 'Windows' }, userAgent: ua.windowsEdge, ip: '2001:db8::5', lookup: { status: 'unavailable', reason: 'failed' }, ipinfoUrl: 'https://ipinfo.io/2001:db8::5' },
  {
    id: 'ses_jordan_unknown_place', at: '2026-11-15T10:00:00.000Z', expiresAt: '2026-12-15T10:00:00.000Z', device: { browser: 'Samsung Internet', os: 'Android' }, userAgent: ua.samsung, ip: '203.0.113.99',
    lookup: { status: 'found', location: { network: 'AS64500 Example Networks' } }, ipinfoUrl: 'https://ipinfo.io/203.0.113.99',
  },
  { id: 'ses_jordan_local', at: '2026-11-12T09:00:00.000Z', expiresAt: '2026-11-22T09:00:00.000Z', expired: true, device: {}, userAgent: ua.monitor, ip: '10.0.0.4', lookup: { status: 'private' } },
  { id: 'ses_jordan_no_address', at: '2026-11-08T16:30:00.000Z', expiresAt: '2026-12-08T16:30:00.000Z', device: { browser: 'Chrome', os: 'Android' }, userAgent: ua.android },
  {
    id: 'ses_jordan_sign_up', at: '2026-11-03T15:00:12.000Z', expiresAt: '2026-12-03T15:00:12.000Z', device: { browser: 'Safari', os: 'Mac' }, userAgent: ua.macSafari, ip: '2001:db8:85a3::8a2e:370:7334',
    lookup: { status: 'found', location: { countryCode: 'US', region: 'Florida', city: 'Gainesville', network: 'AS7922 Comcast Cable Communications, LLC' } },
    ipinfoUrl: 'https://ipinfo.io/2001:db8:85a3::8a2e:370:7334', signUp: true,
  },
];

/** Jordan's page for a role that sees sign-ins (trust and safety, support leads, admins). */
export const adminUserSignInsData: AdminUserPageData = { ...adminUserJordanData, signIns: adminSignInRows };
/** Signed out everywhere: nothing to show. */
export const adminUserNoSignInsData: AdminUserPageData = { ...adminUserJordanData, signIns: [] };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeAdminRewardsHandlers: AdminRewardsHandlers = { onDecide: () => wait({ ok: true, code: 'updated' }) };
export const fakeAdminUserHandlers: AdminUserHandlers = { onSuspension: () => wait({ ok: true, code: 'updated' }), onReverseStrike: () => wait({ ok: true, code: 'updated' }), ...fakeAdminVerificationHandlers };
