import { routes, type AppShellHandlers, type PreviewEntry } from '@/contracts';
import { fakeHandler, mayaShell, publicViewer } from '@/fixtures';
import { BookingHubSkeleton } from '@/ui/screens/bookings/booking-hub-skeleton';
import { BookingsSkeleton } from '@/ui/screens/bookings/bookings-skeleton';
import { DashboardSkeleton } from '@/ui/screens/home/dashboard-skeleton';
import { InboxSkeleton } from '@/ui/screens/messages/inbox-skeleton';
import { ThreadSkeleton } from '@/ui/screens/messages/thread-skeleton';
import { CategorySkeleton } from '@/ui/screens/public/category-skeleton';
import { TaskBoardSkeleton } from '@/ui/screens/public/task-board-skeleton';
import { MyTasksSkeleton } from '@/ui/screens/tasks/my-tasks-skeleton';
import { OfferDetailSkeleton, TaskManageSkeleton } from '@/ui/screens/tasks/task-detail-skeletons';
import { AppShell } from '@/ui/shells/app-shell';
import { AppShellSkeleton } from '@/ui/shells/app-shell-skeleton';
import { PublicShell } from '@/ui/shells/public-shell';
import bookingHub from '../../../messages/en/ui/bookingHub.json';
import home from '../../../messages/en/ui/home.json';
import inbox from '../../../messages/en/ui/inbox.json';
import myTasks from '../../../messages/en/ui/myTasks.json';
import offers from '../../../messages/en/ui/offers.json';
import publicPages from '../../../messages/en/ui/publicPages.json';
import taskManage from '../../../messages/en/ui/taskManage.json';
import thread from '../../../messages/en/ui/thread.json';

/**
 * Each most-visited page while it loads, in its own shape (plan 9.4b), inside its shell: put one beside the page's
 * own preview to see that the content arrives into the same boxes.
 */
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

function app(id: string, title: string, group: string, path: string, skeleton: React.ReactNode, layout: 'tabs' | 'flow' = 'tabs'): PreviewEntry {
  return { id, title, group, layout: 'fullscreen', render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={path} layout={layout}>{skeleton}</AppShell> };
}

function site(id: string, title: string, path: string, skeleton: React.ReactNode): PreviewEntry {
  return { id, title, group: publicPages.previews.group, layout: 'fullscreen', render: () => <PublicShell viewer={publicViewer} currentPath={path}>{skeleton}</PublicShell> };
}

export const pageSkeletonPreviews: PreviewEntry[] = [
  app('screen-dashboard/loading', home.previews.dashboardLoading, home.previews.group, routes.app.home(), <DashboardSkeleton />),
  app('screen-my-tasks/loading', myTasks.previews.loading, myTasks.previews.group, routes.app.tasks(), <MyTasksSkeleton />),
  app('screen-bookings/loading', bookingHub.previews.listLoading, bookingHub.previews.group, routes.app.bookings(), <BookingsSkeleton />),
  app('screen-booking-hub/loading', bookingHub.previews.loading, bookingHub.previews.group, routes.app.bookings(), <BookingHubSkeleton />, 'flow'),
  app('screen-inbox/loading', inbox.previews.loading, inbox.previews.group, routes.app.messages(), <InboxSkeleton />),
  app('screen-thread/loading', thread.previews.loading, thread.previews.group, routes.app.messages(), <ThreadSkeleton />, 'flow'),
  app('screen-task-manage/loading', taskManage.previews.loading, taskManage.previews.group, routes.app.tasks(), <TaskManageSkeleton />, 'flow'),
  app('screen-offer-detail/loading', offers.previews.detailLoading, offers.previews.group, routes.app.tasks(), <OfferDetailSkeleton />, 'flow'),
  // The whole signed-in shell while the session loads, before any page's own skeleton.
  { id: 'shell-app/loading', title: home.previews.shellLoading, group: home.previews.group, layout: 'fullscreen', render: () => <AppShellSkeleton /> },
  { id: 'shell-app/loading-flow', title: home.previews.shellFlowLoading, group: home.previews.group, layout: 'fullscreen', render: () => <AppShellSkeleton layout="flow" /> },
  site('screen-task-board/loading', publicPages.previews.boardLoading, routes.taskBoard(), <TaskBoardSkeleton />),
  site('screen-category/loading', publicPages.previews.categoryLoading, routes.category('furniture-assembly'), <CategorySkeleton />),
];
