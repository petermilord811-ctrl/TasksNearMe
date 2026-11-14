import type { AdminAccountView } from '@/contracts';

/** Staff account and booking controls (completion plan 5.14), as an admin and a lead see them. */

/** Taylor (trust and safety) asked for a ban; Riley, an admin, can approve or decline it. */
export const accountPendingBan: AdminAccountView = {
  status: 'active',
  pendingBan: { requestedById: 'usr_taylor', requestedByName: 'Taylor B.', reason: 'Threats to two clients after canceled bookings.', at: '2026-11-23T14:30:00.000Z' },
  isStaff: false,
  actions: ['suspend', 'approve_ban', 'decline_ban'],
};

export const accountSuspended: AdminAccountView = { status: 'suspended', isStaff: false, actions: ['reinstate', 'request_ban'] };

export const accountBanned: AdminAccountView = { status: 'banned', isStaff: false, actions: ['reinstate'] };

export const staffCancelAllowed = { refundCents: 8800, allowed: true } as const;
export const staffCancelAboveLimit = { refundCents: 24000, allowed: false } as const;
