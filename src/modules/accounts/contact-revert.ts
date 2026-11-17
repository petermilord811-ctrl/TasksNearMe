import { and, desc, eq, gte, inArray, isNotNull, lt, lte, ne, notInArray, or } from 'drizzle-orm';
import type { ActionResult, ContactRevertPageData, TimeZone } from '@/contracts';
import { MARKET_TIME_ZONE, SOCIAL_PROVIDERS } from '@/contracts';
import { markets } from '@/modules/markets/schema';
import { privacyRequests } from '@/modules/notifications/schema';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { rateLimited } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimits, type RateLimitRule } from '@/platform/rate-limit';
import { formatDateTime } from '@/shared/format';
import { CONTACT_REVERT_MS, checkContactRevertLink, contactRevertIdOf, type ContactRevertClaim } from './contact-revert-token';
import { accounts, contactChangeReverts, passkeys, phoneVerifications, sessions, users } from './schema';

/**
 * "Not you?" (completion plan 5.23): recovering from an email or phone change the owner didn't make. Each change
 * leaves a row (`recordContactChange`) whose signed link goes to the old address or number. Using the link, once
 * and within 7 days, with no sign-in:
 * 1. signs every device out (the session rows go, as a ban does);
 * 2. undoes the change, unless a newer change of the same kind replaced it or another account took the old value;
 * 3. removes passkeys and Google or Microsoft sign-ins added since a day before the change (an attacker adds one
 *    to get back in, often just before changing the email), each audited;
 * 4. holds the email, phone and ways to sign in until trust and safety or an admin clears it (signing in with an
 *    emailed code still works, so the owner gets back in);
 * 5. opens an urgent account case for trust and safety (on-call paging, 5.12), or adds to the one already open;
 * 6. is audited.
 * The page says the same for a used, expired, forged or unknown link, and never anything about the account.
 */

