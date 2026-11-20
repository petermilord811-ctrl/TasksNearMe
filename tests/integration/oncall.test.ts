import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmailMessage, EmailProvider } from '@/integrations/email';
import type { SmsMessage, SmsSender } from '@/integrations/sms';
import { bookings } from '@/modules/bookings/schema';
import { users } from '@/modules/accounts/schema';
import { onCallContacts, REPORTER_PAGES_PER_DAY } from '@/modules/oncall/pager';
import { reactForOperations } from '@/modules/oncall/reactions';
import { payments, refunds } from '@/modules/payments/schema';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Completion plan 5.12 against the database: safety reports and urgent cases page the staff on call (by text and
 * email, never with personal details), and a payment nothing is owed for goes back on its own (money review #8), with a
 * case for finance, once, only when it can't.
 * Texts and emails go to stand-ins; a payment and cases made for this file.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const now = new Date();
const env = { ONCALL_PHONES: '+15125550900', ONCALL_EMAILS: 'oncall@example.test', APP_URL: 'https://app.example.test' };
let texts: SmsMessage[] = [];
let emails: EmailMessage[] = [];
const sms: SmsSender = { name: 'test', send: async (message) => void texts.push(message) };
const email: EmailProvider = { name: 'test', send: async (message) => void emails.push(message) } as EmailProvider;
const pager = { sms, email, env };
const event = (type: string, aggregateId: string, payload: Record<string, unknown>) => ({ type, aggregateType: type.startsWith('payment') ? 'payment' : 'support_case', aggregateId, payload });

beforeAll(async () => {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  await db.insert(payments).values([
    { id: 'pay_oc_tip', bookingId: 'bkg_tv', purpose: 'tip', payerUserId: booking!.posterUserId, amountCents: 500, status: 'succeeded', provider: 'dev', providerRef: 'devpi_oc_tip', idempotencyKey: 'pay:oc:tip' },
    { id: 'pay_oc_tip_by_hand', bookingId: 'bkg_tv', purpose: 'tip', payerUserId: booking!.posterUserId, amountCents: 500, status: 'succeeded', provider: 'dev', providerRef: 'devpi_oc_tip_by_hand', idempotencyKey: 'pay:oc:tip:by-hand' },
  ]);
  await db.insert(supportCases).values([
    { id: 'case_oc_urgent', type: 'payment_issue', status: 'open', priority: 'urgent', bookingId: 'bkg_tv', openedByUserId: booking!.posterUserId, description: 'Chargeback.' },
    { id: 'case_oc_normal', type: 'request', status: 'open', priority: 'normal', openedByUserId: booking!.posterUserId, description: 'A question.' },
  ]);
});

afterAll(async () => {
  const opened = await db.select({ id: supportCases.id }).from(supportCases).where(eq(supportCases.description, 'A payment of $5.00 needs a refund: a second tip went through for the same booking.'));
  for (const row of opened) await db.delete(supportCaseEvents).where(eq(supportCaseEvents.caseId, row.id));
  await db.delete(supportCases).where(eq(supportCases.description, 'A payment of $5.00 needs a refund: a second tip went through for the same booking.'));
  await db.delete(supportCases).where(like(supportCases.id, 'case\\_oc\\_%'));
  await db.delete(auditLog).where(and(eq(auditLog.action, 'payment.refund_case_opened'), inArray(auditLog.targetId, ['pay_oc_tip', 'pay_oc_tip_by_hand'])));
  await db.delete(auditLog).where(like(auditLog.targetId, '/admin/cases/case\\_oc\\_%'));
  await db.delete(refunds).where(inArray(refunds.paymentId, ['pay_oc_tip', 'pay_oc_tip_by_hand']));
  await db.delete(payments).where(inArray(payments.id, ['pay_oc_tip', 'pay_oc_tip_by_hand']));
  await pool.end();
});

describe('paging the staff on call', () => {
  it('reaches the configured contacts and trust and safety (Taylor), each once', async () => {
    const contacts = await onCallContacts(db, env);
    expect(contacts.phones).toContain('+15125550900');
    expect(contacts.emails).toEqual(expect.arrayContaining(['oncall@example.test', 'taylor@example.test']));
    expect(new Set(contacts.emails).size).toBe(contacts.emails.length);
  });

  it('pages for a safety report at once, with a link and no personal details', async () => {
    texts = [];
    emails = [];
    await reactForOperations(db, event('support.safety_report', 'case_oc_urgent', { caseId: 'case_oc_urgent', bookingId: 'bkg_tv', reportedBy: 'usr_ben', kind: 'unsafe_now' }), now, pager);
    expect(texts.map((message) => message.to)).toContain('+15125550900');
    expect(texts[0]!.text).toBe('TasksNearMe: Urgent safety report. Someone reported "unsafe now" on a booking. Reply within minutes. https://app.example.test/admin/cases/case_oc_urgent');
    expect(emails.map((message) => message.to)).toEqual(expect.arrayContaining(['oncall@example.test', 'taylor@example.test']));
    expect(emails[0]!.subject).toBe('[On call] Urgent safety report');
    // What the page says (not who it goes to) carries no names, ids or contact details.
    const content = JSON.stringify([...texts.map((message) => message.text), ...emails.map((message) => `${message.subject} ${message.text}`)]);
    expect(content).not.toMatch(/usr_|Ben|@|\+1\d{10}/);
    const [audited] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'oncall.paged'), eq(auditLog.targetId, '/admin/cases/case_oc_urgent')));
    expect(audited!.metadata).toMatchObject({ subject: 'Urgent safety report', failed: 0 });
  });

  it('pages for an urgent case only', async () => {
    texts = [];
    await reactForOperations(db, event('support.case_opened', 'case_oc_normal', { caseId: 'case_oc_normal' }), now, pager);
    expect(texts).toEqual([]);
    await reactForOperations(db, event('support.case_opened', 'case_oc_urgent', { caseId: 'case_oc_urgent' }), now, pager);
    expect(texts[0]!.text).toContain('A payment issue case was opened as urgent.');
  });

  it('pages once per case, whatever sends the event again (5.18)', async () => {
    texts = [];
    await reactForOperations(db, event('support.safety_report', 'case_oc_urgent', { caseId: 'case_oc_urgent', bookingId: 'bkg_tv', reportedBy: 'usr_ben', kind: 'unsafe_now' }), now, pager);
    await reactForOperations(db, event('support.case_opened', 'case_oc_urgent', { caseId: 'case_oc_urgent' }), now, pager);
    // Both kinds of page already went out for this case in the tests above.
    expect(texts).toEqual([]);
  });

  it(`caps one reporter at ${REPORTER_PAGES_PER_DAY} pages a day; later reports still open cases, without paging (5.18)`, async () => {
    texts = [];
    for (let report = 1; report <= REPORTER_PAGES_PER_DAY + 2; report++) {
      await reactForOperations(db, event('support.safety_report', `case_oc_flood_${report}`, { caseId: `case_oc_flood_${report}`, bookingId: 'bkg_tv', reportedBy: 'usr_oc_flooder', kind: 'harassment' }), now, pager);
    }
    expect(texts.filter((message) => message.to === '+15125550900')).toHaveLength(REPORTER_PAGES_PER_DAY);
    const capped = await db.select().from(auditLog).where(and(eq(auditLog.action, 'oncall.page_capped'), like(auditLog.targetId, '/admin/cases/case\\_oc\\_flood\\_%')));
    expect(capped).toHaveLength(2);
    // Someone else's report still pages.
    texts = [];
    await reactForOperations(db, event('support.safety_report', 'case_oc_other', { caseId: 'case_oc_other', bookingId: 'bkg_tv', reportedBy: 'usr_oc_someone_else', kind: 'unsafe_now' }), now, pager);
    expect(texts.length).toBeGreaterThan(0);
  });

  it('leaves out trust and safety staff whose account is suspended (5.18)', async () => {
    const [taylor] = await db.select().from(users).where(eq(users.email, 'taylor@example.test'));
    await db.update(users).set({ status: 'suspended' }).where(eq(users.id, taylor!.id));
    try {
      expect((await onCallContacts(db, env)).emails).not.toContain('taylor@example.test');
    } finally {
      await db.update(users).set({ status: taylor!.status }).where(eq(users.id, taylor!.id));
    }
  });
});

