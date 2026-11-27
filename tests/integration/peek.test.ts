import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GET as peekHelpCenter } from '@/app/api/peek/help/route';
import { GET as peekHelpArticle } from '@/app/api/peek/help/[slug]/route';
import { GET as peekHelper } from '@/app/api/peek/helpers/[handle]/route';
import { GET as peekLegal } from '@/app/api/peek/legal/[doc]/route';
import type { HelperPeekData, HelpPeekData, LegalPeekData } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { getHelperPeek } from '@/modules/marketing/peek';
import { savedHelpers } from '@/modules/reviews/schema';
import { rateLimits } from '@/platform/rate-limit/schema';
import { newId } from '@/platform/db/ids';

/**
 * Peeks (2026-11-23, owner: "I hate redirect … you have to show new window for showing helper profile instead of
 * redirect"): what the sheet loads. A helper's profile as their public page shows it, with whether the viewer saved them
 * or is them, for signed-in people only and at a reader's pace; the help center, an article and a policy for anyone.
 * The viewer is a person of this file's own (no leftovers on the seeded cast).
 */

const { db, pool, viewer } = await vi.hoisted(async () => {
  const { createDb } = await import('@/platform/db/connect');
  const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
  return { db, pool, viewer: { current: { kind: 'public' } as Record<string, unknown> } };
});
vi.mock('@/platform/db/client', () => ({ db }));
vi.mock('@/platform/auth/viewer', () => ({ getViewer: async () => viewer.current }));
vi.mock('@/platform/auth/audience', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/platform/auth/audience')>()), requestRows: async () => 'all' }));
vi.mock('@/platform/clock', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/platform/clock')>()), requestNow: async () => new Date() }));
vi.mock('next/cache', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/cache')>()), cacheLife: () => undefined, cacheTag: () => undefined }));

const readerId = newId('usr');
const signedIn = { kind: 'user', user: { id: readerId } };

function context<Params extends Record<string, string>>(params: Params) {
  return { params: Promise.resolve(params) } as never;
}

beforeAll(async () => {
  const [ana] = await db.select().from(users).where(eq(users.id, 'usr_ana'));
  if (!ana) throw new Error('The seeded client Ana is missing');
  await db.insert(users).values({ ...ana, id: readerId, email: `peek-${readerId}@example.test`, phone: null, name: 'Pia R.', firstName: 'Pia', lastName: 'Reyes' });
});

afterAll(async () => {
  await db.delete(savedHelpers).where(eq(savedHelpers.userId, readerId));
  await db.delete(rateLimits).where(eq(rateLimits.key, `peek:${readerId}`));
  await db.delete(users).where(inArray(users.id, [readerId]));
  await pool.end();
});

describe('a helper’s peek', () => {
  it('is their public profile with Save’s state, and your own profile marked as yours', async () => {
    const before = await getHelperPeek(db, readerId, 'sam-k', 'all', new Date());
    expect(before?.profile.helper.handle).toBe('sam-k');
    expect(before).toMatchObject({ saved: false, self: false });
    await db.insert(savedHelpers).values({ userId: readerId, helperUserId: before!.profile.helper.id });
    expect((await getHelperPeek(db, readerId, 'sam-k', 'all', new Date()))?.saved).toBe(true);
    expect(await getHelperPeek(db, before!.profile.helper.id, 'sam-k', 'all', new Date())).toMatchObject({ saved: false, self: true });
    expect(await getHelperPeek(db, readerId, 'no-such-helper', 'all', new Date())).toBeNull();
  });

  it('loads for signed-in people only, never from a cache, and says when there’s no such helper', async () => {
    viewer.current = { kind: 'public' };
    const signedOut = await peekHelper(new Request('http://localhost/api/peek/helpers/sam-k'), context({ handle: 'sam-k' }));
    expect(signedOut.status).toBe(401);

    viewer.current = signedIn;
    const found = await peekHelper(new Request('http://localhost/api/peek/helpers/Sam-K'), context({ handle: 'Sam-K' }));
    expect(found.status).toBe(200);
    expect(found.headers.get('cache-control')).toBe('no-store');
    const body = (await found.json()) as HelperPeekData;
    expect(body.profile.helper.handle).toBe('sam-k');
    expect(body.self).toBe(false);
    // The request's time, for the account age.
    expect(Number.isNaN(Date.parse(body.now))).toBe(false);

    const missing = await peekHelper(new Request('http://localhost/api/peek/helpers/no-such-helper'), context({ handle: 'no-such-helper' }));
    expect(missing.status).toBe(404);
  });

  it('stops a run through every handle at 120 a minute', async () => {
    viewer.current = signedIn;
    // This window and the next are full, so the request is refused whichever minute it lands in.
    const now = Date.now();
    const windows = [Math.floor(now / 60_000) * 60_000, (Math.floor(now / 60_000) + 1) * 60_000].map((start) => new Date(start));
    for (const windowStart of windows) {
      await db.insert(rateLimits).values({ key: `peek:${readerId}`, windowStart, count: 120 }).onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: 120 } });
    }
    const limited = await peekHelper(new Request('http://localhost/api/peek/helpers/sam-k'), context({ handle: 'sam-k' }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: 'rate_limited' });
  });
});

describe('help and policy peeks', () => {
  it('read the help center and an article in the page’s language, for anyone', async () => {
    viewer.current = { kind: 'public' };
    const center = await peekHelpCenter(new Request('http://localhost/api/peek/help?locale=es'));
    expect(center.status).toBe(200);
    const centerBody = (await center.json()) as HelpPeekData;
    expect(centerBody.kind).toBe('center');
    if (centerBody.kind === 'center') expect(centerBody.data.topics.length).toBeGreaterThan(0);

    const english = await peekHelpArticle(new Request('http://localhost/api/peek/help/when-am-i-charged?locale=en'), context({ slug: 'when-am-i-charged' }));
    const englishBody = (await english.json()) as HelpPeekData;
    expect(englishBody.kind === 'article' && englishBody.data.title).toBe('When am I charged?');
    const spanish = await peekHelpArticle(new Request('http://localhost/api/peek/help/when-am-i-charged?locale=es'), context({ slug: 'when-am-i-charged' }));
    const spanishBody = (await spanish.json()) as HelpPeekData;
    expect(spanishBody.kind === 'article' && spanishBody.data.title).toBe('¿Cuándo me cobran?');
    // A language the site doesn't have reads in English.
    const other = await peekHelpArticle(new Request('http://localhost/api/peek/help/when-am-i-charged?locale=fr'), context({ slug: 'when-am-i-charged' }));
    expect(((await other.json()) as HelpPeekData).kind === 'article').toBe(true);

    const missing = await peekHelpArticle(new Request('http://localhost/api/peek/help/no-such-article'), context({ slug: 'no-such-article' }));
    expect(missing.status).toBe(404);
  });

  it('read a published policy, and nothing else', async () => {
    const terms = await peekLegal(new Request('http://localhost/api/peek/legal/terms'), context({ doc: 'terms' }));
    expect(terms.status).toBe(200);
    expect(((await terms.json()) as LegalPeekData).title).toBe('Terms of service');
    const missing = await peekLegal(new Request('http://localhost/api/peek/legal/not-a-policy'), context({ doc: 'not-a-policy' }));
    expect(missing.status).toBe(404);
  });
});
