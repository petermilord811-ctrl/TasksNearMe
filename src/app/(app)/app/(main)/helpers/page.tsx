import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { DEFAULT_MARKET_SLUG, findPublicMarket } from '@/modules/markets/queries';
import { getHelpersBrowse, parseHelperBrowseQuery } from '@/modules/profiles/browse';
import { toggleSavedHelperAction } from '@/modules/reviews/actions';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { HelpersBrowseScreen } from '@/ui/screens/browse';

export const metadata: Metadata = { title: 'Find helpers', robots: { index: false } };

/** Browse and search the market's helpers (blueprint 02 `/app/helpers`); filters live in the URL. */
export default function HelpersPage({ searchParams }: PageProps<'/app/helpers'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <Helpers searchParams={searchParams} />
    </Suspense>
  );
}

async function Helpers({ searchParams }: Pick<PageProps<'/app/helpers'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.helpers()));
  const market = await findPublicMarket(DEFAULT_MARKET_SLUG);
  if (!market) notFound();
  const data = await getHelpersBrowse(db, viewer.user.id, market.id, parseHelperBrowseQuery(params), new Date());
  return <HelpersBrowseScreen data={data} handlers={{ onToggleSaved: toggleSavedHelperAction }} />;
}
