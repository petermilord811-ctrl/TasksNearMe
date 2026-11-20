import { beforeEach, describe, expect, it, vi } from 'vitest';

/** An invite link keeps only a code that exists (security review SEC23): another site can't fill the step with any text. */
vi.hoisted(() => {
  process.env.FIELD_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
  process.env.BETTER_AUTH_SECRET ||= 'test-secret-for-invite-links';
});
const state = vi.hoisted(() => ({ invite: undefined as { role: string } | undefined, set: [] as string[] }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000' }),
  cookies: async () => ({ set: (name: string, value: string) => void state.set.push(`${name}=${value}`), get: () => undefined }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock('@/platform/db/client', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => (state.invite ? [state.invite] : []) }) }) }) } }));

const { GET } = await import('@/app/[locale]/(public)/invite/[code]/route');
const visit = (code: string) => GET(new Request(`http://localhost/invite/${code}`), { params: Promise.resolve({ locale: 'en', code }) } as never).catch((error: Error) => error.message);

beforeEach(() => {
  state.set = [];
  state.invite = undefined;
});

describe('an invite link', () => {
  it('keeps a code that exists, and goes on to sign-in', async () => {
    state.invite = { role: 'member' };
    expect(await visit('GNV2026')).toMatch(/^redirect \/sign-in/);
    expect(state.set).toEqual([expect.stringMatching(/=GNV2026$/)]);
  });

  it('keeps nothing for a code that doesn’t exist', async () => {
    expect(await visit('MADEUP99')).toMatch(/^redirect \/sign-in/);
    expect(state.set).toEqual([]);
  });
});
