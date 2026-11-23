import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes, type PlanPageData } from '@/contracts';
import { createBillingProvider } from '@/integrations/billing';
import { managePlanAction, subscribeToPlanAction } from '@/modules/billing/actions';
import { planPageData } from '@/modules/billing/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { PlanScreen } from '@/ui/screens/billing/plan-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('plan');
  return { title: t('title'), robots: { index: false } };
}

/** The optional plans (completion plan 9.13): Plus for clients, Pro for helpers. `?checkout=` is Stripe's return. */
function PlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Plan searchParams={searchParams} />
    </Suspense>
  );
}

async function Plan({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.plan()));
  const { checkout, plan } = await searchParams;
  const notice: PlanPageData['notice'] = checkout === 'done' ? 'subscribed' : checkout === 'canceled' ? 'checkout_canceled' : undefined;
  const returned = { ...(notice ? { notice } : {}), ...(typeof plan === 'string' ? { plan } : {}) };
  const data = await planPageData(db, createBillingProvider(), viewer.user.id, await requestNow(), returned);
  if (!data) redirect(routes.app.home());
  return <PlanScreen data={data} handlers={{ onSubscribe: subscribeToPlanAction, onManage: managePlanAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/plan/page.tsx', PlanPage);
