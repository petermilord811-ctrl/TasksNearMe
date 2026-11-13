import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/files/<id>` (B-061 authorization sweep): staff see private files only after this session's two-step
 * check, like every staff page. A staff role alone (a session that stopped at /admin/verify, or a stolen one
 * before the check) gets the same 404 as a stranger.
 */

const state = vi.hoisted(() => ({
  viewer: { kind: 'public' } as unknown,
  file: { id: 'fil_evidence', kind: 'evidence', ownerUserId: 'usr_maya', storageKey: 'evidence/fil_evidence.webp', contentType: 'image/webp' },
}));

vi.mock('@/platform/auth/viewer', () => ({ getViewer: async () => state.viewer }));
vi.mock('@/platform/db/client', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [state.file] }) }) }) } }));
vi.mock('@/platform/clock', () => ({ requestNow: async () => new Date('2026-11-20T18:00:00.000Z') }));
vi.mock('@/integrations/storage', () => ({ createFileStorage: () => ({ get: async () => Buffer.from('photo') }) }));
vi.mock('@/modules/files/related-access', () => ({ canViewRelatedFile: async () => false, isCurrentProfilePhoto: async () => false }));

const { GET } = await import('@/app/api/files/[id]/route');
const fetchFile = () => GET(new Request('http://localhost/api/files/fil_evidence'), { params: Promise.resolve({ id: 'fil_evidence' }) } as never);
const person = (overrides: object) => ({ kind: 'user', user: { id: 'usr_alex', staffRoles: [], staffTwoStepVerified: false, ...overrides } });

beforeEach(() => {
  state.viewer = { kind: 'public' };
});

describe('private files', () => {
  it('are not found for strangers and for other members', async () => {
    expect((await fetchFile()).status).toBe(404);
    state.viewer = person({ id: 'usr_jordan' });
    expect((await fetchFile()).status).toBe(404);
  });

  it('open for their owner', async () => {
    state.viewer = person({ id: 'usr_maya' });
    expect((await fetchFile()).status).toBe(200);
  });

  it('open for staff only after the two-step check', async () => {
    state.viewer = person({ staffRoles: ['support_agent'], staffTwoStepVerified: false });
    expect((await fetchFile()).status).toBe(404);
    state.viewer = person({ staffRoles: ['support_agent'], staffTwoStepVerified: true });
    expect((await fetchFile()).status).toBe(200);
  });
});
