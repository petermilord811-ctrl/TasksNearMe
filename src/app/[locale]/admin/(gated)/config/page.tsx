import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getAdminConfig } from '@/modules/markets/admin-config';
import { getAdminMarkets } from '@/modules/markets/admin-markets';
import { canChangeMarketStatus } from '@/modules/markets/status-actions';
import { publishPolicyAction, setFeatureFlagAction, setMarketStatusAction, setOutageSwitchAction, setSearchIndexingAction } from '@/modules/markets/config-actions';
import { DEFAULT_MARKET_SLUG } from '@/modules/markets/queries';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminConfigScreen, AdminMarketsScreen } from '@/ui/screens/admin';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Config', robots: { index: false } };

/**
 * Admins: where we're open (the markets, with Pre-launch, Live and Pause; completion plan 8.2), the launch market's
 * policy versions, the outage switch, what search engines may list (launch runbook J-L6) and the feature flags. Every other staff role reads the markets only.
 */
function AdminConfigPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <AdminConfig />
    </Suspense>
  );
}

async function AdminConfig() {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const [data, markets, now] = await Promise.all([getAdminConfig(db, staff, DEFAULT_MARKET_SLUG), getAdminMarkets(db, staff), requestNow()]);
  // Not an admin (or no published policy to show): the markets alone, with whatever actions the viewer has (none for staff who aren't admins).
  if (!data) return <AdminMarketsScreen data={{ markets, readOnly: !canChangeMarketStatus(staff.roles) }} handlers={{ onSetMarketStatus: setMarketStatusAction }} />;
  return (
    <AdminConfigScreen
      data={{ ...data, markets }}
      now={now.toISOString()}
      handlers={{
        onPublishPolicy: publishPolicyAction.bind(null, data.market.id, data.market.slug),
        onSetFlag: setFeatureFlagAction.bind(null, data.market.slug),
        onSetOutage: setOutageSwitchAction.bind(null, data.market.id),
        onSetMarketStatus: setMarketStatusAction,
        onSetSearchIndexing: setSearchIndexingAction,
      }}
    />
  );
}

export default withClientMessages('[locale]/admin/(gated)/config/page.tsx', AdminConfigPage);
