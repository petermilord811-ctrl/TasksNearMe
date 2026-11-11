import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getReportProblemPage } from '@/modules/bookings/completion';
import { reportProblemAction, uploadEvidencePhoto } from '@/modules/bookings/completion-actions';
import { hubDeps } from '@/modules/bookings/server';
import { getViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { ReportProblemScreen } from '@/ui/screens/bookings';

export const metadata: Metadata = { title: 'Report a problem', robots: { index: false } };

/** The booking's client reports a problem instead of approving (blueprint 02 J6). */
export default function ProblemPage({ params }: PageProps<'/app/bookings/[bookingId]/problem'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Problem params={params} />
    </Suspense>
  );
}

async function Problem({ params }: Pick<PageProps<'/app/bookings/[bookingId]/problem'>, 'params'>) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingProblem(bookingId)));
  const now = new Date();
  const data = await getReportProblemPage(hubDeps(), viewer.user.id, bookingId, now);
  if (!data) notFound();
  return (
    <ReportProblemScreen
      data={data}
      now={now.toISOString()}
      handlers={{ onUploadPhoto: uploadEvidencePhoto, onSubmit: reportProblemAction.bind(null, bookingId) }}
    />
  );
}
