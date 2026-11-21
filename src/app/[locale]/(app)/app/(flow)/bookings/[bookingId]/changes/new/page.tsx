import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { proposeChangeAction, quoteChangeAction } from '@/modules/bookings/change-actions';
import { getProposeChangePage } from '@/modules/bookings/changes';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { ProposeChangeScreen } from '@/ui/screens/bookings';
import { requestNow } from '@/platform/clock';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('proposeChange');
}

/** Either person on the booking proposes new terms (anyone else: not found). */
function ProposeChangePage({ params }: PageProps<'/[locale]/app/bookings/[bookingId]/changes/new'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <ProposeChange params={params} />
    </Suspense>
  );
}

async function ProposeChange({ params }: Pick<PageProps<'/[locale]/app/bookings/[bookingId]/changes/new'>, 'params'>) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingProposeChange(bookingId)));
  const now = await requestNow();
  const data = await getProposeChangePage(db, viewer.user.id, bookingId, now);
  if (!data) notFound();
  return <ProposeChangeScreen data={data} now={now.toISOString()} handlers={{ onQuote: quoteChangeAction.bind(null, bookingId), onPropose: proposeChangeAction.bind(null, bookingId) }} />;
}

export default withClientMessages('[locale]/(app)/app/(flow)/bookings/[bookingId]/changes/new/page.tsx', ProposeChangePage);
