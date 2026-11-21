import { z } from 'zod';
import type { ActionDescriptor, ActionHandler, FieldErrorCode } from './actions';
import type { Cents, ISODateTime, TimeZone } from './common';

/**
 * Staff tools, part 7 (UI-038; blueprint 02 `/admin/config`, 08 §4, D16): the market's policy (fees,
 * cancellation, timers) as versions, and feature flags. Admins only; every change needs a reason and is
 * audited. Publishing makes a new version: bookings keep the version they were confirmed under. The Markets
 * section (completion plan 8.2) is read by every staff role; only admins change a market's status.
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

/**
 * What search engines may list from the live site (docs/seo/PLAN.md §11.6; launch runbook J-L6): an admin setting, so
 * opening the listings at launch needs no deploy. `site`: the site's own pages (home, cities, services, price guides,
 * job boards, help, about). `on`: also open task pages and helper profiles with a completed task or a review, and the
 * sitemap lists them. Signed-in pages, staff pages and sample data never join search.
 */
export const SEARCH_INDEXING_SETTINGS = ['site', 'on'] as const;
export type AdminSearchIndexingSetting = (typeof SEARCH_INDEXING_SETTINGS)[number];

export interface AdminSearchIndexing {
  /** The setting: the code's default (`site`) until an admin first changes it. */
  setting: AdminSearchIndexingSetting;
  /** No admin has changed it yet: the code's default applies. */
  isDefault: boolean;
  /**
   * What this server does with it: the live site follows the setting; any other copy of the app (development, a
   * staging server) stays out of search, `off`, whatever the setting says. Show it when it differs from `setting`.
   */
  effective: 'off' | AdminSearchIndexingSetting;
  /** The last change (the audit log); absent when it never changed. */
  lastChange?: { at: ISODateTime; by: string; reason: string; from: AdminSearchIndexingSetting; to: AdminSearchIndexingSetting };
}

/**
 * Where we're open (completion plan 8.2): a market's status (src/modules/markets/coverage.ts). `prelaunch`: helpers
 * join and the first clients come in by invitation; `live`: open to everyone; `paused`: closed for now.
 */
export const ADMIN_MARKET_STATUSES = ['prelaunch', 'live', 'paused'] as const;
export type AdminMarketStatus = (typeof ADMIN_MARKET_STATUSES)[number];

/** A status the viewer can move a market to, and what the move does: the counts its confirm step names. */
export interface AdminMarketStatusAction extends ActionDescriptor<AdminMarketStatus> {
  /**
   * Waiting helpers it brings in and tells to choose a neighborhood: whenever the market is open after the move, those
   * with a ZIP it covers whose home market isn't this one yet. 0 for pausing.
   */
  helpersIn: number;
  /** Waitlist entries it emails that the city is open (going live, completion plan 8.3). */
  waitlistEmails: number;
}

/** One market in the config page's Markets section (completion plan 8.2). Counts only, never who. */
export interface AdminMarketRow {
  id: string;
  slug: string;
  name: string;
  /** Two-letter state code. */
  state: string;
  status: AdminMarketStatus;
  /** The ZIP3 prefixes it covers (a ZIP's first three digits), e.g. `["326"]`. */
  zipPrefixes: string[];
  /** Its IANA time zone, e.g. `America/New_York`. */
  timeZone: TimeZone;
  /**
   * Helpers with a ZIP it covers and no neighborhood yet: while it's paused they wait for it (and come in when it
   * opens); once it's open, they came in and still have to choose one.
   */
  helpersWaiting: number;
  /** The city the home page shows (DEFAULT_MARKET_SLUG): while it's paused, the home page answers "not found" too. */
  homePage: boolean;
  /**
   * Its waitlist: `entries` whose ZIP it covers, and its "we're open" email (completion plan 8.3): `told` got it,
   * `queued` are still going out, `toTell` would get it when it next goes live (never told, still subscribed), and
   * `failed` couldn't be sent after every retry (the provider refused them; the launch runbook says how to send them
   * again).
   */
  waitlist: { entries: number; told: number; queued: number; toTell: number; failed: number };
  /** The last status change (the audit log); absent when it never changed. */
  lastChange?: { at: ISODateTime; by: string; reason: string; from: AdminMarketStatus; to: AdminMarketStatus };
  /**
   * Why it can't open (pre-launch or live) now: `time_zone_unsupported` while dates can't be shown in its zone
   * (completion plan 8.1). Pausing still works. The matching actions arrive disabled.
   */
  openingRefused?: 'time_zone_unsupported';
  /** Where the viewer can move it, in order (pre-launch, live, paused), each confirmed with a reason; empty for staff who aren't admins. */
  actions: AdminMarketStatusAction[];
}

