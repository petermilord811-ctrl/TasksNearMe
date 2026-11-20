import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A blocked account is signed out everywhere (completion plan 5.18): `getViewer` gives a suspended, banned or
 * deleted person the public viewer, even when a session of theirs is still there. So does an account that hasn't
 * finished signing up (security review SEC18), from its row, not the session.
 */

const finishedAccount = () => ({ firstName: 'X', lastName: 'Y', adultAttestedAt: new Date('2026-11-01T00:00:00Z'), termsAcceptedAt: new Date('2026-11-01T00:00:00Z'), phoneVerifiedAt: null });
const state = vi.hoisted(() => ({ status: 'active' as string | undefined, account: null as Record<string, unknown> | null }));

vi.mock('server-only', () => ({}));
vi.mock('@/platform/auth/request-headers', () => ({ authRequestHeaders: async () => new Headers() }));
vi.mock('@/platform/auth/auth', () => ({
  auth: { api: { getSession: async () => ({ session: { id: 'ses_1' }, user: { id: 'usr_x', email: 'x@example.test', name: 'X Y.', firstName: 'X', lastName: 'Y', mode: 'poster', status: state.status } }) } },
}));
// Every query finds nothing, but the account's own row.
vi.mock('@/platform/db/client', async () => {
  const { getTableName } = await import('drizzle-orm');
  return { db: { select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => ({ where: async () => (getTableName(table) === 'users' && state.account ? [state.account] : []) }) }) } };
});
// The person's home-market zone (completion plan 8.1): Austin's.
vi.mock('@/modules/markets/time-zone', () => ({ userTimeZone: async () => 'America/Chicago' }));

const { getSessionAccountId, getViewer } = await import('@/platform/auth/viewer');

beforeEach(() => {
  state.status = 'active';
  state.account = finishedAccount();
});

describe('getViewer and the account status', () => {
  it('signs in an active account', async () => {
    expect(await getViewer()).toMatchObject({ kind: 'user', user: { id: 'usr_x', status: 'active' } });
  });

  it.each(['suspended', 'banned', 'deleted'])('treats a %s account as signed out', async (status) => {
    state.status = status;
    expect(await getViewer()).toEqual({ kind: 'public' });
    expect(await getSessionAccountId()).toBeNull();
  });
});

describe('getViewer and an unfinished sign-up (security review SEC18)', () => {
  it.each([
    ['no accepted terms', { termsAcceptedAt: null }],
    ['no 18+ check', { adultAttestedAt: null }],
    ['no name', { firstName: '', lastName: '' }],
  ])('treats an account with %s as signed out', async (_label, missing) => {
    state.account = { ...finishedAccount(), ...missing };
    expect(await getViewer()).toEqual({ kind: 'public' });
    // Its privacy requests still know whose they are.
    expect(await getSessionAccountId()).toBe('usr_x');
  });
});
