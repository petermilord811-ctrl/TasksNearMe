import { createHmac } from 'node:crypto';
import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { routes, type EarningsPageData, type StaffRole } from '@/contracts';
import type { StripeConnect } from '@/integrations/payments/stripe-connect';
import { users } from '@/modules/accounts/schema';
import { runBookingAction } from '@/modules/bookings/hub';
import { bookingCompletionPhotos, bookingCompletions, bookingTerms, bookings } from '@/modules/bookings/schema';
import { earnings, payouts } from '@/modules/earnings/schema';
import { getEarningsPage } from '@/modules/earnings/service';
import { journalsOfBooking } from '@/modules/ledger/journal';
import { ledgerEntries, ledgerJournals } from '@/modules/ledger/schema';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { messages, threads } from '@/modules/messaging/schema';
import { runScheduledTransfers } from '@/modules/payments/connect';
import { quoteBreakdown } from '@/modules/payments/fees';
import { payments } from '@/modules/payments/schema';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { getAdminBooking } from '@/modules/support/staff-money';
import { files, tasks } from '@/modules/tasks/schema';
import { payoutAccounts } from '@/modules/verification/schema';
import { receiveWebhook } from '@/modules/webhooks/inbox';
import { webhookEvents } from '@/modules/webhooks/schema';
import { auditLog } from '@/platform/audit/schema';
import { GET as downloadEvidencePack } from '@/app/api/admin/bookings/[bookingId]/evidence-pack/route';
import { throwawayClient } from '../support/people';

/**
 * T-18: chargebacks through Stripe's signed dispute events (the real inbox, dispatch and handlers; a fake Stripe).
 * Before approval, the helper's earnings are held while the client's bank disputes the charge, and go out once
 * the dispute is won. After the payout, the helper keeps what they were paid, a lost chargeback is the platform's
 * loss in the ledger (a balanced `chargeback_loss` journal, once), and finance downloads the evidence pack (the
 * approval log, completion photos, messages, check-in), audited; nobody else can. A helper and a client made for
 * this file, with two bookings paid by card on Stripe: one waiting for approval, one completed and paid out.
 */

