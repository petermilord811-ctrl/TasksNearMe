import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getHelpersBrowse, parseHelperBrowseQuery } from '@/modules/profiles/browse';
import { toggleSavedHelperAction } from '@/modules/reviews/actions';
import { homeMarketIdOf } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { HelpersBrowseScreen } from '@/ui/screens/browse';
import { requestNow } from '@/platform/clock';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('findHelpers');
}

/**
 * Browse and search the helpers of the viewer's home market (blueprint 02 `/app/helpers`), where their tasks are
 * posted and a request invites a helper to one (community and find work read the same market); filters live in the URL.
 */
function HelpersPage({ searchParams }: PageProps<'/[locale]/app/helpers'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <Helpers searchParams={searchParams} />
    </Suspense>
  );
}

async function Helpers({ searchParams }: Pick<PageProps<'/[locale]/app/helpers'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.helpers()));
  const marketId = await homeMarketIdOf(viewer.user.id);
  if (!marketId) notFound();
  const data = await getHelpersBrowse(db, viewer.user.id, marketId, parseHelperBrowseQuery(params), await requestNow());
  return <HelpersBrowseScreen data={data} handlers={{ onToggleSaved: toggleSavedHelperAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/helpers/page.tsx', HelpersPage);
