import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getCompletionPage } from '@/modules/bookings/completion';
import { quoteFinalAction, submitCompletionAction, uploadEvidencePhoto } from '@/modules/bookings/completion-actions';
import { hubDeps } from '@/modules/bookings/server';
import { getViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { CompletionScreen } from '@/ui/screens/bookings';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Mark the work complete', robots: { index: false } };

/** The booking's helper sends the evidence for approval (blueprint 02 J6). */
export default function CompletePage({ params }: PageProps<'/[locale]/app/bookings/[bookingId]/complete'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Complete params={params} />
    </Suspense>
  );
}

async function Complete({ params }: Pick<PageProps<'/[locale]/app/bookings/[bookingId]/complete'>, 'params'>) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingComplete(bookingId)));
  const now = await requestNow();
  const data = await getCompletionPage(hubDeps(), viewer.user.id, bookingId, now);
  if (!data) notFound();
  return (
    <CompletionScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onUploadPhoto: uploadEvidencePhoto,
        onQuoteFinal: quoteFinalAction.bind(null, bookingId),
        onSubmit: submitCompletionAction.bind(null, bookingId),
      }}
    />
  );
}
