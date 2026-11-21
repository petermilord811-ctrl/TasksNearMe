import { and, eq, inArray, isNotNull, ne, notInArray, sql } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { blocks } from '@/modules/messaging/schema';
import { paymentMethods, payments } from '@/modules/payments/schema';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';

/**
 * Cards and accounts (abuse rehearsal J-AB4, ab's decision 2026-11-21). A card's provider fingerprint (Stripe's
 * `card.fingerprint`: an opaque id, the same on every account that adds the card, not card data) is kept on saved cards
 * and on payments. While texts are off there's no phone check, so nothing limits a person to one account; the card is
 * the gate every request and booking already passes. With texts on (the owner hasn't set them up yet), the phone check
 * limits accounts again, and this stays as a second line.
 * - A card a banned account used is refused to anyone else, at adding a card and at paying, with a neutral message that
 *   never names the ban (`card_not_allowed`).
 * - Contacting someone who blocked another account that used one of your cards opens a case for staff, "possible block
 *   evasion": a flag only, nothing is done to either account.
 */

export const BLOCK_EVASION_REASON = 'block_evasion';
const CLOSED_CASE = ['resolved', 'closed'];

/**
 * An account banned, or deleted while banned (32's review): a deletion overwrites the status, but its `account.deleted`
 * audit entry says `banned`, as the retention sweep reads it. Its cards' rows and fingerprints stay (only detached), so
 * deleting the account doesn't free its card.
 */
const isBanned = sql`(${users.status} = 'banned' or (${users.status} = 'deleted' and exists (select 1 from ${auditLog} l where l.action = 'account.deleted' and l.target_type = 'user' and l.target_id = ${users.id} and l.metadata ->> 'banned' = 'true')))`;

/** Every card fingerprint an account used: saved, or paid with without saving. */
export async function fingerprintsOf(db: Db, userId: string): Promise<string[]> {
  const [saved, paid] = await Promise.all([
    db.selectDistinct({ fingerprint: paymentMethods.fingerprint }).from(paymentMethods).where(and(eq(paymentMethods.userId, userId), isNotNull(paymentMethods.fingerprint))),
    db.selectDistinct({ fingerprint: payments.methodFingerprint }).from(payments).where(and(eq(payments.payerUserId, userId), isNotNull(payments.methodFingerprint))),
  ]);
  return [...new Set([...saved.map((row) => row.fingerprint), ...paid.map((row) => row.fingerprint)].filter((value): value is string => Boolean(value)))];
}

/** A card some banned account used, saved or paid with: refused to `userId`. No fingerprint (an old saved card): no refusal. */
export async function cardOfBannedAccount(db: Db, fingerprint: string | null | undefined, userId: string): Promise<boolean> {
  if (!fingerprint) return false;
  const [saved] = await db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .innerJoin(users, eq(users.id, paymentMethods.userId))
    .where(and(eq(paymentMethods.fingerprint, fingerprint), ne(paymentMethods.userId, userId), isBanned))
    .limit(1);
  if (saved) return true;
  const [paid] = await db
    .select({ id: payments.id })
    .from(payments)
    .innerJoin(users, eq(users.id, payments.payerUserId))
    .where(and(eq(payments.methodFingerprint, fingerprint), ne(payments.payerUserId, userId), isBanned))
    .limit(1);
  return Boolean(paid);
}

/**
 * The saved cards of `userId` that can't be used here because a banned account used the same card (J-AB4 follow-up,
 * ab): the payment forms show them disabled with a Remove button, never preselected. Nothing detaches them on its own.
 */
export async function unusableCardIds(db: Db, userId: string, cards: readonly { id: string; fingerprint: string | null }[]): Promise<Set<string>> {
  const unusable = new Set<string>();
  for (const card of cards) if (await cardOfBannedAccount(db, card.fingerprint, userId)) unusable.add(card.id);
  return unusable;
}

