import { routes, type PreviewEntry } from '@/contracts';
import { ADMIN_NOW, adminConfigData, adminConfigNeverPausedData, adminConfigPausedData, fakeAdminConfigHandlers, fakeHandler, rileyStaff } from '@/fixtures';
import type { AdminConfigPreviewState } from '@/ui/screens/admin/admin-config-controls';
import { AdminConfigContent } from '@/ui/screens/admin/admin-config-screen';
import { AdminShell } from '@/ui/shells/admin-shell';
import copy from '../../../messages/en/ui/adminConfig.json';

const shellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

function config(id: string, title: string, state: AdminConfigPreviewState & { outageOpen?: boolean } = {}, data = adminConfigData): PreviewEntry {
  return {
    id: `screen-admin-config/${id}`, group: copy.previews.group, title, layout: 'fullscreen',
    render: () => <AdminShell viewer={rileyStaff} handlers={shellHandlers} currentPath={routes.admin.config()}>
      <AdminConfigContent data={data} handlers={fakeAdminConfigHandlers} now={ADMIN_NOW} {...state} />
    </AdminShell>,
  };
}

const p = copy.previews;

export const adminConfigPreviews: PreviewEntry[] = [
  config('default', p.default),
  config('publish-errors', p.publishErrors, {
    initialPolicyValues: { posterBps: '40', reason: 'Testing a higher fee.' },
    initialPolicyResult: { ok: false, code: 'validation_failed', fieldErrors: { posterBps: ['out_of_range'] } },
  }),
  config('published', p.published, { initialPolicyResult: { ok: true, code: 'updated' } }),
  config('flag-dialog', p.flagDialog, { initialFlag: { key: 'ai_drafting', reason: 'Pausing AI drafting while we review its suggestions.' } }),
  // The outage switch (completion plan 5.15): on, never used, and its reason dialog.
  config('outage-paused', p.outagePaused, {}, adminConfigPausedData),
  config('outage-never', p.outageNever, {}, adminConfigNeverPausedData),
  config('outage-dialog', p.outageDialog, { outageOpen: true }),
];
