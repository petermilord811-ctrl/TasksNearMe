import type { ReactNode } from 'react';
import { routes, type PreviewEntry } from '@/contracts';
import {
  ADMIN_NOW,
  adminResponseTimesCalmData,
  adminResponseTimesData,
  alexStaff,
  disputeCaseWithSavedReplies,
  fakeAdminCaseHandlers,
  fakeHandler,
  fakeSavedRepliesHandlers,
  morganStaff,
  savedRepliesAgentData,
  savedRepliesEmptyData,
  savedRepliesLeadData,
} from '@/fixtures';
import { AdminResponseTimesScreen, AdminSavedRepliesScreen } from '@/ui/screens/admin';
import { AdminCaseContent } from '@/ui/screens/admin/admin-case-screen';
import { AdminShell } from '@/ui/shells/admin-shell';
import timesCopy from '../../../messages/en/ui/adminResponseTimes.json';
import repliesCopy from '../../../messages/en/ui/adminSavedReplies.json';

/** Staff support tools (completion plan P2): response times, saved replies, and a case starting from one. */

const shellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const r = timesCopy.previews;
const s = repliesCopy.previews;

function Shell({ path, lead = false, children }: { path: string; lead?: boolean; children: ReactNode }) {
  return <AdminShell viewer={lead ? morganStaff : alexStaff} handlers={shellHandlers} currentPath={path}>{children}</AdminShell>;
}

export const adminSupportToolsPreviews: PreviewEntry[] = [
  { id: 'screen-admin-response-times/busy', group: r.group, title: r.busy, layout: 'fullscreen', render: () => <Shell path={routes.admin.responseTimes()} lead><AdminResponseTimesScreen data={adminResponseTimesData} now={ADMIN_NOW} /></Shell> },
  { id: 'screen-admin-response-times/calm', group: r.group, title: r.calm, layout: 'fullscreen', render: () => <Shell path={routes.admin.responseTimes()}><AdminResponseTimesScreen data={adminResponseTimesCalmData} now={ADMIN_NOW} /></Shell> },
  { id: 'screen-admin-saved-replies/lead', group: s.group, title: s.lead, layout: 'fullscreen', render: () => <Shell path={routes.admin.savedReplies()} lead><AdminSavedRepliesScreen data={savedRepliesLeadData} handlers={fakeSavedRepliesHandlers} /></Shell> },
  { id: 'screen-admin-saved-replies/agent', group: s.group, title: s.agent, layout: 'fullscreen', render: () => <Shell path={routes.admin.savedReplies()}><AdminSavedRepliesScreen data={savedRepliesAgentData} handlers={fakeSavedRepliesHandlers} /></Shell> },
  { id: 'screen-admin-saved-replies/empty', group: s.group, title: s.empty, layout: 'fullscreen', render: () => <Shell path={routes.admin.savedReplies()} lead><AdminSavedRepliesScreen data={savedRepliesEmptyData} handlers={fakeSavedRepliesHandlers} /></Shell> },
  {
    id: 'screen-admin-case/saved-replies', group: s.group, title: s.case, layout: 'fullscreen',
    render: () => <Shell path={routes.admin.case(disputeCaseWithSavedReplies.case.id)}><AdminCaseContent data={disputeCaseWithSavedReplies} handlers={fakeAdminCaseHandlers} now={ADMIN_NOW} /></Shell>,
  },
];
