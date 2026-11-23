import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { isHelperCheckDialogStep, routes } from '@/contracts';
import { PageSkeleton } from '@/ui/components';

/**
 * A check's own address (2026-11-23): from inside the site the phone and home address checks open in a dialog over the
 * page (src/app/[locale]/@modal/(.)app/helper/checks/[step]); loaded directly (a refresh, a link from elsewhere), it's
 * the onboarding step's page, which has the same form.
 */
function HelperCheckPage({ params }: PageProps<'/[locale]/app/helper/checks/[step]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <HelperCheck params={params} />
    </Suspense>
  );
}

async function HelperCheck({ params }: Pick<PageProps<'/[locale]/app/helper/checks/[step]'>, 'params'>) {
  const { step } = await params;
  if (!isHelperCheckDialogStep(step)) notFound();
  return redirect(routes.app.helperOnboarding(step));
}

export default HelperCheckPage;
