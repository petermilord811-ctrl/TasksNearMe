import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { toggleSavedHelperAction } from '@/modules/reviews/actions';
import { getSavedHelpers } from '@/modules/reviews/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { SavedHelpersScreen } from '@/ui/screens/reviews';

export const metadata: Metadata = { title: 'Saved helpers', robots: { index: false } };

/** The client's saved helpers. */
function SavedPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <Saved />
    </Suspense>
  );
}

async function Saved() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.saved()));
  const data = await getSavedHelpers(db, viewer.user.id);
  return <SavedHelpersScreen data={data} handlers={{ onToggleSaved: toggleSavedHelperAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/saved/page.tsx', SavedPage);
