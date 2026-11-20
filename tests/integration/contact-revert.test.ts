import { and, desc, eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createDevOutboxEmailProvider, type EmailMessage, type EmailProvider } from '@/integrations/email';
import { appUrl } from '@/integrations/oauth';
import { createDevOutboxSmsSender, type SmsMessage, type SmsSender } from '@/integrations/sms';
import type { FileStorage } from '@/integrations/storage';
import { adminAccountView, moderateAccount } from '@/modules/accounts/account-moderation';
import { createContactChange } from '@/modules/accounts/contact-change';
import { CONTACT_REVERT_CASE_REASON, getContactRevertPage, isContactHeld, KEEP_SPENT_ROWS_MS, pruneContactReverts, recordContactChange, redeemContactRevertLink } from '@/modules/accounts/contact-revert';
import { CONTACT_REVERT_MS, contactRevertToken } from '@/modules/accounts/contact-revert-token';
import { createPhoneVerification } from '@/modules/accounts/phone-verification';
import { accounts, contactChangeReverts, passkeys, sessions, users } from '@/modules/accounts/schema';
import { createHeldAccountLinkGuard, createProviderConnectedHook } from '@/modules/accounts/sign-in/provider-gate';
import { noticeSignInAdded } from '@/modules/accounts/sign-in-added';
import { privacyRequests } from '@/modules/notifications/schema';
import { getAccountPage } from '@/modules/notifications/service';
import { reactForOperations } from '@/modules/oncall/reactions';
import { anonymizeAccount } from '@/modules/privacy/requests';
import type { StaffActor } from '@/modules/support/staff';
import { supportCaseEvents, supportCaseReads, supportCases } from '@/modules/support/schema';
import { auditLog } from '@/platform/audit/schema';
import { createAuth } from '@/platform/auth/config';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * "Not you?" (completion plan 5.23) against the database: the link in an email or phone change notice, used
 * without signing in, or the one in the notice of a new way to sign in. It ends every session, undoes the change and
 * any later one of its kind, removes every passkey and Google or Microsoft sign-in (security review SEC15), holds the
 * account's sign-in details until trust and safety clear them, opens an urgent case (which pages the on-call) and is
 * audited. It works once, is rate-limited, and a forged or expired link changes nothing. People made for this file
 * sign in through Better Auth's real endpoints, and change their email and phone through the account page's flows,
 * codes read from the dev outbox.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const auth = createAuth(db, { nextCookies: false });
const BASE = appUrl();
const RUN = Date.now().toString(36);
const outbox = createDevOutboxEmailProvider(db);
const phoneVerification = createPhoneVerification({ db, sms: createDevOutboxSmsSender(db), secret: 'test-secret' });
const contacts = createContactChange({ db, auth, email: outbox, sms: createDevOutboxSmsSender(db), phoneVerification, appUrl: BASE });
const made: string[] = [];
const taylor: StaffActor = { id: 'usr_taylor', roles: ['trust_safety'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

afterAll(async () => {
  const cases = (await db.select({ id: supportCases.id }).from(supportCases).where(inArray(supportCases.openedByUserId, made))).map((row) => row.id);
  if (cases.length) {
    await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, cases));
    await db.delete(supportCaseReads).where(inArray(supportCaseReads.caseId, cases));
    await db.delete(supportCases).where(inArray(supportCases.id, cases));
    await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, cases));
    await db.delete(auditLog).where(inArray(auditLog.targetId, cases.map((id) => `/admin/cases/${id}`)));
  }
  await db.delete(auditLog).where(inArray(auditLog.targetId, made));
  await db.delete(privacyRequests).where(inArray(privacyRequests.userId, made));
  await db.update(users).set({ contactHoldAt: null }).where(eq(users.id, 'usr_taylor'));
  await db.delete(users).where(inArray(users.id, made));
  await pool.end();
});

