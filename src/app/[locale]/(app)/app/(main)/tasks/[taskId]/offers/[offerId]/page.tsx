import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { posterOfferAction } from '@/modules/offers/actions';
import { getOfferDetail } from '@/modules/offers/owner';
import { ownerDepsFor } from '@/modules/offers/server';
import { getViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { OfferDetailScreen } from '@/ui/screens/tasks';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Offer' };

/** One offer on the poster's task. Opening it marks it seen. */
export default function OfferDetailPage({ params }: PageProps<'/[locale]/app/tasks/[taskId]/offers/[offerId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <OfferDetail params={params} />
    </Suspense>
  );
}

async function OfferDetail({ params }: Pick<PageProps<'/[locale]/app/tasks/[taskId]/offers/[offerId]'>, 'params'>) {
  const [{ taskId, offerId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') notFound();
  const deps = await ownerDepsFor(viewer.user.id);
  const now = await requestNow();
  const data = deps ? await getOfferDetail(deps, viewer.user.id, taskId, offerId, now) : null;
  if (!data) notFound();
  return <OfferDetailScreen data={data} now={now.toISOString()} handlers={{ onOfferAction: posterOfferAction }} />;
}
