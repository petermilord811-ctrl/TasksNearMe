import { and, eq } from 'drizzle-orm';
import type { AiAssistResult, AppLocale, BookingChecklist, BookingPrepView, BookingStatus, BookingView } from '@/contracts';
import type { BookingPrepper } from '@/integrations/ai/booking-prepper';
import { bookings } from '@/modules/bookings/schema';
import { markets } from '@/modules/markets/schema';
import { tasks } from '@/modules/tasks/schema';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import type { Db } from '@/platform/db/connect';
import { formatDateTime } from '@/shared/format';
import { aiDraftingEnabledFor, aiDraftingFlag } from './availability';
import { asAiResult, inputHash, overLimit, UNAVAILABLE } from './ai-run';
import { aiResults } from './schema';

/**
 * "Get ready" on a booking (2026-11-24; src/contracts/ai-assist.ts): the viewer's checklist for the day, made with AI
 * when they ask and kept per booking, role and language, so it's there on every visit without asking a model again.
 * It's made from the booking as the viewer sees it (the agreed scope, the time, remote or not) and the task's details;
 * never the address. When any of that changes, the kept one is stale and the page offers a fresh one.
 */

export const BOOKING_PREP_KIND = 'booking_prep';
/** Checklists per person an hour. */
export const BOOKING_PREP_RULE = { limit: 12, windowSeconds: 60 * 60 };
/** Bookings still ahead of their day's work: a checklist helps until the work is done. */
export const PREP_STATUSES: readonly BookingStatus[] = ['pending_funding', 'scheduled', 'confirmed', 'in_progress'];

export function prepOffered(view: Pick<BookingView, 'status'>): boolean {
  return PREP_STATUSES.includes(view.status);
}

async function taskFacts(db: Db, view: BookingView): Promise<{ details: string[]; timeZone: string }> {
  const [row] = await db
    .select({ details: tasks.details, timeZone: markets.timeZone })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(markets, eq(markets.id, bookings.marketId))
    .where(eq(bookings.id, view.id))
    .limit(1);
  const details = Object.entries(row?.details ?? {})
    .filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`);
  return { details, timeZone: row?.timeZone ?? 'America/New_York' };
}

/** What a checklist is made from: when any of it changes, the kept one is stale. */
function sourceOf(view: BookingView, details: string[]) {
  const pricing = view.terms.pricing;
  return {
    title: view.task.title,
    scope: view.terms.scopeText,
    start: view.terms.start,
    window: [view.task.schedule.windowStart, view.task.schedule.windowEnd, view.task.schedule.flexible],
    remote: view.location.kind === 'remote',
    hours: pricing.type === 'hourly' ? pricing.estimatedHours : null,
    details,
  };
}

function keyOf(view: BookingView, locale: AppLocale) {
  return and(eq(aiResults.kind, BOOKING_PREP_KIND), eq(aiResults.subjectId, view.id), eq(aiResults.variant, view.viewerRole), eq(aiResults.locale, locale));
}

const isChecklist = (content: unknown): content is { items: string[] } =>
  Boolean(content && Array.isArray((content as { items?: unknown }).items) && (content as { items: unknown[] }).items.every((item) => typeof item === 'string'));

/** The hub's "Get ready" for this viewer: absent when it doesn't apply or AI is off for them. */
export async function bookingPrepViewFor(db: Db, userId: string, view: BookingView, locale: AppLocale): Promise<BookingPrepView | undefined> {
  if (!prepOffered(view) || !(await aiDraftingEnabledFor(db, userId))) return undefined;
  const [stored] = await db.select({ inputHash: aiResults.inputHash, content: aiResults.content, createdAt: aiResults.createdAt }).from(aiResults).where(keyOf(view, locale)).limit(1);
  if (!stored || !isChecklist(stored.content)) return {};
  const { details } = await taskFacts(db, view);
  const checklist: BookingChecklist = { items: stored.content.items, madeAt: stored.createdAt.toISOString() };
  return stored.inputHash === inputHash(sourceOf(view, details)) ? { checklist } : { checklist, stale: true };
}

/**
 * "Make my checklist": for either person on a booking that's still ahead (`view` is the booking as they see it, loaded
 * with its access rules). Kept for them; sent to nobody.
 */
export async function prepareBookingChecklist(
  { db, prepper, now }: { db: Db; prepper: BookingPrepper | null; now: Date },
  userId: string,
  view: BookingView,
  locale: AppLocale,
): Promise<AiAssistResult<BookingChecklist>> {
  if (!prepper || !(await aiDraftingFlag(db, userId))) return UNAVAILABLE;
  if (!prepOffered(view)) return { ok: false, code: 'not_allowed' };
  const limited = await overLimit(db, `assist:prep:${userId}`, BOOKING_PREP_RULE, now);
  if (limited) return limited;
  const { details, timeZone } = await taskFacts(db, view);
  const other = view.viewerRole === 'poster' ? view.helper : view.poster;
  return asAiResult('assist-prep', 'form', async () => {
    const steps = await prepper.checklist({
      role: view.viewerRole,
      categorySlug: view.task.categorySlug,
      title: view.task.title,
      scope: view.terms.scopeText,
      details,
      startLabel: formatDateTime(view.terms.start, locale, timeZone),
      ...(view.terms.pricing.type === 'hourly' ? { hours: view.terms.pricing.estimatedHours } : {}),
      remote: view.location.kind === 'remote',
      otherFirstName: other.deleted ? '' : (other.displayName.split(/\s+/)[0] ?? ''),
      locale,
    });
    const items = steps.map((step) => maskContactDetails(step).text);
    const content = { items };
    const hash = inputHash(sourceOf(view, details));
    await db
      .insert(aiResults)
      .values({ kind: BOOKING_PREP_KIND, subjectId: view.id, variant: view.viewerRole, locale, inputHash: hash, content, model: prepper.name, createdAt: now })
      .onConflictDoUpdate({ target: [aiResults.kind, aiResults.subjectId, aiResults.variant, aiResults.locale], set: { inputHash: hash, content, model: prepper.name, createdAt: now } });
    return { items, madeAt: now.toISOString() };
  });
}
