import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiRefusedError } from '@/integrations/ai';
import { createFakeOfferWriter, type OfferFacts, type OfferMessageWriter } from '@/integrations/ai/offer-writer';
import { createFakeProfileWriter, type ProfileFacts, type ProfileWriter } from '@/integrations/ai/profile-writer';
import { aiDraftingEnabledFor } from '@/modules/assist/availability';
import { draftHelperProfile, draftOfferMessage } from '@/modules/assist/service';
import { featureFlags } from '@/modules/markets/schema';
import { getHelperTaskView } from '@/modules/offers/helper';
import { tasks } from '@/modules/tasks/schema';
import { getProfileEditorData } from '@/modules/verification/service';
import { createDb } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * Writing help for helpers (src/modules/assist): facts from the database, the `ai_drafting` flag, limits,
 * prohibited words, masking. Stand-in writers record what they were given; Claude is never called.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());
const now = () => new Date();

function recordingProfileWriter(answer?: { headline: string; bio: string }) {
  const seen: ProfileFacts[] = [];
  const writer: ProfileWriter = {
    name: 'recording',
    async draft(facts) {
      seen.push(facts);
      return answer ?? createFakeProfileWriter().draft(facts);
    },
  };
  return { writer, seen };
}

function recordingOfferWriter(answer?: string | Error) {
  const seen: OfferFacts[] = [];
  const writer: OfferMessageWriter = {
    name: 'recording',
    async draft(facts) {
      seen.push(facts);
      if (answer instanceof Error) throw answer;
      return answer ?? createFakeOfferWriter().draft(facts);
    },
  };
  return { writer, seen };
}

async function setAustinFlag(enabled: boolean | null) {
  await db.delete(featureFlags).where(and(eq(featureFlags.key, 'ai_drafting'), eq(featureFlags.marketId, 'mkt_austin')));
  if (enabled !== null) await db.insert(featureFlags).values({ key: 'ai_drafting', marketId: 'mkt_austin', enabled, description: 'test' });
}

/** A copy of the seeded desk, posted by Chris, so Jordan can offer on it without touching shared rows. */
const TASK = 'tsk_assist_test';
beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  if (!desk) throw new Error('The seeded desk task is missing');
  await db.delete(tasks).where(eq(tasks.id, TASK));
  await db.insert(tasks).values({
    ...desk,
    id: TASK,
    slug: 'assist-test-desk',
    posterUserId: 'usr_chris',
    status: 'open',
    offerCount: 0,
    version: 1,
    description: 'Flat-pack standing desk. Text me at 512-555-0199 or desk@example.test before you come.',
  });
  await db.delete(rateLimits).where(eq(rateLimits.key, 'assist:profile:usr_sam'));
});