/** The account `recipientId` blocked that shares one of `senderId`'s cards, if any (never the sender themself). */
async function blockedAccountOnSameCard(db: Db, senderId: string, recipientId: string): Promise<string | null> {
  const mine = await fingerprintsOf(db, senderId);
  if (mine.length === 0) return null;
  const blocked = (await db.select({ id: blocks.blockedId }).from(blocks).where(and(eq(blocks.blockerId, recipientId), ne(blocks.blockedId, senderId)))).map((row) => row.id);
  if (blocked.length === 0) return null;
  const [saved] = await db.select({ userId: paymentMethods.userId }).from(paymentMethods).where(and(inArray(paymentMethods.userId, blocked), inArray(paymentMethods.fingerprint, mine))).limit(1);
  if (saved) return saved.userId;
  const [paid] = await db.select({ userId: payments.payerUserId }).from(payments).where(and(inArray(payments.payerUserId, blocked), inArray(payments.methodFingerprint, mine))).limit(1);
  return paid?.userId ?? null;
}

/** Who reached whom in an outbox event: a message, an offer, a request to a helper, a question on a task. */
function contactOf(event: { type: string; payload: Record<string, unknown> }): { senderId: string; recipientIds: string[]; context: { threadId?: string; taskId?: string } } | null {
  const p = event.payload;
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
  switch (event.type) {
    case 'message.sent': {
      const senderId = text(p.senderUserId);
      const recipientIds = Array.isArray(p.recipientIds) ? (p.recipientIds as unknown[]).map(text).filter((id): id is string => Boolean(id)) : [];
      const threadId = text(p.threadId);
      return senderId ? { senderId, recipientIds, context: threadId ? { threadId } : {} } : null;
    }
    case 'offer.submitted': {
      const senderId = text(p.helperUserId);
      const recipientId = text(p.posterUserId);
      const taskId = text(p.taskId);
      return senderId && recipientId ? { senderId, recipientIds: [recipientId], context: taskId ? { taskId } : {} } : null;
    }
    case 'invite.sent': {
      const senderId = text(p.posterUserId);
      const recipientId = text(p.helperUserId);
      return senderId && recipientId ? { senderId, recipientIds: [recipientId], context: {} } : null;
    }
    case 'question.asked': {
      const senderId = text(p.askerUserId);
      const recipientId = text(p.posterUserId);
      const taskId = text(p.taskId);
      return senderId && recipientId ? { senderId, recipientIds: [recipientId], context: taskId ? { taskId } : {} } : null;
    }
    default:
      return null;
  }
}

/**
 * The notification dispatcher calls this for every event (src/modules/notifications/service.ts): when someone reaches a
 * person who blocked another account that used one of their cards, a case for staff, once per pair while it's open.
 */
export async function flagBlockEvasion(db: Db, event: { type: string; payload: Record<string, unknown> }, now: Date): Promise<string | null> {
  const contact = contactOf(event);
  if (!contact) return null;
  for (const recipientId of contact.recipientIds) {
    if (recipientId === contact.senderId) continue;
    const blockedUserId = await blockedAccountOnSameCard(db, contact.senderId, recipientId);
    if (!blockedUserId) continue;
    const [open] = await db
      .select({ id: supportCases.id })
      .from(supportCases)
      .where(and(eq(supportCases.reason, BLOCK_EVASION_REASON), eq(supportCases.subjectUserId, contact.senderId), notInArray(supportCases.status, CLOSED_CASE), sql`${supportCases.context} ->> 'recipientUserId' = ${recipientId}`))
      .limit(1);
    if (open) continue;
    const id = newId('case');
    await db.transaction(async (tx) => {
      await tx.insert(supportCases).values({
        id,
        type: 'report_user',
        status: 'open',
        priority: 'normal',
        subjectUserId: contact.senderId,
        reason: BLOCK_EVASION_REASON,
        description: 'Possible block evasion: this account reached someone who blocked another account that used the same card. A flag for review only: nothing was done to either account.',
        context: { ...contact.context, recipientUserId: recipientId, blockedUserId },
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(supportCaseEvents).values({ id: newId('cev'), caseId: id, kind: 'note', authorUserId: null, visibility: 'internal', body: `Reached by ${event.type}. Recipient ${recipientId} blocked ${blockedUserId}, which used one of this account's cards (same provider fingerprint).`, createdAt: now });
    });
    return id;
  }
  return null;
}
