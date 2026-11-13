import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getFindWorkPageData } from '@/modules/offers/helper';
import { hideTaskAction, saveTaskAction } from '@/modules/offers/helper-actions';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { FindWorkScreen } from '@/ui/screens/work';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Find work', robots: { index: false } };

/** The helper feed: open tasks near the helper's area, with distance bands and filters. */
export default function FindWorkPage({ searchParams }: PageProps<'/app/find-work'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <Feed searchParams={searchParams} />
    </Suspense>
  );
}

async function Feed({ searchParams }: Pick<PageProps<'/app/find-work'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.findWork()));
  const now = await requestNow();
  const data = await getFindWorkPageData(db, viewer.user.id, params, now);
  if (!data) notFound();
  return <FindWorkScreen data={data} now={now.toISOString()} handlers={{ onSaveTask: saveTaskAction, onHideTask: hideTaskAction }} />;
}
