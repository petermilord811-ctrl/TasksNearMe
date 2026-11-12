import { routes, type PreviewEntry } from '@/contracts';
import { ADMIN_NOW, adminStaffData, fakeAdminStaffHandlers, fakeHandler, rileyStaff } from '@/fixtures';
import type { AdminStaffPreviewState } from '@/ui/screens/admin/admin-staff-controls';
import { AdminStaffContent } from '@/ui/screens/admin/admin-staff-screen';
import { AdminShell } from '@/ui/shells/admin-shell';
import copy from '../../../messages/en/ui/adminStaff.json';

const shellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

function staff(id: string, title: string, state: AdminStaffPreviewState = {}): PreviewEntry {
  return {
    id: `screen-admin-staff/${id}`, group: copy.previews.group, title, layout: 'fullscreen',
    render: () => <AdminShell viewer={rileyStaff} handlers={shellHandlers} currentPath={routes.admin.staff()}>
      <AdminStaffContent data={adminStaffData} handlers={fakeAdminStaffHandlers} now={ADMIN_NOW} {...state} />
    </AdminShell>,
  };
}

const p = copy.previews;
const reason = 'Moving to the support lead role; agent access is no longer needed.';

export const adminStaffPreviews: PreviewEntry[] = [
  staff('default', p.default),
  staff('grant-errors', p.grantErrors, {
    initialGrantValues: { email: 'nobody@example.test', reason: 'New hire on the support team.' },
    initialGrantResult: { ok: false, code: 'validation_failed', fieldErrors: { email: ['invalid'] } },
  }),
  staff('granted', p.granted, { initialGrantResult: { ok: true, code: 'updated' } }),
  staff('remove-dialog', p.removeDialog, { initialRemove: { userId: 'usr_alex', role: 'support_agent', reason } }),
  staff('not-allowed', p.notAllowed, { initialRemove: { userId: 'usr_sky', role: 'support_lead', reason, result: { ok: false, code: 'not_allowed' } } }),
];
