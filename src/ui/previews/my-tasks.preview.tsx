import { routes, type AppShellHandlers, type MyTasksPageData, type PreviewEntry } from '@/contracts';
import { fakeHandler, mayaShell, myTasksAllAttentionData, myTasksEmptyData, myTasksPageData } from '@/fixtures';
import { MyTasksScreen } from '@/ui/screens/tasks/my-tasks-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/myTasks.json';

const now = '2026-11-17T15:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
function preview(variant: string, title: string, data: MyTasksPageData, initialTab: 'open' | 'booked' | 'past' = 'open'): PreviewEntry {
  return {
    id: `screen-my-tasks/${variant}`,
    title,
    group: copy.previews.group,
    layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.tasks()}><MyTasksScreen data={data} now={now} initialTab={initialTab} /></AppShell>,
  };
}

export const myTasksPreviews: PreviewEntry[] = [
  preview('default', copy.previews.default, myTasksPageData),
  preview('all-attention', copy.previews.allAttention, myTasksAllAttentionData),
  preview('empty', copy.previews.empty, myTasksEmptyData),
  preview('booked', copy.previews.booked, myTasksPageData, 'booked'),
  preview('past', copy.previews.past, myTasksPageData, 'past'),
  preview('empty-booked', copy.previews.emptyBooked, myTasksEmptyData, 'booked'),
  preview('empty-past', copy.previews.emptyPast, myTasksEmptyData, 'past'),
  preview('past-statuses', copy.previews.pastStatuses, {
    ...myTasksPageData,
    past: [myTasksPageData.past[0], { ...myTasksPageData.open[0], status: 'canceled' }, { ...myTasksPageData.booked[1], status: 'expired' }],
  }, 'past'),
];
