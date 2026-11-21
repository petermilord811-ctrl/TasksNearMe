import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { botCheckForPage } from '@/modules/accounts/bot-check';
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
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('myOffers');
}

/** The helper's invites from clients (`?invite=` opens one), then their offers: active, booked, and closed. */
function MyOffersPage({ searchParams }: PageProps<'/[locale]/app/offers'>) {
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
  const [data, found, botCheck] = await Promise.all([getMyOffers(db, viewer.user.id, now), invitesForHelper(db, bookingDeps()?.payments ?? null, viewer.user.id, now), botCheckForPage()]);
  // Countering an invite runs the bot check (contracts/bot-check.ts).
  const invites = botCheck ? found.map((invite) => (invite.actions.includes('counter_invite') ? { ...invite, botCheck } : invite)) : found;
  const openInviteId = inviteId && invites.some((invite) => invite.id === inviteId) ? inviteId : undefined;
  return <MyOffersScreen data={{ ...data, invites, ...(openInviteId ? { openInviteId } : {}) }} now={now.toISOString()} inviteHandlers={inviteHandlers} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/offers/page.tsx', MyOffersPage);