describe("drafting a helper's profile", () => {
  it('builds on what the database says about them, and masks contact details both ways', async () => {
    const { writer, seen } = recordingProfileWriter({ headline: 'Furniture assembly in Hyde Park', bio: 'Hi! Reach me at 512-555-0142 to book. I bring my own drill and tidy up after.' });
    const result = await draftHelperProfile({ db, writer, now: now() }, 'usr_sam', { notes: 'Tidy and careful. Email sam@example.test' });
    expect(result).toEqual({ ok: true, draft: { headline: 'Furniture assembly in Hyde Park', bio: 'Hi! Reach me at [hidden] to book. I bring my own drill and tidy up after.' } });
    const facts = seen[0]!;
    expect(facts.firstName).toBe('Sam');
    expect(facts.services.map((service) => service.categorySlug)).toContain('furniture-assembly');
    expect(facts.notes).toBe('Tidy and careful. Email [hidden]');
    expect(facts.languages).toContain('English');
    expect(facts.current?.headline).toBeTruthy();
  });

  it('refuses prohibited notes and Claude refusals, and limits drafts to 10 an hour', async () => {
    expect(await draftHelperProfile({ db, writer: recordingProfileWriter().writer, now: now() }, 'usr_sam', { notes: 'I can also help with firearms' })).toEqual({ ok: false, code: 'prohibited' });
    const refusing: ProfileWriter = { name: 'refusing', draft: async () => { throw new AiRefusedError(); } };
    expect(await draftHelperProfile({ db, writer: refusing, now: now() }, 'usr_sam', { notes: '' })).toEqual({ ok: false, code: 'prohibited' });
    const results = [];
    for (let i = 0; i < 10; i += 1) results.push(await draftHelperProfile({ db, writer: recordingProfileWriter().writer, now: now() }, 'usr_sam', { notes: '' }));
    expect(results.at(-1)).toEqual({ ok: false, code: 'rate_limited' });
  });

  it('follows the ai_drafting flag, and the editor says whether to offer it', async () => {
    try {
      await setAustinFlag(false);
      expect(await aiDraftingEnabledFor(db, 'usr_jordan')).toBe(false);
      expect((await getProfileEditorData(db, 'usr_jordan', now()))?.aiDraftingEnabled).toBe(false);
      expect(await draftHelperProfile({ db, writer: recordingProfileWriter().writer, now: now() }, 'usr_jordan', { notes: '' })).toEqual({ ok: false, code: 'unavailable' });
      await setAustinFlag(true);
      expect((await getProfileEditorData(db, 'usr_jordan', now()))?.aiDraftingEnabled).toBe(true);
      expect(await draftHelperProfile({ db, writer: null, now: now() }, 'usr_jordan', { notes: '' })).toEqual({ ok: false, code: 'unavailable' });
    } finally {
      await setAustinFlag(null);
    }
  });
});

describe('drafting an offer message', () => {
  it('reads the task as the helper sees it (contact details masked), with their chosen start and what they bring', async () => {
    const view = await getHelperTaskView(db, 'usr_jordan', TASK, now());
    expect(view?.aiDraftingEnabled).toBe(true);
    const start = view!.offerRules.startTimes[1]!;
    const { writer, seen } = recordingOfferWriter('Hi! I can be there on time. Call 512-555-0142 if anything changes.');
    const result = await draftOfferMessage({ db, writer, now: now() }, 'usr_jordan', TASK, { startTime: start, brings: [' Drill ', 'x'.repeat(60), 7 as unknown as string], notes: 'have a level' });
    expect(result).toEqual({ ok: true, message: 'Hi! I can be there on time. Call [hidden] if anything changes.' });
    const facts = seen[0]!;
    expect(facts.task.title).toBe(view!.task.title);
    expect(facts.task.description).toContain('[hidden]');
    expect(facts.task.description).not.toMatch(/512-555-0199|desk@example\.test/);
    expect(facts.startLabel).toMatch(/^\d{1,2}:\d{2} (am|pm)$/);
    expect(facts.brings).toEqual(['Drill', 'x'.repeat(40)]);
    expect(facts.notes).toBe('have a level');
    expect(facts.maxLength).toBe(view!.offerRules.messageMaxLength);
  });

  it("leaves the start out when it isn't one of the task's times", async () => {
    const { writer, seen } = recordingOfferWriter();
    const result = await draftOfferMessage({ db, writer, now: now() }, 'usr_jordan', TASK, { startTime: '03:00', brings: [] });
    expect(result.ok).toBe(true);
    expect(seen[0]!.startLabel).toBeUndefined();
  });

  it("is unavailable on a task the helper can't offer on, and for their own or missing tasks", async () => {
    const { writer, seen } = recordingOfferWriter();
    expect(await draftOfferMessage({ db, writer, now: now() }, 'usr_priya', TASK, { startTime: '', brings: [] })).toEqual({ ok: false, code: 'unavailable' });
    expect(await draftOfferMessage({ db, writer, now: now() }, 'usr_chris', TASK, { startTime: '', brings: [] })).toEqual({ ok: false, code: 'unavailable' });
    expect(await draftOfferMessage({ db, writer, now: now() }, 'usr_jordan', 'tsk_missing', { startTime: '', brings: [] })).toEqual({ ok: false, code: 'unavailable' });
    expect(seen).toHaveLength(0);
  });
});
