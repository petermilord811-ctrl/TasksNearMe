import { and, eq } from 'drizzle-orm';
import { rateSupportInputSchema, SUPPORT_RATING_CHANGE_DAYS, type ActionResult, type RateSupportInput, type SupportRating, type SupportRatingView } from '@/contracts';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { STAFF_SUPPORT_CHANNEL } from '@/platform/realtime/hub';
import { publishNotices } from '@/platform/realtime/publish';
import { supportCaseEvents, supportCases } from './schema';

/**
 * Rating the help a member got (2026-11-23, owner: "Live support: rate the chat afterwards"). The member who opened a
 * case rates it once its live chat ended or the case is resolved or closed: good or bad, with a comment if they like.
 * One rating per case, kept as a case event of its own kind (`rating`; staff only in the conversation lists, so it never
 * shows as a message), which they can change for `SUPPORT_RATING_CHANGE_DAYS` after first giving it. Support staff on
 * duty hear it (`support.rated`), and see it in the case's timeline and on the live chat console.
 */

const DAY_MS = 86_400_000;
/** Ratings and changes per person: a person's pace, not a script's. */
const RATE_RULE = { limit: 20, windowSeconds: 60 * 60 };
const FINISHED = new Set(['resolved', 'closed']);

type CaseRow = typeof supportCases.$inferSelect;
type EventRow = typeof supportCaseEvents.$inferSelect;

/** There's help to rate: the live chat ended, or the case is resolved or closed. */
export function caseRateable(row: Pick<CaseRow, 'status' | 'liveEndedAt'>): boolean {
  return row.liveEndedAt !== null || FINISHED.has(row.status);
}

const ratingOf = (event: Pick<EventRow, 'meta'>): SupportRating => (event.meta?.rating === 'bad' ? 'bad' : 'good');

/**
 * What the member sees about rating a case: nothing for anyone but the person who opened it, or before there's help to
 * rate; then "How did we do?", then their rating, changeable until `changeUntil`.
 */
export function supportRatingView(input: { isOpener: boolean; rateable: boolean; given?: Pick<EventRow, 'meta' | 'body' | 'createdAt'>; now: Date }): SupportRatingView | undefined {
  if (!input.isOpener) return undefined;
  if (!input.given) return input.rateable ? { canRate: true } : undefined;
  const changeUntil = new Date(input.given.createdAt.getTime() + SUPPORT_RATING_CHANGE_DAYS * DAY_MS);
  const comment = input.given.body?.trim();
  return {
    given: { rating: ratingOf(input.given), ...(comment ? { comment } : {}), at: input.given.createdAt.toISOString() },
    canRate: input.now < changeUntil,
    changeUntil: changeUntil.toISOString(),
  };
}

/** The member's rating of a case, if they gave one. */
export async function givenRating(db: Db, caseId: string, userId: string): Promise<EventRow | undefined> {
  const [row] = await db
    .select()
    .from(supportCaseEvents)
    .where(and(eq(supportCaseEvents.caseId, caseId), eq(supportCaseEvents.kind, 'rating'), eq(supportCaseEvents.authorUserId, userId)))
    .limit(1);
  return row;
}

/** The rating view of a case row for a member (`SupportCasePageData.rating`, `HelpCaseView.rating`). */
export async function ratingViewFor(db: Db, row: CaseRow, userId: string, now: Date): Promise<SupportRatingView | undefined> {
  if (row.openedByUserId !== userId) return undefined;
  const given = await givenRating(db, row.id, userId);
  return supportRatingView({ isOpener: true, rateable: caseRateable(row), ...(given ? { given } : {}), now });
}

/** `SupportCaseHandlers.onRate`: ok `saved`. */
export async function rateSupportCase(db: Db, userId: string, caseId: string, input: RateSupportInput, now: Date): Promise<ActionResult> {
  const parsed = rateSupportInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [row] = await db.select().from(supportCases).where(eq(supportCases.id, String(caseId))).limit(1);
  if (!row || row.openedByUserId !== userId) return { ok: false, code: 'not_allowed' };
  const given = await givenRating(db, row.id, userId);
  if (!given && !caseRateable(row)) return { ok: false, code: 'not_allowed' };
  if (given && now.getTime() >= given.createdAt.getTime() + SUPPORT_RATING_CHANGE_DAYS * DAY_MS) return { ok: false, code: 'expired' };
  const limited = await consumeRateLimit(db, `support-rating:${userId}`, RATE_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const comment = parsed.data.comment?.trim() || null;
  if (given) {
    await db
      .update(supportCaseEvents)
      .set({ body: comment, meta: { ...given.meta, rating: parsed.data.rating, changedAt: now.toISOString() } })
      .where(eq(supportCaseEvents.id, given.id));
  } else {
    await db.insert(supportCaseEvents).values({
      id: newId('cev'),
      caseId: row.id,
      kind: 'rating',
      authorUserId: userId,
      partyUserId: userId,
      // Never one of the member's messages: the conversation lists read `participants` events only.
      visibility: 'internal',
      body: comment,
      meta: { rating: parsed.data.rating },
      createdAt: now,
    });
  }
  await publishNotices(db, [{ channel: STAFF_SUPPORT_CHANNEL, notice: { type: 'update', event: 'support.rated', case: row.id } }]);
  return { ok: true, code: 'saved' };
}
