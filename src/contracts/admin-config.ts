import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { Cents, ISODateTime } from './common';

/**
 * Staff tools, part 7 (UI-038; blueprint 02 `/admin/config`, 08 §4, D16): the market's policy (fees,
 * cancellation, timers) as versions, and feature flags. Admins only; every change needs a reason and is
 * audited. Publishing makes a new version: bookings keep the version they were confirmed under.
 */

const code = (value: FieldErrorCode) => value;
const reason = () => z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long'));

/** One market policy, flat for the form. Fees in basis points (1,000 = 10%), money in cents. */
export interface AdminPolicyValues {
  posterBps: number;
  posterMinCents: Cents;
  helperBps: number;
  freeUntilHours: number;
  lateFeeBps: number;
  lateFeeMinCents: Cents;
  autoApproveHours: number;
  inviteTtlHours: number;
  pendingFundingMinutes: number;
  noShowMinutes: number;
  addressHideAfterHours: number;
  maxLeadDays: number;
  minLeadHours: number;
}

/** The allowed range of each value (inclusive). */
export const POLICY_LIMITS: Record<keyof AdminPolicyValues, { min: number; max: number }> = {
  posterBps: { min: 0, max: 3000 },
  posterMinCents: { min: 0, max: 2000 },
  helperBps: { min: 0, max: 3000 },
  freeUntilHours: { min: 1, max: 168 },
  lateFeeBps: { min: 0, max: 5000 },
  lateFeeMinCents: { min: 0, max: 5000 },
  autoApproveHours: { min: 24, max: 168 },
  inviteTtlHours: { min: 1, max: 168 },
  pendingFundingMinutes: { min: 10, max: 120 },
  noShowMinutes: { min: 10, max: 120 },
  addressHideAfterHours: { min: 0, max: 168 },
  maxLeadDays: { min: 1, max: 60 },
  minLeadHours: { min: 0, max: 72 },
};
export const POLICY_FIELDS = Object.keys(POLICY_LIMITS) as (keyof AdminPolicyValues)[];
/** Fields shown as percentages and as dollars in the form (the rest are whole numbers of their unit). */
export const POLICY_PERCENT_FIELDS: readonly (keyof AdminPolicyValues)[] = ['posterBps', 'helperBps', 'lateFeeBps'];
export const POLICY_MONEY_FIELDS: readonly (keyof AdminPolicyValues)[] = ['posterMinCents', 'lateFeeMinCents'];

export type PolicyVersionStatus = 'draft' | 'published' | 'retired';

export interface AdminPolicyVersion {
  id: string;
  version: number;
  status: PolicyVersionStatus;
  publishedAt?: ISODateTime;
  publishedBy?: string;
  values: AdminPolicyValues;
}

export interface AdminFeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
}

/**
 * The market's outage switch (completion plan 5.15; the payments-incident runbook). On, nobody in the market can
 * start a booking (an offer, a direct request or its counter, a rebook or regular visits), tip or pay for a change,
 * and every signed-in page says so. Bookings that exist go ahead: their scheduled charges, Pay now, refunds and
 * transfers to helpers carry on.
 */
export interface AdminOutageSwitch {
  paused: boolean;
  /** The last time it was switched, by whom and why (from the audit log); absent when it never was. */
  changed?: { at: ISODateTime; by: string; reason: string };
}

/** `routes.admin.config()`: admins only. */
export interface AdminConfigPageData {
  market: { id: string; name: string; slug: string };
  outage: AdminOutageSwitch;
  /** The published version new bookings use. */
  current: AdminPolicyVersion;
  /** Every version, newest first. */
  history: AdminPolicyVersion[];
  flags: AdminFeatureFlag[];
}

const value = (key: keyof AdminPolicyValues) =>
  z.number(code('invalid')).int(code('invalid')).min(POLICY_LIMITS[key].min, code('out_of_range')).max(POLICY_LIMITS[key].max, code('out_of_range'));

/** Publish a new version with these values (it becomes the one new bookings use). */
export const policyPublishInputSchema = z.object({
  ...(Object.fromEntries(POLICY_FIELDS.map((key) => [key, value(key)])) as Record<keyof AdminPolicyValues, ReturnType<typeof value>>),
  reason: reason(),
});
export type PolicyPublishInput = z.input<typeof policyPublishInputSchema>;

export const flagSetInputSchema = z.object({
  key: z.string(code('required')).min(1, code('required')).max(80, code('too_long')),
  enabled: z.boolean(code('required')),
  reason: reason(),
});
export type FlagSetInput = z.input<typeof flagSetInputSchema>;

/** Turn the market's outage switch on (`paused`) or off (`open`), with the reason for the audit log. */
export const outageSwitchInputSchema = z.object({
  state: z.enum(['paused', 'open'], code('invalid')),
  reason: reason(),
});
export type OutageSwitchInput = z.input<typeof outageSwitchInputSchema>;

/**
 * An admin opens, pauses or pre-launches a market (owner, 2026-11-14: national, cities open in turn). Moving a
 * market to pre-launch or live brings in the helpers who waited there and tells them. Until dates follow each
 * market's own time zone, `live` is refused for a market outside America/Chicago: `validation_failed` with
 * `fieldErrors.status: ['not_supported']`.
 */
export const marketStatusInputSchema = z.object({
  status: z.enum(['prelaunch', 'live', 'paused'], code('invalid')),
  reason: reason(),
});
export type MarketStatusInput = z.input<typeof marketStatusInputSchema>;

/** All ok `updated`. Errors: `validation_failed` (a value out of range, the reason), `not_allowed`, `unknown`. */
export interface AdminConfigHandlers {
  onPublishPolicy: ActionHandler<PolicyPublishInput>;
  onSetFlag: ActionHandler<FlagSetInput>;
  /** A Server Action (the reason dialog calls it with `{ state, reason }`). */
  onSetOutage: ActionHandler<OutageSwitchInput>;
}

/** Form text for a basis-point value: 1000 → "10", 1250 → "12.5". */
export const percentText = (bps: number): string => String(bps / 100);
/** A typed percentage to basis points ("12.5" → 1250); null when it isn't a number with at most 2 decimals. */
export function bpsFromPercentText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}
/** Form text for cents: 300 → "3.00". */
export const dollarsText = (cents: Cents): string => (cents / 100).toFixed(2);