async function latest(to: string, channel: 'email' | 'sms' = 'email', tag?: string) {
  const [row] = await db
    .select({ body: devOutboxMessages.body, html: devOutboxMessages.html, tag: devOutboxMessages.tag })
    .from(devOutboxMessages)
    .where(and(eq(devOutboxMessages.channel, channel), eq(devOutboxMessages.to, to), ...(tag ? [eq(devOutboxMessages.tag, tag)] : [])))
    .orderBy(desc(devOutboxMessages.createdAt))
    .limit(1);
  return row ?? null;
}

function codeIn(body: string | undefined): string {
  const code = body?.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error('no code');
  return code;
}

/** The "Not you?" link's token in a notice. */
function tokenIn(body: string | undefined | null): string {
  const found = body?.match(/\/account\/not-me\?token=([A-Za-z0-9_.%-]+)/)?.[1];
  if (!found) throw new Error('no link');
  return decodeURIComponent(found);
}

const post = (route: string, body: object, cookie = '') =>
  auth.handler(new Request(`${BASE}/api/auth${route}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: JSON.stringify(body) }));

/** Signs in with an emailed code: the session's headers. */
async function signIn(address: string): Promise<Headers> {
  await post('/email-otp/send-verification-otp', { email: address, type: 'sign-in' });
  const response = await post('/sign-in/email-otp', { email: address, otp: codeIn((await latest(address))?.body) });
  expect(response.status).toBe(200);
  return new Headers({ cookie: response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; '), origin: BASE });
}

async function person(label: string) {
  const userId = `usr_ccr_${label}_${RUN}`;
  const email = `ccr-${label}-${RUN}@example.test`;
  await db.insert(users).values({ id: userId, email, name: 'Robin C.', firstName: 'Robin', lastName: 'Cole', emailVerified: true, homeMarketId: 'mkt_austin' });
  made.push(userId);
  return { userId, email, headers: await signIn(email) };
}

async function changeEmail(who: { userId: string; headers: Headers }, next: string) {
  expect(await contacts.startEmailChange(who.userId, who.headers, { email: next })).toEqual({ ok: true, code: 'sent' });
  expect(await contacts.confirmEmailChange(who.userId, who.headers, { email: next, code: codeIn((await latest(next))?.body) })).toEqual({ ok: true, code: 'updated' });
}

const userOf = async (userId: string) => (await db.select().from(users).where(eq(users.id, userId)))[0]!;
const sessionCount = async (userId: string) => (await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId))).length;
const casesOf = (userId: string) => db.select().from(supportCases).where(and(eq(supportCases.openedByUserId, userId), eq(supportCases.reason, CONTACT_REVERT_CASE_REASON)));
const auditOf = async (userId: string, action: string) => db.select().from(auditLog).where(and(eq(auditLog.targetId, userId), eq(auditLog.action, action)));
const passkey = (userId: string, id: string, name: string, createdAt: Date) => ({ id, userId, name, publicKey: 'pk', credentialID: `cred_${id}`, counter: 0, deviceType: 'singleDevice', backedUp: false, createdAt });

describe('using the "Not you?" link after an email change', () => {
  let robin: Awaited<ReturnType<typeof person>>;
  let token: string;
  let caseId: string;
  const old = () => robin.email;
  const next = () => `ccr-robin-new-${RUN}@example.test`;

  it('sends the old address a notice whose link works without signing in, and asks first', async () => {
    robin = await person('robin');
    // A second device, and ways to sign in from before: an old passkey and Microsoft connected a month ago, a passkey
    // added two hours before the change (an attacker's first move), then the change itself.
    await db.insert(sessions).values({ id: `ses_ccr_${RUN}`, userId: robin.userId, token: `tok_ccr_${RUN}`, expiresAt: new Date(Date.now() + DAY), createdAt: new Date(), updatedAt: new Date() });
    await db.insert(passkeys).values([passkey(robin.userId, `pky_ccr_old_${RUN}`, 'Old laptop', new Date(Date.now() - 30 * DAY)), passkey(robin.userId, `pky_ccr_before_${RUN}`, 'Before', new Date(Date.now() - 2 * HOUR))]);
    await db.insert(accounts).values({ id: `acc_ccr_ms_${RUN}`, accountId: `ms-${RUN}`, providerId: 'microsoft', userId: robin.userId, createdAt: new Date(Date.now() - 30 * DAY), updatedAt: new Date(Date.now() - 30 * DAY) });
    await changeEmail(robin, next());
    // Added after the change: what someone who took the account would add to get back in.
    await db.insert(passkeys).values(passkey(robin.userId, `pky_ccr_after_${RUN}`, 'Phone', new Date()));
    await db.insert(accounts).values({ id: `acc_ccr_google_${RUN}`, accountId: `google-${RUN}`, providerId: 'google', userId: robin.userId });

    const notice = await latest(old(), 'email', 'email-changed');
    token = tokenIn(notice?.body);
    expect(notice?.html).toContain(`href="${BASE}/account/not-me?token=${encodeURIComponent(token)}"`);
    expect(notice?.body).toContain(next());
    expect(notice?.body).toContain(`${BASE}/help/contact`);
    // The link carries the change's id and a signature, nothing about the account.
    expect(token).toMatch(/^ccr_[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/);
    expect(token).not.toContain(robin.userId);
    expect(await getContactRevertPage(db, token, new Date())).toEqual({ state: 'ask' });
    // Opening the page changed nothing.
    expect(await sessionCount(robin.userId)).toBe(2);
  });

  it('ends every session, undoes the change, removes every way in but the emailed code, holds the account, opens an urgent case, and audits it all', async () => {
    const now = new Date();
    expect(await redeemContactRevertLink({ db, now, ip: '203.0.113.21' }, token)).toEqual({ ok: true, code: 'updated' });

    const user = await userOf(robin.userId);
    expect(user.email).toBe(old());
    expect(user.emailVerified).toBe(true);
    expect(user.contactHoldAt).toEqual(now);
    expect(await sessionCount(robin.userId)).toBe(0);
    // The old ones too (security review SEC15): one added long before the change can be the way back in.
    expect(await db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.userId, robin.userId))).toEqual([]);
    expect((await db.select({ provider: accounts.providerId }).from(accounts).where(eq(accounts.userId, robin.userId))).map((row) => row.provider)).toEqual([]);

    // What the link kept is gone once it's used.
    const [row] = await db.select().from(contactChangeReverts).where(eq(contactChangeReverts.userId, robin.userId));
    expect(row).toMatchObject({ usedAt: now, previousValue: null, newValue: null });

    const [opened] = await casesOf(robin.userId);
    expect(opened).toMatchObject({ type: 'account', topic: 'account_access', priority: 'urgent', status: 'open', openedByUserId: robin.userId });
    caseId = opened!.id;
    const [note] = await db.select().from(supportCaseEvents).where(eq(supportCaseEvents.caseId, caseId));
    expect(note).toMatchObject({ kind: 'note', visibility: 'internal' });
    expect(note!.body).toContain(`Undone: the account uses ${old()} again.`);
    // Times in the account's market's zone, named (Austin's here).
    expect(note!.body).toMatch(/ on .+ · .+ C[SD]T\./);
    expect(note!.body).toContain('Signed out everywhere (2 sessions).');
    expect(note!.body).toContain('Removed every way to sign in but an emailed code: the passkey “Before”, the passkey “Old laptop”, the passkey “Phone”, Google, Microsoft.');
    const [event] = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, caseId));
    expect(event).toMatchObject({ type: 'support.case_opened', payload: { caseId, type: 'account', openedByUserId: robin.userId } });

    const [reported] = await auditOf(robin.userId, 'account.contact_change_reported');
    expect(reported).toMatchObject({ actorId: null, actorRole: 'system', ip: '203.0.113.21' });
    expect(reported!.metadata).toMatchObject({ via: 'not_me_link', kind: 'email', reverted: true, from: next(), to: old(), sessionsEnded: 2, held: true, caseId });
    expect((await auditOf(robin.userId, 'account.passkey_removed')).map((entry) => entry.metadata.name).sort()).toEqual(['Before', 'Old laptop', 'Phone']);
    expect((await auditOf(robin.userId, 'account.sign_in_disconnected')).map((entry) => entry.metadata.provider).sort()).toEqual(['google', 'microsoft']);
  });

  it('works once: the same link again changes nothing and reads like any broken link', async () => {
    const back = await signIn(old());
    expect(await redeemContactRevertLink({ db, now: new Date(), ip: '203.0.113.21' }, token)).toEqual({ ok: false, code: 'not_found' });
    expect(await getContactRevertPage(db, token, new Date())).toEqual({ state: 'invalid' });
    expect(await sessionCount(robin.userId)).toBe(1);
    expect(await casesOf(robin.userId)).toHaveLength(1);
    expect(await auditOf(robin.userId, 'account.contact_change_reported')).toHaveLength(1);
    expect((await auth.api.getSession({ headers: back }))?.user.email).toBe(old());
  });

  it('holds email, phone and sign-in changes, while signing in with an emailed code still works', async () => {
    const headers = await signIn(old());
    expect(await isContactHeld(db, robin.userId)).toBe(true);
    expect((await getAccountPage(db, robin.userId))?.contactChangesHeld).toBe(true);
    expect(await contacts.startEmailChange(robin.userId, headers, { email: `ccr-robin-other-${RUN}@example.test` })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { email: ['held'] } });
    expect(await contacts.confirmEmailChange(robin.userId, headers, { email: `ccr-robin-other-${RUN}@example.test`, code: '123456' })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { email: ['held'] } });
    expect(await contacts.startPhoneChange(robin.userId, { phone: '(512) 555-0175' })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { phone: ['held'] } });
    // Sign-in's phone step too.
    expect(await phoneVerification.start(robin.userId, '512 555 0175')).toEqual({ ok: false, reason: 'held' });
    // Google or Microsoft can't be connected, from the account page or by signing in (Better Auth's account hook).
    const guard = createHeldAccountLinkGuard(db);
    expect(await guard({ userId: robin.userId, providerId: 'google' })).toBe(false);
    expect(await guard({ userId: 'usr_maya', providerId: 'google' })).toBeUndefined();
  });

  it('pages the on-call about it, without names or contact details', async () => {
    const texts: SmsMessage[] = [];
    const emails: EmailMessage[] = [];
    const sms: SmsSender = { name: 'test', send: async (message) => void texts.push(message) };
    const email: EmailProvider = { name: 'test', send: async (message) => void emails.push(message) } as EmailProvider;
    await reactForOperations(db, { type: 'support.case_opened', aggregateType: 'support_case', aggregateId: caseId, payload: { caseId } }, new Date(), { sms, email, env: { ONCALL_PHONES: '+15125550901', APP_URL: 'https://app.example.test' } });
    const page = texts.find((text) => text.to === '+15125550901');
    expect(page?.text).toContain('Urgent account case');
    expect(page?.text).toContain('"Not you?"');
    expect(page?.text).toContain(`https://app.example.test/admin/cases/${caseId}`);
    expect(page?.text).not.toContain(old());
    expect(emails.some((message) => message.text.includes(old()))).toBe(false);
  });

  it('is cleared by trust and safety or an admin with a reason, audited, never by a lead or on their own account', async () => {
    expect((await adminAccountView(db, morgan, robin.userId))!).toMatchObject({ contactHold: { at: expect.any(String) }, actions: expect.not.arrayContaining(['clear_contact_hold']) });
    expect(await moderateAccount(db, morgan, robin.userId, { action: 'clear_contact_hold', reason: 'The owner confirmed it on a call.' }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await adminAccountView(db, taylor, robin.userId))!.actions).toContain('clear_contact_hold');
    expect(await moderateAccount(db, taylor, robin.userId, { action: 'clear_contact_hold', reason: 'too short' }, new Date())).toMatchObject({ ok: false, code: 'validation_failed' });
    const why = 'Called the owner at the restored address: the account is theirs again.';
    expect(await moderateAccount(db, taylor, robin.userId, { action: 'clear_contact_hold', reason: why }, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await isContactHeld(db, robin.userId)).toBe(false);
    expect((await adminAccountView(db, taylor, robin.userId))!.contactHold).toBeUndefined();
    const [cleared] = await auditOf(robin.userId, 'account.contact_hold_cleared');
    expect(cleared).toMatchObject({ actorId: 'usr_taylor', reason: why });
    // Changes work again.
    expect(await contacts.startEmailChange(robin.userId, await signIn(old()), { email: `ccr-robin-later-${RUN}@example.test` })).toEqual({ ok: true, code: 'sent' });

    // A staff member's own hold is someone else's to clear.
    await db.update(users).set({ contactHoldAt: new Date() }).where(eq(users.id, 'usr_taylor'));
    expect((await adminAccountView(db, taylor, 'usr_taylor'))!.actions).not.toContain('clear_contact_hold');
    expect((await adminAccountView(db, riley, 'usr_taylor'))!.actions).toEqual(['clear_contact_hold']);
    await db.update(users).set({ contactHoldAt: null }).where(eq(users.id, 'usr_taylor'));
  });
});

