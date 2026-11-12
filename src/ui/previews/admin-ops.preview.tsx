import type { ReactNode } from 'react';
import { routes, type ActionResult, type AdminAuditPageData, type AdminBookingsPageData, type AdminTaskPageData, type PreviewEntry, type StaffViewer } from '@/contracts';
import {
  ADMIN_NOW,
  adminAuditData,
  adminAuditEmptyData,
  adminAuditFilteredData,
  adminBookingsAttentionData,
  adminBookingsEmptyData,
  adminBookingsSearchData,
  adminBookingsUpcomingData,
  adminTaskBookedData,
  adminTaskHiddenData,
  adminTaskOpenData,
  adminTaskReadOnlyData,
  alexStaff,
  fakeHandler,
  morganStaff,
} from '@/fixtures';
import { AdminAuditScreen } from '@/ui/screens/admin/admin-audit-screen';
import { AdminBookingsScreen } from '@/ui/screens/admin/admin-bookings-screen';
import type { AdminTaskPreviewState } from '@/ui/screens/admin/admin-task-controls';
import { AdminTaskContent } from '@/ui/screens/admin/admin-task-screen';
import { AdminShell } from '@/ui/shells/admin-shell';
import auditCopy from '../../../messages/en/ui/adminAudit.json';
import bookingsCopy from '../../../messages/en/ui/adminBookings.json';
import taskCopy from '../../../messages/en/ui/adminTask.json';

const shellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

function Shell({ path, viewer = morganStaff, children }: { path: string; viewer?: StaffViewer; children: ReactNode }) {
  return <AdminShell viewer={viewer} handlers={shellHandlers} currentPath={path}>{children}</AdminShell>;
}

function bookings(id: string, title: string, data: AdminBookingsPageData): PreviewEntry {
  return {
    id: `screen-admin-bookings/${id}`, group: bookingsCopy.previews.group, title, layout: 'fullscreen',
    render: () => <Shell path={routes.admin.bookings({ filter: data.filter, q: data.query || undefined })}><AdminBookingsScreen data={data} now={ADMIN_NOW} /></Shell>,
  };
}

function task(id: string, title: string, data: AdminTaskPageData, state: AdminTaskPreviewState = {}, viewer: StaffViewer = morganStaff): PreviewEntry {
  const result: ActionResult = state.initialResult ?? { ok: true, code: 'updated' };
  return {
    id: `screen-admin-task/${id}`, group: taskCopy.previews.group, title, layout: 'fullscreen',
    render: () => <Shell path={routes.admin.task(data.task.id)} viewer={viewer}><AdminTaskContent data={data} handlers={{ onModerate: fakeHandler(result) }} now={ADMIN_NOW} {...state} /></Shell>,
  };
}

function audit(id: string, title: string, data: AdminAuditPageData): PreviewEntry {
  return {
    id: `screen-admin-audit/${id}`, group: auditCopy.previews.group, title, layout: 'fullscreen',
    render: () => <Shell path={routes.admin.audit(data.filters)}><AdminAuditScreen data={data} now={ADMIN_NOW} /></Shell>,
  };
}

const b = bookingsCopy.previews;
const t = taskCopy.previews;
const a = auditCopy.previews;
const reason = 'Asks helpers to bring their own cash for parts; checking with the poster.';

export const adminOpsPreviews: PreviewEntry[] = [
  bookings('attention', b.attention, adminBookingsAttentionData),
  bookings('upcoming', b.upcoming, adminBookingsUpcomingData),
  bookings('search', b.search, adminBookingsSearchData),
  bookings('empty', b.empty, adminBookingsEmptyData),
  task('open', t.open, adminTaskOpenData),
  task('hidden', t.hidden, adminTaskHiddenData),
  task('booked', t.booked, adminTaskBookedData),
  task('read-only', t.readOnly, adminTaskReadOnlyData, {}, alexStaff),
  task('hide-dialog', t.hideDialog, adminTaskOpenData, { initialDialog: 'hide_task', initialValues: { reason } }),
  task('remove-photo-dialog', t.removePhotoDialog, adminTaskOpenData, { initialDialog: 'remove_photo', initialValues: { photoId: adminTaskOpenData.photos[0]?.id, reason: 'The second photo shows the street number.' } }),
  task('recategorize-dialog', t.recategorizeDialog, adminTaskOpenData, { initialDialog: 'recategorize', initialValues: { categorySlug: 'moving-help', reason: 'This is moving furniture between rooms, not assembly.' } }),
  task('saved', t.saved, adminTaskHiddenData, { initialResult: { ok: true, code: 'updated' } }),
  task('validation-failed', t.validationFailed, adminTaskOpenData, { initialDialog: 'hide_task', initialValues: { reason: 'Too short' }, initialResult: { ok: false, code: 'validation_failed', fieldErrors: { reason: ['too_short'] } } }),
  task('not-allowed', t.notAllowed, adminTaskOpenData, { initialDialog: 'close_task', initialValues: { reason: 'Duplicate of another open task by the same poster.' }, initialResult: { ok: false, code: 'not_allowed' } }),
  audit('default', a.default, adminAuditData),
  audit('filtered', a.filtered, adminAuditFilteredData),
  audit('empty', a.empty, adminAuditEmptyData),
];
