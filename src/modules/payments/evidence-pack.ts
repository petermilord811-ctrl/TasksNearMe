import { and, asc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { routes, type PaymentStatus, type PriceBreakdown } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookingCompletionPhotos, bookingCompletions, bookingTerms, bookings } from '@/modules/bookings/schema';
import { checklistView } from '@/modules/bookings/checklist';
import { journalsOfBooking } from '@/modules/ledger/journal';
import { messages, threads } from '@/modules/messaging/schema';
import { reviews } from '@/modules/reviews/schema';
import type { StaffActor } from '@/modules/support/staff';
import { isoOf } from '@/modules/support/staff-audit';
import { findTaskWithPublicView } from '@/modules/tasks/queries';
import { toMessageSegments } from '@/modules/trust/message-segments';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { payments, refunds } from './schema';
import { shownPaymentStatus } from './shown-status';

/**
 * The chargeback evidence pack (T-18; blueprint 04 §6: the platform contests a chargeback with "the approval log,
 * completion photos, messages, check-in"): one JSON file finance downloads from `routes.api.evidencePack` and
 * submits with its answer in the Stripe Dashboard. Finance and admins only, only for a booking whose charge a
 * client's bank disputed, and every download goes to the audit log. It leaves the exact address out (that needs
 * its own reason, blueprint 08); photos are staff links (`/api/files/…`). The pack leaves the platform (Stripe,
 * the card issuer), so phone numbers and emails in what people wrote are hidden, as in a thread before booking.
 */

export interface ChargebackEvidencePack {
  pack: { kind: 'chargeback_evidence'; version: 1; generatedAt: string; generatedBy: { id: string; role: string } };
  disputes: { disputeId: string; status: PaymentStatus; paymentId: string; stripePaymentIntent: string | null; purpose: string; amountCents: number; card: { brand: string | null; last4: string | null }; paidAt: string }[];
  booking: { id: string; title: string; category: string; area: string; status: string; bookedAt: string | null; start: string; completedAt: string | null };
  client: { id: string; name: string; email: string; memberSince: string };
  helper: { id: string; displayName: string };
  /** The terms both people agreed to (the current version) and what the client was charged. */
  terms: {
    version: number;
    agreedAt: string;
    pricingType: string;
    priceCents: number | null;
    hourlyRateCents: number | null;
    estimatedHours: number | null;
    hoursCap: number | null;
    expenseAllowanceCents: number;
    scope: string;
    breakdown: PriceBreakdown;
  };
  checkIn: { onMyWayAt: string | null; arrivedAt: string | null; lateByMinutes: number | null };
  completion: {
    submittedAt: string;
    note: string;
    hoursWorked: number | null;
    checklist: { item: string; done: boolean }[];
    photos: { fileId: string; url: string }[];
    finalBreakdown: PriceBreakdown;
  } | null;
  /** `via`: client, automatic (the client didn't answer in time), support or settlement. */
  approval: { approvedAt: string; via: string } | null;
  /** What each person did on the booking, in order (the audit log). */
  log: { at: string; action: string; by: 'client' | 'helper' | 'system' }[];
  /** The conversation before and after booking, as written, with photos as links. */
  messages: { at: string; thread: string; from: 'client' | 'helper' | 'system'; kind: string; text: string; photos: string[] }[];
  reviewByClient: { rating: number; body: string | null; at: string } | null;
  refunds: { amountCents: number; reason: string; status: string; at: string }[];
  /** The platform's ledger for the booking (a lost chargeback's `chargeback_loss` journal). */
  ledger: { kind: string; at: string; memo: string; entries: { account: string; debitCents: number; creditCents: number }[] }[];
}

/** Who may download it (blueprint 08: chargeback evidence is finance's). */
export const canDownloadEvidencePack = (staff: StaffActor) => staff.roles.includes('finance') || staff.roles.includes('admin');

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

/** A dispute that is open, or was won or lost; an inquiry that closed without a chargeback clears it (stripe-webhooks.ts). */
export const LIVE_DISPUTE_STATUSES = ['open', 'won', 'lost'] as const;

