import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PaymentAttemptResult, PaymentChoice } from '@/contracts';
import { createStripeClient, createStripePayments, StripeError } from '@/integrations/payments/stripe';
import { createStripeConnect } from '@/integrations/payments/stripe-connect';
import { users } from '@/modules/accounts/schema';
import { acceptChange, payChangeDifference, proposeChange } from '@/modules/bookings/changes';
import { submitCompletion } from '@/modules/bookings/completion';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { getBookingView, runBookingAction } from '@/modules/bookings/hub';
import { bookings } from '@/modules/bookings/schema';
import { cancelBookingBy } from '@/modules/bookings/sheets';
import { tipBooking } from '@/modules/bookings/tips';
import { instantPayoutOffer, requestInstantPayout } from '@/modules/earnings/instant';
import { earnings, payouts } from '@/modules/earnings/schema';
import { getEarningsPage, getReceiptPage } from '@/modules/earnings/service';
import { ledgerEntries, ledgerJournals } from '@/modules/ledger/schema';
import { offers } from '@/modules/offers/schema';
import { handleConnectWebhook, runScheduledTransfers } from '@/modules/payments/connect';
import { paymentCustomers, paymentMethods, payments, refunds } from '@/modules/payments/schema';
import { handleStripePaymentWebhook } from '@/modules/payments/stripe-webhooks';
import { supportCases } from '@/modules/support/schema';
import { getAdminPayments } from '@/modules/support/staff-payments';
import { files, tasks } from '@/modules/tasks/schema';
import { payoutAccounts } from '@/modules/verification/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { throwawayClient } from '../support/people';

/**
 * The money paths against Stripe's test mode (ab's real-money check, 2026-11-20): Stripe's records compared with our rows
 * and the money views, mismatch by mismatch. Opt-in, never in CI (vitest.stripe.config.mts, guard in ./guard.ts):
 *
 *   STRIPE_TEST_CHECK=1 npm run test:stripe      Stripe test mode (sk_test_/pk_test_ keys in .env.stripe-test)
 *   STRIPE_TEST_CHECK=dry npm run test:stripe    the same steps against an in-memory Stripe (./fake-stripe.ts)
 *
 * Flows, each on its own booking of a copy of the seeded desk (Jordan's offer), cards made the way Stripe.js makes them
 * (a PaymentMethod from a test token):
 * 1. book and pay with a new card, saved (0077: the money is available at once, so transfers and payouts can follow);
 * 2. a change with an extra charge, on the saved card;
 * 3. the client cancels: the refund spans both charges;
 * 4. another booking completes, and the client tips;
 * 5. the helper's transfers (Jordan's payout account points at a test Custom account made for the run) and an instant
 *    payout to its debit card;
 * 6. a failed card: 0002 (the bank refuses it, so Stripe won't attach it) and 0341 (attaches, then declines);
 * 7. disputes (0259 opens one at once): one won, one lost (Stripe's evidence values), the lost one in the ledger;
 * then every event Stripe recorded for the run, replayed through our webhook handlers (signed locally, as Stripe signs)
 * in order, and everything compared again (a second delivery changes nothing).
 * Every comparison goes to artifacts/stripe-check/report-<mode>.md; mismatches also fail the run (soft, so all show).
 * Cleanup: the test account and customers are deleted, Jordan's payout account restored, the copied tasks canceled.
 */

type Obj = Record<string, unknown>;
const MODE = process.env.STRIPE_TEST_CHECK === 'dry' ? 'dry' : 'test';
const secretKey = process.env.STRIPE_SECRET_KEY ?? '';
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const stripe = createStripeClient({ secretKey });
const pay = createStripePayments({ secretKey });
const connect = createStripeConnect({ secretKey });
const deps = { db, payments: pay };
const hub = { db, cipher: fieldCipherFromEnv(), payments: pay };

const RUN = Date.now().toString(36);
const CLIENT = `usr_stc_${RUN}_client`;
const DISPUTER = `usr_stc_${RUN}_disputer`;
const HELPER = 'usr_jordan';
const SECRET = 'whsec_stripe_check_local';
const STARTED = Math.floor(Date.now() / 1000) - 5;
const HOUR = 3_600_000;
const str = (value: unknown) => (typeof value === 'string' ? value : null);
const num = (value: unknown) => (typeof value === 'number' ? value : null);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, MODE === 'dry' ? 0 : ms));

// ---- What the run found ---------------------------------------------------------------------------------

interface Finding {
  flow: string;
  check: string;
  ours: unknown;
  stripe: unknown;
}
const findings: Finding[] = [];
const notes: string[] = [];
let compared = 0;

/** One comparison: ours against Stripe's (or what Stripe's answer means for us). */
function same(flow: string, check: string, ours: unknown, stripes: unknown): void {
  compared += 1;
  if (!isDeepStrictEqual(ours, stripes)) findings.push({ flow, check, ours, stripe: stripes });
  expect.soft(ours, `${flow}: ${check}`).toEqual(stripes);
}

