import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { EmailMessage, EmailProvider } from '@/integrations/email';
import { PUBLIC_SUPPORT_RULES, submitPublicSupportRequest, type PublicSupportDeps } from '@/modules/support/public-requests';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { getSupportPage } from '@/modules/support/service';
import { EMAIL_CONTACT_RULE, getAdminCase, getAdminCases, staffEmailContact, staffReply, type StaffActor } from '@/modules/support/staff';
import { fieldError } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/** Completion plan 5.22: the public contact form, its cases, and staff's emailed answers. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const sent: EmailMessage[] = [];
const mail: EmailProvider = { name: 'test', send: async (message) => void sent.push(message) };
const message = 'I changed phones and the sign-in code never arrives at my old number.';
const stranger = 'nobody-5-22@example.test';
/** Each test has its own clock, address and IP, so the fixed-window limits start empty. */
const at = (day: number) => new Date(Date.UTC(2027, 0, day, 15, 0, 0));

function deps(over: Partial<PublicSupportDeps> = {}): PublicSupportDeps {
  return { db, email: mail, appUrl: 'https://tasksnearme.test', checkBot: async () => null, ip: '203.0.113.1', locale: 'en', now: at(1), ...over };
}

async function casesFor(email: string) {
  return db.select().from(supportCases).where(eq(supportCases.contactEmail, email));
}

describe('the public contact form', () => {
  it('answers the same whether or not an account uses the address, and never repeats the message', async () => {
    sent.length = 0;
    const known = await submitPublicSupportRequest(deps({ ip: '203.0.113.10' }), { email: 'Maya@Example.test', topic: 'account_access', message });
    const unknown = await submitPublicSupportRequest(deps({ ip: '203.0.113.10' }), { email: stranger, topic: 'account_access', message });
    expect(known).toEqual({ ok: true, code: 'submitted' });
    expect(unknown).toEqual(known);
    expect(sent.map((email) => email.to)).toEqual(['maya@example.test', stranger]);
    expect(sent[0]!.subject).toBe(sent[1]!.subject);
    expect(sent[0]!.text).toBe(sent[1]!.text);
    for (const email of sent) {
      expect(email.text).not.toContain('phones');
      expect(email.html).not.toContain('phones');
      expect(email.text).toContain('https://tasksnearme.test/help/contact');
    }
  });

  it('opens a case keyed by the address, with no member on it, that only staff see', async () => {
    const [row] = await casesFor(stranger);
    expect(row).toMatchObject({ openedByUserId: null, contactEmail: stranger, contactLocale: 'en', type: 'account', topic: 'account_access', priority: 'high', status: 'open', description: message });
    const [opened] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'support.case_opened'), eq(outboxEvents.aggregateId, row!.id)));
    expect(opened?.payload).toMatchObject({ caseId: row!.id, type: 'account', contact: true });

    // In the requests queue, by address.
    const list = await getAdminCases(db, alex, { queue: 'requests', status: 'active', mine: false }, at(1));
    const listed = list.cases.find((item) => item.id === row!.id);
    expect(listed).toMatchObject({ contact: { email: stranger }, subject: 'Can’t get into their account', priority: 'high', awaitingReply: true });
    expect(listed?.openedBy).toBeUndefined();

    // Staff see whether an account uses the address; the account itself never sees the case.
    const page = await getAdminCase(db, alex, row!.id, at(1));
    expect(page?.data.contact).toEqual({ email: stranger, locale: 'en' });
    expect(page?.data.parties).toEqual([]);
    expect(page?.data.nextStatuses).toEqual(['awaiting_support', 'escalated']);
    const [maya] = await casesFor('maya@example.test');
    expect((await getAdminCase(db, alex, maya!.id, at(1)))?.data.contact).toEqual({ email: 'maya@example.test', locale: 'en', matchesAccount: { id: 'usr_maya', displayName: expect.any(String) } });
    expect((await getSupportPage(db, 'usr_maya')).cases.map((item) => item.id)).not.toContain(maya!.id);
  });

  it('adds a second message on the same topic to the open case, and opens another for a new topic', async () => {
    const [before] = await casesFor(stranger);
    expect(await submitPublicSupportRequest(deps({ ip: '203.0.113.11', now: at(2), locale: 'es' }), { email: stranger, topic: 'account_access', message: 'Also, I can still get email here, just not texts.' })).toMatchObject({ ok: true });
    const rows = await casesFor(stranger);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: before!.id, contactLocale: 'es' });
    const page = await getAdminCase(db, alex, before!.id, at(2));
    expect(page?.data.events.at(-1)).toMatchObject({ kind: 'message', actor: { kind: 'contact', email: stranger }, body: 'Also, I can still get email here, just not texts.' });

    expect(await submitPublicSupportRequest(deps({ ip: '203.0.113.11', now: at(2) }), { email: stranger, topic: 'payment', message: 'I was charged for a booking I never made, I think.' })).toMatchObject({ ok: true });
    expect((await casesFor(stranger)).map((row) => row.topic).sort()).toEqual(['account_access', 'payment']);
  });

  it('checks the form and the bot check before anything is counted or opened', async () => {
    const email = 'bot-5-22@example.test';
    expect(await submitPublicSupportRequest(deps({ ip: '203.0.113.12', now: at(3) }), { email, topic: 'other', message: 'Too short' })).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { message: ['too_short'] } });
    expect(await submitPublicSupportRequest(deps({ ip: '203.0.113.12', now: at(3) }), { email: 'not an address', topic: 'other', message })).toMatchObject({ ok: false, fieldErrors: { email: ['invalid'] } });
    const refused = fieldError('botCheck', 'invalid');
    expect(await submitPublicSupportRequest(deps({ ip: '203.0.113.12', now: at(3), checkBot: async () => refused }), { email, topic: 'other', message })).toEqual(refused);
    expect(await casesFor(email)).toHaveLength(0);
    // None of those used up the address's allowance.
    for (let i = 0; i < PUBLIC_SUPPORT_RULES.perEmail.limit; i += 1) {
      expect(await submitPublicSupportRequest(deps({ ip: '203.0.113.12', now: at(3) }), { email, topic: 'other', message })).toMatchObject({ ok: true });
    }
  });

  it('limits each address and each IP', async () => {
    const email = 'flood-5-22@example.test';
    for (let i = 0; i < PUBLIC_SUPPORT_RULES.perEmail.limit; i += 1) {
      expect(await submitPublicSupportRequest(deps({ ip: `203.0.113.${20 + i}`, now: at(4) }), { email, topic: 'other', message })).toMatchObject({ ok: true });
    }
    expect(await submitPublicSupportRequest(deps({ ip: '203.0.113.29', now: at(4) }), { email, topic: 'other', message })).toMatchObject({ ok: false, code: 'rate_limited', retryAt: expect.any(String) });

    for (let i = 0; i < PUBLIC_SUPPORT_RULES.perIp.limit; i += 1) {
      expect(await submitPublicSupportRequest(deps({ ip: '203.0.113.30', now: at(5) }), { email: `ip-${i}-5-22@example.test`, topic: 'other', message })).toMatchObject({ ok: true });
    }
    expect(await submitPublicSupportRequest(deps({ ip: '203.0.113.30', now: at(5) }), { email: 'ip-last-5-22@example.test', topic: 'other', message })).toMatchObject({ ok: false, code: 'rate_limited' });
    expect(await casesFor('ip-last-5-22@example.test')).toHaveLength(0);
  });
});

