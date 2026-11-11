import type {
  AdminRewardRow,
  AdminRewardsHandlers,
  AdminRewardsPageData,
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

const jordanWelcome: AdminRewardRow = {
  id: 'rwd_jordan_welcome',
  program: 'welcome',
  amountCents: 5000,
  status: 'in_review',
  helper: person(jordan),
  booking: { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', client: person(maya), priceCents: 6000, completedAt: '2026-11-21T19:05:00.000Z' },
  holdUntil: '2026-11-28T19:05:00.000Z',
  createdAt: '2026-11-17T15:02:00.000Z',
  signals: [],
  actions: ['approve_review', 'reject_review', 'void'],
};

const devonWelcome: AdminRewardRow = {
  id: 'rwd_devon_welcome',
  program: 'welcome',
  amountCents: 5000,
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

const budgets: AdminRewardsPageData['budgets'] = [
  { program: 'welcome', budgetCents: 500_000, committedCents: 15_000, deliveredCents: 5_000 },
  { program: 'repeat', committedCents: 1_000, deliveredCents: 0 },
];

/** The oldest first: Devon's flagged reward, then Jordan's clean one. */
export const adminRewardsReviewData: AdminRewardsPageData = { filter: 'in_review', rows: [devonWelcome, jordanWelcome], counts: { in_review: 2, failed: 1, all: 6 }, budgets };
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
    { id: 'bkg_tv', title: 'Mount a TV on the wall', role: 'helper', status: 'confirmed', start: '2026-11-25T18:00:00.000Z', amountCents: 7200 },
  ],
  cases: adminCasesPageData.cases.slice(0, 1),
  rewards: [jordanWelcome],
  strikes: [],
  actions: ['suspend_helper'],
};

/** Devon, suspended after the reward review. */
export const adminUserSuspendedData: AdminUserPageData = {
  user: { ...devonRow, helperStatus: 'suspended' },
  bookings: [{ id: 'bkg_dana', title: 'Assemble a chair', role: 'helper', status: 'completed', start: '2026-11-19T17:00:00.000Z', amountCents: 3600 }],
  cases: [],
  rewards: [{ ...devonWelcome, status: 'voided', actions: [] }],
  strikes: [{ id: 'stk_devon', bookingId: 'bkg_dana', reason: 'linked_accounts', at: '2026-11-27T16:00:00.000Z' }],
  suspension: { reason: 'Shares a card with the client on their only booking.', at: '2026-11-27T16:00:00.000Z', byDisplayName: 'Taylor B.' },
  actions: ['reinstate_helper'],
};

/** A support agent sees the page but can't suspend. */
export const adminUserReadOnlyData: AdminUserPageData = { ...adminUserJordanData, actions: [] };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeAdminRewardsHandlers: AdminRewardsHandlers = { onDecide: () => wait({ ok: true, code: 'updated' }) };
export const fakeAdminUserHandlers: AdminUserHandlers = { onSuspension: () => wait({ ok: true, code: 'updated' }) };
