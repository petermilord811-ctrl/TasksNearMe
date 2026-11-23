import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { OfferDetailSkeleton } from '@/ui/screens/tasks/task-detail-skeletons';

/** An offer's dialog (`routes.app.offerView`, src/app/[locale]/@modal), loaded on its own: the offer's page. */
export default function OfferViewPage({ params }: PageProps<'/[locale]/app/tasks/[taskId]/offers/[offerId]/view'>) {
  return (
    <Suspense fallback={<OfferDetailSkeleton />}>
      <ToOffer params={params} />
    </Suspense>
  );
}

async function ToOffer({ params }: Pick<PageProps<'/[locale]/app/tasks/[taskId]/offers/[offerId]/view'>, 'params'>): Promise<never> {
  const { taskId, offerId } = await params;
  return redirect(routes.app.offer(taskId, offerId));
}
