import type { AdminPendingGrant, AdminStaffHandlers, AdminStaffMember, AdminStaffPageData, PersonSummary } from '@/contracts';

/** Staff tools, part 6 (UI-037): the staff list, around Monday Nov 23, 2026 in Austin (`ADMIN_NOW`). */

const person = (id: string, displayName: string, initials: string, email: string): PersonSummary & { email: string } => ({
  id,
  displayName,
  initials,
  memberSince: '2026-08-01T15:00:00.000Z',
  phoneVerified: true,
  email,
});
const granted = { grantedAt: '2026-08-01T15:00:00.000Z', grantedBy: 'Riley N.' };

const members: AdminStaffMember[] = [
  // New to staff: no authenticator yet (an admin gives them a setup code).
  { person: person('usr_alex', 'Alex P.', 'AP', 'alex@example.test'), roles: [{ role: 'support_agent', ...granted }], removable: ['support_agent'], authenticator: 'none', authenticatorActions: ['setup_code'] },
  // Has a setup code in progress: the key is added but not confirmed yet.
  { person: person('usr_casey', 'Casey W.', 'CW', 'casey@example.test'), roles: [{ role: 'finance', ...granted }], removable: ['finance'], authenticator: 'pending', authenticatorActions: ['setup_code', 'reset'] },
  { person: person('usr_morgan', 'Morgan L.', 'ML', 'morgan@example.test'), roles: [{ role: 'support_lead', ...granted }], removable: ['support_lead'], authenticator: 'active', authenticatorActions: ['reset'] },
  // The viewer: their own admin role can't be removed, nor their own authenticator reset.
  { person: person('usr_riley', 'Riley N.', 'RN', 'riley@example.test'), roles: [{ role: 'admin', grantedAt: '2026-08-01T15:00:00.000Z' }], removable: [], authenticator: 'active', authenticatorActions: [] },
  // A second admin who also leads support: with only two admins, only the lead role can go.
  { person: person('usr_sky', 'Sky D.', 'SD', 'sky@example.test'), roles: [{ role: 'admin', ...granted }, { role: 'support_lead', ...granted }], removable: ['support_lead'], authenticator: 'active', authenticatorActions: ['reset'] },
  { person: person('usr_taylor', 'Taylor B.', 'TB', 'taylor@example.test'), roles: [{ role: 'trust_safety', ...granted }], removable: ['trust_safety'], authenticator: 'active', authenticatorActions: ['reset'] },
];

/** A setup code as shown once to the admin who asked for it (until Tuesday Nov 24, 3:00 PM in Austin). */
export const adminStaffSetupCode = { setupCode: 'K7QD-29XM-PR', expiresAt: '2026-11-24T21:00:00.000Z' };

/** `/admin/staff` for Riley (an admin). */
export const adminStaffData: AdminStaffPageData = { members, adminCount: 2, grantable: ['support_agent', 'support_lead', 'trust_safety', 'finance', 'admin'], pendingGrants: [] };

/**
 * Grants waiting for a second admin (security review SEC19): Sky asked for Alex to lead support, which Riley may
 * decide; Riley asked for Casey to join trust and safety, which another admin decides.
 */
const pendingGrants: AdminPendingGrant[] = [
  {
    id: 'aud_grant_alex',
    person: person('usr_alex', 'Alex P.', 'AP', 'alex@example.test'),
    role: 'support_lead',
    requestedBy: 'Sky D.',
    reason: 'Alex leads the weekend support shift from December.',
    requestedAt: '2026-11-22T18:30:00.000Z',
    expiresAt: '2026-11-24T18:30:00.000Z',
    canDecide: true,
  },
  {
    id: 'aud_grant_casey',
    person: person('usr_casey', 'Casey W.', 'CW', 'casey@example.test'),
    role: 'trust_safety',
    requestedBy: 'Riley N.',
    reason: 'Casey covers chargeback reviews with trust and safety.',
    requestedAt: '2026-11-23T14:05:00.000Z',
    expiresAt: '2026-11-25T14:05:00.000Z',
    canDecide: false,
  },
];

export const adminStaffWithPendingGrants: AdminStaffPageData = { ...adminStaffData, pendingGrants };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeAdminStaffHandlers: AdminStaffHandlers = {
  onGrant: () => wait({ ok: true as const, code: 'updated' as const }),
  onRemove: () => wait({ ok: true as const, code: 'updated' as const }),
  onDecideGrant: () => wait({ ok: true as const, code: 'updated' as const }),
  onCreateSetupCode: () => wait({ ok: true as const, ...adminStaffSetupCode }),
  onResetAuthenticator: () => wait({ ok: true as const, code: 'updated' as const }),
};