export const CONTACT_REVERT_RULES = {
  perIp: { limit: 10, windowSeconds: 60 * 60 },
  perLink: { limit: 5, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

/** Ways to sign in added from this long before the change on are removed with it. */
export const SIGN_IN_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Used and expired rows, without their values, stay this long for staff, then go. */
export const KEEP_SPENT_ROWS_MS = 30 * 24 * 60 * 60 * 1000;
/** `support_cases.reason` of the case a link opens. */
export const CONTACT_REVERT_CASE_REASON = 'contact_change_reported';

type Kind = 'email' | 'phone';
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
const INVALID: ActionResult = { ok: false, code: 'not_found' };
const FINISHED_CASES = ['resolved', 'closed'];
const last4 = (phone: string | null | undefined) => (phone ? phone.slice(-4) : '');

/**
 * A new email or phone on the account: the row behind its notice's "Not you?" link, valid for 7 days. `previous`
 * is what the change replaced (the old address, or the old number in E.164).
 */
export async function recordContactChange(db: Pick<Db, 'insert'>, input: { userId: string; kind: Kind; previous: string; next: string }, now: Date): Promise<ContactRevertClaim> {
  const claim: ContactRevertClaim = { id: newId('ccr'), userId: input.userId, kind: input.kind, expiresAt: new Date(now.getTime() + CONTACT_REVERT_MS) };
  await db.insert(contactChangeReverts).values({ ...claim, previousValue: input.previous, newValue: input.next, createdAt: now });
  return claim;
}

/** Whether the account's email, phone and ways to sign in are held (a "Not you?" link was used). */
export async function isContactHeld(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ at: users.contactHoldAt }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(row?.at);
}

async function rowOf(db: Db | Tx, id: string, lock = false) {
  const query = db.select().from(contactChangeReverts).where(eq(contactChangeReverts.id, id)).limit(1);
  const [row] = lock ? await query.for('update') : await query;
  return row ?? null;
}

const claimOf = (row: typeof contactChangeReverts.$inferSelect) => ({ id: row.id, userId: row.userId, kind: row.kind as Kind, expiresAt: row.expiresAt, usedAt: row.usedAt });

/** `routes.contactRevert(token)`: whether the link can still be used. Reads only. */
export async function getContactRevertPage(db: Db, token: unknown, now: Date): Promise<ContactRevertPageData> {
  const id = contactRevertIdOf(token);
  const row = id ? await rowOf(db, id) : null;
  return { state: checkContactRevertLink(String(token), row ? claimOf(row) : null, now).ok ? 'ask' : 'invalid' };
}

export interface RedeemDeps {
  db: Db;
  now: Date;
  /** The visitor's address, when known (not on this machine). */
  ip: string | null;
}

/** `ContactRevertHandlers.onConfirm`: the link is used (see the module comment). */
export async function redeemContactRevertLink(deps: RedeemDeps, token: unknown): Promise<ActionResult> {
  const { db, now, ip } = deps;
  const id = contactRevertIdOf(token);
  const limited = await consumeRateLimits(
    db,
    [
      ...(ip ? [{ key: `contact-revert:ip:${ip}`, rule: CONTACT_REVERT_RULES.perIp }] : []),
      ...(id ? [{ key: `contact-revert:link:${id}`, rule: CONTACT_REVERT_RULES.perLink }] : []),
    ],
    now,
  );
  if (!limited.ok) return rateLimited(limited.retryAt);
  if (!id) return INVALID;
  const used = await db.transaction(async (tx) => {
    // Locked, so a second use waits for this one and then finds it used.
    const row = await rowOf(tx, id, true);
    if (!row || !checkContactRevertLink(String(token), claimOf(row), now).ok) return false;
    const [user] = await tx
      .select({ id: users.id, email: users.email, phone: users.phone, status: users.status, contactHoldAt: users.contactHoldAt, homeMarketId: users.homeMarketId })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1)
      .for('update');
    if (!user || user.status === 'deleted') return false;
    await tx.update(contactChangeReverts).set({ usedAt: now, previousValue: null, newValue: null }).where(eq(contactChangeReverts.id, row.id));

    const revert = await undoChange(tx, row, user, now);
    const ended = await tx.delete(sessions).where(eq(sessions.userId, user.id)).returning({ id: sessions.id });
    const since = new Date(row.createdAt.getTime() - SIGN_IN_LOOKBACK_MS);
    const removedKeys = await tx.delete(passkeys).where(and(eq(passkeys.userId, user.id), gte(passkeys.createdAt, since))).returning({ id: passkeys.id, name: passkeys.name });
    const removedLinks = await tx
      .delete(accounts)
      .where(and(eq(accounts.userId, user.id), inArray(accounts.providerId, [...SOCIAL_PROVIDERS]), gte(accounts.createdAt, since)))
      .returning({ id: accounts.id, provider: accounts.providerId });
    // A code sent before now can't finish a phone change any more.
    await tx.update(phoneVerifications).set({ status: 'canceled', updatedAt: now }).where(and(eq(phoneVerifications.userId, user.id), eq(phoneVerifications.status, 'pending')));
    if (!user.contactHoldAt) await tx.update(users).set({ contactHoldAt: now }).where(eq(users.id, user.id));

    const [market] = await tx.select({ timeZone: markets.timeZone }).from(markets).where(eq(markets.id, user.homeMarketId)).limit(1);
    const timeZone = market?.timeZone ?? MARKET_TIME_ZONE;
    const caseId = await openCase(tx, { timeZone, row, user, revert, sessionsEnded: ended.length, since, removedKeys, removedLinks, now });
    const audit = (action: string, metadata: Record<string, unknown>) =>
      ({ id: newId('aud'), at: now.toISOString(), actorId: null, actorRole: 'system', action, targetType: 'user', targetId: user.id, metadata: { via: 'not_me_link', revertId: row.id, ...metadata }, ip });
    await tx.insert(auditLog).values([
      audit('account.contact_change_reported', {
        kind: row.kind,
        reverted: revert.done,
        ...(revert.done ? {} : { notReverted: revert.why }),
        ...(row.kind === 'email' ? { from: row.newValue, to: row.previousValue } : { fromLast4: last4(row.newValue), toLast4: last4(row.previousValue) }),
        sessionsEnded: ended.length,
        held: true,
        caseId,
      }),
      ...removedKeys.map((key) => audit('account.passkey_removed', { passkeyId: key.id, name: key.name ?? '' })),
      ...removedLinks.map((link) => audit('account.sign_in_disconnected', { provider: link.provider })),
    ]);
    return true;
  });
  return used ? { ok: true, code: 'updated' } : INVALID;
}

