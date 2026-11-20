import { randomBytes } from 'node:crypto';

/**
 * Stripe's test mode, in memory, for the Stripe check's dry run (`STRIPE_TEST_CHECK=dry`: no network, no keys). It keeps
 * the objects the money paths touch and behaves as Stripe documents for the test cards the check uses
 * (docs.stripe.com/testing):
 * - a card its bank declines (4000 0000 0000 0002) can't be attached to a customer;
 * - 4000 0000 0000 0341 attaches, and every charge on it is declined;
 * - 4000 0000 0000 0077 puts the money straight in the available balance (other cards wait in pending);
 * - 4000 0000 0000 0259 succeeds and opens a fraud dispute in the same request;
 * - evidence `winning_evidence` / `losing_evidence` closes a dispute won or lost;
 * - an idempotency key gets its first answer again.
 * Every change records the event Stripe would send (`GET /v1/events`, a connected account's with `Stripe-Account`).
 * It shows the check's own steps work; only the real run says what Stripe does.
 */

type Obj = Record<string, unknown>;
type Behavior = 'ok' | 'declined' | 'charge_fails' | 'dispute';
interface TestCard {
  last4: string;
  behavior: Behavior;
  /** The money is available at once (0077), not pending. */
  available: boolean;
  funding: 'credit' | 'debit';
}

const TOKENS: Record<string, TestCard> = {
  tok_visa: { last4: '4242', behavior: 'ok', available: false, funding: 'credit' },
  tok_bypassPending: { last4: '0077', behavior: 'ok', available: true, funding: 'credit' },
  tok_visa_chargeDeclined: { last4: '0002', behavior: 'declined', available: false, funding: 'credit' },
  tok_chargeCustomerFail: { last4: '0341', behavior: 'charge_fails', available: false, funding: 'credit' },
  tok_createDispute: { last4: '0259', behavior: 'dispute', available: false, funding: 'credit' },
  tok_visa_debit: { last4: '5556', behavior: 'ok', available: true, funding: 'debit' },
};
const DISPUTE_FEE = 1500;
const fee = (cents: number) => Math.round(cents * 0.029) + 30;

class Answer {
  constructor(
    readonly status: number,
    readonly body: Obj,
  ) {}
}
const error = (status: number, type: string, code: string, message: string, extra: Obj = {}) => new Answer(status, { error: { type, code, message, ...extra } });
const missing = (what: string) => error(404, 'invalid_request_error', 'resource_missing', `No such ${what}`);