/** `routes.admin.config()` for staff who aren't admins: the markets, read-only (completion plan 8.2). */
export interface AdminMarketsPageData {
  markets: AdminMarketRow[];
  /** The viewer can't change a market's status (say so; the rows carry no actions). */
  readOnly: boolean;
}

/** `routes.admin.config()`: the whole page for admins (other staff get `AdminMarketsPageData`). */
export interface AdminConfigPageData {
  market: { id: string; name: string; slug: string };
  /** Every market, by name (completion plan 8.2). */
  markets: AdminMarketRow[];
  outage: AdminOutageSwitch;
  /** Search engines (the whole site, not one market). */
  searchIndexing: AdminSearchIndexing;
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

/** Open the listings to search (`on`) or keep them out (`site`), with the reason for the audit log. */
export const searchIndexingInputSchema = z.object({
  setting: z.enum(SEARCH_INDEXING_SETTINGS, code('invalid')),
  reason: reason(),
});
export type SearchIndexingInput = z.input<typeof searchIndexingInputSchema>;

/**
 * An admin opens, pauses or pre-launches a market (owner, 2026-11-14: national, cities open in turn). Moving a
 * market to pre-launch or live brings in the helpers who wait there and haven't come in yet (their home market is
 * elsewhere) and tells them; going live also emails its waitlist (completion plan 8.3). Opening (pre-launch or live) is refused for a market in a zone dates
 * aren't shown and checked in (outside the supported US zones, completion plan 8.1): `validation_failed` with
 * `fieldErrors.timeZone: ['not_supported']` (the market's zone, not the status asked for, is what isn't supported).
 */
export const marketStatusInputSchema = z.object({
  status: z.enum(['prelaunch', 'live', 'paused'], code('invalid')),
  reason: reason(),
});
export type MarketStatusInput = z.input<typeof marketStatusInputSchema>;

/** The Markets section's confirm step: one market, the status asked for and the reason. */
export const marketStatusChangeInputSchema = marketStatusInputSchema.extend({
  marketId: z.string(code('required')).trim().min(1, code('required')).max(80, code('too_long')),
});
export type MarketStatusChangeInput = z.input<typeof marketStatusChangeInputSchema>;

/** All ok `updated`. Errors: `validation_failed` (a value out of range, the reason), `not_allowed`, `unknown`. */
export interface AdminConfigHandlers {
  onPublishPolicy: ActionHandler<PolicyPublishInput>;
  onSetFlag: ActionHandler<FlagSetInput>;
  /** A Server Action (the reason dialog calls it with `{ state, reason }`). */
  onSetOutage: ActionHandler<OutageSwitchInput>;
  /**
   * A Server Action (a market's reason dialog calls it with `{ marketId, status, reason }`; completion plan 8.2). ok
   * `updated`. Errors: `validation_failed` with `fieldErrors.timeZone: ['not_supported']` (it can't open in its zone
   * yet) or `fieldErrors.reason`; `not_allowed` (not an admin); `not_found` (no such market); `unknown`.
   */
  onSetMarketStatus: ActionHandler<MarketStatusChangeInput>;
  /**
   * A Server Action (the Search engines section's reason dialog calls it with `{ setting, reason }`). ok `updated`
   * (also when it already was that). Robots.txt, the sitemap and the pages' X-Robots-Tag follow within 15 seconds.
   * Errors: `validation_failed` (`fieldErrors.reason`), `not_allowed` (not an admin), `unknown`.
   */
  onSetSearchIndexing: ActionHandler<SearchIndexingInput>;
}

/** The read-only Markets page needs no handler: its rows carry no actions. */
export type AdminMarketsHandlers = Partial<Pick<AdminConfigHandlers, 'onSetMarketStatus'>>;

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
