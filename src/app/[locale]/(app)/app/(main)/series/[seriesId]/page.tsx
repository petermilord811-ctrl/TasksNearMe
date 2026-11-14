import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getSeriesPage } from '@/modules/bookings/series';
import {
  cancelSeriesAction,
  changeSeriesCardAction,
  endSeriesAction,
  pauseSeriesAction,
  resumeSeriesAction,
  seriesMessageAction,
  skipVisitAction,
} from '@/modules/bookings/series-actions';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { SeriesScreen } from '@/ui/screens/series';

export const metadata: Metadata = { title: 'Regular visits', robots: { index: false } };

/** Regular visits (blueprint 03 §7), for their client and their helper only (anyone else: not found). */
function SeriesPage({ params }: PageProps<'/[locale]/app/series/[seriesId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Series params={params} />
    </Suspense>
  );
}

async function Series({ params }: Pick<PageProps<'/[locale]/app/series/[seriesId]'>, 'params'>) {
  const [{ seriesId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.series(seriesId)));
  const now = await requestNow();
  const data = await getSeriesPage(db, viewer.user.id, seriesId, now);
  if (!data) notFound();
  return (
    <SeriesScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onSkipVisit: skipVisitAction.bind(null, seriesId),
        onPause: pauseSeriesAction.bind(null, seriesId),
        onResume: resumeSeriesAction.bind(null, seriesId),
        onCancel: cancelSeriesAction.bind(null, seriesId),
        onEnd: endSeriesAction.bind(null, seriesId),
        onChangeCard: changeSeriesCardAction.bind(null, seriesId),
        onMessage: seriesMessageAction.bind(null, seriesId),
      }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(main)/series/[seriesId]/page.tsx', SeriesPage);
