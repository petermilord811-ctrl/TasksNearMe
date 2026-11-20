import { z } from 'zod';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import { STAFF_ROLES, type ISODateTime, type StaffRole } from './common';
import type { PersonSummary } from './people';

/**
 * Staff tools, part 6 (UI-037; blueprint 02 `/admin/staff`, 08 §4): who works here and in which roles.
 * Admins only. Every change needs a reason and is audited; there are always at least two admins.
 */

const code = (value: FieldErrorCode) => value;
const reason = () => z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long'));

/** There must be at least this many admins (blueprint 08 §4). */
export const MIN_ADMINS = 2;

export interface AdminStaffRole {
  role: StaffRole;
  grantedAt: ISODateTime;
  /** Who granted it, when known. */
  grantedBy?: string;
}

export interface AdminStaffMember {
  person: PersonSummary & { email: string };
  roles: AdminStaffRole[];
  /**
   * Roles the viewer may remove now (never their own admin role, and never an admin role that would leave
   * fewer than `MIN_ADMINS`).
   */
  removable: StaffRole[];
  /** Their authenticator app for the two-step check: none yet, set up but not confirmed, or in use. */
  authenticator: StaffAuthenticatorStatus;
  /** What the viewer may do about it (never for themselves; see `STAFF_AUTHENTICATOR_ACTIONS`). */
  authenticatorActions: StaffAuthenticatorAction[];
}

export const STAFF_AUTHENTICATOR_STATUSES = ['none', 'pending', 'active'] as const;
export type StaffAuthenticatorStatus = (typeof STAFF_AUTHENTICATOR_STATUSES)[number];

/**
 * `setup_code`: a one-time code (24 hours) that lets them set up an authenticator; only before one is in
 * use. `reset`: remove a lost authenticator, with a reason; their sessions are asked for a code again.
 */
export const STAFF_AUTHENTICATOR_ACTIONS = ['setup_code', 'reset'] as const;
export type StaffAuthenticatorAction = (typeof STAFF_AUTHENTICATOR_ACTIONS)[number];

export const staffAuthenticatorResetInputSchema = z.object({
  userId: z.string(code('required')).min(1, code('required')),
  reason: reason(),
});
export type StaffAuthenticatorResetInput = z.input<typeof staffAuthenticatorResetInputSchema>;

/** The setup code is shown once, to the admin who asked for it. */
export type StaffSetupCodeResult = { ok: true; setupCode: string; expiresAt: ISODateTime } | { ok: false; code: 'not_allowed' | 'not_found' | 'unknown' };

/**
 * `onCreateSetupCode`: the code, or `not_allowed` (not an admin, their own, or an authenticator already in
 * use) / `not_found` (not staff). `onResetAuthenticator`: ok `updated`; `validation_failed`
 * (`fieldErrors.reason`), `not_allowed`.
 */
export interface StaffAuthenticatorHandlers {
  onCreateSetupCode: QueryHandler<{ userId: string }, StaffSetupCodeResult>;
  onResetAuthenticator: ActionHandler<StaffAuthenticatorResetInput>;
}

/** `routes.admin.staff()`: everyone with a staff role, by name. */
/**
 * A role grant waiting for a second admin (security review SEC19). With two or more admins, a grant takes effect only
 * once another admin approves it, within `GRANT_APPROVAL_HOURS`; with one admin it takes effect at once, and every
 * admin is told by email. Nobody grants themselves a role, nor approves a grant they asked for or one for themselves.
 */
export interface AdminPendingGrant {
  /** The request's id (its audit row). */
  id: string;
  person: PersonSummary & { email: string };
  role: StaffRole;
  /** The admin who asked. */
  requestedBy: string;
  reason: string;
  requestedAt: ISODateTime;
  expiresAt: ISODateTime;
  /** The viewer may approve or decline it: not the admin who asked, nor the person it's for. */
  canDecide: boolean;
}

export const GRANT_APPROVAL_HOURS = 48;

export interface AdminStaffPageData {
  members: AdminStaffMember[];
  adminCount: number;
  /** Roles the viewer may grant (every role, for an admin). */
  grantable: StaffRole[];
  /** Grants waiting for a second admin, oldest first. */
  pendingGrants: AdminPendingGrant[];
}

/**
 * Grant a role to an existing account by its email. Errors: `validation_failed` with `email: ['invalid']`
 * (no account uses it) or `role: ['in_use']` (they already have it).
 */
export const staffRoleGrantInputSchema = z.object({
  email: z.email(code('invalid')).max(254, code('too_long')),
  role: z.enum(STAFF_ROLES, code('required')),
  reason: reason(),
});
export type StaffRoleGrantInput = z.input<typeof staffRoleGrantInputSchema>;

export const staffRoleRemoveInputSchema = z.object({
  userId: z.string(code('required')).min(1, code('required')),
  role: z.enum(STAFF_ROLES, code('required')),
  reason: reason(),
});
export type StaffRoleRemoveInput = z.input<typeof staffRoleRemoveInputSchema>;

/** Approving or declining a pending grant (`AdminPendingGrant.id`). */
export const staffGrantDecisionInputSchema = z.object({
  requestId: z.string(code('required')).min(1, code('required')),
  approve: z.boolean(code('required')),
});
export type StaffGrantDecisionInput = z.input<typeof staffGrantDecisionInputSchema>;

/**
 * - `onGrant`: ok `updated` (the role is theirs now: the only admin granted it) or `sent` (waiting for a second admin).
 *   Errors: `validation_failed` (`email: ['invalid']`, `role: ['in_use']` when they have it or a grant of it waits),
 *   `not_allowed` (oneself), `unknown`.
 * - `onRemove`: ok `updated`. Errors: `validation_failed`, `not_allowed` (role or the admin minimum), `unknown`.
 * - `onDecideGrant`: ok `updated`. Errors: `not_allowed` (one's own request, or a grant for oneself), `expired`,
 *   `version_conflict` (another admin decided it first), `unknown`.
 */
export interface AdminStaffHandlers extends StaffAuthenticatorHandlers {
  onGrant: ActionHandler<StaffRoleGrantInput>;
  onRemove: ActionHandler<StaffRoleRemoveInput>;
  onDecideGrant: ActionHandler<StaffGrantDecisionInput>;
}