function need<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`The check can't go on: ${what}`);
  return value;
}

function writeReport(): void {
  const cell = (value: unknown) => '`' + (JSON.stringify(value) ?? 'undefined').replaceAll('|', '\\|').replaceAll('`', "'") + '`';
  const title = MODE === 'dry' ? 'dry run against the in-memory Stripe (the check’s own steps, not a statement about Stripe)' : 'Stripe test mode';
  const lines = [`# Stripe check: ${title}`, '', `${new Date().toISOString()}, run ${RUN}: ${compared} comparisons, ${findings.length} mismatches.`, ''];
  if (findings.length > 0) lines.push('| Flow | Check | Ours | Stripe |', '|---|---|---|---|', ...findings.map((f) => `| ${f.flow} | ${f.check} | ${cell(f.ours)} | ${cell(f.stripe)} |`), '');
  if (notes.length > 0) lines.push('## Notes', '', ...notes.map((note) => `- ${note}`), '');
  mkdirSync('artifacts/stripe-check', { recursive: true });
  writeFileSync(`artifacts/stripe-check/report-${MODE}.md`, lines.join('\n'));
  writeFileSync(`artifacts/stripe-check/report-${MODE}.json`, JSON.stringify({ mode: MODE, run: RUN, compared, findings, notes }, null, 2));
}

// ---- Stripe ---------------------------------------------------------------------------------------------

let account = '';
const customersMade = new Set<string>();

/** A card the way Stripe.js makes one: a PaymentMethod from a test token. */
async function newCard(token: string): Promise<string> {
  return need(str((await stripe.request('POST', '/payment_methods', new URLSearchParams({ type: 'card', 'card[token]': token }))).id), `a card from ${token}`);
}
const intentOf = (id: string) => stripe.request('GET', `/payment_intents/${encodeURIComponent(id)}`);
const chargeOf = (id: string) => stripe.request('GET', `/charges/${encodeURIComponent(id)}`);

async function waitFor<T>(what: string, read: () => Promise<T | null>, seconds = 60): Promise<T> {
  for (let tries = 0; tries < seconds; tries += 1) {
    const found = await read();
    if (found !== null) return found;
    await sleep(1000);
  }
  throw new Error(`Stripe didn't get there in ${seconds} s: ${what}`);
}

/** Every event since the run started, oldest first (on the platform, or on the run's connected account). */
async function eventsSince(on?: string): Promise<Obj[]> {
  const all: Obj[] = [];
  let after: string | null = null;
  for (;;) {
    const params = new URLSearchParams({ 'created[gte]': String(STARTED), limit: '100' });
    if (after) params.set('starting_after', after);
    const page = await stripe.request('GET', '/events', params, undefined, on ? { account: on } : {});
    const data = (page.data ?? []) as Obj[];
    all.push(...data);
    if (page.has_more !== true || data.length === 0) break;
    after = str(data.at(-1)?.id);
  }
  return all.reverse();
}

/** An event as Stripe delivers it to the endpoint, signed with the run's own secret. */
function delivered(event: Obj, now: Date) {
  const payload = JSON.stringify(event);
  const t = Math.floor(now.getTime() / 1000);
  return { payload, signature: `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')}` };
}
const PAYMENT_EVENTS = new Set(['payment_intent.succeeded', 'payment_intent.amount_capturable_updated', 'payment_intent.payment_failed', 'payment_intent.canceled', 'charge.dispute.created', 'charge.dispute.closed']);
const isConnectEvent = (type: string) => type === 'account.updated' || type.startsWith('account.external_account.') || type.startsWith('payout.');

async function replayPaymentEvents(flow: string, events: Obj[]): Promise<number> {
  let replayed = 0;
  for (const event of events) {
    if (!PAYMENT_EVENTS.has(String(event.type))) continue;
    const now = new Date();
    const outcome = await handleStripePaymentWebhook(deps, { ...delivered(event, now), secret: SECRET }, now);
    same(flow, `${String(event.type)} ${String(event.id)}: answered`, 200, outcome.status);
    replayed += 1;
  }
  return replayed;
}

async function replayConnectEvents(flow: string, events: Obj[]): Promise<number> {
  let replayed = 0;
  for (const event of events) {
    if (!isConnectEvent(String(event.type))) continue;
    // A Connect endpoint's delivery names the account; a read through Stripe-Account may not.
    const now = new Date();
    const outcome = await handleConnectWebhook(db, { ...delivered({ account, ...event }, now), secrets: [SECRET] }, now);
    same(flow, `${String(event.type)} ${String(event.id)}: answered`, 200, outcome.status);
    replayed += 1;
  }
  return replayed;
}

// ---- Our side ---------------------------------------------------------------------------------------------