describe('a payment nothing is owed for', () => {
  const caseFor = (description: string) => db.select().from(supportCases).where(eq(supportCases.description, description));

  it('goes back on its own, once, with no case (money review #8)', async () => {
    const refund = event('payment.refund_needed', 'pay_oc_tip', { paymentId: 'pay_oc_tip', bookingId: 'bkg_tv', reason: 'second_tip' });
    await reactForOperations(db, refund, now, pager);
    await reactForOperations(db, refund, now, pager);
    const back = await db.select().from(refunds).where(eq(refunds.paymentId, 'pay_oc_tip'));
    expect(back.map((row) => [row.amountCents, row.reason, row.status])).toEqual([[500, 'second_tip', 'succeeded']]);
    expect((await db.select({ status: payments.status }).from(payments).where(eq(payments.id, 'pay_oc_tip')))[0]?.status).toBe('refunded');
    expect(await db.select().from(auditLog).where(and(eq(auditLog.action, 'payment.refund_case_opened'), eq(auditLog.targetId, 'pay_oc_tip')))).toHaveLength(0);
  });

  it('opens a high-priority payment case once when it can’t go back on its own, pointing a tip to the Stripe Dashboard', async () => {
    const refund = event('payment.refund_needed', 'pay_oc_tip_by_hand', { paymentId: 'pay_oc_tip_by_hand', bookingId: 'bkg_tv', reason: 'second_tip' });
    // No payment provider here: a person refunds it.
    await reactForOperations(db, refund, now, pager, null);
    await reactForOperations(db, refund, now, pager, null);
    const cases = await caseFor('A payment of $5.00 needs a refund: a second tip went through for the same booking.');
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ type: 'payment_issue', priority: 'high', bookingId: 'bkg_tv', status: 'open' });
    const [note] = await db.select().from(supportCaseEvents).where(eq(supportCaseEvents.caseId, cases[0]!.id));
    expect(note).toMatchObject({ visibility: 'internal', body: expect.stringContaining('Refund payment pay_oc_tip_by_hand ($5.00) in the Stripe Dashboard') });
    expect(await db.select().from(refunds).where(eq(refunds.paymentId, 'pay_oc_tip_by_hand'))).toHaveLength(0);
  });
});