/** What a hidden detail reads as in the pack. */
const HIDDEN_AS = { phone: '[phone number hidden]', email: '[email hidden]', link: '[link hidden]', handle: '[username hidden]' } as const;

/** What someone wrote, with phone numbers, emails, links and usernames replaced (src/modules/trust/message-segments.ts). */
function withoutContacts(text: string): string {
  return toMessageSegments(text, { mask: true })
    .map((segment) => (segment.kind === 'text' ? segment.text : segment.kind === 'mention' ? `@${segment.name}` : HIDDEN_AS[segment.detail]))
    .join('');
}
const APPROVAL_VIA: Record<string, string> = { poster: 'client', auto: 'automatic', support: 'support', settlement: 'settlement' };

/** The pack for finance, audited; null for anyone else, an unknown booking, or a booking never charged back. */
export async function chargebackEvidencePack(db: Db, staff: StaffActor, bookingId: string, now: Date): Promise<{ filename: string; pack: ChargebackEvidencePack } | null> {
  if (!canDownloadEvidencePack(staff)) return null;
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, String(bookingId))).limit(1);
  if (!booking) return null;
  const disputed = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, booking.id), isNotNull(payments.disputeId), inArray(payments.disputeStatus, [...LIVE_DISPUTE_STATUSES])))
    .orderBy(asc(payments.createdAt));
  if (disputed.length === 0) return null;

  const threadLinks = [and(eq(threads.kind, 'booking'), eq(threads.linkedId, booking.id))];
  if (booking.offerId) threadLinks.push(and(eq(threads.kind, 'offer'), eq(threads.linkedId, booking.offerId)));
  if (booking.seriesId) threadLinks.push(and(eq(threads.kind, 'series'), eq(threads.linkedId, booking.seriesId)));
  const [found, [terms], [completion], photos, people, logRows, threadRows, [review], refundRows, ledger] = await Promise.all([
    findTaskWithPublicView(db, booking.taskId),
    db.select().from(bookingTerms).where(and(eq(bookingTerms.bookingId, booking.id), eq(bookingTerms.version, booking.termsVersion))).limit(1),
    db.select().from(bookingCompletions).where(eq(bookingCompletions.bookingId, booking.id)).limit(1),
    db.select({ fileId: bookingCompletionPhotos.fileId }).from(bookingCompletionPhotos).where(eq(bookingCompletionPhotos.bookingId, booking.id)).orderBy(asc(bookingCompletionPhotos.position)),
    db.select().from(users).where(inArray(users.id, [booking.posterUserId, booking.helperUserId])),
    db.select().from(auditLog).where(and(eq(auditLog.targetType, 'booking'), eq(auditLog.targetId, booking.id))).orderBy(asc(auditLog.at)),
    db.select().from(threads).where(or(...threadLinks)),
    db.select().from(reviews).where(and(eq(reviews.bookingId, booking.id), eq(reviews.authorUserId, booking.posterUserId))).limit(1),
    db.select().from(refunds).where(eq(refunds.bookingId, booking.id)).orderBy(asc(refunds.createdAt)),
    journalsOfBooking(db, booking.id),
  ]);
  const client = people.find((user) => user.id === booking.posterUserId);
  const helper = people.find((user) => user.id === booking.helperUserId);
  if (!found || !terms || !client || !helper) return null;
  const threadKind = new Map(threadRows.map((thread) => [thread.id, thread.kind]));
  const messageRows = threadRows.length > 0 ? await db.select().from(messages).where(inArray(messages.threadId, threadRows.map((thread) => thread.id))).orderBy(asc(messages.createdAt)) : [];
  const roleOf = (userId: string | null | undefined): 'client' | 'helper' | 'system' => (userId === booking.posterUserId ? 'client' : userId === booking.helperUserId ? 'helper' : 'system');
  const fileUrl = (fileId: string) => `/api/files/${encodeURIComponent(fileId)}`;
  const checklist = completion ? checklistView(found.view.categorySlug, completion.checklist) : undefined;

  // The role that allows the download, for the pack and its audit row (not whichever role is listed first).
  const role = staff.roles.includes('finance') ? 'finance' : 'admin';
  const pack: ChargebackEvidencePack = {
    pack: { kind: 'chargeback_evidence', version: 1, generatedAt: now.toISOString(), generatedBy: { id: staff.id, role } },
    disputes: disputed.map((payment) => ({
      disputeId: payment.disputeId!,
      status: shownPaymentStatus(payment),
      paymentId: payment.id,
      stripePaymentIntent: payment.providerRef,
      purpose: payment.purpose,
      amountCents: payment.amountCents,
      card: { brand: payment.methodBrand, last4: payment.methodLast4 },
      paidAt: payment.createdAt.toISOString(),
    })),
    booking: {
      id: booking.id,
      title: found.view.title,
      category: found.view.categorySlug,
      area: found.view.location.kind === 'local' ? found.view.location.areaName : 'Remote',
      status: booking.status,
      bookedAt: iso(booking.confirmedAt),
      start: booking.startAt.toISOString(),
      completedAt: iso(booking.completedAt),
    },
    client: { id: client.id, name: [client.firstName, client.lastName].filter(Boolean).join(' ') || client.name, email: client.email, memberSince: client.createdAt.toISOString() },
    helper: { id: helper.id, displayName: helper.name },
    terms: {
      version: terms.version,
      agreedAt: terms.createdAt.toISOString(),
      pricingType: terms.pricingType,
      priceCents: terms.priceCents,
      hourlyRateCents: terms.hourlyRateCents,
      estimatedHours: terms.estimatedHours,
      hoursCap: terms.hoursCap,
      expenseAllowanceCents: terms.expenseAllowanceCents,
      scope: withoutContacts(terms.scopeText),
      breakdown: terms.breakdown,
    },
    checkIn: { onMyWayAt: iso(booking.onMyWayAt), arrivedAt: iso(booking.arrivedAt), lateByMinutes: booking.lateByMinutes },
    completion: completion
      ? {
          submittedAt: completion.submittedAt.toISOString(),
          note: withoutContacts(completion.note),
          hoursWorked: completion.hoursWorked,
          checklist: (checklist?.items ?? []).map((item) => ({ item: item.key, done: item.done })),
          photos: photos.map((photo) => ({ fileId: photo.fileId, url: fileUrl(photo.fileId) })),
          finalBreakdown: completion.finalBreakdown,
        }
      : null,
    approval: booking.completedAt && booking.completedVia ? { approvedAt: booking.completedAt.toISOString(), via: APPROVAL_VIA[booking.completedVia] ?? booking.completedVia } : null,
    // The people's own steps and the system's (staff's look-ups and their reasons stay out).
    log: logRows
      .filter((row) => row.action.startsWith('booking.') && (row.actorRole === 'user' || row.actorRole === 'system'))
      .map((row) => ({ at: isoOf(row.at), action: row.action, by: row.actorRole === 'user' ? roleOf(row.actorId) : 'system' })),
    messages: messageRows.map((row) => ({
      at: row.createdAt.toISOString(),
      thread: threadKind.get(row.threadId) ?? 'booking',
      from: roleOf(row.senderUserId),
      kind: row.kind,
      text: row.body ? withoutContacts(row.body) : row.event ? row.event.type : '',
      photos: row.attachmentFileIds.map(fileUrl),
    })),
    reviewByClient: review ? { rating: review.rating, body: review.body === null ? null : withoutContacts(review.body), at: review.createdAt.toISOString() } : null,
    refunds: refundRows.map((row) => ({ amountCents: row.amountCents, reason: row.reason, status: row.status, at: row.createdAt.toISOString() })),
    ledger: ledger.map((journal) => ({ kind: journal.kind, at: journal.occurredAt.toISOString(), memo: journal.memo, entries: journal.entries })),
  };
  await db.insert(auditLog).values({
    id: newId('aud'),
    at: now.toISOString(),
    actorId: staff.id,
    actorRole: role,
    action: 'booking.evidence_pack_downloaded',
    targetType: 'booking',
    targetId: booking.id,
    reason: 'Chargeback ' + disputed.map((payment) => payment.disputeId).join(', '),
    metadata: { disputeIds: disputed.map((payment) => payment.disputeId), url: routes.api.evidencePack(booking.id) },
  });
  return { filename: `evidence-${booking.id}.json`, pack };
}