type PaymentRow = typeof payments.$inferSelect;
const idOf = (result: PaymentAttemptResult) => (result.ok && result.redirectTo ? result.redirectTo.split('/').pop()! : null);
const paymentsOf = (bookingId: string) => db.select().from(payments).where(eq(payments.bookingId, bookingId)).orderBy(payments.createdAt);
const RECEIVED = ['succeeded', 'partially_refunded', 'refunded'];

/** A booking of a copy of the seeded desk ($60, Jordan's offer), starting `startsIn` from now, paid with `payment`. */
async function book(name: string, client: string, payment: PaymentChoice, startsIn: number): Promise<{ result: PaymentAttemptResult; taskId: string }> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  const taskId = `tsk_stc_${RUN}_${name}`;
  const start = new Date(Date.now() + startsIn);
  await db.insert(tasks).values({ ...need(desk, 'the seeded desk'), id: taskId, slug: `${taskId.replaceAll('_', '-')}`, posterUserId: client, status: 'open', offerCount: 1, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 6 * HOUR) });
  await db.insert(offers).values({ ...need(offer, 'Jordan’s offer'), id: `off_stc_${RUN}_${name}`, taskId, status: 'pending', revision: 1, proposedStart: start, expiresAt: new Date(Date.now() + 24 * HOUR) });
  await getBookingConfirmPage(deps, client, taskId, `off_stc_${RUN}_${name}`, new Date());
  const result = await confirmBooking(deps, client, taskId, `off_stc_${RUN}_${name}`, { offerRevision: 1, payment, acceptTerms: true }, new Date());
  return { result, taskId };
}

/** A charge (or tip) row against its payment intent, its charge and its refunds. */
async function compareCharge(flow: string, row: PaymentRow): Promise<void> {
  const label = `${row.purpose} ${row.id}`;
  const ref = need(row.providerRef, `${label} has no intent`);
  const intent = await intentOf(ref);
  same(flow, `${label}: amount`, row.amountCents, intent.amount);
  same(flow, `${label}: currency`, 'usd', intent.currency);
  same(flow, `${label}: our payment id on the intent`, row.id, (intent.metadata as Obj | undefined)?.payment_id ?? null);
  same(flow, `${label}: the card charged`, row.methodRef, intent.payment_method);
  const [customer] = await db.select().from(paymentCustomers).where(eq(paymentCustomers.userId, row.payerUserId));
  same(flow, `${label}: the client’s customer`, customer?.customerRef ?? null, intent.customer ?? null);
  const went = RECEIVED.includes(row.status);
  same(flow, `${label}: went through`, went, intent.status === 'succeeded');
  if (!went) {
    if (row.status === 'failed') same(flow, `${label}: why it failed`, row.failureCode, (intent.last_payment_error as Obj | null)?.decline_code === 'insufficient_funds' ? 'insufficient_funds' : 'payment_declined');
    return;
  }
  const charge = await chargeOf(need(str(intent.latest_charge), `${label}: Stripe has no charge`));
  same(flow, `${label}: captured`, row.amountCents, charge.amount_captured);
  const ours = await db.select().from(refunds).where(eq(refunds.paymentId, row.id));
  const counted = ours.filter((refund) => refund.status === 'succeeded' || refund.status === 'pending');
  same(flow, `${label}: refunded`, counted.reduce((sum, refund) => sum + refund.amountCents, 0), charge.amount_refunded);
  const theirs = ((await stripe.request('GET', '/refunds', new URLSearchParams({ payment_intent: ref, limit: '100' }))).data ?? []) as Obj[];
  const key = (rows: (string | number | null)[][]) => rows.map((r) => JSON.stringify(r)).sort();
  same(flow, `${label}: refunds (id, amount, status)`, key(ours.map((r) => [r.providerRef, r.amountCents, r.status])), key(theirs.map((r) => [str(r.id), num(r.amount), str(r.status)])));
  const status = charge.amount_refunded === 0 ? 'succeeded' : charge.refunded ? 'refunded' : 'partially_refunded';
  same(flow, `${label}: status`, row.status, status);
  same(flow, `${label}: disputed`, row.disputeStatus !== null, charge.disputed === true);
}