describe('a newer change, a phone change, and links that must change nothing', () => {
  it('undoes a newer email change with the first, still securing the account, and the newer link then stops working (SEC15)', async () => {
    const sam = await person('sam');
    const second = `ccr-sam-2-${RUN}@example.test`;
    const third = `ccr-sam-3-${RUN}@example.test`;
    await changeEmail(sam, second);
    const first = tokenIn((await latest(sam.email, 'email', 'email-changed'))?.body);
    await changeEmail(sam, third);
    const newer = tokenIn((await latest(second, 'email', 'email-changed'))?.body);

    // Two changes in a row don't make the first notice's link useless: it puts the original address back.
    expect(await redeemContactRevertLink({ db, now: new Date(), ip: null }, first)).toEqual({ ok: true, code: 'updated' });
    let user = await userOf(sam.userId);
    expect(user.email).toBe(sam.email);
    expect(user.contactHoldAt).not.toBeNull();
    expect(await sessionCount(sam.userId)).toBe(0);
    const [reported] = await auditOf(sam.userId, 'account.contact_change_reported');
    expect(reported!.metadata).toMatchObject({ reverted: true, from: second, to: sam.email });
    const [opened] = await casesOf(sam.userId);
    const notes = async () => (await db.select({ body: supportCaseEvents.body }).from(supportCaseEvents).where(eq(supportCaseEvents.caseId, opened!.id))).map((row) => row.body ?? '');
    expect((await notes()).join('\n')).toContain(`Undone: the account uses ${sam.email} again.`);
    expect((await notes()).join('\n')).toContain('Other changes in the last 7 days: email on');
    expect((await notes()).join('\n')).toContain('Later changes of this kind were undone with this one, and their links no longer work');

    // The newer change's link went to the address in between, which whoever made it may hold: it changes nothing now.
    expect(await redeemContactRevertLink({ db, now: new Date(), ip: null }, newer)).toEqual({ ok: false, code: 'not_found' });
    user = await userOf(sam.userId);
    expect(user.email).toBe(sam.email);
    expect(await casesOf(sam.userId)).toHaveLength(1);
  });

  it('after a phone change, texts the old number and emails the account the same link, which puts the old number back', async () => {
    const lee = await person('lee');
    expect(await contacts.startPhoneChange(lee.userId, { phone: '(512) 555-0181' })).toEqual({ ok: true, code: 'sent' });
    expect(await contacts.confirmPhoneChange(lee.userId, { code: codeIn((await latest('+15125550181', 'sms'))?.body) })).toEqual({ ok: true, code: 'updated' });
    // Adding a first number has no "Not you?" link.
    expect(await db.select().from(contactChangeReverts).where(eq(contactChangeReverts.userId, lee.userId))).toEqual([]);

    expect(await contacts.startPhoneChange(lee.userId, { phone: '512-555-0182' })).toEqual({ ok: true, code: 'sent' });
    expect(await contacts.confirmPhoneChange(lee.userId, { code: codeIn((await latest('+15125550182', 'sms'))?.body) })).toEqual({ ok: true, code: 'updated' });
    const text = await latest('+15125550181', 'sms');
    expect(text?.body).toContain('Not you?');
    expect(text?.body).not.toContain('0182');
    const token = tokenIn(text?.body);
    expect(tokenIn((await latest(lee.email, 'email', 'phone-changed'))?.body)).toBe(token);

    expect(await redeemContactRevertLink({ db, now: new Date(), ip: null }, token)).toEqual({ ok: true, code: 'updated' });
    const user = await userOf(lee.userId);
    expect(user.phone).toBe('+15125550181');
    expect(user.phoneVerifiedAt).not.toBeNull();
    expect(user.contactHoldAt).not.toBeNull();
    const [reported] = await auditOf(lee.userId, 'account.contact_change_reported');
    expect(reported!.metadata).toMatchObject({ kind: 'phone', reverted: true, fromLast4: '0182', toLast4: '0181' });
    // Phone numbers appear in the audit only as their last 4 digits.
    expect(JSON.stringify(reported!.metadata)).not.toContain('5550182');
    const [opened] = await casesOf(lee.userId);
    const [note] = await db.select().from(supportCaseEvents).where(eq(supportCaseEvents.caseId, opened!.id));
    expect(note!.body).toContain('Undone: the account uses the number ending in 0181 again.');
  });

  it('withdraws a deletion asked for since a day before the change, and names an older one in the case note', async () => {
    const ana = await person('ana');
    const ben = await person('ben');
    // Ana's deletion was asked for after her email changed: what someone who took the account would do.
    await changeEmail(ana, `ccr-ana-new-${RUN}@example.test`);
    const anaLink = tokenIn((await latest(ana.email, 'email', 'email-changed'))?.body);
    const fresh = `prv_ccr_fresh_${RUN}`;
    await db.insert(privacyRequests).values({ id: fresh, userId: ana.userId, kind: 'deletion', status: 'requested', scheduledFor: new Date(Date.now() + 7 * DAY), createdAt: new Date() });
    // Ben asked to delete his account three days before his email changed.
    const older = `prv_ccr_older_${RUN}`;
    await db.insert(privacyRequests).values({ id: older, userId: ben.userId, kind: 'deletion', status: 'requested', scheduledFor: new Date(Date.now() + 4 * DAY), createdAt: new Date(Date.now() - 3 * DAY) });
    await changeEmail(ben, `ccr-ben-new-${RUN}@example.test`);
    const benLink = tokenIn((await latest(ben.email, 'email', 'email-changed'))?.body);

    const now = new Date();
    expect(await redeemContactRevertLink({ db, now, ip: null }, anaLink)).toEqual({ ok: true, code: 'updated' });
    expect(await redeemContactRevertLink({ db, now, ip: null }, benLink)).toEqual({ ok: true, code: 'updated' });

    // Withdrawn as "Keep my account" does, and audited.
    expect((await db.select().from(privacyRequests).where(eq(privacyRequests.id, fresh)))[0]).toMatchObject({ status: 'withdrawn', completedAt: now });
    const [withdrawn] = await auditOf(ana.userId, 'account.deletion_withdrawn');
    expect(withdrawn).toMatchObject({ actorId: null, actorRole: 'system' });
    expect(withdrawn!.metadata).toMatchObject({ via: 'not_me_link', requestId: fresh });
    expect((await auditOf(ana.userId, 'account.contact_change_reported'))[0]!.metadata).toMatchObject({ deletionsWithdrawn: 1 });
    // The older one stays.
    expect((await db.select().from(privacyRequests).where(eq(privacyRequests.id, older)))[0]).toMatchObject({ status: 'requested', completedAt: null });
    expect(await auditOf(ben.userId, 'account.deletion_withdrawn')).toEqual([]);

    const noteOf = async (userId: string) => {
      const [opened] = await casesOf(userId);
      const [note] = await db.select().from(supportCaseEvents).where(eq(supportCaseEvents.caseId, opened!.id));
      return note!.body ?? '';
    };
    const anaNote = await noteOf(ana.userId);
    expect(anaNote).toMatch(/Deleting the account was requested on .+: withdrawn, so it can't run before the account is checked\./);
    expect(anaNote).not.toContain('it happens on');
    expect(await noteOf(ben.userId)).toMatch(/Deleting the account was requested on .+, before .+; it happens on .+ unless it's withdrawn\./);
  });

  it('changes nothing for a forged, unknown or expired link, and says the same for each', async () => {
    const kim = await person('kim');
    await changeEmail(kim, `ccr-kim-new-${RUN}@example.test`);
    const token = tokenIn((await latest(kim.email, 'email', 'email-changed'))?.body);
    const [id, signature] = token.split('.') as [string, string];
    const forged = `${id}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    const [row] = await db.select().from(contactChangeReverts).where(eq(contactChangeReverts.id, id));
    const expired = new Date(row!.expiresAt.getTime() + 1000);

    for (const [attempt, at] of [[forged, new Date()], [contactRevertToken({ id, userId: 'usr_maya', kind: 'email', expiresAt: row!.expiresAt }), new Date()], ['ccr_0123456789abcdef0123456789abcdef.' + signature, new Date()], ['nope', new Date()], [token, expired]] as const) {
      expect(await redeemContactRevertLink({ db, now: at, ip: null }, attempt)).toEqual({ ok: false, code: 'not_found' });
      expect(await getContactRevertPage(db, attempt, at)).toEqual({ state: 'invalid' });
    }
    const user = await userOf(kim.userId);
    expect(user.email).toBe(`ccr-kim-new-${RUN}@example.test`);
    expect(user.contactHoldAt).toBeNull();
    expect(await sessionCount(kim.userId)).toBe(1);
    expect(await casesOf(kim.userId)).toEqual([]);
    expect(await auditOf(kim.userId, 'account.contact_change_reported')).toEqual([]);
    const [still] = await db.select().from(contactChangeReverts).where(eq(contactChangeReverts.id, id));
    expect(still).toMatchObject({ usedAt: null, previousValue: kim.email });
  });

  it('is rate-limited per link and per address, even for the right link', async () => {
    const pat = await person('pat');
    const claim = await recordContactChange(db, { userId: pat.userId, kind: 'phone', previous: '+15125550191', next: '+15125550192' }, new Date());
    const token = contactRevertToken(claim);
    const forged = `${claim.id}.${'A'.repeat(43)}`;
    const now = new Date();
    for (let i = 0; i < 5; i += 1) expect(await redeemContactRevertLink({ db, now, ip: null }, forged)).toEqual({ ok: false, code: 'not_found' });
    expect(await redeemContactRevertLink({ db, now, ip: null }, token)).toMatchObject({ ok: false, code: 'rate_limited', retryAt: expect.any(String) });
    expect(await isContactHeld(db, pat.userId)).toBe(false);
    // Ten tries an hour from one address, whatever the link.
    for (let i = 0; i < 10; i += 1) expect(await redeemContactRevertLink({ db, now, ip: '203.0.113.77' }, `nope-${i}`)).toEqual({ ok: false, code: 'not_found' });
    expect(await redeemContactRevertLink({ db, now, ip: '203.0.113.77' }, 'nope-11')).toMatchObject({ ok: false, code: 'rate_limited' });
    // The next hour, the right link works.
    expect(await redeemContactRevertLink({ db, now: new Date(now.getTime() + HOUR), ip: null }, token)).toEqual({ ok: true, code: 'updated' });
    expect(await isContactHeld(db, pat.userId)).toBe(true);
  });
});

describe('what the links keep', () => {
  it('clears an expired link’s values in the hourly sweep, and removes rows a month after they expired', async () => {
    const jo = await person('jo');
    const now = new Date();
    const live = await recordContactChange(db, { userId: jo.userId, kind: 'email', previous: 'a@example.test', next: 'b@example.test' }, now);
    const lapsed = await recordContactChange(db, { userId: jo.userId, kind: 'email', previous: 'c@example.test', next: 'd@example.test' }, new Date(now.getTime() - CONTACT_REVERT_MS - HOUR));
    const ancient = await recordContactChange(db, { userId: jo.userId, kind: 'phone', previous: '+15125550193', next: '+15125550194' }, new Date(now.getTime() - CONTACT_REVERT_MS - KEEP_SPENT_ROWS_MS - DAY));
    expect(await pruneContactReverts(db, now)).toBeGreaterThanOrEqual(2);
    const rows = new Map((await db.select().from(contactChangeReverts).where(eq(contactChangeReverts.userId, jo.userId))).map((row) => [row.id, row]));
    expect(rows.get(live.id)).toMatchObject({ previousValue: 'a@example.test', newValue: 'b@example.test' });
    expect(rows.get(lapsed.id)).toMatchObject({ previousValue: null, newValue: null });
    expect(rows.has(ancient.id)).toBe(false);
  });

  it('goes with the account when it is deleted', async () => {
    const leaver = await person('leaver');
    await recordContactChange(db, { userId: leaver.userId, kind: 'email', previous: 'old@example.test', next: leaver.email }, new Date());
    await db.insert(passkeys).values(passkey(leaver.userId, `pky_ccr_leaver_${RUN}`, 'Laptop', new Date()));
    const storage = { put: async () => undefined, get: async () => null, delete: async () => undefined } as unknown as FileStorage;
    await anonymizeAccount(db, { storage, cipher: fieldCipherFromEnv(), email: { name: 'memory', send: vi.fn(async () => undefined) }, appUrl: BASE }, leaver.userId, new Date());
    expect(await db.select().from(contactChangeReverts).where(eq(contactChangeReverts.userId, leaver.userId))).toEqual([]);
    expect(await db.select().from(passkeys).where(eq(passkeys.userId, leaver.userId))).toEqual([]);
  });
});

describe('"Not you?" since the security review (SEC15)', () => {
  const finished = (userId: string) => db.update(users).set({ termsAcceptedAt: new Date(), adultAttestedAt: new Date() }).where(eq(users.id, userId));

  it('tells a finished account about a new way to sign in, and its link removes every way in', async () => {
    const lee = await person('linked');
    await finished(lee.userId);
    await db.insert(accounts).values({ id: `acc_ccr_linked_${RUN}`, accountId: `google-linked-${RUN}`, providerId: 'google', userId: lee.userId });
    await createProviderConnectedHook(db)({ userId: lee.userId, providerId: 'google' });
    const notice = await latest(lee.email, 'email', 'sign-in-added');
    expect(notice?.body).toContain('Your Google account can now be used to sign in to your TasksNearMe account.');
    expect(await redeemContactRevertLink({ db, now: new Date(), ip: null }, tokenIn(notice?.body))).toEqual({ ok: true, code: 'updated' });
    expect(await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.userId, lee.userId), eq(accounts.providerId, 'google')))).toEqual([]);
    expect(await sessionCount(lee.userId)).toBe(0);
    expect(await isContactHeld(db, lee.userId)).toBe(true);
    const [opened] = await casesOf(lee.userId);
    expect(opened?.description).toContain('a new way to sign in');
    const [reported] = await auditOf(lee.userId, 'account.contact_change_reported');
    expect(reported!.metadata).toMatchObject({ kind: 'sign_in', method: 'google', reverted: true });
  });

  it('names a new passkey, and says nothing about sign-up’s own first way in', async () => {
    const kim = await person('passkey');
    await finished(kim.userId);
    expect(await noticeSignInAdded({ db, email: outbox, appUrl: BASE }, { userId: kim.userId, method: { kind: 'passkey', name: 'Work laptop' } }, new Date())).toBe(true);
    expect((await latest(kim.email, 'email', 'sign-in-added'))?.body).toContain('A passkey named “Work laptop” can now be used to sign in');
    const newcomer = await person('newcomer');
    await createProviderConnectedHook(db)({ userId: newcomer.userId, providerId: 'google' });
    expect(await latest(newcomer.email, 'email', 'sign-in-added')).toBeNull();
  });
});
