import type { ReactNode } from 'react';
import { routes, type AdminBookingHandlers, type AdminUserHandlers, type PreviewEntry, type StaffViewer } from '@/contracts';
import {
  accountBanned,
  accountPendingBan,
  accountSuspended,
  ADMIN_NOW,
  adminBookingSettledData,
  adminUserJordanData,
  alexStaff,
  fakeAdminUserHandlers,
  fakeHandler,
  morganStaff,
  rileyStaff,
  staffCancelAboveLimit,
  staffCancelAllowed,
} from '@/fixtures';
import { AdminBookingScreen, AdminUserScreen } from '@/ui/screens/admin';
import { AdminReasonAction } from '@/ui/screens/admin/admin-reason-action';
import { AdminShell } from '@/ui/shells/admin-shell';

/** Staff account and booking controls (completion plan 5.14). */

const group = 'Admin: account and booking controls';
const shell = (viewer: StaffViewer, path: string, children: ReactNode) => <AdminShell viewer={viewer} handlers={{ onSignOut: fakeHandler({ ok: true, code: 'updated' }) }} currentPath={path}>{children}</AdminShell>;
const userHandlers: AdminUserHandlers = { ...fakeAdminUserHandlers, onAccountAction: fakeHandler({ ok: true, code: 'updated' }) };
const bookingHandlers: AdminBookingHandlers = {
  onRefund: fakeHandler({ ok: true, code: 'submitted' }),
  onDecideRefund: fakeHandler({ ok: true, code: 'updated' }),
  onRevealAddress: async () => ({ ok: false, code: 'not_allowed' }),
  onRevealConversation: async () => ({ ok: false, code: 'not_allowed' }),
  onStaffCancel: fakeHandler({ ok: true, code: 'canceled' }),
};

export const staffControlsPreviews: PreviewEntry[] = [
  { id: 'screen-admin-user/account-pending-ban', group, title: 'Account: a ban waiting for a second reviewer', layout: 'fullscreen', render: () => shell(rileyStaff, routes.admin.user(adminUserJordanData.user.id), <AdminUserScreen data={{ ...adminUserJordanData, account: accountPendingBan }} handlers={userHandlers} now={ADMIN_NOW} />) },
  { id: 'screen-admin-user/account-suspended', group, title: 'Account: suspended', layout: 'fullscreen', render: () => shell(morganStaff, routes.admin.user(adminUserJordanData.user.id), <AdminUserScreen data={{ ...adminUserJordanData, account: accountSuspended }} handlers={userHandlers} now={ADMIN_NOW} />) },
  { id: 'screen-admin-user/account-banned', group, title: 'Account: banned (an admin view)', layout: 'fullscreen', render: () => shell(rileyStaff, routes.admin.user(adminUserJordanData.user.id), <AdminUserScreen data={{ ...adminUserJordanData, account: accountBanned }} handlers={userHandlers} now={ADMIN_NOW} />) },
  { id: 'screen-admin-booking/staff-cancel', group, title: 'Booking: support can cancel it', layout: 'fullscreen', render: () => shell(morganStaff, routes.admin.booking(adminBookingSettledData.booking.id), <AdminBookingScreen data={{ ...adminBookingSettledData, staffCancel: staffCancelAllowed }} handlers={bookingHandlers} now={ADMIN_NOW} />) },
  { id: 'screen-admin-booking/staff-cancel-above-limit', group, title: 'Booking: the refund is above an agent’s limit', layout: 'fullscreen', render: () => shell(alexStaff, routes.admin.booking(adminBookingSettledData.booking.id), <AdminBookingScreen data={{ ...adminBookingSettledData, staffCancel: staffCancelAboveLimit }} handlers={bookingHandlers} now={ADMIN_NOW} />) },
  {
    id: 'admin-reason-action/open', group, title: 'A reason dialog, open',
    render: () => <div className="p-4"><AdminReasonAction trigger="Suspend account" title="Suspend this account" description="They're signed out everywhere, can't sign in, and their helper profile is suspended." submit="Suspend" pending="Saving…" destructive notAllowed="You can't do that now." action={fakeHandler({ ok: true, code: 'updated' })} payload={{ action: 'suspend' }} field="reason" initialOpen /></div>,
  },
];
