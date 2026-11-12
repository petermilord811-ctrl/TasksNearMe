import { routes, type AdminPaymentsPageData, type PreviewEntry } from '@/contracts';
import {
  ADMIN_NOW,
  adminPaymentsChargesData,
  adminPaymentsEmptyData,
  adminPaymentsExceptionsData,
  adminPaymentsPayoutsData,
  adminPaymentsSearchData,
  fakeHandler,
  morganStaff,
} from '@/fixtures';
import { AdminPaymentsScreen } from '@/ui/screens/admin/admin-payments-screen';
import { AdminShell } from '@/ui/shells/admin-shell';
import copy from '../../../messages/en/ui/adminPayments.json';

const shellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

function payments(id: string, title: string, data: AdminPaymentsPageData): PreviewEntry {
  return {
    id: `screen-admin-payments/${id}`, group: copy.previews.group, title, layout: 'fullscreen',
    render: () => <AdminShell viewer={morganStaff} handlers={shellHandlers} currentPath={routes.admin.payments({ tab: data.tab, q: data.query || undefined })}>
      <AdminPaymentsScreen data={data} now={ADMIN_NOW} />
    </AdminShell>,
  };
}

const p = copy.previews;

export const adminPaymentsPreviews: PreviewEntry[] = [
  payments('exceptions', p.exceptions, adminPaymentsExceptionsData),
  payments('charges', p.charges, adminPaymentsChargesData),
  payments('payouts', p.payouts, adminPaymentsPayoutsData),
  payments('search', p.search, adminPaymentsSearchData),
  payments('empty', p.empty, adminPaymentsEmptyData),
];
