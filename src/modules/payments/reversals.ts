import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { transferReversalInputSchema, type ActionResult, type AdminBookingReversals, type AdminTransferRow, type TransferReversalInput } from '@/contracts';
import type { StripeConnect } from '@/integrations/payments/stripe-connect';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { earnings, transferReversals } from '@/modules/earnings/schema';
import { supportCases } from '@/modules/support/schema';
import type { StaffActor } from '@/modules/support/staff';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { devHelpersOn } from '@/shared/dev-helpers';
import { serialized, submissionKeys } from './double-submit';

/**
 * Taking back a helper's transfer (blueprint 08 `transfer_reversals`; completion plan 5.13). Finance only, and
 * always with a support case on the booking that justifies it. Stripe takes the money back from the helper's
 * balance; when it can't (already paid out to the bank), the attempt is recorded as failed and the money is
 * recovered by hand. Without Stripe Connect (development) a stand-in records it.
 */

const TRANSFERRED = ['transferred', 'paid_out', 'partially_reversed'];
const isFinance = (staff: StaffActor) => staff.roles.includes('finance');

async function reversedByEarnings(db: Db, earningsIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (earningsIds.length === 0) return out;
  const rows = await db
    .select({ earningsId: transferReversals.earningsId, amountCents: transferReversals.amountCents })
    .from(transferReversals)
    .where(and(inArray(transferReversals.earningsId, earningsIds), eq(transferReversals.status, 'succeeded')));
  for (const row of rows) out.set(row.earningsId, (out.get(row.earningsId) ?? 0) + row.amountCents);
  return out;
}

/** Whether the staff member is the booking's client or helper: they never reverse its transfers (security review). */
async function isPartyTo(db: Db, staffId: string, bookingId: string): Promise<boolean> {
  const [row] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.id, bookingId), or(eq(bookings.posterUserId, staffId), eq(bookings.helperUserId, staffId)))).limit(1);
  return Boolean(row);
}

export async function getBookingReversals(db: Db, staff: StaffActor, bookingId: string): Promise<AdminBookingReversals> {
  const rows = await db.select().from(earnings).where(eq(earnings.bookingId, bookingId));
  const transferred = rows.filter((row) => row.transferRef && (TRANSFERRED.includes(row.status) || row.status === 'reversed'));
  const reversed = await reversedByEarnings(db, transferred.map((row) => row.id));
  const [history, cases, party] = await Promise.all([
    db
      .select({ reversal: transferReversals, by: users.name })
      .from(transferReversals)
      .innerJoin(users, eq(users.id, transferReversals.createdByUserId))
      .where(eq(transferReversals.bookingId, bookingId))
      .orderBy(desc(transferReversals.createdAt)),
    db.select({ id: supportCases.id, type: supportCases.type, createdAt: supportCases.createdAt }).from(supportCases).where(eq(supportCases.bookingId, bookingId)).orderBy(desc(supportCases.createdAt)),
    isPartyTo(db, staff.id, bookingId),
  ]);
  return {
    transfers: transferred.map((row): AdminTransferRow => {
      const back = reversed.get(row.id) ?? 0;
      return {
        earningsId: row.id,
        kind: row.kind as AdminTransferRow['kind'],
        transferredCents: row.amountCents,
        reversedCents: back,
        reversibleCents: Math.max(0, row.amountCents - back),
        ...(row.transferredAt ? { transferredAt: row.transferredAt.toISOString() } : {}),
      };
    }),
    history: history.map(({ reversal, by }) => ({
      id: reversal.id,
      earningsId: reversal.earningsId,
      amountCents: reversal.amountCents,
      caseId: reversal.caseId,
      reason: reversal.reason,
      status: reversal.status as 'succeeded' | 'failed',
      at: reversal.createdAt.toISOString(),
      byDisplayName: by,
    })),
    canReverse: isFinance(staff) && !party,
    cases: cases.map((row) => ({ id: row.id, label: `${row.type.replaceAll('_', ' ')} · ${row.id}` })),
  };
}

