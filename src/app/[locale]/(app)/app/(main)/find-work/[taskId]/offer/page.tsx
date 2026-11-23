import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { PageSkeleton } from '@/ui/components';

/** "Make an offer"'s dialog (`routes.app.findWorkOffer`, src/app/[locale]/@modal), loaded on its own: the task's page. */
export default function FindWorkOfferPage({ params }: PageProps<'/[locale]/app/find-work/[taskId]/offer'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <ToTask params={params} />
    </Suspense>
  );
}

async function ToTask({ params }: Pick<PageProps<'/[locale]/app/find-work/[taskId]/offer'>, 'params'>): Promise<never> {
  const { taskId } = await params;
  return redirect(routes.app.findWorkTask(taskId));
}
