import { routes, type PreviewEntry } from '@/contracts';
import { ADMIN_NOW, adminJobsOffData, adminJobsRunningData, adminJobsStalledData, fakeHandler, rileyStaff } from '@/fixtures';
import { AdminJobsScreen } from '@/ui/screens/admin';
import { AdminShell } from '@/ui/shells/admin-shell';
import copy from '../../../messages/en/ui/adminJobs.json';

/** What the job runner did on this server, for admins and finance (when things break, 2026-11-21). */

const p = copy.previews;
const shell = (children: React.ReactNode) => <AdminShell viewer={rileyStaff} handlers={{ onSignOut: fakeHandler({ ok: true, code: 'updated' }) }} currentPath={routes.admin.jobs()}>{children}</AdminShell>;

export const adminJobsPreviews: PreviewEntry[] = [
  { id: 'screen-admin-jobs/running', group: p.group, title: p.running, layout: 'fullscreen', render: () => shell(<AdminJobsScreen data={adminJobsRunningData} now={ADMIN_NOW} />) },
  { id: 'screen-admin-jobs/stalled', group: p.group, title: p.stalled, layout: 'fullscreen', render: () => shell(<AdminJobsScreen data={adminJobsStalledData} now={ADMIN_NOW} />) },
  { id: 'screen-admin-jobs/off', group: p.group, title: p.off, layout: 'fullscreen', render: () => shell(<AdminJobsScreen data={adminJobsOffData} now={ADMIN_NOW} />) },
];
