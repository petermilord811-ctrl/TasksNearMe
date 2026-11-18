import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { botCheckForPage } from '@/modules/accounts/bot-check';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getFindWorkPageData } from '@/modules/offers/helper';
import { hideTaskAction, quickOfferAction, saveTaskAction, undoQuickOfferAction } from '@/modules/offers/helper-actions';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { FindWorkScreen, FindWorkSkeleton } from '@/ui/screens/work';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Find work', robots: { index: false } };

/** The helper feed: open tasks near the helper's area, with distance bands and filters. */
function FindWorkPage({ searchParams }: PageProps<'/[locale]/app/find-work'>) {
  return (
    <Suspense fallback={<FindWorkSkeleton />}>
      <Feed searchParams={searchParams} />
    </Suspense>
  );
}

async function Feed({ searchParams }: Pick<PageProps<'/[locale]/app/find-work'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.findWork()));
  const now = await requestNow();
  const [data, botCheck] = await Promise.all([getFindWorkPageData(db, viewer.user.id, params, now), botCheckForPage()]);
  if (!data) notFound();
  return <FindWorkScreen data={botCheck ? { ...data, botCheck } : data} now={now.toISOString()} handlers={{ onSaveTask: saveTaskAction, onHideTask: hideTaskAction, onQuickOffer: quickOfferAction, onUndoQuickOffer: undoQuickOfferAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/find-work/page.tsx', FindWorkPage);