describe('staff answering a public request by email', () => {
  it('emails the address in its language, records it, audits it, and stops the clock', async () => {
    const [row] = await db.select().from(supportCases).where(and(eq(supportCases.contactEmail, stranger), eq(supportCases.topic, 'account_access')));
    sent.length = 0;
    const result = await staffEmailContact(db, { email: mail, appUrl: 'https://tasksnearme.test' }, alex, row!.id, { body: 'Hola {first_name}, gracias por escribir.\n\nPrueba a iniciar sesión con tu correo.' }, at(6));
    expect(result).toEqual({ ok: true, code: 'sent' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: stranger, subject: 'Una respuesta de soporte de TasksNearMe', tag: 'support-reply' });
    // No name is known for an address: the greeting drops it.
    expect(sent[0]!.text).toContain('Hola, gracias por escribir.');
    // Its help link opens in Spanish too (messages pass J-M1).
    expect(sent[0]!.text).toContain('https://tasksnearme.test/es/help/contact');

    const [event] = await db.select().from(supportCaseEvents).where(and(eq(supportCaseEvents.caseId, row!.id), eq(supportCaseEvents.authorUserId, 'usr_alex')));
    expect(event).toMatchObject({ kind: 'message', partyUserId: null, meta: { emailed: true } });
    const [audited] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'case.email_contact'), eq(auditLog.targetId, row!.id)));
    expect(audited).toMatchObject({ actorId: 'usr_alex', metadata: { caseId: row!.id, eventId: event!.id } });
    const [after] = await db.select().from(supportCases).where(eq(supportCases.id, row!.id));
    expect(after?.firstResponseAt).toEqual(at(6));

    const page = await getAdminCase(db, alex, row!.id, at(6));
    expect(page?.data.events.at(-1)).toMatchObject({ kind: 'message', emailed: true, actor: { kind: 'staff' } });
    expect(page?.data.case.awaitingReply).toBe(false);
    // Members' replies don't apply: there is nobody to reply to in the app.
    expect(await staffReply(db, alex, row!.id, { partyId: 'usr_maya', body: 'Hi' }, at(6))).toMatchObject({ ok: false, fieldErrors: { partyId: ['invalid'] } });
  });

  it('records nothing when the email fails, refuses member cases, and limits each case', async () => {
    const [row] = await db.select().from(supportCases).where(and(eq(supportCases.contactEmail, stranger), eq(supportCases.topic, 'payment')));
    const failing: EmailProvider = { name: 'down', send: async () => { throw new Error('provider down'); } };
    expect(await staffEmailContact(db, { email: failing, appUrl: 'https://tasksnearme.test' }, alex, row!.id, { body: 'We looked into the charge.' }, at(7))).toEqual({ ok: false, code: 'unknown' });
    expect(await db.select().from(supportCaseEvents).where(eq(supportCaseEvents.caseId, row!.id))).toHaveLength(0);

    const [memberCase] = await db.select({ id: supportCases.id }).from(supportCases).where(eq(supportCases.openedByUserId, 'usr_ben')).limit(1);
    if (memberCase) expect(await staffEmailContact(db, { email: mail, appUrl: 'https://tasksnearme.test' }, alex, memberCase.id, { body: 'Hello there.' }, at(7))).toEqual({ ok: false, code: 'not_allowed' });

    // The failed send above counted: the limit is on attempts.
    for (let i = 1; i < EMAIL_CONTACT_RULE.limit; i += 1) {
      expect(await staffEmailContact(db, { email: mail, appUrl: 'https://tasksnearme.test' }, alex, row!.id, { body: `Update ${i} on your charge.` }, at(7))).toMatchObject({ ok: true });
    }
    expect(await staffEmailContact(db, { email: mail, appUrl: 'https://tasksnearme.test' }, alex, row!.id, { body: 'One more update.' }, at(7))).toMatchObject({ ok: false, code: 'rate_limited' });
  });
});
