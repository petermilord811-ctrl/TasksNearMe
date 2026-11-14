import type { PayoutAccountStatus } from '@/contracts';
import { createStripeClient, StripeError, type StripeClient } from './stripe';

/**
 * Stripe Connect for helper payouts (docs/integration-points.md "Transfers and payouts"), REST without
 * the SDK:
 * - each helper gets an Express account (US, individual, transfers) and finishes Stripe's own onboarding
 *   through an account link; Stripe collects the bank and identity details and pays out on its schedule;
 * - earnings move as one Transfer each, tied to the booking's charge (`source_transaction`) when the charge
 *   covers it, with the earnings row's id as the idempotency key;
 * - `account.updated` gives the account's state; `payout.*` events (from connected accounts) the deposits.
 */

export interface StripeConnect {
  readonly provider: 'stripe';
  /** A new Express account for the helper (one per person: the same key returns the same account). */
  createAccount(input: { userId: string; email: string }): Promise<string>;
  /** Stripe's onboarding for the account; it comes back to `returnUrl` (or `refreshUrl` when the link expired). */
  onboardingLink(input: { accountId: string; returnUrl: string; refreshUrl: string }): Promise<string>;
  /** The account's state, read again (after the return from onboarding). */
  accountStatus(accountId: string): Promise<PayoutAccountStatus>;
  /** The charge behind a payment intent, for `source_transaction`. */
  chargeOf(intentId: string): Promise<{ chargeId: string; amountCents: number } | null>;
  transfer(input: { amountCents: number; accountId: string; sourceChargeId?: string; group: string; idempotencyKey: string }): Promise<{ ok: true; transferId: string } | { ok: false; reason: 'account_not_ready' }>;
  /**
   * Takes back part or all of a transfer (completion plan 5.13): the money returns from the helper's Stripe
   * balance to the platform. `insufficient`: the helper's balance can't cover it (already paid out to the bank);
   * Stripe then leaves it to us to recover. `already_reversed`: nothing left to take back.
   */
  reverseTransfer(input: { transferId: string; amountCents: number; idempotencyKey: string; caseId: string }): Promise<{ ok: true; reversalId: string } | { ok: false; reason: 'insufficient' | 'already_reversed' }>;
  /** What the account can pay out instantly now (needs an eligible debit card on the account). */
  instantAvailable(accountId: string): Promise<number>;
  /**
   * An instant payout of `amountCents` to the account's debit card. Stripe takes the Instant Payouts fee set
   * in the platform's Connect pricing from it; the money arrives in minutes.
   */
  instantPayout(input: { accountId: string; amountCents: number; idempotencyKey: string }): Promise<{ payoutId: string; arrivalDate: string }>;
  /** A one-time link to the helper's Express Dashboard (payouts, bank details, tax forms). */
  dashboardLink(accountId: string): Promise<string>;
}

type Account = { requirements?: { currently_due?: unknown[]; past_due?: unknown[]; disabled_reason?: string | null; pending_verification?: unknown[] } | null; payouts_enabled?: boolean; capabilities?: { transfers?: string } | null };

/** Stripe's account as the app's payout status. */
export function payoutStatusOf(account: Account): PayoutAccountStatus {
  const requirements = account.requirements ?? {};
  const disabled = requirements.disabled_reason ?? null;
  if (account.capabilities?.transfers === 'active' && account.payouts_enabled && !disabled) return 'active';
  if (disabled && !disabled.startsWith('requirements.pending') && disabled !== 'requirements.past_due' && disabled !== 'under_review') return 'restricted';
  if ((requirements.past_due?.length ?? 0) > 0 || (requirements.currently_due?.length ?? 0) > 0) return 'requirements_due';
  return 'pending';
}