const { db, pool, viewer, stripeFetch, savedEnv } = await vi.hoisted(async () => {
  const { createDb } = await import('@/platform/db/connect');
  const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 6 });
  const savedEnv = { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET };
  // Stripe as the money provider for this file (scheduled transfers); its API answers from here, never the network.
  process.env.STRIPE_SECRET_KEY = 'sk_test_t18';
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_t18';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_t18_chargebacks';
  const stripeFetch = (async (url: string) => {
    const { pathname } = new URL(url);
    const body = pathname === '/v1/balance' ? { instant_available: [] } : { error: { type: 'invalid_request_error' } };
    return new Response(JSON.stringify(body), { status: pathname === '/v1/balance' ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { db, pool, stripeFetch, savedEnv, viewer: { current: { kind: 'public' } as Record<string, unknown> } };
});
vi.mock('@/platform/db/client', () => ({ db }));
vi.mock('@/platform/auth/viewer', () => ({ getViewer: async () => viewer.current }));
vi.mock('@/modules/bookings/server', async () => {
  const { createStripePayments } = await import('@/integrations/payments/stripe');
  const deps = { db, payments: createStripePayments({ secretKey: 'sk_test_t18', fetch: stripeFetch }) };
  return { bookingDeps: () => deps, hubDeps: () => ({ db, cipher: null, payments: deps.payments }) };
});

const SECRET = 'whsec_t18_chargebacks';
const HELPER = 'usr_t18_helper';
const CLIENT = 'usr_t18_client';
const BEFORE = 'bkg_t18_before';
const AFTER = 'bkg_t18_after';
const PLAIN = 'bkg_t18_plain';
const ACCOUNT = 'acct_t18_helper';
const DAY = 86_400_000;
const breakdown = quoteBreakdown(DEFAULT_FEES, { type: 'fixed', priceCents: 6000 });

const transfers: Parameters<StripeConnect['transfer']>[0][] = [];
const connect = {
  provider: 'stripe',
  chargeOf: async () => ({ chargeId: 'ch_t18', amountCents: breakdown.posterTotalCents }),
  transfer: async (input: Parameters<StripeConnect['transfer']>[0]) => {
    transfers.push(input);
    return { ok: true as const, transferId: `tr_t18_${transfers.length}` };
  },
} as unknown as StripeConnect;

let delivered = 0;
/** A dispute event for one of this file's charges, signed as Stripe signs it, through the inbox. */
function deliver(type: 'charge.dispute.created' | 'charge.dispute.closed', dispute: { id: string; intent: string; status: string; fee?: number }, eventId = `evt_t18_${++delivered}`) {
  const object = {
    id: dispute.id,
    object: 'dispute',
    amount: breakdown.posterTotalCents,
    payment_intent: dispute.intent,
    reason: 'product_not_received',
    status: dispute.status,
    evidence_details: { due_by: Math.floor((Date.now() + 14 * DAY) / 1000) },
    ...(dispute.fee !== undefined ? { balance_transactions: [{ object: 'balance_transaction', amount: -breakdown.posterTotalCents, fee: dispute.fee, reporting_category: 'dispute' }] } : {}),
  };
  const payload = JSON.stringify({ id: eventId, object: 'event', type, data: { object } });
  const now = new Date();
  const t = Math.floor(now.getTime() / 1000);
  return receiveWebhook(db, 'stripe', payload, { 'stripe-signature': `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')}` }, now);
}
const rowOf = (page: EarningsPageData, bookingId: string) => page.rows.find((row) => row.bookingId === bookingId && row.kind === 'earnings');
const statusOf = async (bookingId: string) => (await db.select({ status: earnings.status }).from(earnings).where(eq(earnings.bookingId, bookingId))).map((row) => row.status);
const download = (bookingId: string) => downloadEvidencePack(new Request(`http://localhost${routes.api.evidencePack(bookingId)}`), { params: Promise.resolve({ bookingId }) } as never);
const staffViewer = (id: string, roles: string[], twoStep = true) => ({ kind: 'user', user: { id, staffRoles: roles, staffTwoStepVerified: twoStep } });

/** A copy of the TV booking between this file's client and helper, paid on Stripe. */
async function booking(id: string, values: Partial<typeof bookings.$inferInsert>, intent: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  const [paid] = await db.select().from(payments).where(eq(payments.bookingId, 'bkg_tv'));
  const taskId = `tsk_${id.slice(4)}`;
  await db.insert(tasks).values({ ...task!, id: taskId, slug: `${taskId}-slug`, posterUserId: CLIENT, status: values.status === 'completed' ? 'completed' : 'assigned' });
  await db.insert(bookings).values({ ...tv!, id, taskId, offerId: null, posterUserId: CLIENT, helperUserId: HELPER, seriesId: null, visitIndex: null, ...values });
  await db.insert(bookingTerms).values({ ...terms!, id: `btm_${id.slice(4)}`, bookingId: id, version: 1, priceCents: 6000, breakdown });
  await db.insert(payments).values({ ...paid!, id: `pay_${id.slice(4)}`, bookingId: id, payerUserId: CLIENT, amountCents: breakdown.posterTotalCents, provider: 'stripe', providerRef: intent, status: 'succeeded', disputeStatus: null, disputeId: null, idempotencyKey: `test:${id}` });
}

beforeAll(async () => {
  vi.stubGlobal('fetch', stripeFetch);
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  await db.insert(users).values({ ...jordan!, id: HELPER, email: 'tmp-t18-helper@example.test', name: 'Hale H.', firstName: 'Hale', lastName: 'Hart', phone: null, phoneVerifiedAt: null });
  await throwawayClient(db, CLIENT);
  await db.insert(payoutAccounts).values({ userId: HELPER, provider: 'stripe', providerAccountId: ACCOUNT, status: 'active', activatedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });

  // Waiting for the client's approval.
  const submitted = new Date(Date.now() - 2 * 3_600_000);
  await booking(BEFORE, { status: 'completion_submitted', startAt: new Date(Date.now() - DAY), confirmedAt: new Date(Date.now() - 3 * DAY), arrivedAt: new Date(Date.now() - DAY), completionSubmittedAt: submitted, approvalDueAt: new Date(submitted.getTime() + 72 * 3_600_000) }, 'pi_t18_before');
  await db.insert(bookingCompletions).values({ bookingId: BEFORE, submittedAt: submitted, note: 'Assembled and level.', finalBreakdown: breakdown });

  // Done, approved by the client, and paid out to the helper's bank.
  const done = new Date(Date.now() - 10 * DAY);
  await booking(AFTER, { status: 'completed', startAt: new Date(done.getTime() - 3 * 3_600_000), confirmedAt: new Date(done.getTime() - 5 * DAY), onMyWayAt: new Date(done.getTime() - 4 * 3_600_000), arrivedAt: new Date(done.getTime() - 3 * 3_600_000), completionSubmittedAt: new Date(done.getTime() - 3_600_000), completedAt: done, completedVia: 'poster' }, 'pi_t18_after');
  await db.insert(files).values({ id: 'fil_t18_photo', ownerUserId: HELPER, kind: 'evidence', storageKey: 'test/t18-photo.jpg', contentType: 'image/jpeg', width: 1200, height: 900, bytes: 120_000 });
  await db.insert(bookingCompletions).values({ bookingId: AFTER, submittedAt: new Date(done.getTime() - 3_600_000), note: 'Desk built, packaging taken away.', finalBreakdown: breakdown, checklist: { all_parts_used: true, level_and_stable: true } });
  await db.insert(bookingCompletionPhotos).values({ bookingId: AFTER, fileId: 'fil_t18_photo', position: 0 });
  await db.insert(payouts).values({ id: 'po_t18_after', helperUserId: HELPER, amountCents: breakdown.helperEarningsCents, status: 'paid', arrivalDate: new Date(done.getTime() + 3 * DAY).toISOString().slice(0, 10), bankLast4: '', providerRef: 'po_stripe_t18', createdAt: new Date(done.getTime() + 2 * DAY) });
  await db.insert(earnings).values({ id: 'ern_t18_after', bookingId: AFTER, helperUserId: HELPER, kind: 'earnings', amountCents: breakdown.helperEarningsCents, status: 'paid_out', transferRef: 'tr_t18_after', transferredAt: done, payoutId: 'po_t18_after', createdAt: done });
  const [thread] = await db.insert(threads).values({ id: 'thr_t18_after', kind: 'booking', linkedId: AFTER, taskId: 'tsk_t18_after', createdAt: new Date(done.getTime() - 5 * DAY) }).returning();
  await db.insert(messages).values([
    { id: 'msg_t18_1', threadId: thread!.id, senderUserId: CLIENT, kind: 'text', body: 'The desk is in the box by the door.', createdAt: new Date(done.getTime() - 5 * DAY) },
    { id: 'msg_t18_2', threadId: thread!.id, senderUserId: HELPER, kind: 'text', body: 'All done, photos attached.', attachmentFileIds: ['fil_t18_photo'], createdAt: new Date(done.getTime() - 3_600_000) },
    { id: 'msg_t18_3', threadId: thread!.id, senderUserId: null, kind: 'status', event: { type: 'approved' }, createdAt: done },
  ]);
  await db.insert(auditLog).values([
    { id: 'aud_t18_1', at: new Date(done.getTime() - 3 * 3_600_000).toISOString(), actorId: HELPER, actorRole: 'user', action: 'booking.arrived', targetType: 'booking', targetId: AFTER },
    { id: 'aud_t18_2', at: new Date(done.getTime() - 3_600_000).toISOString(), actorId: HELPER, actorRole: 'user', action: 'booking.completion_submitted', targetType: 'booking', targetId: AFTER },
    { id: 'aud_t18_3', at: done.toISOString(), actorId: CLIENT, actorRole: 'user', action: 'booking.completed', targetType: 'booking', targetId: AFTER },
    { id: 'aud_t18_4', at: done.toISOString(), actorId: 'usr_alex', actorRole: 'support_agent', action: 'booking.view_address', targetType: 'booking', targetId: AFTER, reason: 'Checking the access notes.' },
  ]);

  // Never charged back.
  await booking(PLAIN, { status: 'completed', completedAt: done, completedVia: 'auto' }, 'pi_t18_plain');
});

afterAll(async () => {
  vi.unstubAllGlobals();
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  const mine = [BEFORE, AFTER, PLAIN];
  try {
    const journals = (await db.select({ id: ledgerJournals.id }).from(ledgerJournals).where(inArray(ledgerJournals.bookingId, mine))).map((row) => row.id);
    if (journals.length > 0) {
      await db.delete(ledgerEntries).where(inArray(ledgerEntries.journalId, journals));
      await db.delete(ledgerJournals).where(inArray(ledgerJournals.id, journals));
    }
    const cases = (await db.select({ id: supportCases.id }).from(supportCases).where(inArray(supportCases.bookingId, mine))).map((row) => row.id);
    if (cases.length > 0) {
      await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, cases));
      await db.delete(supportCases).where(inArray(supportCases.id, cases));
    }
    await db.delete(auditLog).where(inArray(auditLog.targetId, mine));
    await db.delete(webhookEvents).where(like(webhookEvents.eventId, 'evt\\_t18\\_%'));
    await db.delete(messages).where(eq(messages.threadId, 'thr_t18_after'));
    await db.delete(threads).where(eq(threads.id, 'thr_t18_after'));
    await db.delete(bookingCompletionPhotos).where(inArray(bookingCompletionPhotos.bookingId, mine));
    await db.delete(bookingCompletions).where(inArray(bookingCompletions.bookingId, mine));
    await db.delete(files).where(eq(files.id, 'fil_t18_photo'));
    await db.delete(earnings).where(eq(earnings.helperUserId, HELPER));
    await db.delete(payouts).where(eq(payouts.helperUserId, HELPER));
    await db.delete(payments).where(inArray(payments.bookingId, mine));
    await db.delete(bookingTerms).where(inArray(bookingTerms.bookingId, mine));
    await db.delete(bookings).where(inArray(bookings.id, mine));
    await db.delete(tasks).where(like(tasks.id, 'tsk\\_t18\\_%'));
    await db.delete(payoutAccounts).where(eq(payoutAccounts.userId, HELPER));
  } finally {
    await pool.end();
  }
});