type Revert = { done: true } | { done: false; why: 'newer_change' | 'in_use' };

/** Puts the old email or number back, if this change is still the latest of its kind and nobody else took the old one. */
async function undoChange(tx: Tx, row: typeof contactChangeReverts.$inferSelect, user: { id: string; email: string; phone: string | null }, now: Date): Promise<Revert> {
  const { previousValue: previous, newValue: next } = row;
  if (!previous || !next) return { done: false, why: 'newer_change' };
  const [latest] = await tx
    .select({ id: contactChangeReverts.id })
    .from(contactChangeReverts)
    .where(and(eq(contactChangeReverts.userId, user.id), eq(contactChangeReverts.kind, row.kind)))
    .orderBy(desc(contactChangeReverts.createdAt), desc(contactChangeReverts.id))
    .limit(1);
  const current = row.kind === 'email' ? user.email.toLowerCase() : user.phone;
  if (latest?.id !== row.id || current !== next) return { done: false, why: 'newer_change' };
  const column = row.kind === 'email' ? users.email : users.phone;
  const [taken] = await tx.select({ id: users.id }).from(users).where(and(eq(column, previous), ne(users.id, user.id))).limit(1);
  if (taken) return { done: false, why: 'in_use' };
  if (row.kind === 'email') await tx.update(users).set({ email: previous, emailVerified: true, updatedAt: now }).where(eq(users.id, user.id));
  // The old number was the account's verified number until the change.
  else await tx.update(users).set({ phone: previous, phoneVerifiedAt: now, updatedAt: now }).where(eq(users.id, user.id));
  return { done: true };
}

const DESCRIPTION: Record<Kind, string> = {
  email:
    'The “Not you?” link in our email change notice was used. Every device was signed out, and the account’s email, phone and ways to sign in are held until our team has checked it.',
  phone:
    'The “Not you?” link in our phone number change notice was used. Every device was signed out, and the account’s email, phone and ways to sign in are held until our team has checked it.',
};

interface CaseFacts {
  /** The account's home market's zone: the note's times are shown in it, with its abbreviation. */
  timeZone: TimeZone;
  row: typeof contactChangeReverts.$inferSelect;
  user: { id: string; email: string; phone: string | null };
  revert: Revert;
  sessionsEnded: number;
  since: Date;
  removedKeys: { id: string; name: string | null }[];
  removedLinks: { id: string; provider: string }[];
  now: Date;
}