export function createFakeStripe() {
  let clock = Math.floor(Date.now() / 1000);
  const now = () => (clock += 1);
  const id = (prefix: string) => `${prefix}_dry${randomBytes(6).toString('hex')}`;
  const methods = new Map<string, Obj & { card: TestCard & Obj }>();
  const customers = new Map<string, Obj>();
  const intents = new Map<string, Obj>();
  const charges = new Map<string, Obj & { card: TestCard }>();
  const refunds = new Map<string, Obj>();
  const accounts = new Map<string, Obj & { balance: { available: number; pending: number } }>();
  const transfers = new Map<string, Obj>();
  const payouts = new Map<string, Obj>();
  const disputes = new Map<string, Obj>();
  const events: Obj[] = [];
  const platform = { available: 0, pending: 0 };
  const replies = new Map<string, Answer>();
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const emit = (type: string, object: Obj, account?: string) => events.push({ id: id('evt'), object: 'event', type, created: now(), livemode: false, data: { object: copy(object) }, ...(account ? { account } : {}) });
  const list = (data: Obj[]) => new Answer(200, { object: 'list', data, has_more: false });
  const publicMethod = (method: Obj & { card: TestCard & Obj }) => {
    const { behavior: _behavior, available: _available, ...card } = method.card;
    return { ...method, card };
  };

  function credit(card: TestCard, cents: number) {
    if (card.available) platform.available += cents - fee(cents);
    else platform.pending += cents - fee(cents);
  }

  function openDispute(charge: Obj & { card: TestCard }) {
    const dispute = {
      id: id('dp'),
      object: 'dispute',
      amount: charge.amount,
      currency: 'usd',
      charge: charge.id,
      payment_intent: charge.payment_intent,
      reason: 'fraudulent',
      status: 'needs_response',
      created: now(),
      evidence_details: { due_by: clock + 7 * 86_400, has_evidence: false, submission_count: 0 },
      balance_transactions: [{ id: id('txn'), object: 'balance_transaction', amount: -(charge.amount as number), fee: DISPUTE_FEE, net: -(charge.amount as number) - DISPUTE_FEE, type: 'adjustment' }],
    };
    disputes.set(dispute.id, dispute);
    charge.disputed = true;
    platform.available -= (charge.amount as number) + DISPUTE_FEE;
    emit('charge.dispute.created', dispute);
    emit('charge.dispute.funds_withdrawn', dispute);
  }

  function confirm(intent: Obj, method: Obj & { card: TestCard & Obj }): Answer {
    const card = method.card;
    if (card.behavior === 'declined' || card.behavior === 'charge_fails') {
      const charge = { id: id('ch'), object: 'charge', amount: intent.amount, amount_captured: 0, amount_refunded: 0, captured: false, paid: false, refunded: false, disputed: false, status: 'failed', payment_intent: intent.id, card };
      charges.set(charge.id, charge);
      const failure = { type: 'card_error', code: 'card_declined', decline_code: 'generic_decline', message: 'Your card was declined.', charge: charge.id };
      Object.assign(intent, { status: 'requires_payment_method', latest_charge: charge.id, last_payment_error: failure });
      emit('charge.failed', { ...charge, card: undefined });
      emit('payment_intent.payment_failed', intent);
      return error(402, 'card_error', 'card_declined', 'Your card was declined.', { decline_code: 'generic_decline', charge: charge.id, payment_intent: copy(intent) });
    }
    const manual = intent.capture_method === 'manual';
    const amount = intent.amount as number;
    const charge = { id: id('ch'), object: 'charge', amount, amount_captured: manual ? 0 : amount, amount_refunded: 0, captured: !manual, paid: true, refunded: false, disputed: false, status: 'succeeded', payment_intent: intent.id, card };
    charges.set(charge.id, charge);
    Object.assign(intent, { status: manual ? 'requires_capture' : 'succeeded', latest_charge: charge.id, amount_received: manual ? 0 : amount, amount_capturable: manual ? amount : 0 });
    if (manual) {
      emit('payment_intent.amount_capturable_updated', intent);
      return new Answer(200, intent);
    }
    credit(card, amount);
    emit('charge.succeeded', { ...charge, card: undefined });
    emit('payment_intent.succeeded', intent);
    if (card.behavior === 'dispute') openDispute(charge);
    return new Answer(200, intent);
  }

  function route(method: string, path: string, params: URLSearchParams, account: string | null): Answer {
    let match: RegExpMatchArray | null;
    // Cards.
    if (method === 'POST' && path === '/payment_methods') {
      const card = TOKENS[params.get('card[token]') ?? ''];
      if (params.get('type') !== 'card' || !card) return error(400, 'invalid_request_error', 'parameter_invalid', 'Unknown test token');
      const created = { id: id('pm'), object: 'payment_method', type: 'card', customer: null, card: { ...card, brand: 'visa', exp_month: 12, exp_year: 2034 } };
      methods.set(created.id, created);
      return new Answer(200, publicMethod(created));
    }
    if ((match = path.match(/^\/payment_methods\/([^/]+)(\/attach|\/detach)?$/))) {
      const found = methods.get(match[1]!);
      if (!found) return missing('payment_method');
      if (method === 'GET') return new Answer(200, publicMethod(found));
      if (match[2] === '/detach') {
        found.customer = null;
        return new Answer(200, publicMethod(found));
      }
      const customer = customers.get(params.get('customer') ?? '');
      if (!customer || customer.deleted) return missing('customer');
      // "You can't attach cards that simulate issuer declines to a Customer object."
      if (found.card.behavior === 'declined') return error(402, 'card_error', 'card_declined', 'Your card was declined.', { decline_code: 'generic_decline' });
      if (found.customer && found.customer !== customer.id) return error(400, 'invalid_request_error', 'payment_method_unexpected_state', 'The payment method is attached to another customer.');
      found.customer = customer.id;
      return new Answer(200, publicMethod(found));
    }
    if (method === 'POST' && path === '/customers') {
      const created = { id: id('cus'), object: 'customer', email: params.get('email'), name: params.get('name'), metadata: { user_id: params.get('metadata[user_id]') } };
      customers.set(created.id, created);
      return new Answer(200, created);
    }
    if (method === 'DELETE' && (match = path.match(/^\/customers\/([^/]+)$/))) {
      const found = customers.get(match[1]!);
      if (!found || found.deleted) return missing('customer');
      found.deleted = true;
      return new Answer(200, { id: found.id, object: 'customer', deleted: true });
    }
    // Payment intents.
    if (method === 'POST' && path === '/payment_intents') {
      const card = methods.get(params.get('payment_method') ?? '');
      if (!card) return missing('payment_method');
      const customer = params.get('customer');
      if (card.customer && card.customer !== customer) return error(400, 'invalid_request_error', 'parameter_invalid', 'The PaymentMethod is attached to a Customer; pass that customer.');
      const intent: Obj = {
        id: id('pi'),
        object: 'payment_intent',
        amount: Number(params.get('amount')),
        currency: params.get('currency'),
        capture_method: params.get('capture_method') ?? 'automatic',
        customer,
        payment_method: card.id,
        description: params.get('description'),
        metadata: params.get('metadata[payment_id]') ? { payment_id: params.get('metadata[payment_id]') } : {},
        status: 'requires_confirmation',
        amount_received: 0,
        amount_capturable: 0,
        latest_charge: null,
        last_payment_error: null,
        created: now(),
      };
      intent.client_secret = `${intent.id}_secret_dry`;
      intents.set(intent.id as string, intent);
      return params.get('confirm') === 'true' ? confirm(intent, card) : new Answer(200, intent);
    }
    if ((match = path.match(/^\/payment_intents\/([^/]+)(\/capture|\/cancel)?$/))) {
      const intent = intents.get(match[1]!);
      if (!intent) return missing('payment_intent');
      if (method === 'GET') return new Answer(200, intent);
      if (match[2] === '/cancel') {
        if (intent.status === 'succeeded' || intent.status === 'canceled') return error(400, 'invalid_request_error', 'payment_intent_unexpected_state', `This PaymentIntent's status is ${String(intent.status)}.`);
        intent.status = 'canceled';
        emit('payment_intent.canceled', intent);
        return new Answer(200, intent);
      }
      if (intent.status !== 'requires_capture') return error(400, 'invalid_request_error', 'payment_intent_unexpected_state', `This PaymentIntent's status is ${String(intent.status)}.`);
      const amount = Number(params.get('amount_to_capture') ?? intent.amount);
      const charge = charges.get(intent.latest_charge as string)!;
      Object.assign(charge, { amount_captured: amount, captured: true });
      Object.assign(intent, { status: 'succeeded', amount_received: amount, amount_capturable: 0 });
      credit(charge.card, amount);
      emit('payment_intent.succeeded', intent);
      return new Answer(200, intent);
    }
    if (method === 'GET' && (match = path.match(/^\/charges\/([^/]+)$/))) {
      const charge = charges.get(match[1]!);
      return charge ? new Answer(200, { ...charge, card: undefined }) : missing('charge');
    }
    // Refunds.
    if (method === 'POST' && path === '/refunds') {
      const intent = intents.get(params.get('payment_intent') ?? '');
      if (!intent) return missing('payment_intent');
      if (intent.status !== 'succeeded') return error(400, 'invalid_request_error', 'charge_not_refundable', 'This PaymentIntent has no charge to refund.');
      const charge = charges.get(intent.latest_charge as string)!;
      const left = (charge.amount_captured as number) - (charge.amount_refunded as number);
      const amount = Number(params.get('amount') ?? left);
      if (left === 0) return error(400, 'invalid_request_error', 'charge_already_refunded', 'The charge has already been refunded.');
      if (amount > left) return error(400, 'invalid_request_error', 'amount_too_large', `Refund amount ($${amount / 100}) is greater than unrefunded amount on charge ($${left / 100})`);
      const refund = { id: id('re'), object: 'refund', amount, currency: 'usd', charge: charge.id, payment_intent: intent.id, status: 'succeeded', created: now() };
      refunds.set(refund.id, refund);
      charge.amount_refunded = (charge.amount_refunded as number) + amount;
      charge.refunded = charge.amount_refunded === charge.amount_captured;
      platform.available -= amount;
      emit('refund.created', refund);
      emit('charge.refunded', { ...charge, card: undefined });
      return new Answer(200, refund);
    }
    if (method === 'GET' && path === '/refunds') return list([...refunds.values()].filter((refund) => refund.payment_intent === params.get('payment_intent')).reverse());
    if (method === 'GET' && (match = path.match(/^\/refunds\/([^/]+)$/))) {
      const refund = refunds.get(match[1]!);
      return refund ? new Answer(200, refund) : missing('refund');
    }
    // Disputes.
    if (method === 'GET' && path === '/disputes') return list([...disputes.values()].filter((dispute) => dispute.payment_intent === params.get('payment_intent')));
    if ((match = path.match(/^\/disputes\/([^/]+)$/))) {
      const dispute = disputes.get(match[1]!);
      if (!dispute) return missing('dispute');
      if (method === 'GET') return new Answer(200, dispute);
      const evidence = params.get('evidence[uncategorized_text]');
      if (params.get('submit') === 'true' && (evidence === 'winning_evidence' || evidence === 'losing_evidence')) {
        const won = evidence === 'winning_evidence';
        dispute.status = won ? 'won' : 'lost';
        if (won) {
          (dispute.balance_transactions as Obj[]).push({ id: id('txn'), object: 'balance_transaction', amount: dispute.amount, fee: -DISPUTE_FEE, net: (dispute.amount as number) + DISPUTE_FEE, type: 'adjustment' });
          platform.available += (dispute.amount as number) + DISPUTE_FEE;
          emit('charge.dispute.funds_reinstated', dispute);
        }
        emit('charge.dispute.closed', dispute);
      }
      return new Answer(200, dispute);
    }
    // Connect: accounts, transfers, balances, payouts.
    if (method === 'POST' && path === '/accounts') {
      const card = TOKENS[params.get('external_account') ?? ''];
      const external = card ? [{ id: id('card'), object: 'card', last4: card.last4, funding: card.funding, currency: 'usd', default_for_currency: true, available_payout_methods: card.funding === 'debit' ? ['standard', 'instant'] : ['standard'] }] : [];
      const created = {
        id: id('acct'),
        object: 'account',
        type: params.get('type'),
        country: params.get('country'),
        email: params.get('email'),
        capabilities: { transfers: params.get('capabilities[transfers][requested]') === 'true' ? 'active' : 'inactive' },
        payouts_enabled: external.length > 0,
        charges_enabled: false,
        requirements: { currently_due: [], past_due: [], pending_verification: [], disabled_reason: null },
        external_accounts: { object: 'list', data: external },
        metadata: { user_id: params.get('metadata[user_id]') },
        balance: { available: 0, pending: 0 },
      };
      accounts.set(created.id, created);
      emit('account.updated', { ...created, balance: undefined }, created.id);
      return new Answer(200, { ...created, balance: undefined });
    }
    if ((match = path.match(/^\/accounts\/([^/]+)$/))) {
      const found = accounts.get(match[1]!);
      if (!found || found.deleted) return missing('account');
      if (method === 'DELETE') {
        found.deleted = true;
        return new Answer(200, { id: found.id, object: 'account', deleted: true });
      }
      return new Answer(200, { ...found, balance: undefined });
    }
    if (method === 'POST' && path === '/transfers') {
      const destination = accounts.get(params.get('destination') ?? '');
      if (!destination || destination.deleted) return missing('account');
      if ((destination.capabilities as Obj).transfers !== 'active') return error(400, 'invalid_request_error', 'insufficient_capabilities_for_transfer', 'The destination account needs the transfers capability.');
      const amount = Number(params.get('amount'));
      const sourceId = params.get('source_transaction');
      let available = true;
      if (sourceId) {
        const source = charges.get(sourceId);
        if (!source) return missing('charge');
        const sent = [...transfers.values()].filter((transfer) => transfer.source_transaction === sourceId).reduce((sum, transfer) => sum + (transfer.amount as number), 0);
        if (sent + amount > (source.amount_captured as number)) return error(400, 'invalid_request_error', 'transfer_source_balance_parameters_mismatch', 'The transfers from this charge would be more than the charge.');
        available = source.card.available;
      } else {
        if (platform.available < amount) return error(400, 'invalid_request_error', 'balance_insufficient', 'You have insufficient available funds in your Stripe account.');
        platform.available -= amount;
      }
      if (available) destination.balance.available += amount;
      else destination.balance.pending += amount;
      const transfer = { id: id('tr'), object: 'transfer', amount, currency: 'usd', destination: destination.id, source_transaction: sourceId, transfer_group: params.get('transfer_group'), amount_reversed: 0, created: now() };
      transfers.set(transfer.id, transfer);
      emit('transfer.created', transfer);
      return new Answer(200, transfer);
    }
    if ((match = path.match(/^\/transfers\/([^/]+)(\/reversals)?$/))) {
      const transfer = transfers.get(match[1]!);
      if (!transfer) return missing('transfer');
      if (method === 'GET') return new Answer(200, transfer);
      const amount = Number(params.get('amount'));
      if (amount > (transfer.amount as number) - (transfer.amount_reversed as number)) return error(400, 'invalid_request_error', 'transfer_already_reversed', 'The transfer has already been reversed.');
      const destination = accounts.get(transfer.destination as string)!;
      if (destination.balance.available < amount) return error(400, 'invalid_request_error', 'balance_insufficient', 'Insufficient funds in the connected account.');
      destination.balance.available -= amount;
      transfer.amount_reversed = (transfer.amount_reversed as number) + amount;
      return new Answer(200, { id: id('trr'), object: 'transfer_reversal', amount, transfer: transfer.id });
    }
    if (method === 'GET' && path === '/balance') {
      const of = account ? accounts.get(account)?.balance : platform;
      if (!of) return missing('account');
      const row = (amount: number) => [{ amount, currency: 'usd' }];
      return new Answer(200, { object: 'balance', available: row(of.available), pending: row(of.pending), ...(account ? { instant_available: row(of.available) } : {}) });
    }
    if (method === 'POST' && path === '/payouts') {
      const found = account ? accounts.get(account) : undefined;
      if (!found) return error(400, 'invalid_request_error', 'parameter_missing', 'Payouts here are made on the connected account.');
      const amount = Number(params.get('amount'));
      const card = ((found.external_accounts as { data: Obj[] }).data ?? [])[0];
      if (params.get('method') === 'instant' && !(card?.available_payout_methods as string[] | undefined)?.includes('instant')) return error(400, 'invalid_request_error', 'instant_payouts_unsupported', 'This account has no card that takes instant payouts.');
      if (found.balance.available < amount) return error(400, 'invalid_request_error', 'balance_insufficient', 'You have insufficient funds in your Stripe account for this transfer.');
      found.balance.available -= amount;
      const payout = { id: id('po'), object: 'payout', amount, currency: 'usd', arrival_date: clock, created: now(), destination: card?.id, method: params.get('method') ?? 'standard', type: 'card', status: 'pending' };
      payouts.set(payout.id, { ...payout, account: found.id });
      emit('payout.created', payout, account!);
      // Instant: paid within minutes (at once here).
      const paid = { ...payout, status: 'paid' };
      payouts.set(payout.id, { ...paid, account: found.id });
      emit('payout.paid', paid, account!);
      return new Answer(200, payout);
    }
    if (method === 'GET' && (match = path.match(/^\/payouts\/([^/]+)$/))) {
      const payout = payouts.get(match[1]!);
      if (!payout || payout.account !== account) return missing('payout');
      const { account: _account, ...shown } = payout;
      return new Answer(200, shown);
    }
    // Events, newest first.
    if (method === 'GET' && path === '/events') {
      const since = Number(params.get('created[gte]') ?? 0);
      const type = params.get('type');
      const data = events.filter((event) => (event.account ?? null) === account && (event.created as number) >= since && (!type || event.type === type)).reverse();
      const after = params.get('starting_after');
      const from = after ? data.findIndex((event) => event.id === after) + 1 : 0;
      const limit = Number(params.get('limit') ?? 10);
      return new Answer(200, { object: 'list', data: data.slice(from, from + limit), has_more: from + limit < data.length });
    }
    return error(404, 'invalid_request_error', 'unknown_endpoint', `Unrecognized request URL (${method}: /v1${path}). The dry run's Stripe doesn't know it.`);
  }

  /** A `fetch` for Stripe's API (others pass through to `fallback`). */
  function fetcher(fallback: typeof fetch): typeof fetch {
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname !== 'api.stripe.com') return fallback(input, init);
      const method = init?.method ?? 'GET';
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const params = method === 'POST' ? new URLSearchParams(String(init?.body ?? '')) : url.searchParams;
      const account = headers['Stripe-Account'] ?? null;
      const key = headers['Idempotency-Key'] ? `${account ?? ''}:${headers['Idempotency-Key']}` : null;
      const answer = (key && replies.get(key)) || route(method, url.pathname.replace(/^\/v1/, ''), params, account);
      if (key && !replies.has(key)) replies.set(key, answer);
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
  }

  return { fetcher, state: { platform, accounts, events } };
}

/** Routes Stripe's API to the in-memory Stripe for this process (before the app's modules make their clients). */
export function installFakeStripe(): ReturnType<typeof createFakeStripe> {
  const fake = createFakeStripe();
  globalThis.fetch = fake.fetcher(globalThis.fetch.bind(globalThis));
  return fake;
}