/** The client's booking page, receipt and the admin payments page, against Stripe. */
async function compareViews(flow: string, bookingId: string, client: string): Promise<void> {
  const rows = await paymentsOf(bookingId);
  let net = 0;
  for (const row of rows.filter((r) => RECEIVED.includes(r.status) && r.providerRef)) {
    const charge = await chargeOf(need(str((await intentOf(row.providerRef!)).latest_charge), `${row.id}: Stripe has no charge`));
    net += (charge.amount_captured as number) - (charge.amount_refunded as number);
  }
  const view = await getBookingView(hub, client, bookingId, new Date());
  for (const line of view?.payments ?? []) {
    if (line.kind === 'refund') {
      const [row] = await db.select().from(refunds).where(eq(refunds.id, line.id));
      const refund = await stripe.request('GET', `/refunds/${need(row?.providerRef, `refund ${line.id} has no reference`)}`);
      same(flow, `booking page: refund ${line.id} amount`, line.amountCents, refund.amount);
    } else {
      const [row] = await db.select().from(payments).where(eq(payments.id, line.id));
      const intent = await intentOf(need(row?.providerRef, `${line.id} has no intent`));
      same(flow, `booking page: ${line.kind} ${line.id} amount`, line.amountCents, intent.amount);
      same(flow, `booking page: ${line.kind} ${line.id} went through`, line.status !== 'failed', intent.status === 'succeeded');
    }
  }
  const receipt = await getReceiptPage(db, client, bookingId);
  if (receipt) same(flow, 'receipt: what the client paid, net', receipt.netCents, net);
  for (const tab of ['charges', 'refunds'] as const) {
    const page = await getAdminPayments(db, { tab, query: bookingId }, new Date(), 'full');
    for (const row of page.rows) {
      const ref = need(row.reference, `admin ${tab} row ${row.id} has no reference`);
      const theirs = tab === 'charges' ? await intentOf(ref) : await stripe.request('GET', `/refunds/${ref}`);
      same(flow, `admin payments (${tab}): ${row.id} amount`, row.amountCents, theirs.amount);
    }
  }
}

/** The booking's earnings rows against Stripe's transfers. */
async function compareTransfers(flow: string, bookingId: string): Promise<void> {
  const rows = await db.select().from(earnings).where(eq(earnings.bookingId, bookingId));
  for (const row of rows) {
    const label = `${row.kind} ${row.id}`;
    same(flow, `${label}: transferred`, true, row.transferRef !== null);
    if (!row.transferRef) continue;
    const transfer = await stripe.request('GET', `/transfers/${row.transferRef}`);
    same(flow, `${label}: amount`, row.amountCents, transfer.amount);
    same(flow, `${label}: to the helper’s account`, account, transfer.destination);
    same(flow, `${label}: group`, `booking:${bookingId}`, transfer.transfer_group);
    const [source] = row.sourcePaymentId ? await db.select().from(payments).where(eq(payments.id, row.sourcePaymentId)) : [];
    const sourceCharge = source?.providerRef ? str((await intentOf(source.providerRef)).latest_charge) : null;
    same(flow, `${label}: the charge it came from`, sourceCharge, str(transfer.source_transaction));
  }
}

// ---- The run ---------------------------------------------------------------------------------------------

const ctx = { a: '', b: '', disputes: [] as { bookingId: string; outcome: 'won' | 'lost' }[] };
let savedCard = '';
let jordanAccount: typeof payoutAccounts.$inferSelect | undefined;
const photo = `fil_stc_${RUN}`;

beforeAll(async () => {
  await throwawayClient(db, CLIENT, 'usr_maya');
  await throwawayClient(db, DISPUTER, 'usr_maya');
  await db.insert(files).values({ id: photo, ownerUserId: HELPER, kind: 'evidence', storageKey: `test/${photo}.webp`, contentType: 'image/webp', width: 800, height: 600, bytes: 100 });
  // The helper's payouts: a test Custom account, verified with Stripe's test values (docs.stripe.com/connect/testing),
  // with a debit card for instant payouts.
  let created: Obj;
  try {
    created = await stripe.request(
      'POST',
      '/accounts',
      new URLSearchParams({
        type: 'custom',
        country: 'US',
        email: `stripe-check-${RUN}@example.test`,
        business_type: 'individual',
        'capabilities[transfers][requested]': 'true',
        'business_profile[mcc]': '7299',
        'business_profile[url]': 'https://accessible.stripe.com',
        'individual[first_name]': 'Jordan',
        'individual[last_name]': 'Check',
        'individual[email]': `stripe-check-${RUN}@example.test`,
        'individual[phone]': '0000000000',
        'individual[dob][day]': '1',
        'individual[dob][month]': '1',
        'individual[dob][year]': '1901',
        'individual[address][line1]': 'address_full_match',
        'individual[address][city]': 'Gainesville',
        'individual[address][state]': 'FL',
        'individual[address][postal_code]': '32601',
        'individual[id_number]': '000000000',
        external_account: 'tok_visa_debit',
        'tos_acceptance[date]': String(Math.floor(Date.now() / 1000)),
        'tos_acceptance[ip]': '127.0.0.1',
        'metadata[purpose]': 'TasksNearMe Stripe check',
      }),
      `stripe-check-account:${RUN}`,
    );
  } catch (error) {
    const message = error instanceof StripeError ? `${error.message}: ${String((error.body as Obj).message ?? '')}` : String(error);
    throw new Error(`Making the test Connect account failed (${message}). Connect must be on in the test-mode dashboard.`);
  }
  account = need(str(created.id), 'the test account');
  const status = await waitFor('the test account can take transfers and pay out', async () => ((await connect.accountStatus(account)) === 'active' ? 'active' : null), 90);
  notes.push(`Test account ${account}: ${status}.`);
  [jordanAccount] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, HELPER));
  await db
    .insert(payoutAccounts)
    .values({ userId: HELPER, provider: 'stripe', providerAccountId: account, status: 'active', createdAt: new Date(), updatedAt: new Date() })
    .onConflictDoUpdate({ target: payoutAccounts.userId, set: { provider: 'stripe', providerAccountId: account, status: 'active', updatedAt: new Date() } });
});

