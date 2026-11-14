import { routes, type PreviewEntry } from '@/contracts';
import { ADMIN_NOW, adminWebhooksCalmData, adminWebhooksFailingData, fakeAdminWebhooksHandlers, fakeHandler, rileyStaff } from '@/fixtures';
import { AdminWebhooksScreen } from '@/ui/screens/admin';
import { AdminShell } from '@/ui/shells/admin-shell';
import copy from '../../../messages/en/ui/adminWebhooks.json';

/** The webhook inbox for admins and finance (completion plan 5.11). */

const p = copy.previews;
const shell = (children: React.ReactNode) => <AdminShell viewer={rileyStaff} handlers={{ onSignOut: fakeHandler({ ok: true, code: 'updated' }) }} currentPath={routes.admin.webhooks()}>{children}</AdminShell>;

export const adminWebhooksPreviews: PreviewEntry[] = [
  { id: 'screen-admin-webhooks/failing', group: p.group, title: p.failing, layout: 'fullscreen', render: () => shell(<AdminWebhooksScreen data={adminWebhooksFailingData} handlers={fakeAdminWebhooksHandlers} now={ADMIN_NOW} />) },
  { id: 'screen-admin-webhooks/calm', group: p.group, title: p.calm, layout: 'fullscreen', render: () => shell(<AdminWebhooksScreen data={adminWebhooksCalmData} handlers={fakeAdminWebhooksHandlers} now={ADMIN_NOW} />) },
];
