import { routes, type AppShellHandlers, type PreviewEntry, type SeriesPageData } from '@/contracts';
import {
  SERIES_NOW,
  fakeHandler,
  fakeSeriesHandlers,
  jordanShell,
  mayaShell,
  seriesClientActiveData,
  seriesClientMonthlyData,
  seriesClientNoCardData,
  seriesClientPausedData,
  seriesClientPaymentDueData,
  seriesClientStoppedData,
  seriesHelperActiveData,
  seriesHelperEndedData,
} from '@/fixtures';
import { SeriesScreen } from '@/ui/screens/series';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/series.json';

const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

function preview(variant: keyof typeof copy.previews, data: SeriesPageData): PreviewEntry {
  return {
    id: `screen-series/${variant}`,
    title: copy.previews[variant],
    group: copy.previews.group,
    layout: 'fullscreen',
    render: () => <AppShell viewer={data.series.viewerRole === 'poster' ? mayaShell : jordanShell} handlers={shellHandlers} currentPath={routes.app.series(data.series.id)}>
      <SeriesScreen data={data} handlers={fakeSeriesHandlers} now={SERIES_NOW} />
    </AppShell>,
  };
}

/** Regular visits (blueprint 03 §7): each status and role. */
export const seriesPreviews: PreviewEntry[] = [
  preview('client-active', seriesClientActiveData),
  preview('client-payment-due', seriesClientPaymentDueData),
  preview('client-no-card', seriesClientNoCardData),
  preview('client-paused', seriesClientPausedData),
  preview('client-monthly', seriesClientMonthlyData),
  preview('client-stopped', seriesClientStoppedData),
  preview('helper-active', seriesHelperActiveData),
  preview('helper-ended', seriesHelperEndedData),
];
