import { withClientMessages } from '@/i18n/client-messages';
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
import { requestNow } from '@/platform/clock';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('supportCase');
}

/** One case for the member who opened it (anyone else: not found). Opening it marks support's replies read. */
function SupportCasePage({ params }: PageProps<'/[locale]/app/support/[caseId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <SupportCase params={params} />
    </Suspense>
  );
}

async function SupportCase({ params }: Pick<PageProps<'/[locale]/app/support/[caseId]'>, 'params'>) {
  const [{ caseId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.supportCase(caseId)));
  const now = await requestNow();
  const data = await getSupportCasePage(db, viewer.user.id, caseId, now);
  if (!data) notFound();
  return <SupportCaseScreen data={data} now={now.toISOString()} handlers={{ onReply: replyToSupportCaseAction.bind(null, caseId) }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/support/[caseId]/page.tsx', SupportCasePage);
