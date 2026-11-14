import type { ReactNode } from 'react';
import { routes, type PreviewEntry } from '@/contracts';
import { publicRemoteTaskPageData, publicTaskAssignedPageData, publicTaskPageData, publicViewer, taskBoardByDayData, taskBoardCardsData, taskBoardFilteredData, taskBoardFilteredEmptyData, taskBoardHubData, taskBoardNoTasksData, taskBoardPageData, taskBoardPagedData } from '@/fixtures';
import { PublicShell } from '@/ui/shells/public-shell';
import { TaskBoardScreen } from '@/ui/screens/public/task-board-screen';
import { PublicTaskScreen } from '@/ui/screens/public/public-task-screen';
import boardCopy from '../../../messages/en/ui/taskBoard.json';
import taskCopy from '../../../messages/en/ui/publicTask.json';

const now = '2026-11-17T15:00:00.000Z';
function page(id: string, title: string, path: string, render: () => ReactNode): PreviewEntry {
  return { id, title, group: boardCopy.previews.group, layout: 'fullscreen', render: () => <PublicShell viewer={publicViewer} currentPath={path}>{render()}</PublicShell> };
}

export const taskPagePreviews: PreviewEntry[] = [
  page('screen-task-board/default', boardCopy.previews.default, routes.taskBoard(taskBoardPageData.market.slug), () => <TaskBoardScreen data={taskBoardPageData} now={now} />),
  page('screen-task-board/by-day', boardCopy.previews.byDay, routes.taskBoard(taskBoardByDayData.market.slug, taskBoardByDayData.query), () => <TaskBoardScreen data={taskBoardByDayData} now={now} />),
  page('screen-task-board/cards', boardCopy.previews.cards, routes.taskBoard(taskBoardCardsData.market.slug, taskBoardCardsData.query), () => <TaskBoardScreen data={taskBoardCardsData} now={now} />),
  page('screen-task-board/filtered', boardCopy.previews.filtered, routes.taskBoard(taskBoardFilteredData.market.slug, taskBoardFilteredData.query), () => <TaskBoardScreen data={taskBoardFilteredData} now={now} />),
  page('screen-task-board/hub', boardCopy.previews.hub, routes.taskBoard(taskBoardHubData.market.slug, taskBoardHubData.query), () => <TaskBoardScreen data={taskBoardHubData} now={now} />),
  page('screen-task-board/paged', boardCopy.previews.paged, routes.taskBoard(taskBoardPagedData.market.slug, taskBoardPagedData.query), () => <TaskBoardScreen data={taskBoardPagedData} now={now} />),
  page('screen-task-board/filtered-empty', boardCopy.previews.filteredEmpty, routes.taskBoard(taskBoardFilteredEmptyData.market.slug, taskBoardFilteredEmptyData.query), () => <TaskBoardScreen data={taskBoardFilteredEmptyData} now={now} />),
  page('screen-task-board/no-tasks', boardCopy.previews.noTasks, routes.taskBoard(taskBoardNoTasksData.market.slug), () => <TaskBoardScreen data={taskBoardNoTasksData} now={now} />),
  page('screen-public-task/open', taskCopy.previews.open, routes.publicTask(publicTaskPageData.task.slug), () => <PublicTaskScreen data={publicTaskPageData} now={now} />),
  page('screen-public-task/assigned', taskCopy.previews.assigned, routes.publicTask(publicTaskAssignedPageData.task.slug), () => <PublicTaskScreen data={publicTaskAssignedPageData} now={now} />),
  page('screen-public-task/remote', taskCopy.previews.remote, routes.publicTask(publicRemoteTaskPageData.task.slug), () => <PublicTaskScreen data={publicRemoteTaskPageData} now={now} />),
];