describe('T-18: chargebacks', () => {
  it('holds the helper’s earnings while a chargeback opened before approval is open, and sends them once it’s won', async () => {
    expect(await deliver('charge.dispute.created', { id: 'dp_t18_before', intent: 'pi_t18_before', status: 'needs_response' })).toEqual({ status: 200, body: { ok: true } });
    // The work waiting for approval shows as held, not just "not due yet".
    expect(rowOf(await getEarningsPage(db, HELPER, new Date()), BEFORE)).toMatchObject({ status: 'on_hold', holdReason: 'dispute', amountCents: breakdown.helperEarningsCents });

    // The client approves anyway: the earnings are recorded for the transfer, which waits.
    expect(await runBookingAction(db, CLIENT, BEFORE, 'approve', new Date())).toEqual({ ok: true, code: 'approved' });
    expect(await statusOf(BEFORE)).toEqual(['scheduled']);
    await runScheduledTransfers(db, connect, new Date());
    expect(await statusOf(BEFORE)).toEqual(['scheduled']);
    expect(transfers.some((transfer) => transfer.group === `booking:${BEFORE}`)).toBe(false);
    const held = await getEarningsPage(db, HELPER, new Date());
    expect(rowOf(held, BEFORE)).toMatchObject({ status: 'on_hold', holdReason: 'dispute' });
    expect(held.totals.upcomingCents).toBeGreaterThanOrEqual(breakdown.helperEarningsCents);

    // Won: the hold lifts and the money goes out; a won chargeback costs the platform nothing.
    expect(await deliver('charge.dispute.closed', { id: 'dp_t18_before', intent: 'pi_t18_before', status: 'won' })).toEqual({ status: 200, body: { ok: true } });
    await runScheduledTransfers(db, connect, new Date());
    expect(await statusOf(BEFORE)).toEqual(['transferred']);
    expect(transfers.filter((transfer) => transfer.group === `booking:${BEFORE}`)).toEqual([expect.objectContaining({ amountCents: breakdown.helperEarningsCents, accountId: ACCOUNT })]);
    expect(rowOf(await getEarningsPage(db, HELPER, new Date()), BEFORE)).toMatchObject({ status: 'transferred' });
    expect(rowOf(await getEarningsPage(db, HELPER, new Date()), BEFORE)?.holdReason).toBeUndefined();
    expect(await journalsOfBooking(db, BEFORE)).toEqual([]);
  });

  it('lets the helper keep money already paid out, and records a lost chargeback as the platform’s loss, once', async () => {
    expect(await deliver('charge.dispute.created', { id: 'dp_t18_after', intent: 'pi_t18_after', status: 'needs_response' })).toEqual({ status: 200, body: { ok: true } });
    expect(rowOf(await getEarningsPage(db, HELPER, new Date()), AFTER)).toMatchObject({ status: 'paid_out', payout: { id: 'po_t18_after' } });

    const closed = `evt_t18_after_lost`;
    expect(await deliver('charge.dispute.closed', { id: 'dp_t18_after', intent: 'pi_t18_after', status: 'lost', fee: 1500 }, closed)).toEqual({ status: 200, body: { ok: true } });
    const [journal, ...more] = await journalsOfBooking(db, AFTER);
    expect(more).toEqual([]);
    expect(journal).toMatchObject({ kind: 'chargeback_loss', providerRef: 'dp_t18_after' });
    expect(journal!.entries).toEqual(
      expect.arrayContaining([
        { account: 'expense:chargeback_losses', debitCents: breakdown.posterTotalCents, creditCents: 0 },
        { account: 'expense:processing', debitCents: 1500, creditCents: 0 },
        { account: 'cash:stripe_platform', debitCents: 0, creditCents: breakdown.posterTotalCents + 1500 },
      ]),
    );
    expect(journal!.entries.reduce((sum, entry) => sum + entry.debitCents - entry.creditCents, 0)).toBe(0);

    // The same outcome again, redelivered or as a new event: still one journal.
    expect(await deliver('charge.dispute.closed', { id: 'dp_t18_after', intent: 'pi_t18_after', status: 'lost', fee: 1500 }, closed)).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect(await deliver('charge.dispute.closed', { id: 'dp_t18_after', intent: 'pi_t18_after', status: 'lost', fee: 1500 })).toEqual({ status: 200, body: { ok: true, ignored: true } });
    expect(await journalsOfBooking(db, AFTER)).toHaveLength(1);

    // The helper still has their money; the payment shows the lost chargeback.
    expect(rowOf(await getEarningsPage(db, HELPER, new Date()), AFTER)).toMatchObject({ status: 'paid_out' });
    expect((await db.select().from(payments).where(eq(payments.bookingId, AFTER)))[0]).toMatchObject({ status: 'succeeded', disputeStatus: 'lost', disputeId: 'dp_t18_after' });
    // The case's note tells finance where the evidence pack is.
    const [opened] = await db.select({ id: supportCases.id }).from(supportCases).where(and(eq(supportCases.bookingId, AFTER), eq(supportCases.type, 'payment_issue')));
    const notes = await db.select({ body: supportCaseEvents.body }).from(supportCaseEvents).where(eq(supportCaseEvents.caseId, opened!.id));
    // Any of the case's notes (they come back in no set order: "dispute closed" is a note too).
    expect(notes.map((note) => note.body)).toContainEqual(expect.stringContaining(routes.api.evidencePack(AFTER)));
  });

  it('gives finance the evidence pack as a download, audited, and nobody else', async () => {
    viewer.current = staffViewer('usr_casey', ['finance']);
    const response = await download(AFTER);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="evidence-${AFTER}.json"`);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const pack = await response.json();
    expect(pack).toMatchObject({
      pack: { kind: 'chargeback_evidence', generatedBy: { id: 'usr_casey', role: 'finance' } },
      disputes: [{ disputeId: 'dp_t18_after', status: 'chargeback_lost', stripePaymentIntent: 'pi_t18_after', amountCents: breakdown.posterTotalCents }],
      booking: { id: AFTER, status: 'completed' },
      client: { id: CLIENT, email: `${CLIENT}@example.test` },
      helper: { id: HELPER, displayName: 'Hale H.' },
      terms: { priceCents: 6000, breakdown: { posterTotalCents: breakdown.posterTotalCents } },
      checkIn: { arrivedAt: expect.any(String), onMyWayAt: expect.any(String) },
      completion: { note: 'Desk built, packaging taken away.', photos: [{ fileId: 'fil_t18_photo', url: '/api/files/fil_t18_photo' }], checklist: expect.arrayContaining([{ item: 'all_parts_used', done: true }]) },
      approval: { via: 'client' },
      ledger: [{ kind: 'chargeback_loss' }],
    });
    // The approval log: the people's own steps, without staff look-ups.
    expect(pack.log.map((entry: { action: string; by: string }) => [entry.action, entry.by])).toEqual([
      ['booking.arrived', 'helper'],
      ['booking.completion_submitted', 'helper'],
      ['booking.completed', 'client'],
    ]);
    expect(pack.messages.map((message: { from: string; text: string }) => [message.from, message.text])).toEqual([
      ['client', 'The desk is in the box by the door.'],
      ['helper', 'All done, photos attached.'],
      ['system', 'approved'],
    ]);
    expect(pack.messages[1].photos).toEqual(['/api/files/fil_t18_photo']);
    expect(JSON.stringify(pack)).not.toMatch(/address/i);
    const [audited] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'booking.evidence_pack_downloaded'), eq(auditLog.targetId, AFTER)));
    expect(audited).toMatchObject({ actorId: 'usr_casey', reason: 'Chargeback dp_t18_after' });

    // Admins too; a support agent, staff without this session's two-step check, members and the public get a 404.
    viewer.current = staffViewer('usr_riley', ['admin']);
    expect((await download(AFTER)).status).toBe(200);
    for (const someone of [staffViewer('usr_alex', ['support_agent']), staffViewer('usr_casey', ['finance'], false), staffViewer(CLIENT, []), { kind: 'public' }]) {
      viewer.current = someone;
      expect((await download(AFTER)).status).toBe(404);
    }
    // A booking whose charge was never disputed has no pack.
    viewer.current = staffViewer('usr_casey', ['finance']);
    expect((await download(PLAIN)).status).toBe(404);
    expect((await download('bkg_t18_missing')).status).toBe(404);

    // The staff booking page offers it to finance on a charged-back booking only.
    const actionsOf = async (staff: { id: string; roles: StaffRole[] }, bookingId: string) => (await getAdminBooking(db, staff, bookingId, new Date()))?.actions ?? [];
    expect(await actionsOf({ id: 'usr_casey', roles: ['finance'] }, AFTER)).toContain('download_evidence_pack');
    expect(await actionsOf({ id: 'usr_alex', roles: ['support_agent'] }, AFTER)).not.toContain('download_evidence_pack');
    expect(await actionsOf({ id: 'usr_casey', roles: ['finance'] }, PLAIN)).not.toContain('download_evidence_pack');
  });

  it('hides contact details from the pack, only while a dispute is live, and audits the role that allowed it (5.18)', async () => {
    // The pack leaves the platform (Stripe, the card issuer): phone numbers and emails come out masked, everywhere.
    await db.insert(messages).values({ id: 'msg_t18_contact', threadId: 'thr_t18_after', senderUserId: CLIENT, kind: 'text', body: 'Call me at 512-555-0142 or write to me@client.example.', createdAt: new Date() });
    await db.update(bookingTerms).set({ scopeText: 'Desk assembly. Text 512-555-0177 when you arrive.' }).where(eq(bookingTerms.bookingId, AFTER));
    await db.update(bookingCompletions).set({ note: 'Done. Questions? helper.hale@example.test' }).where(eq(bookingCompletions.bookingId, AFTER));
    // Support first, finance second: the audit names finance, the role that allows the download.
    viewer.current = staffViewer('usr_casey', ['support_agent', 'finance']);
    const response = await download(AFTER);
    expect(response.status).toBe(200);
    const pack = await response.json();
    const text = JSON.stringify(pack);
    for (const detail of ['512-555-0142', 'me@client.example', '512-555-0177', 'helper.hale@example.test']) expect(text).not.toContain(detail);
    expect(pack.messages.find((message: { text: string }) => message.text.startsWith('Call me at'))?.text).toBe('Call me at [phone number hidden] or write to [email hidden].');
    expect(pack.terms.scope).toBe('Desk assembly. Text [phone number hidden] when you arrive.');
    expect(pack.completion.note).toBe('Done. Questions? [email hidden]');
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.action, 'booking.evidence_pack_downloaded'), eq(auditLog.targetId, AFTER), eq(auditLog.actorId, 'usr_casey')));
    expect(audits.at(-1)?.actorRole).toBe('finance');

    // An inquiry that closed without a chargeback keeps its dispute id but no dispute status: no pack, no download.
    const [payment] = await db.select().from(payments).where(eq(payments.bookingId, AFTER));
    await db.update(payments).set({ disputeStatus: null }).where(eq(payments.id, payment!.id));
    try {
      viewer.current = staffViewer('usr_casey', ['finance']);
      expect((await download(AFTER)).status).toBe(404);
      expect((await getAdminBooking(db, { id: 'usr_casey', roles: ['finance'] }, AFTER, new Date()))?.actions ?? []).not.toContain('download_evidence_pack');
    } finally {
      await db.update(payments).set({ disputeStatus: payment!.disputeStatus }).where(eq(payments.id, payment!.id));
    }
  });
});
