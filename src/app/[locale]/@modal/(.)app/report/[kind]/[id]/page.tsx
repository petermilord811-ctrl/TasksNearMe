import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { reportTargetAction } from '@/modules/support/actions';
import { getReportPage } from '@/modules/support/target-reports';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { ReportDialogScreen } from '@/ui/screens/support';

type Params = Promise<{ kind: string; id: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('report');
}

/** Report a task, a profile, a review or a post over the page it's on (the full page: (app)/app/(flow)/report). */
function ReportDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <ReportDialog params={params} />
    </Suspense>
  );
}

async function ReportDialog({ params }: { params: Params }) {
  const [{ kind, id }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(`/app/report/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`));
  const data = await getReportPage(db, viewer.user.id, kind, id);
  if (!data) notFound();
  return <ReportDialogScreen data={data} handlers={{ onReport: reportTargetAction.bind(null, kind, id) }} />;
}

export default withClientMessages('[locale]/@modal/(.)app/report/[kind]/[id]/page.tsx', ReportDialogPage);