/** What trust and safety need to know, for the case's internal note (staff only, English like the staff tools). */
async function noteFor(tx: Tx, facts: CaseFacts): Promise<string> {
  const { row, user, revert } = facts;
  const zoneName = (date: Date) => new Intl.DateTimeFormat('en-US', { timeZone: facts.timeZone, timeZoneName: 'short' }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? '';
  const at = (date: Date) => `${formatDateTime(date, 'en', facts.timeZone)} ${zoneName(date)}`.trim();
  const lines: string[] = [];
  if (row.kind === 'email') {
    lines.push(`“Not you?” link from the email change notice sent to the old address. The email changed from ${row.previousValue} to ${row.newValue} on ${at(row.createdAt)}.`);
    lines.push(revert.done ? `Undone: the account uses ${row.previousValue} again.` : revert.why === 'in_use' ? `Not undone: another account uses ${row.previousValue} now.` : 'Not undone: a newer email change replaced it.');
  } else {
    lines.push(`“Not you?” link from the phone number change notice (a text to the old number and an email to the account). The number changed from the one ending in ${last4(row.previousValue)} to the one ending in ${last4(row.newValue)} on ${at(row.createdAt)}.`);
    lines.push(revert.done ? `Undone: the account uses the number ending in ${last4(row.previousValue)} again.` : revert.why === 'in_use' ? 'Not undone: another account uses the old number now.' : 'Not undone: a newer phone change replaced it.');
  }
  lines.push(`Signed out everywhere (${facts.sessionsEnded === 1 ? '1 session' : `${facts.sessionsEnded} sessions`}).`);
  const removed = [
    ...facts.removedKeys.map((key) => (key.name ? `the passkey “${key.name}”` : 'a passkey')).sort(),
    ...facts.removedLinks.map((link) => (link.provider === 'google' ? 'Google' : link.provider === 'microsoft' ? 'Microsoft' : link.provider)).sort(),
  ];
  lines.push(removed.length > 0 ? `Removed what was added to sign in since ${at(facts.since)}: ${removed.join(', ')}.` : `Nothing was added to sign in since ${at(facts.since)}.`);
  const others = await tx
    .select({ kind: contactChangeReverts.kind, createdAt: contactChangeReverts.createdAt })
    .from(contactChangeReverts)
    .where(and(eq(contactChangeReverts.userId, user.id), ne(contactChangeReverts.id, row.id), gte(contactChangeReverts.createdAt, new Date(facts.now.getTime() - CONTACT_REVERT_MS))))
    .orderBy(desc(contactChangeReverts.createdAt));
  if (others.length > 0) lines.push(`Other changes in the last 7 days: ${others.map((other) => `${other.kind === 'email' ? 'email' : 'phone number'} on ${at(other.createdAt)}`).join('; ')}. Each notice has its own link.`);
  const [deletion] = await tx
    .select({ scheduledFor: privacyRequests.scheduledFor })
    .from(privacyRequests)
    .where(and(eq(privacyRequests.userId, user.id), eq(privacyRequests.kind, 'deletion'), eq(privacyRequests.status, 'requested')))
    .limit(1);
  if (deletion) lines.push(`Deleting the account was requested${deletion.scheduledFor ? `; it happens on ${at(deletion.scheduledFor)}` : ''} unless it's withdrawn.`);
  lines.push('Held: the email, phone and ways to sign in can’t change until trust and safety or an admin clears the hold on the person page, once the account is back with its owner. Signing in with an emailed code still works.');
  return lines.join('\n');
}

/** An urgent account case for trust and safety, or a note on the one a link already opened. Returns its id. */
async function openCase(tx: Tx, facts: CaseFacts): Promise<string> {
  const { user, now } = facts;
  const body = await noteFor(tx, facts);
  const [open] = await tx
    .select({ id: supportCases.id })
    .from(supportCases)
    .where(and(eq(supportCases.openedByUserId, user.id), eq(supportCases.reason, CONTACT_REVERT_CASE_REASON), notInArray(supportCases.status, FINISHED_CASES)))
    .orderBy(desc(supportCases.createdAt))
    .limit(1)
    .for('update');
  if (open) {
    await tx.insert(supportCaseEvents).values({ id: newId('cev'), caseId: open.id, kind: 'note', authorUserId: null, visibility: 'internal', body: `Another “Not you?” link was used.\n${body}`, createdAt: now });
    await tx.update(supportCases).set({ priority: 'urgent', updatedAt: now }).where(eq(supportCases.id, open.id));
    return open.id;
  }
  const id = newId('case');
  await tx.insert(supportCases).values({
    id,
    type: 'account',
    status: 'open',
    priority: 'urgent',
    openedByUserId: user.id,
    topic: 'account_access',
    reason: CONTACT_REVERT_CASE_REASON,
    description: DESCRIPTION[facts.row.kind as Kind],
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(supportCaseEvents).values({ id: newId('cev'), caseId: id, kind: 'note', authorUserId: null, visibility: 'internal', body, createdAt: now });
  // Urgent, so the on-call is paged (src/modules/oncall/reactions.ts).
  await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'support.case_opened', aggregateType: 'support_case', aggregateId: id, payload: { caseId: id, type: 'account', openedByUserId: user.id } });
  return id;
}

/**
 * The hourly sweep (privacy/retention.ts): what an expired link kept is cleared, and spent rows go a month after
 * they expired. Used links were cleared when they were used.
 */
export async function pruneContactReverts(db: Db, now: Date): Promise<number> {
  const cleared = await db
    .update(contactChangeReverts)
    .set({ previousValue: null, newValue: null })
    .where(and(lte(contactChangeReverts.expiresAt, now), or(isNotNull(contactChangeReverts.previousValue), isNotNull(contactChangeReverts.newValue))))
    .returning({ id: contactChangeReverts.id });
  const removed = await db.delete(contactChangeReverts).where(lt(contactChangeReverts.expiresAt, new Date(now.getTime() - KEEP_SPENT_ROWS_MS))).returning({ id: contactChangeReverts.id });
  return cleared.length + removed.length;
}
