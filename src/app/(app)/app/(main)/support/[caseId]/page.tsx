import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { replyToSupportCaseAction } from '@/modules/support/actions';
import { getSupportCasePage } from '@/modules/support/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { SupportCaseScreen } from '@/ui/screens/support';

export const metadata: Metadata = { title: 'Support case', robots: { index: false } };

/** One case for the member who opened it (anyone else: not found). Opening it marks support's replies read. */
export default function SupportCasePage({ params }: PageProps<'/app/support/[caseId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <SupportCase params={params} />
    </Suspense>
  );
}

async function SupportCase({ params }: Pick<PageProps<'/app/support/[caseId]'>, 'params'>) {
  const [{ caseId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.supportCase(caseId)));
  const now = new Date();
  const data = await getSupportCasePage(db, viewer.user.id, caseId, now);
  if (!data) notFound();
  return <SupportCaseScreen data={data} now={now.toISOString()} handlers={{ onReply: replyToSupportCaseAction.bind(null, caseId) }} />;
}