export async function reverseTransfer(db: Db, connect: StripeConnect | null, staff: StaffActor, bookingId: string, input: TransferReversalInput, now: Date): Promise<ActionResult> {
  const parsed = transferReversalInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!isFinance(staff)) return { ok: false, code: 'not_allowed' };
  // Never on a booking of their own (security review): taking a helper's pay back is someone else's call.
  if (await isPartyTo(db, staff.id, bookingId)) return { ok: false, code: 'not_allowed' };
  const { earningsId, amountCents, caseId, reason } = parsed.data;
  const [row] = await db.select().from(earnings).where(and(eq(earnings.id, earningsId), eq(earnings.bookingId, bookingId))).limit(1);
  if (!row?.transferRef || !TRANSFERRED.includes(row.status)) return { ok: false, code: 'not_allowed' };
  const transferred = { ...row, transferRef: row.transferRef };
  const [onBooking] = await db.select({ id: supportCases.id }).from(supportCases).where(and(eq(supportCases.id, caseId), eq(supportCases.bookingId, bookingId))).limit(1);
  if (!onBooking) return { ok: false, code: 'validation_failed', fieldErrors: { caseId: ['invalid'] } };
  // The same form sent twice reverses once (money review #10): its key comes from what was asked, and one reversal per
  // transfer runs at a time, so the second finds the first one's row and answers the same.
  const keys = submissionKeys(`trr:${row.id}`, [staff.id, amountCents, caseId, reason], now);
  return serialized(db, `transfer-reversal:${row.id}`, async (): Promise<ActionResult> => {
    const [earlier] = await db.select({ status: transferReversals.status }).from(transferReversals).where(inArray(transferReversals.idempotencyKey, [keys.previous, keys.current])).limit(1);
    if (earlier) return earlier.status === 'succeeded' ? { ok: true, code: 'updated' } : { ok: false, code: 'insufficient_funds' };
    return reverseOnce(db, connect, staff, bookingId, transferred, { amountCents, caseId, reason, idempotencyKey: keys.current }, now);
  });
}

async function reverseOnce(
  db: Db,
  connect: StripeConnect | null,
  staff: StaffActor,
  bookingId: string,
  row: typeof earnings.$inferSelect & { transferRef: string },
  input: { amountCents: number; caseId: string; reason: string; idempotencyKey: string },
  now: Date,
): Promise<ActionResult> {
  const { amountCents, caseId, reason, idempotencyKey } = input;
  const already = (await reversedByEarnings(db, [row.id])).get(row.id) ?? 0;
  if (amountCents > row.amountCents - already) return { ok: false, code: 'validation_failed', fieldErrors: { amountCents: ['out_of_range'] } };

  const id = newId('trr');
  const outcome = connect
    ? await connect.reverseTransfer({ transferId: row.transferRef, amountCents, idempotencyKey, caseId })
    : !devHelpersOn()
      ? null
      : ({ ok: true, reversalId: `trr_dev_${id.slice(4)}` } as const);
  if (!outcome) return { ok: false, code: 'not_allowed' };
  await db.insert(transferReversals).values({
    id,
    earningsId: row.id,
    bookingId,
    amountCents,
    reason,
    caseId,
    status: outcome.ok ? 'succeeded' : 'failed',
    ...(outcome.ok ? { stripeReversalId: outcome.reversalId } : {}),
    createdByUserId: staff.id,
    idempotencyKey,
    createdAt: now,
  });
  if (outcome.ok) {
    const total = already + amountCents;
    await db.update(earnings).set({ status: total >= row.amountCents ? 'reversed' : 'partially_reversed', updatedAt: now }).where(eq(earnings.id, row.id));
  }
  await db.insert(auditLog).values({
    id: newId('aud'),
    at: now.toISOString(),
    actorId: staff.id,
    actorRole: 'finance',
    action: outcome.ok ? 'booking.transfer_reversed' : 'booking.transfer_reversal_failed',
    targetType: 'booking',
    targetId: bookingId,
    reason,
    metadata: { reversalId: id, earningsId: row.id, amountCents, caseId, ...(outcome.ok ? {} : { stripe: outcome.reason }) },
  });
  return outcome.ok ? { ok: true, code: 'updated' } : { ok: false, code: 'insufficient_funds' };
}
