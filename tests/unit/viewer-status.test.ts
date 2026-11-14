import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A blocked account is signed out everywhere (completion plan 5.18): `getViewer` gives a suspended, banned or
 * deleted person the public viewer, even when a session of theirs is still there.
 */

const state = vi.hoisted(() => ({ status: 'active' as string | undefined }));

vi.mock('server-only', () => ({}));
vi.mock('@/platform/auth/request-headers', () => ({ authRequestHeaders: async () => new Headers() }));
vi.mock('@/platform/auth/auth', () => ({
  auth: { api: { getSession: async () => ({ session: { id: 'ses_1' }, user: { id: 'usr_x', email: 'x@example.test', name: 'X Y.', firstName: 'X', lastName: 'Y', mode: 'poster', status: state.status } }) } },
}));
vi.mock('@/platform/db/client', () => ({ db: { select: () => ({ from: () => ({ where: async () => [] }) }) } }));

const { getViewer } = await import('@/platform/auth/viewer');

beforeEach(() => {
  state.status = 'active';
});

describe('getViewer and the account status', () => {
  it('signs in an active account', async () => {
    expect(await getViewer()).toMatchObject({ kind: 'user', user: { id: 'usr_x', status: 'active' } });
  });

  it.each(['suspended', 'banned', 'deleted'])('treats a %s account as signed out', async (status) => {
    state.status = status;
    expect(await getViewer()).toEqual({ kind: 'public' });
  });
});
