import { and, eq } from 'drizzle-orm';
import type { ActionDescriptor, BookingAgreement, BookingChatActionId, BookingViewerRole, CategorySlug, PricingInput, TimeZone } from '@/contracts';
import { categories, markets } from '@/modules/markets/schema';
import { tasks } from '@/modules/tasks/schema';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import type { Db } from '@/platform/db/connect';
import { checklistFor } from './checklist';
import { dayOfActions } from './domain';
import { bookingFactsOf, bookingPolicyOf } from './facts';
import { bookingTerms, bookings } from './schema';

/**
 * A booking's conversation, 2026-11-24 (owner: "implement others all one by one"): "What we agreed" pinned on top, and the
 * day-of updates the viewer can send right now as chips above the composer. Read for one of the booking's two people
 * (anyone else: nothing); the money and the scope as the booking page projects them (ui-contract §5), never the address.
 * Kept apart from hub.ts, which the conversation's own module (messaging/service.ts) can't import back.
 */

export interface BookingChatTools {
  agreement: BookingAgreement;
  actions: ActionDescriptor<BookingChatActionId>[];
}

type TermsRow = typeof bookingTerms.$inferSelect;

const pricingOf = (terms: TermsRow): PricingInput =>
  terms.pricingType === 'hourly'
    ? { type: 'hourly', rateCents: terms.hourlyRateCents ?? 0, estimatedHours: terms.estimatedHours ?? 0, hoursCap: terms.hoursCap ?? 0 }
    : { type: 'fixed', priceCents: terms.priceCents ?? 0 };

export async function bookingChatToolsOf(db: Db, userId: string, bookingId: string, title: string, now: Date): Promise<BookingChatTools | null> {
  const [row] = await db
    .select({ booking: bookings, terms: bookingTerms, task: { mode: tasks.mode, windowStart: tasks.windowStart, windowEnd: tasks.windowEnd, flexible: tasks.flexible, expenseNote: tasks.expenseAllowanceNote }, categorySlug: categories.slug, timeZone: markets.timeZone })
    .from(bookings)
    .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .innerJoin(markets, eq(markets.id, bookings.marketId))
    .where(eq(bookings.id, String(bookingId)))
    .limit(1);
  if (!row) return null;
  const { booking, terms, task } = row;
  const role: BookingViewerRole | null = booking.posterUserId === userId ? 'poster' : booking.helperUserId === userId ? 'helper' : null;
  // As the booking page: a booking whose payment never went through isn't anyone's.
  if (!role || (booking.status === 'canceled' && booking.cancelReason === 'funding_failed')) return null;
  const remote = task.mode === 'remote';
  // Before the money comes in, the helper reads the client's text masked (security review SEC13), as on the booking page.
  const masked = role === 'helper' && !booking.confirmedAt;
  const shown = (text: string) => (masked ? maskContactDetails(text).text : text);
  const agreement: BookingAgreement = {
    bookingId: booking.id,
    title,
    categorySlug: row.categorySlug as CategorySlug,
    start: terms.startAt.toISOString(),
    window: { windowStart: task.windowStart.toISOString(), windowEnd: task.windowEnd.toISOString(), flexible: task.flexible },
    remote,
    timeZone: row.timeZone as TimeZone,
    pricing: pricingOf(terms),
    money: role === 'poster' ? { kind: 'client_total', amountCents: terms.breakdown.posterTotalCents } : { kind: 'helper_earnings', amountCents: terms.breakdown.helperEarningsCents },
    scope: shown(terms.scopeText),
    ...(terms.expenseAllowanceCents > 0 ? { expenseAllowance: { amountCents: terms.expenseAllowanceCents, description: shown(task.expenseNote ?? '') } } : {}),
    checklist: [...checklistFor(row.categorySlug)],
  };
  const actions = dayOfActions(bookingFactsOf(booking, remote), role, await bookingPolicyOf(db, booking.policyVersionId), now);
  return { agreement, actions };
}