afterAll(async () => {
  const step = async (what: string, work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      notes.push(`Cleanup: ${what} failed (${error instanceof Error ? error.message : String(error)}).`);
    }
  };
  if (jordanAccount) await step('restoring Jordan’s payout account', () => db.update(payoutAccounts).set(jordanAccount!).where(eq(payoutAccounts.userId, HELPER)));
  await step('closing the run’s tasks', () => db.update(tasks).set({ status: 'canceled' }).where(like(tasks.id, `tsk\\_stc\\_${RUN}\\_%`)));
  const customers = await db.select().from(paymentCustomers).where(inArray(paymentCustomers.userId, [CLIENT, DISPUTER]));
  for (const customer of customers) customersMade.add(customer.customerRef);
  for (const ref of customersMade) await step(`deleting customer ${ref}`, () => pay.forgetCustomer(ref));
  if (account) await step(`deleting test account ${account}`, () => stripe.request('DELETE', `/accounts/${account}`));
  writeReport();
  await pool.end();
});

describe(`Stripe check (${MODE === 'dry' ? 'dry run' : 'test mode'})`, () => {
  it('1. books and pays with a new card from Stripe’s form, saved on the client’s customer', async () => {
    const flow = '1 book and pay';
    const card = await newCard('tok_bypassPending');
    const { result } = await book('a', CLIENT, { kind: 'stripe_card', paymentMethodId: card, save: true }, 2 * 24 * HOUR);
    expect(result).toMatchObject({ ok: true, code: 'booked' });
    ctx.a = need(idOf(result), 'booking A');
    const [charge] = await paymentsOf(ctx.a);
    await compareCharge(flow, need(charge, 'booking A’s charge'));
    const [saved] = await db.select().from(paymentMethods).where(eq(paymentMethods.userId, CLIENT));
    savedCard = need(saved, 'the saved card').id;
    const theirs = await stripe.request('GET', `/payment_methods/${saved!.providerRef}`);
    const [customer] = await db.select().from(paymentCustomers).where(eq(paymentCustomers.userId, CLIENT));
    same(flow, 'saved card: on the client’s customer', customer?.customerRef ?? null, theirs.customer);
    same(flow, 'saved card: last four', saved!.last4, (theirs.card as Obj).last4);
    await compareViews(flow, ctx.a, CLIENT);
  });

  it('2. a change with an extra charge, on the saved card', async () => {
    const flow = '2 change with an extra charge';
    const bookingId = need(ctx.a || null, 'booking A (flow 1)');
    const sent = await proposeChange(db, CLIENT, bookingId, { priceCents: 8000, scopeText: 'Assemble the desk and the matching chair.', message: 'Could you also assemble the matching chair?' }, new Date());
    expect(sent).toMatchObject({ ok: true, code: 'sent' });
    const changeId = need(sent.ok && sent.redirectTo ? sent.redirectTo.split('/').pop() : null, 'the change');
    expect(await acceptChange(deps, HELPER, bookingId, changeId, {}, new Date())).toMatchObject({ ok: true, code: 'updated' });
    expect(await payChangeDifference(deps, CLIENT, bookingId, changeId, { payment: { kind: 'saved', methodId: savedCard } }, new Date())).toMatchObject({ ok: true, code: 'paid' });
    const rows = await paymentsOf(bookingId);
    same(flow, 'two charges', rows.filter((row) => RECEIVED.includes(row.status)).map((row) => row.purpose), ['booking_funding', 'change_funding']);
    for (const row of rows) await compareCharge(flow, row);
    await compareViews(flow, bookingId, CLIENT);
  });

  it('3. the client cancels: the refund spans both charges', async () => {
    const flow = '3 cancel and refund';
    const bookingId = need(ctx.a || null, 'booking A (flow 1)');
    expect(await cancelBookingBy(deps, CLIENT, bookingId, { reason: 'plans_changed', note: '' }, new Date())).toMatchObject({ ok: true, code: 'canceled' });
    const rows = await paymentsOf(bookingId);
    for (const row of rows) await compareCharge(flow, row);
    const back = await db.select().from(refunds).where(eq(refunds.bookingId, bookingId));
    notes.push(`Flow 3: refunded ${back.map((r) => `${r.amountCents} from ${rows.find((p) => p.id === r.paymentId)?.purpose ?? r.paymentId} (${r.reason}, ${r.status})`).join(', ') || 'nothing'} of ${rows.map((r) => r.amountCents).join(' + ')} charged.`);
    same(flow, 'both charges refunded from', [...new Set(back.map((r) => rows.find((p) => p.id === r.paymentId)?.purpose))].sort(), ['booking_funding', 'change_funding']);
    await compareViews(flow, bookingId, CLIENT);
  });

  it('4. another booking completes, and the client tips', async () => {
    const flow = '4 complete and tip';
    const { result } = await book('b', CLIENT, { kind: 'saved', methodId: need(savedCard || null, 'the saved card (flow 1)') }, 2 * HOUR);
    expect(result).toMatchObject({ ok: true, code: 'booked' });
    ctx.b = need(idOf(result), 'booking B');
    await db.update(bookings).set({ status: 'in_progress', arrivedAt: new Date() }).where(eq(bookings.id, ctx.b));
    expect(await submitCompletion(db, HELPER, ctx.b, { photoIds: [photo], note: 'Assembled and level.', expenses: [] }, new Date())).toMatchObject({ ok: true, code: 'submitted' });
    expect(await runBookingAction(db, CLIENT, ctx.b, 'approve', new Date())).toMatchObject({ ok: true });
    expect(await tipBooking(deps, CLIENT, ctx.b, { amountCents: 1000, payment: { kind: 'saved', methodId: savedCard } }, new Date())).toMatchObject({ ok: true, code: 'paid' });
    const rows = await paymentsOf(ctx.b);
    same(flow, 'a charge and a tip', rows.map((row) => [row.purpose, row.status]), [['booking_funding', 'succeeded'], ['tip', 'succeeded']]);
    for (const row of rows) await compareCharge(flow, row);
    const owed = await db.select().from(earnings).where(eq(earnings.bookingId, ctx.b));
    same(flow, 'earnings waiting for the transfer job', owed.map((row) => [row.kind, row.status]).sort(), [['earnings', 'scheduled'], ['tip', 'scheduled']]);
    same(flow, 'the tip, whole, to the helper', owed.find((row) => row.kind === 'tip')?.amountCents, 1000);
    await compareViews(flow, ctx.b, CLIENT);
  });

  it('5. the helper’s transfers, and an instant payout', async () => {
    const flow = '5 transfers and payout';
    const bookingId = need(ctx.b || null, 'booking B (flow 4)');
    await runScheduledTransfers(db, connect, new Date());
    await compareTransfers(flow, bookingId);
    const transfersTab = await getAdminPayments(db, { tab: 'transfers', query: bookingId }, new Date(), 'full');
    same(flow, 'admin payments (transfers): the booking’s transfers listed', transfersTab.rows.length, (await db.select().from(earnings).where(eq(earnings.bookingId, bookingId))).length);
    for (const row of transfersTab.rows) same(flow, `admin payments (transfers): ${row.id} amount`, row.amountCents, (await stripe.request('GET', `/transfers/${need(row.reference, `transfer row ${row.id} has no reference`)}`)).amount);
    const totalsBefore = (await getEarningsPage(db, HELPER, new Date())).totals;
    const offer = await instantPayoutOffer(db, connect, HELPER);
    const balance = await stripe.request('GET', '/balance', undefined, undefined, { account });
    notes.push(`Flow 5: the account's balance after the transfers: ${JSON.stringify({ available: balance.available, pending: balance.pending, instant_available: balance.instant_available ?? null })}.`);
    if (!offer) {
      notes.push('Flow 5: no instant payout offered (Stripe’s instant_available is under $5 or missing), so none was made.');
      return;
    }
    expect(await requestInstantPayout(db, connect, HELPER, new Date())).toMatchObject({ ok: true, code: 'submitted' });
    const [row] = await db.select().from(payouts).where(and(eq(payouts.helperUserId, HELPER), eq(payouts.method, 'instant'))).orderBy(desc(payouts.createdAt)).limit(1);
    const payout = await stripe.request('GET', `/payouts/${need(row?.providerRef, 'the payout’s reference')}`, undefined, undefined, { account });
    same(flow, 'payout: amount', row!.amountCents, payout.amount);
    same(flow, 'payout: instant', 'instant', payout.method);
    const txn = str(payout.balance_transaction);
    if (txn) {
      const fees = await stripe.request('GET', `/balance_transactions/${txn}`, undefined, undefined, { account });
      same(flow, 'payout: the fee we tell the helper, against the fee on Stripe’s payout', row!.feeCents, Math.abs(num(fees.fee) ?? 0));
    } else notes.push(`Flow 5: payout ${String(payout.id)} has no balance transaction to read Stripe’s fee from; ours says ${row!.feeCents}.`);
    // Stripe's payout events, as the Connect endpoint gets them: the payout's state and the earnings it carried.
    await waitFor('the instant payout is paid', async () => ((await stripe.request('GET', `/payouts/${row!.providerRef}`, undefined, undefined, { account })).status === 'paid' ? true : null), 120).catch((error: unknown) => notes.push(String(error)));
    await replayConnectEvents(flow, (await eventsSince(account)).filter((event) => String(event.type).startsWith('payout.')));
    const [after] = await db.select().from(payouts).where(eq(payouts.id, row!.id));
    const paid = await stripe.request('GET', `/payouts/${row!.providerRef}`, undefined, undefined, { account });
    same(flow, 'payout: status', after?.status, paid.status === 'pending' ? 'in_transit' : paid.status);
    const carried = await db.select().from(earnings).where(eq(earnings.payoutId, row!.providerRef!));
    if (paid.status === 'paid') same(flow, 'payout: the earnings it carried, paid out', carried.reduce((sum, e) => sum + e.amountCents, 0) <= (paid.amount as number) && carried.every((e) => e.status === 'paid_out'), true);
    const totalsAfter = (await getEarningsPage(db, HELPER, new Date())).totals;
    if (paid.status === 'paid') same(flow, 'earnings page: paid this year grew by the payout', totalsAfter.paidThisYearCents - totalsBefore.paidThisYearCents, paid.amount);
    const [jordan] = await db.select({ email: users.email }).from(users).where(eq(users.id, HELPER));
    const payoutsTab = await getAdminPayments(db, { tab: 'payouts', query: need(jordan?.email, 'Jordan’s email') }, new Date(), 'full');
    const listed = payoutsTab.rows.find((r) => r.reference === row!.providerRef);
    same(flow, 'admin payments (payouts): the payout’s amount and status', [listed?.amountCents, listed?.status], [paid.amount, paid.status === 'pending' ? 'in_transit' : paid.status]);
    const page = await getEarningsPage(db, HELPER, new Date());
    for (const line of page.rows.filter((r) => r.bookingId === bookingId)) {
      const [earned] = await db.select().from(earnings).where(eq(earnings.id, line.id));
      if (earned?.transferRef) same(flow, `earnings page: ${line.kind} amount`, line.amountCents, (await stripe.request('GET', `/transfers/${earned.transferRef}`)).amount);
    }
  });

  it('6. a failed card: refused outright (0002), or declined when charged (0341)', async () => {
    const flow = '6 failed card';
    const refused = await book('c', CLIENT, { kind: 'stripe_card', paymentMethodId: await newCard('tok_visa_chargeDeclined'), save: false }, 2 * 24 * HOUR);
    same(flow, '0002: the answer (Stripe won’t attach a card its bank declines)', refused.result, { ok: false, code: 'payment_declined' });
    same(flow, '0002: nothing held', (await db.select().from(bookings).where(eq(bookings.taskId, refused.taskId))).length, 0);
    const failing = await book('d', CLIENT, { kind: 'stripe_card', paymentMethodId: await newCard('tok_chargeCustomerFail'), save: false }, 2 * 24 * HOUR);
    same(flow, '0341: the answer', failing.result, { ok: false, code: 'payment_declined' });
    const [hold] = await db.select().from(bookings).where(eq(bookings.taskId, failing.taskId));
    const rows = hold ? await paymentsOf(hold.id) : [];
    same(flow, '0341: one failed charge on the hold', rows.map((row) => [row.purpose, row.status, row.failureCode]), [['booking_funding', 'failed', 'payment_declined']]);
    for (const row of rows) await compareCharge(flow, row);
  });

  it('7. disputes (0259): one won, one lost and in the ledger', async () => {
    const flow = '7 disputes';
    for (const outcome of ['won', 'lost'] as const) {
      const { result } = await book(`dispute_${outcome}`, DISPUTER, { kind: 'stripe_card', paymentMethodId: await newCard('tok_createDispute'), save: false }, 2 * 24 * HOUR);
      expect(result).toMatchObject({ ok: true, code: 'booked' });
      const bookingId = need(idOf(result), `the ${outcome} dispute's booking`);
      ctx.disputes.push({ bookingId, outcome });
      const [charge] = await paymentsOf(bookingId);
      const intentId = need(charge?.providerRef, 'the disputed charge');
      const dispute = await waitFor('the dispute opens', async () => (((await stripe.request('GET', '/disputes', new URLSearchParams({ payment_intent: intentId }))).data ?? []) as Obj[])[0] ?? null);
      const disputeId = need(str(dispute.id), 'the dispute');
      const opened = (await eventsSince()).filter((event) => event.type === 'charge.dispute.created' && (event.data as { object?: Obj }).object?.id === disputeId);
      same(flow, `${outcome}: Stripe's charge.dispute.created`, opened.length, 1);
      await replayPaymentEvents(flow, opened);
      const [open] = await db.select().from(payments).where(eq(payments.id, charge!.id));
      same(flow, `${outcome}: our payment, disputed`, [open?.disputeStatus, open?.disputeId], ['open', disputeId]);
      const cases = await db.select().from(supportCases).where(and(eq(supportCases.bookingId, bookingId), eq(supportCases.type, 'payment_issue')));
      same(flow, `${outcome}: an urgent case for staff`, cases.map((c) => c.priority), ['urgent']);
      await stripe.request('POST', `/disputes/${disputeId}`, new URLSearchParams({ 'evidence[uncategorized_text]': outcome === 'won' ? 'winning_evidence' : 'losing_evidence', submit: 'true' }));
      const closed = await waitFor(`the dispute is ${outcome}`, async () => {
        const now = await stripe.request('GET', `/disputes/${disputeId}`);
        return now.status === 'won' || now.status === 'lost' ? now : null;
      }, 120);
      same(flow, `${outcome}: Stripe's outcome`, closed.status, outcome);
      const closing = (await eventsSince()).filter((event) => event.type === 'charge.dispute.closed' && (event.data as { object?: Obj }).object?.id === disputeId);
      await replayPaymentEvents(flow, closing);
      const [done] = await db.select().from(payments).where(eq(payments.id, charge!.id));
      same(flow, `${outcome}: our payment's dispute`, done?.disputeStatus, closed.status);
      const journals = await db.select().from(ledgerJournals).where(and(eq(ledgerJournals.kind, 'chargeback_loss'), eq(ledgerJournals.providerRef, disputeId)));
      if (outcome === 'won') same(flow, 'won: nothing in the ledger', journals.length, 0);
      else {
        const lines = journals[0] ? await db.select().from(ledgerEntries).where(eq(ledgerEntries.journalId, journals[0].id)) : [];
        const fee = ((closed.balance_transactions ?? []) as Obj[]).reduce((sum, txn) => sum + (num(txn.fee) ?? 0), 0);
        same(flow, 'lost: the loss in the ledger (amount, Stripe’s fee)', [lines.find((l) => l.account === 'expense:chargeback_losses')?.debitCents, lines.find((l) => l.account === 'expense:processing')?.debitCents], [closed.amount, fee]);
      }
      await compareCharge(flow, (await db.select().from(payments).where(eq(payments.id, charge!.id)))[0]!);
    }
  });

  it('8. Stripe’s events, delivered again in order, change nothing', async () => {
    const flow = '8 events replayed';
    const refs = (await db.select({ ref: payments.providerRef }).from(payments).where(inArray(payments.payerUserId, [CLIENT, DISPUTER]))).map((row) => row.ref);
    const ours = new Set(refs.filter((ref): ref is string => ref !== null));
    const relevant = (await eventsSince()).filter((event) => {
      const object = ((event.data as { object?: Obj }).object ?? {}) as Obj;
      return ours.has(str(object.id) ?? '') || ours.has(str(object.payment_intent) ?? '');
    });
    const before = await db.select().from(payments).where(inArray(payments.payerUserId, [CLIENT, DISPUTER]));
    const earned = await db.select().from(earnings).where(inArray(earnings.bookingId, [ctx.a, ctx.b].filter(Boolean)));
    const payments_ = await replayPaymentEvents(flow, relevant);
    const connected = account ? await replayConnectEvents(flow, await eventsSince(account)) : 0;
    notes.push(`Flow 8: ${payments_} payment events and ${connected} Connect events replayed.`);
    const after = await db.select().from(payments).where(inArray(payments.payerUserId, [CLIENT, DISPUTER]));
    const shape = (rows: typeof before) => rows.map((row) => [row.id, row.status, row.amountCents, row.disputeStatus]).sort();
    same(flow, 'payments unchanged by a second delivery', shape(after), shape(before));
    const earnedAfter = await db.select().from(earnings).where(inArray(earnings.bookingId, [ctx.a, ctx.b].filter(Boolean)));
    same(flow, 'earnings unchanged by a second delivery', earnedAfter.map((row) => [row.id, row.status]).sort(), earned.map((row) => [row.id, row.status]).sort());
    for (const row of after) if (row.providerRef) await compareCharge(flow, row);
    if (ctx.b) await compareTransfers(flow, ctx.b);
    // Nothing on the reconciliation tab for the run's bookings: their money matches.
    for (const bookingId of [ctx.a, ctx.b, ...ctx.disputes.map((d) => d.bookingId)].filter(Boolean)) {
      const flagged = await getAdminPayments(db, { tab: 'exceptions', query: bookingId }, new Date(), 'full');
      same(flow, `admin exceptions: none for ${bookingId}`, flagged.rows.map((r) => [r.exception, r.id]), []);
    }
  });
});
