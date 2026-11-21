import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { createBillingProvider } from '@/integrations/billing';
import { buySparksAction } from '@/modules/sparks/actions';
import { sparksPageData } from '@/modules/sparks/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { SparksScreen } from '@/ui/screens/sparks/sparks-screen';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('sparks');
}

/** The person's Sparks (2026-11-21). `?purchase=` (and `canceled`) is Stripe's return from buying a pack. */
function SparksPage({ searchParams }: PageProps<'/[locale]/app/sparks'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Sparks searchParams={searchParams} />
    </Suspense>
  );
}

async function Sparks({ searchParams }: Pick<PageProps<'/[locale]/app/sparks'>, 'searchParams'>) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.sparks()));
  const { purchase, canceled } = await searchParams;
  const returned = { ...(typeof purchase === 'string' ? { purchase } : {}), ...(canceled === '1' ? { canceled: true } : {}) };
  const data = await sparksPageData(db, createBillingProvider(), viewer.user.id, await requestNow(), returned);
  return <SparksScreen data={data} handlers={{ onBuy: buySparksAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/sparks/page.tsx', SparksPage);
