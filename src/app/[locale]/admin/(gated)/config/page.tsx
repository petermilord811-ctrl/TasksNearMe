import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getAdminConfig } from '@/modules/markets/admin-config';
import { publishPolicyAction, setFeatureFlagAction, setOutageSwitchAction } from '@/modules/markets/config-actions';
import { DEFAULT_MARKET_SLUG } from '@/modules/markets/queries';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminConfigScreen } from '@/ui/screens/admin';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Config', robots: { index: false } };

/** The launch market's policy versions and the feature flags, for admins only (other staff get not found). */
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
  const data = await getAdminConfig(db, staff, DEFAULT_MARKET_SLUG);
  if (!data) notFound();
  return (
    <AdminConfigScreen
      data={data}
      now={(await requestNow()).toISOString()}
      handlers={{ onPublishPolicy: publishPolicyAction.bind(null, data.market.id, data.market.slug), onSetFlag: setFeatureFlagAction.bind(null, data.market.slug), onSetOutage: setOutageSwitchAction.bind(null, data.market.id) }}
    />
  );
}

export default withClientMessages('[locale]/admin/(gated)/config/page.tsx', AdminConfigPage);
