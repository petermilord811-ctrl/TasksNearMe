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
import { newCardCollection } from '@/modules/bookings/confirm';
import { hubDeps } from '@/modules/bookings/server';
import { addCardAction, removeCardAction } from '@/modules/earnings/actions';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { SeriesScreen } from '@/ui/screens/series';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('series');
}

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
      // A card can be added inside the Change-card sheet (2026-11-23), collected as the payments page does.
      data={data.cards ? { ...data, newCard: newCardCollection(hubDeps().payments ?? null) } : data}
      now={now.toISOString()}
      handlers={{
        onSkipVisit: skipVisitAction.bind(null, seriesId),
        onPause: pauseSeriesAction.bind(null, seriesId),
        onResume: resumeSeriesAction.bind(null, seriesId),
        onCancel: cancelSeriesAction.bind(null, seriesId),
        onEnd: endSeriesAction.bind(null, seriesId),
        onChangeCard: changeSeriesCardAction.bind(null, seriesId),
        onMessage: seriesMessageAction.bind(null, seriesId),
        onRemoveCard: removeCardAction,
        ...(data.cards ? { onAddCard: addCardAction } : {}),
      }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(main)/series/[seriesId]/page.tsx', SeriesPage);
