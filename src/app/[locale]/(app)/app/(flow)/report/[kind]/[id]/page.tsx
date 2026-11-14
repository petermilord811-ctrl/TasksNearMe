import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { reportTargetAction } from '@/modules/support/actions';
import { getReportPage } from '@/modules/support/target-reports';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { ReportScreen } from '@/ui/screens/support';

export const metadata: Metadata = { title: 'Report', robots: { index: false } };

/** Report a task, a helper's profile or a review (backlog B-059); public pages link here. */
function ReportPage({ params }: PageProps<'/[locale]/app/report/[kind]/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: Pick<PageProps<'/[locale]/app/report/[kind]/[id]'>, 'params'>) {
  const [{ kind, id }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(`/app/report/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`));
  const data = await getReportPage(db, viewer.user.id, kind, id);
  if (!data) notFound();
  return <ReportScreen data={data} handlers={{ onReport: reportTargetAction.bind(null, kind, id) }} />;
}

export default withClientMessages('[locale]/(app)/app/(flow)/report/[kind]/[id]/page.tsx', ReportPage);
