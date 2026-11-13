import type { ReactNode } from 'react';
import { routes, type MetricsPeriodDays, type PreviewEntry, type StaffViewer } from '@/contracts';
import { adminMetricsAgentData, adminMetricsEmptyData, adminMetricsFinanceData, adminMetricsWeekData, alexStaff, caseyStaff, fakeHandler, morganStaff, rileyStaff } from '@/fixtures';
import { AdminMetricsScreen } from '@/ui/screens/admin';
import { AdminShell } from '@/ui/shells/admin-shell';
import copy from '../../../messages/en/ui/adminMetrics.json';

/** Market metrics (B-067): finance with money, an agent without, a lead's week, and a new market. */

const shellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const p = copy.previews;

function Shell({ viewer, days, children }: { viewer: StaffViewer; days: MetricsPeriodDays; children: ReactNode }) {
  return <AdminShell viewer={viewer} handlers={shellHandlers} currentPath={routes.admin.metrics(days)}>{children}</AdminShell>;
}

export const adminMetricsPreviews: PreviewEntry[] = [
  { id: 'screen-admin-metrics/finance', group: p.group, title: p.finance, layout: 'fullscreen', render: () => <Shell viewer={caseyStaff} days={30}><AdminMetricsScreen data={adminMetricsFinanceData} /></Shell> },
  { id: 'screen-admin-metrics/agent', group: p.group, title: p.agent, layout: 'fullscreen', render: () => <Shell viewer={alexStaff} days={30}><AdminMetricsScreen data={adminMetricsAgentData} /></Shell> },
  { id: 'screen-admin-metrics/week', group: p.group, title: p.week, layout: 'fullscreen', render: () => <Shell viewer={morganStaff} days={7}><AdminMetricsScreen data={adminMetricsWeekData} /></Shell> },
  { id: 'screen-admin-metrics/empty', group: p.group, title: p.empty, layout: 'fullscreen', render: () => <Shell viewer={rileyStaff} days={7}><AdminMetricsScreen data={adminMetricsEmptyData} /></Shell> },
];
