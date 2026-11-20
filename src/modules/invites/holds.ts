import { and, eq, inArray, like } from 'drizzle-orm';
import type { InviteStatus } from '@/contracts';
import { createPaymentProvider, type PaymentProvider } from '@/integrations/payments';
import { releaseSlot } from '@/modules/availability/slots';
import { cancelIntents } from '@/modules/payments/cancel-intents';
import { payments } from '@/modules/payments/schema';
import type { Db } from '@/platform/db/connect';
import { invites } from './schema';

/**
 * Holds on a client's card for direct invites (repeats review #11, #12): every hold an invite made is let go when the
 * invite ends, and a task that was booked or canceled ends its other invites at once.
 */

/** Invites still waiting on an answer: their holds are live. */
export const OPEN_INVITES: InviteStatus[] = ['authorizing', 'sent', 'countered'];

/** A hold that's live or may yet be: authorized, in the bank's step, or its call still out. */
const LIVE_HOLD = ['authorized', 'requires_confirmation', 'processing'];

/** Every hold an invite made carries its id in the key (`invite:<inviteId>:<paymentId>`); LIKE's wildcards escaped. */
export const holdKeysOf = (inviteId: string) => `invite:${inviteId.replace(/[\\%_]/g, (character) => `\\${character}`)}:%`;

/**
 * Lets go of one hold: authorized or still in the bank's step, it's canceled at the provider and marked canceled (a
 * hold whose call is still out has no intent yet: its row is marked canceled, and should it authorize after all, Stripe's
 * event lets it go, stripe-webhooks.ts). A hold that became a booking's charge is left alone.
 */
export async function releaseHold(db: Db, provider: PaymentProvider | null, paymentId: string | null, now: Date): Promise<void> {
  if (!paymentId) return;
  const [held] = await db
    .update(payments)
    .set({ status: 'canceled', updatedAt: now })
    .where(and(eq(payments.id, paymentId), eq(payments.purpose, 'invite_authorization'), inArray(payments.status, LIVE_HOLD)))
    .returning({ providerRef: payments.providerRef });
  if (held) await cancelIntents(provider, [held.providerRef], `hold ${paymentId}`);
}

/**
 * Lets go of every hold an invite made: its first one and any counter's new one, not only the one the invite points at
 * (repeats review #12: a counter's bank step left open when the invite ended was never let go).
 */
export async function releaseInviteHolds(db: Db, provider: PaymentProvider | null, inviteId: string, now: Date): Promise<void> {
  const held = await db
    .update(payments)
    .set({ status: 'canceled', updatedAt: now })
    .where(and(like(payments.idempotencyKey, holdKeysOf(inviteId)), eq(payments.purpose, 'invite_authorization'), inArray(payments.status, LIVE_HOLD)))
    .returning({ providerRef: payments.providerRef });
  await cancelIntents(provider, held.map((hold) => hold.providerRef), `invite ${inviteId}'s holds`);
}

/**
 * A task that was booked (any way) or canceled ends its other invites at once and lets go of their holds (repeats review
 * #11): they used to keep the client's card held until they expired, up to 48–72 hours later.
 */
export async function closeTaskInvites(db: Db, taskId: string, now: Date, provider: PaymentProvider | null = createPaymentProvider()): Promise<number> {
  const closed = await db
    .update(invites)
    .set({ status: 'canceled', decidedAt: now, updatedAt: now })
    .where(and(eq(invites.taskId, taskId), inArray(invites.status, OPEN_INVITES)))
    .returning({ id: invites.id, slotId: invites.slotId });
  for (const invite of closed) {
    await releaseInviteHolds(db, provider, invite.id, now);
    await releaseSlot(db, invite.slotId, now);
  }
  return closed.length;
}
