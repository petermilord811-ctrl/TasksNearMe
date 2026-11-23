import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getInviteHelpersPage } from '@/modules/invites/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { InviteHelpersDialogScreen } from '@/ui/screens/invites';

type Params = Promise<{ taskId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('inviteHelpers');
}

/**
 * "Invite helpers" over the task (2026-11-23, owner: "I hate to redirect to new pages continually"; it went to the
 * Saved helpers page; the full page: (app)/app/(flow)/tasks/[taskId]/invite). Request closes it and opens the request
 * dialog over the task, with the task chosen.
 */
function InviteHelpersDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <InviteHelpers params={params} />
    </Suspense>
  );
}

async function InviteHelpers({ params }: { params: Params }) {
  const [{ taskId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.inviteHelpers(taskId)));
  const data = await getInviteHelpersPage(db, viewer.user.id, taskId, await requestNow());
  if (!data) notFound();
  return <InviteHelpersDialogScreen data={data} />;
}

export default withClientMessages('[locale]/@modal/(.)app/tasks/[taskId]/invite/page.tsx', InviteHelpersDialogPage);
