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
  reads: 0,
  audits: [] as Record<string, unknown>[],
}));

vi.mock('@/platform/auth/viewer', () => ({ getViewer: async () => state.viewer }));
vi.mock('@/platform/db/client', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [state.file] }) }) }),
    insert: () => ({ values: async (row: Record<string, unknown>) => void state.audits.push(row) }),
  },
}));
vi.mock('@/platform/clock', () => ({ requestNow: async () => new Date('2026-11-20T18:00:00.000Z') }));
vi.mock('@/integrations/storage', () => ({
  createFileStorage: () => ({
    get: async () => {
      state.reads += 1;
      return state.body;
    },
  }),
}));
vi.mock('@/modules/files/related-access', () => ({ canViewRelatedFile: async () => false, isCurrentProfilePhoto: async () => false }));

const { GET } = await import('@/app/api/files/[id]/route');
const { staffFileToken } = await import('@/modules/files/staff-file-token');
const { forgetResizedImages } = await import('@/modules/files/resize-cache');
const NOW = new Date('2026-11-20T18:00:00.000Z');
const tokenFor = (staffUserId: string, fileId = 'fil_evidence', expiresAt = new Date(NOW.getTime() + 30 * 60_000)) =>
  `?t=${encodeURIComponent(staffFileToken({ fileId, staffUserId, context: 'case:case_1', expiresAt }))}`;
const fetchFile = (query = '', headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/files/fil_evidence${query}`, { headers }), { params: Promise.resolve({ id: 'fil_evidence' }) } as never);
const person = (overrides: object) => ({ kind: 'user', user: { id: 'usr_alex', staffRoles: [], staffTwoStepVerified: false, ...overrides } });

beforeEach(() => {
  forgetResizedImages();
  state.reads = 0;
  state.audits = [];
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

  it('are asked for again on every use, so a browser stops showing them once access ends (security review)', async () => {
    state.viewer = person({ id: 'usr_maya' });
    const first = await fetchFile();
    expect(first.headers.get('cache-control')).toBe('private, no-cache');
    const etag = first.headers.get('etag')!;
    // Asking again with the copy's tag costs nothing while access lasts...
    expect((await fetchFile('', { 'if-none-match': etag })).status).toBe(304);
    // ...and gets nothing after it ends.
    state.viewer = { kind: 'public' };
    expect((await fetchFile('', { 'if-none-match': etag })).status).toBe(404);
  });

  it('open for staff only with a token from the page that showed them, after the two-step check (SEC24)', async () => {
    const alex = person({ staffRoles: ['support_agent'], staffTwoStepVerified: true });
    state.viewer = alex;
    // A pasted id opens nothing for staff.
    expect((await fetchFile()).status).toBe(404);
    expect((await fetchFile(tokenFor('usr_alex'))).status).toBe(200);
    expect(state.audits).toEqual([expect.objectContaining({ actorId: 'usr_alex', actorRole: 'support_agent', action: 'file.viewed', targetType: 'file', targetId: 'fil_evidence', metadata: expect.objectContaining({ context: 'case:case_1', ownerUserId: 'usr_maya' }) })]);
    // Someone else's token, another file's, an expired one, or no two-step: nothing.
    expect((await fetchFile(tokenFor('usr_morgan'))).status).toBe(404);
    expect((await fetchFile(tokenFor('usr_alex', 'fil_other'))).status).toBe(404);
    expect((await fetchFile(tokenFor('usr_alex', 'fil_evidence', new Date(NOW.getTime() - 1)))).status).toBe(404);
    state.viewer = person({ staffRoles: ['support_agent'], staffTwoStepVerified: false });
    expect((await fetchFile(tokenFor('usr_alex'))).status).toBe(404);
    // The owner needs no token, and isn't audited.
    state.viewer = person({ id: 'usr_maya' });
    state.audits = [];
    expect((await fetchFile()).status).toBe(200);
    expect(state.audits).toEqual([]);
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

  it('are kept a while: the same width again needs no read or resize (SEC23)', async () => {
    state.viewer = person({ id: 'usr_maya' });
    state.body = await image(2000, 1000);
    const first = Buffer.from(await (await fetchFile('?w=1280')).arrayBuffer());
    const again = Buffer.from(await (await fetchFile('?w=1280')).arrayBuffer());
    expect(again.equals(first)).toBe(true);
    expect(state.reads).toBe(1);
  });

  it('never enlarge: a smaller image is served as stored', async () => {
    state.viewer = person({ id: 'usr_maya' });
    state.file = { ...state.file, width: 200, height: 200 };
    state.body = await image(200, 200);
    expect(Buffer.from(await (await fetchFile('?w=256')).arrayBuffer()).equals(state.body)).toBe(true);
  });
});
