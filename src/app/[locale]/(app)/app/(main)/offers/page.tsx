import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { bookingDeps } from '@/modules/bookings/server';
import { inviteHandlers } from '@/modules/invites/handlers';
import { invitesForHelper } from '@/modules/invites/service';
import { getMyOffers } from '@/modules/offers/helper';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { MyOffersScreen } from '@/ui/screens/work';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'My offers', robots: { index: false } };

/** The helper's invites from clients (`?invite=` opens one), then their offers: active, booked, and closed. */
export default function MyOffersPage({ searchParams }: PageProps<'/[locale]/app/offers'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Offers searchParams={searchParams} />
    </Suspense>
  );
}

async function Offers({ searchParams }: Pick<PageProps<'/[locale]/app/offers'>, 'searchParams'>) {
  const [viewer, query] = await Promise.all([getViewer(), searchParams]);
  const inviteId = typeof query.invite === 'string' ? query.invite : undefined;
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.offers(inviteId)));
  const now = await requestNow();
  const [data, invites] = await Promise.all([getMyOffers(db, viewer.user.id, now), invitesForHelper(db, bookingDeps()?.payments ?? null, viewer.user.id, now)]);
  const openInviteId = inviteId && invites.some((invite) => invite.id === inviteId) ? inviteId : undefined;
  return <MyOffersScreen data={{ ...data, invites, ...(openInviteId ? { openInviteId } : {}) }} now={now.toISOString()} inviteHandlers={inviteHandlers} />;
}
