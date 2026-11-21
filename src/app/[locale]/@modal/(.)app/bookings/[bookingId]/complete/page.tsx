import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getCompletionPage } from '@/modules/bookings/completion';
import { quoteFinalAction, submitCompletionAction, uploadEvidencePhoto } from '@/modules/bookings/completion-actions';
import { hubDeps } from '@/modules/bookings/server';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { CompletionDialogScreen } from '@/ui/screens/bookings';

type Params = Promise<{ bookingId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('complete');
}

/** The helper sends the work for approval over the booking (the full page: (app)/app/(flow)/bookings/[bookingId]/complete). */
function CompleteDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <Complete params={params} />
    </Suspense>
  );
}

async function Complete({ params }: { params: Params }) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingComplete(bookingId)));
  const now = await requestNow();
  const data = await getCompletionPage(hubDeps(), viewer.user.id, bookingId, now);
  if (!data) notFound();
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <CompletionDialogScreen
        data={data}
        now={now.toISOString()}
        handlers={{ onUploadPhoto: uploadEvidencePhoto, onQuoteFinal: quoteFinalAction.bind(null, bookingId), onSubmit: submitCompletionAction.bind(null, bookingId) }}
      />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/bookings/[bookingId]/complete/page.tsx', CompleteDialogPage);
