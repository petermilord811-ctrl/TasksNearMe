import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { StaffSummary } from './admin';
import type { ISODateTime } from './common';

/**
 * Private beta (blueprint 11 B-068, 10 §6): invite codes per market and role, and two switches per market.
 * - `sign_up` on: a new account needs an invite (a client or a helper invite) to finish signing up. Accounts
 *   that finished before stay in.
 * - `helpers` on: becoming a helper needs a helper invite. Helpers who already started setup keep going.
 * Without a code, people join the waitlist (`routes.waitlist({ from: 'beta' })`).
 */

const code = (value: FieldErrorCode) => value;

/** Who an invite lets in: `poster` (a client account) or `helper` (a client account and helper setup). */
export const BETA_ROLES = ['poster', 'helper'] as const;
export type BetaRole = (typeof BETA_ROLES)[number];

export const BETA_GATES = ['sign_up', 'helpers'] as const;
export type BetaGate = (typeof BETA_GATES)[number];

export const INVITE_CODE_STATUSES = ['active', 'used_up', 'expired', 'revoked'] as const;
export type InviteCodeStatus = (typeof INVITE_CODE_STATUSES)[number];

/** Staff's own codes: 6–24 letters and digits (dashes allowed between them, ignored when matching). */
export const INVITE_CODE_MIN = 6;
export const INVITE_CODE_MAX = 24;

/** What a person types: letters, digits, spaces and dashes; matched without case, spaces or dashes. */
export const inviteCodeField = z
  .string(code('required'))
  .trim()
  .min(1, code('required'))
  .max(40, code('too_long'))
  .regex(/^[A-Za-z0-9\s-]+$/, code('incorrect'));

export const inviteCodeInputSchema = z.object({ inviteCode: inviteCodeField });
export type InviteCodeInput = z.input<typeof inviteCodeInputSchema>;

/**
 * Entering an invite (the sign-in `invite_code` step and the helper invite screen).
 * ok `redeemed`, maybe with `redirectTo`. Errors:
 * - `validation_failed` + `fieldErrors.inviteCode`: `required`; `incorrect` (no such invite here: "Check the
 *   code and try again"); `expired` (expired, used up or withdrawn: "This invite can't be used anymore");
 *   `not_supported` (a client invite on the helper screen: "This invite is for a client account").
 * - `rate_limited` + `retryAt` (10 tries in 10 minutes); `not_allowed` (signed out: back to sign-in).
 */
export type RedeemInviteHandler = ActionHandler<InviteCodeInput>;

/** The sign-in `invite_code` step (`SignInPageData.invite`). */
export interface SignInInvite {
  /** "TasksNearMe is invite-only in Austin for now." */
  marketName: string;
  /** From an invite link the person opened (`/invite/<code>`): fill it in. */
  code?: string;
}

/** `/app/helper/onboarding/*` while starting helper setup needs a helper invite. */
export interface HelperInvitePageData {
  marketName: string;
  /** From an invite link the person opened: fill it in. */
  code?: string;
}

export interface HelperInviteHandlers {
  /** ok `redeemed` with `redirectTo` (the first setup step). */
  onRedeem: RedeemInviteHandler;
}

// ---- Staff: `routes.admin.beta()` -------------------------------------------------------------------------

export interface AdminInviteJoiner {
  /** Their staff person page: `routes.admin.user(id)`. */
  id: string;
  /** "Maya R.", or empty while they haven't given their name yet. */
  displayName: string;
  joinedAt: ISODateTime;
  /** False while they're still at the sign-up steps after entering the code. */
  signUpFinished: boolean;
}

export interface AdminInviteCodeView {
  id: string;
  /** As people type it, e.g. "K7QP-M4XD" or "MUELLER". */
  code: string;
  /** The full link to share (sign-up opens with the code filled in). */
  link: string;
  /** Who it's for, e.g. "Mueller neighborhood group". */
  label: string;
  role: BetaRole;
  status: InviteCodeStatus;
  uses: number;
  maxUses: number;
  expiresAt?: ISODateTime;
  createdAt: ISODateTime;
  createdBy: StaffSummary;
  revokedAt?: ISODateTime;
  /** Newest first (the latest 50; `uses` is the full count). */
  joined: AdminInviteJoiner[];
}

export interface AdminBetaMarket {
  id: string;
  name: string;
  gates: Record<BetaGate, boolean>;
  /** People with access in this market, by the kind of invite they used. */
  joined: Record<BetaRole, number>;
  /** Active invites first, then the rest; newest first within each. */
  codes: AdminInviteCodeView[];
}

export interface AdminBetaPageData {
  markets: AdminBetaMarket[];
  /** Support leads and admins create and withdraw invites; other staff read. */
  canManage: boolean;
  /** Admins flip the invite-only switches (they're feature flags); everyone else sees them. */
  canSwitch: boolean;
}

export const INVITE_LABEL_MAX = 80;
export const INVITE_MAX_USES_LIMIT = 500;
export const INVITE_EXPIRY_DAYS = [7, 14, 30, 60, 90] as const;

const customCodeLength = (value: string) => value.replaceAll('-', '').length;

export const inviteCodeCreateSchema = z.object({
  marketId: z.string(code('required')).min(1, code('required')),
  role: z.enum(BETA_ROLES, code('required')),
  label: z.string(code('required')).trim().min(3, code('too_short')).max(INVITE_LABEL_MAX, code('too_long')),
  /** A number, or its text from an input. */
  maxUses: z.coerce.number(code('required')).int(code('invalid')).min(1, code('out_of_range')).max(INVITE_MAX_USES_LIMIT, code('out_of_range')),
  /** One of `INVITE_EXPIRY_DAYS`; empty: never expires. */
  expiresInDays: z
    .union([z.literal(''), z.coerce.number().refine((value) => (INVITE_EXPIRY_DAYS as readonly number[]).includes(value), code('invalid'))])
    .optional(),
  /** Empty: a generated code ("K7QP-M4XD"). */
  customCode: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[A-Za-z0-9-]+$/.test(value), code('invalid'))
    .refine((value) => value === '' || customCodeLength(value) >= INVITE_CODE_MIN, code('too_short'))
    .refine((value) => customCodeLength(value) <= INVITE_CODE_MAX, code('too_long'))
    .optional(),
});
export type InviteCodeCreateInput = z.input<typeof inviteCodeCreateSchema>;

export const betaGateInputSchema = z.object({
  marketId: z.string().min(1),
  gate: z.enum(BETA_GATES),
  enabled: z.boolean(),
});
export type BetaGateInput = z.input<typeof betaGateInputSchema>;

/**
 * - `onCreateCode`: ok `saved`. `validation_failed` with field codes on `label`, `maxUses`, `expiresInDays`,
 *   `customCode` (`in_use`: that code exists already).
 * - `onRevokeCode`: ok `updated` (nobody new can use it; people who joined keep their access).
 * - `onSetGate`: ok `updated`.
 * Errors on each: `not_allowed`, `not_found`, `unknown`.
 */
export interface AdminBetaHandlers {
  onCreateCode: ActionHandler<InviteCodeCreateInput>;
  onRevokeCode: ActionHandler<{ id: string }>;
  onSetGate: ActionHandler<BetaGateInput>;
}
