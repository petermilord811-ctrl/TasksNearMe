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

/** `routes.admin.config()`: admins only. */
export interface AdminConfigPageData {
  market: { id: string; name: string; slug: string };
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

/** Both ok `updated`. Errors: `validation_failed` (a value out of range, the reason), `not_allowed`, `unknown`. */
export interface AdminConfigHandlers {
  onPublishPolicy: ActionHandler<PolicyPublishInput>;
  onSetFlag: ActionHandler<FlagSetInput>;
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
