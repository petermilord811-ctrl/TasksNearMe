import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
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
}

/** `routes.admin.staff()`: everyone with a staff role, by name. */
export interface AdminStaffPageData {
  members: AdminStaffMember[];
  adminCount: number;
  /** Roles the viewer may grant (every role, for an admin). */
  grantable: StaffRole[];
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

/** Both ok `updated`. Errors: `validation_failed`, `not_allowed` (role or the admin minimum), `unknown`. */
export interface AdminStaffHandlers {
  onGrant: ActionHandler<StaffRoleGrantInput>;
  onRemove: ActionHandler<StaffRoleRemoveInput>;
}
