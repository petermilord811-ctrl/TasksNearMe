import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getReportProblemPage } from '@/modules/bookings/completion';
import { reportProblemAction, uploadEvidencePhoto } from '@/modules/bookings/completion-actions';
import { hubDeps } from '@/modules/bookings/server';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { ReportProblemDialogScreen } from '@/ui/screens/bookings';

type Params = Promise<{ bookingId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('reportProblem');
}

/** The client reports a problem over the booking (the full page: (app)/app/(flow)/bookings/[bookingId]/problem). */
function ProblemDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <Problem params={params} />
    </Suspense>
  );
}

async function Problem({ params }: { params: Params }) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingProblem(bookingId)));
  const now = await requestNow();
  const data = await getReportProblemPage(hubDeps(), viewer.user.id, bookingId, now);
  if (!data) notFound();
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <ReportProblemDialogScreen data={data} now={now.toISOString()} handlers={{ onUploadPhoto: uploadEvidencePhoto, onSubmit: reportProblemAction.bind(null, bookingId) }} />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/bookings/[bookingId]/problem/page.tsx', ProblemDialogPage);
