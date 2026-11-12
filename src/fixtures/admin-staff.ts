import type { AdminStaffHandlers, AdminStaffMember, AdminStaffPageData, PersonSummary } from '@/contracts';

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
  { person: person('usr_alex', 'Alex P.', 'AP', 'alex@example.test'), roles: [{ role: 'support_agent', ...granted }], removable: ['support_agent'] },
  { person: person('usr_casey', 'Casey W.', 'CW', 'casey@example.test'), roles: [{ role: 'finance', ...granted }], removable: ['finance'] },
  { person: person('usr_morgan', 'Morgan L.', 'ML', 'morgan@example.test'), roles: [{ role: 'support_lead', ...granted }], removable: ['support_lead'] },
  // The viewer: their own admin role can't be removed.
  { person: person('usr_riley', 'Riley N.', 'RN', 'riley@example.test'), roles: [{ role: 'admin', grantedAt: '2026-08-01T15:00:00.000Z' }], removable: [] },
  // A second admin who also leads support: with only two admins, only the lead role can go.
  { person: person('usr_sky', 'Sky D.', 'SD', 'sky@example.test'), roles: [{ role: 'admin', ...granted }, { role: 'support_lead', ...granted }], removable: ['support_lead'] },
  { person: person('usr_taylor', 'Taylor B.', 'TB', 'taylor@example.test'), roles: [{ role: 'trust_safety', ...granted }], removable: ['trust_safety'] },
];

/** `/admin/staff` for Riley (an admin). */
export const adminStaffData: AdminStaffPageData = { members, adminCount: 2, grantable: ['support_agent', 'support_lead', 'trust_safety', 'finance', 'admin'] };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeAdminStaffHandlers: AdminStaffHandlers = {
  onGrant: () => wait({ ok: true as const, code: 'updated' as const }),
  onRemove: () => wait({ ok: true as const, code: 'updated' as const }),
};
