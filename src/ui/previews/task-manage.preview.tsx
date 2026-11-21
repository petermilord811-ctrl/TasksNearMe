import type { ComponentProps } from 'react';
import { routes, type AppShellHandlers, type PreviewEntry, type TaskOwnerHandlers, type TaskOwnerView } from '@/contracts';
import { bookAgainOwnerView, bookshelfOwnerWithInviteView, deskOwnerView, deskOwnerNoOffersView, deskOwnerStaleView, deskOwnerBookedView, deskOwnerExpiredView, deskOwnerSomeExpiredView, remoteOwnerView, fakeHandler, fakeInviteHandlers, mayaShell, movingDraft, samplePushSetup } from '@/fixtures';
import { TaskManageScreen } from '@/ui/screens/tasks/task-manage-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/taskManage.json';

const now = '2026-11-17T15:00:00.000Z';
const handlers: TaskOwnerHandlers = {
  onOfferAction: fakeHandler({ ok: true, code: 'updated' }),
  onTaskAction: fakeHandler({ ok: true, code: 'updated' }),
  onCancelTask: fakeHandler({ ok: true, code: 'canceled' }),
  onSavePushSubscription: fakeHandler({ ok: true, code: 'updated' }),
};
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

function preview(variant: Exclude<keyof typeof copy.previews, 'group'>, data: TaskOwnerView, options: Partial<ComponentProps<typeof TaskManageScreen>> = {}): PreviewEntry {
  return {
    id: `screen-task-manage/${variant}`, group: copy.previews.group, title: copy.previews[variant], layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.task(data.task.id)} layout="flow"><TaskManageScreen data={data} handlers={handlers} now={now} {...options} /></AppShell>,
  };
}

export const taskManagePreviews: PreviewEntry[] = [
  {
    id: 'screen-task-owner/with-invite', group: copy.previews.group, title: copy.previews.withInvite, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.task(bookshelfOwnerWithInviteView.task.id)} layout="flow"><TaskManageScreen data={bookshelfOwnerWithInviteView} handlers={handlers} inviteHandlers={fakeInviteHandlers} now="2026-12-08T17:00:00.000Z" /></AppShell>,
  },
  {
    id: 'screen-task-owner/book-again', group: copy.previews.group, title: copy.previews.bookAgain, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.task(bookAgainOwnerView.task.id)} layout="flow"><TaskManageScreen data={bookAgainOwnerView} handlers={handlers} inviteHandlers={fakeInviteHandlers} now="2026-12-08T17:00:00.000Z" /></AppShell>,
  },
  preview('offers', deskOwnerView),
  preview('expired-offers', deskOwnerExpiredView),
  preview('some-expired', deskOwnerSomeExpiredView),
  preview('no-offers', deskOwnerNoOffersView),
  preview('push-prompt', { ...deskOwnerNoOffersView, push: samplePushSetup }),
  preview('stale-offer', deskOwnerStaleView),
  preview('booked', deskOwnerBookedView),
  preview('remote', remoteOwnerView),
  preview('compare', deskOwnerView, { initialSelectedOfferIds: deskOwnerView.offers.map((offer) => offer.id) }),
  preview('cancel-sheet', deskOwnerView, { initialCancelOpen: true }),
  preview('cancel-error', deskOwnerView, { initialCancelOpen: true, initialCancelResult: { ok: false, code: 'not_allowed' }, handlers: { ...handlers, onCancelTask: fakeHandler({ ok: false, code: 'not_allowed' }) } }),
  preview('allowance', { ...deskOwnerView, expenseAllowance: movingDraft.expenseAllowance }),
];
