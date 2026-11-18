import { routes, type DashboardData, type DashboardQuery, type DashboardSeeAll, type DashboardTarget } from '@/contracts';

/** Where a dashboard row leads (the app decides the target; the routes build the link). */
export function dashboardTargetHref(target: DashboardTarget): string {
  switch (target.kind) {
    case 'task': return routes.app.task(target.taskId);
    case 'offer': return routes.app.offer(target.taskId, target.offerId);
    case 'booking': return routes.app.booking(target.bookingId);
    case 'find_work_task': return routes.app.findWorkTask(target.taskId);
    case 'public_task': return routes.publicTask(target.slug);
  }
}

/** A list's full page, with the same category and words where that page has them. */
export function seeAllHref(seeAll: DashboardSeeAll): string {
  switch (seeAll.kind) {
    case 'tasks': return routes.app.tasks();
    case 'offers': return routes.app.offers();
    case 'bookings': return routes.app.bookings();
    case 'find_work': return routes.app.findWork(seeAll.query);
    case 'board': return routes.taskBoard(seeAll.market, seeAll.query);
  }
}

/** The filters as the URL has them, so a change keeps the rest. */
export function dashboardBase(query: DashboardData['query']): DashboardQuery {
  return { tab: query.tab, view: query.view, status: query.status, date: query.date, ...(query.category ? { category: query.category } : {}), ...(query.q ? { q: query.q } : {}) };
}