export function createStripeConnect(config: { secretKey: string; fetch?: typeof fetch; client?: StripeClient }): StripeConnect {
  const stripe = config.client ?? createStripeClient(config);
  return {
    provider: 'stripe',

    async createAccount({ userId, email }) {
      const account = await stripe.request(
        'POST',
        '/accounts',
        new URLSearchParams({
          type: 'express',
          country: 'US',
          email,
          business_type: 'individual',
          'capabilities[transfers][requested]': 'true',
          'metadata[user_id]': userId,
        }),
        `account:${userId}`,
      );
      if (typeof account.id !== 'string') throw new Error('Stripe sent no account id');
      return account.id;
    },

    async onboardingLink({ accountId, returnUrl, refreshUrl }) {
      const link = await stripe.request('POST', '/account_links', new URLSearchParams({ account: accountId, type: 'account_onboarding', return_url: returnUrl, refresh_url: refreshUrl }));
      if (typeof link.url !== 'string') throw new Error('Stripe sent no onboarding link');
      return link.url;
    },

    async accountStatus(accountId) {
      return payoutStatusOf((await stripe.request('GET', `/accounts/${encodeURIComponent(accountId)}`)) as Account);
    },

    async chargeOf(intentId) {
      const intent = await stripe.request('GET', `/payment_intents/${encodeURIComponent(intentId)}`);
      const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : null;
      const amount = typeof intent.amount_received === 'number' ? intent.amount_received : typeof intent.amount === 'number' ? intent.amount : 0;
      return chargeId ? { chargeId, amountCents: amount } : null;
    },

    async instantAvailable(accountId) {
      const balance = await stripe.request('GET', '/balance', undefined, undefined, { account: accountId });
      const instant = (balance.instant_available ?? []) as { amount?: unknown; currency?: unknown }[];
      return instant.filter((row) => row.currency === 'usd' && typeof row.amount === 'number').reduce((sum, row) => sum + (row.amount as number), 0);
    },

    async instantPayout({ accountId, amountCents, idempotencyKey }) {
      const payout = await stripe.request('POST', '/payouts', new URLSearchParams({ amount: String(amountCents), currency: 'usd', method: 'instant' }), idempotencyKey, { account: accountId });
      if (typeof payout.id !== 'string') throw new Error('Stripe sent no payout id');
      const arrival = typeof payout.arrival_date === 'number' ? new Date(payout.arrival_date * 1000) : new Date();
      return { payoutId: payout.id, arrivalDate: arrival.toISOString().slice(0, 10) };
    },

    async dashboardLink(accountId) {
      const link = await stripe.request('POST', `/accounts/${encodeURIComponent(accountId)}/login_links`);
      if (typeof link.url !== 'string') throw new Error('Stripe sent no dashboard link');
      return link.url;
    },

    async transfer({ amountCents, accountId, sourceChargeId, group, idempotencyKey }) {
      const params = new URLSearchParams({ amount: String(amountCents), currency: 'usd', destination: accountId, transfer_group: group });
      if (sourceChargeId) params.set('source_transaction', sourceChargeId);
      try {
        const transfer = await stripe.request('POST', '/transfers', params, idempotencyKey);
        return { ok: true, transferId: typeof transfer.id === 'string' ? transfer.id : '' };
      } catch (error) {
        // The account can't take transfers yet (onboarding unfinished, or restricted): try again later.
        if (error instanceof StripeError && error.status === 400 && /capabilit|account/i.test(`${error.body.code ?? ''}`)) return { ok: false, reason: 'account_not_ready' };
        throw error;
      }
    },

    async reverseTransfer({ transferId, amountCents, idempotencyKey, caseId }) {
      const params = new URLSearchParams({ amount: String(amountCents), 'metadata[case_id]': caseId });
      try {
        const reversal = await stripe.request('POST', `/transfers/${encodeURIComponent(transferId)}/reversals`, params, idempotencyKey);
        if (typeof reversal.id !== 'string') throw new Error('Stripe sent no reversal id');
        return { ok: true, reversalId: reversal.id };
      } catch (error) {
        if (error instanceof StripeError && error.status === 400) {
          const code = `${error.body.code ?? ''}`;
          if (/insufficient/i.test(code)) return { ok: false, reason: 'insufficient' };
          if (/reversed|amount_too_large/i.test(code)) return { ok: false, reason: 'already_reversed' };
        }
        throw error;
      }
    },
  };
}

export type ConnectEvent =
  | { kind: 'account'; accountId: string; status: PayoutAccountStatus }
  | { kind: 'payout'; accountId: string; payoutId: string; amountCents: number; status: 'in_transit' | 'paid' | 'failed' | 'canceled'; arrivalDate: string; createdAt: Date };

/** The Connect events the app acts on: an account's state, and a connected account's payouts. */
export function parseConnectEvent(event: unknown): ConnectEvent | null {
  if (!event || typeof event !== 'object') return null;
  const { type, account, data } = event as { type?: unknown; account?: unknown; data?: { object?: Record<string, unknown> } };
  const object = data?.object;
  if (typeof type !== 'string' || !object) return null;
  if (type === 'account.updated' && typeof object.id === 'string') return { kind: 'account', accountId: object.id, status: payoutStatusOf(object as Account) };
  if (type.startsWith('payout.') && typeof account === 'string' && typeof object.id === 'string') {
    const status = object.status === 'paid' ? 'paid' : object.status === 'failed' ? 'failed' : object.status === 'canceled' ? 'canceled' : 'in_transit';
    const arrival = typeof object.arrival_date === 'number' ? new Date(object.arrival_date * 1000) : new Date();
    return {
      kind: 'payout',
      accountId: account,
      payoutId: object.id,
      amountCents: typeof object.amount === 'number' ? object.amount : 0,
      status,
      arrivalDate: arrival.toISOString().slice(0, 10),
      createdAt: typeof object.created === 'number' ? new Date(object.created * 1000) : new Date(),
    };
  }
  return null;
}

export function stripeConnectFromEnv(env: Record<string, string | undefined> = process.env): StripeConnect | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  return secretKey && env.STRIPE_PUBLISHABLE_KEY?.trim() ? createStripeConnect({ secretKey }) : null;
}
