import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { appPageMetadata } from '@/i18n/metadata';
import { PageSkeleton } from '@/ui/components';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('inviteHelpers');
}

/**
 * "Invite helpers"' dialog (`routes.app.inviteHelpers`, src/app/[locale]/@modal), loaded on its own: the task, where
 * Invite helpers opens it again. Never a page of its own: Request opens a dialog, and a dialog over a page that has a
 * dialog version of its own reloads when it refreshes (checkout over an offer did, 2026-11-23).
 */
export default function InviteHelpersPage({ params }: PageProps<'/[locale]/app/tasks/[taskId]/invite'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <ToTask params={params} />
    </Suspense>
  );
}

async function ToTask({ params }: Pick<PageProps<'/[locale]/app/tasks/[taskId]/invite'>, 'params'>): Promise<never> {
  const { taskId } = await params;
  return redirect(routes.app.task(taskId));
}
