import { routes, type AdminBookingHandlers, type PreviewEntry, type StaffViewer } from '@/contracts';
import { ADMIN_NOW, adminBookingSettledData, agentReversals, alexStaff, caseyStaff, fakeHandler, financeReversals } from '@/fixtures';
import { AdminBookingScreen } from '@/ui/screens/admin';
import { AdminTransferReversals } from '@/ui/screens/admin/admin-transfer-reversals';
import { AdminShell } from '@/ui/shells/admin-shell';
import copy from '../../../messages/en/ui/adminBooking.json';

/** Taking back a helper's transfer (completion plan 5.13): finance's form, the dialog, and an agent's read-only view. */

const r = copy.reversals;
const handlers: AdminBookingHandlers = {
  onRefund: fakeHandler({ ok: true, code: 'submitted' }),
  onDecideRefund: fakeHandler({ ok: true, code: 'updated' }),
  onRevealAddress: async () => ({ ok: false, code: 'not_allowed' }),
  onRevealConversation: async () => ({ ok: false, code: 'not_allowed' }),
  onReverseTransfer: fakeHandler({ ok: true, code: 'updated' }),
};
const page = (viewer: StaffViewer, data = adminBookingSettledData) => <AdminShell viewer={viewer} handlers={{ onSignOut: fakeHandler({ ok: true, code: 'updated' }) }} currentPath={routes.admin.booking(data.booking.id)}>
  <AdminBookingScreen data={data} handlers={handlers} now={ADMIN_NOW} />
</AdminShell>;

export const adminReversalsPreviews: PreviewEntry[] = [
  { id: 'screen-admin-booking/reversals-finance', group: 'Admin: transfer reversals', title: r.title, layout: 'fullscreen', render: () => page(caseyStaff, { ...adminBookingSettledData, reversals: financeReversals }) },
  { id: 'screen-admin-booking/reversals-agent', group: 'Admin: transfer reversals', title: r.historyTitle, layout: 'fullscreen', render: () => page(alexStaff, { ...adminBookingSettledData, reversals: agentReversals }) },
  { id: 'admin-transfer-reversals/dialog', group: 'Admin: transfer reversals', title: r.dialogTitle, render: () => <div className="p-4"><AdminTransferReversals data={financeReversals} onReverseTransfer={fakeHandler({ ok: false, code: 'insufficient_funds' })} initialOpen /></div> },
];
