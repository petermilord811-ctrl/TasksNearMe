import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/files/<id>` (B-061 authorization sweep): staff see private files only after this session's two-step
 * check, like every staff page. A staff role alone (a session that stopped at /admin/verify, or a stolen one
 * before the check) gets the same 404 as a stranger.
 */

const state = vi.hoisted(() => ({
  viewer: { kind: 'public' } as unknown,
  file: { id: 'fil_evidence', kind: 'evidence', ownerUserId: 'usr_maya', storageKey: 'evidence/fil_evidence.webp', contentType: 'image/webp', width: 2000, height: 1000 },
  body: Buffer.from('photo') as Buffer,
}));

vi.mock('@/platform/auth/viewer', () => ({ getViewer: async () => state.viewer }));
vi.mock('@/platform/db/client', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [state.file] }) }) }) } }));
vi.mock('@/platform/clock', () => ({ requestNow: async () => new Date('2026-11-20T18:00:00.000Z') }));
vi.mock('@/integrations/storage', () => ({ createFileStorage: () => ({ get: async () => state.body }) }));
vi.mock('@/modules/files/related-access', () => ({ canViewRelatedFile: async () => false, isCurrentProfilePhoto: async () => false }));

const { GET } = await import('@/app/api/files/[id]/route');
const fetchFile = (query = '') => GET(new Request(`http://localhost/api/files/fil_evidence${query}`), { params: Promise.resolve({ id: 'fil_evidence' }) } as never);
const person = (overrides: object) => ({ kind: 'user', user: { id: 'usr_alex', staffRoles: [], staffTwoStepVerified: false, ...overrides } });

beforeEach(() => {
  state.viewer = { kind: 'public' };
  state.body = Buffer.from('photo');
  state.file = { ...state.file, width: 2000, height: 1000 };
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

describe('smaller copies (?w=, completion plan 5.7)', () => {
  const image = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#c86432' } }).webp().toBuffer();

  it('are made after the same access check', async () => {
    state.body = await image(2000, 1000);
    expect((await fetchFile('?w=1280')).status).toBe(404);
  });

  it('fit the asked width, for the allowed widths only', async () => {
    state.viewer = person({ id: 'usr_maya' });
    state.body = await image(2000, 1000);
    const resized = await fetchFile('?w=1280');
    expect(resized.status).toBe(200);
    const bytes = Buffer.from(await resized.arrayBuffer());
    expect(await sharp(bytes).metadata()).toMatchObject({ width: 1280, height: 640, format: 'webp' });
    expect(resized.headers.get('Content-Length')).toBe(String(bytes.length));
    // Any other width: the stored file as it is.
    expect(Buffer.from(await (await fetchFile('?w=999')).arrayBuffer()).equals(state.body)).toBe(true);
  });

  it('never enlarge: a smaller image is served as stored', async () => {
    state.viewer = person({ id: 'usr_maya' });
    state.file = { ...state.file, width: 200, height: 200 };
    state.body = await image(200, 200);
    expect(Buffer.from(await (await fetchFile('?w=256')).arrayBuffer()).equals(state.body)).toBe(true);
  });
});
