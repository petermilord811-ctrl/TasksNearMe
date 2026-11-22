import { withClientMessages } from '@/i18n/client-messages';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { signOut } from '@/modules/accounts/actions';
import { getViewer, toStaffViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { AdminShell } from '@/ui/shells';
import { RealtimeProvider } from '@/ui/lib/realtime';
import { liveWaitingCount } from '@/modules/support/live-chat';
import { db } from '@/platform/db/client';
import { requestNow } from '@/platform/clock';

/** Instant navigations inside the signed-in area (per-segment Partial Prefetching). */
export const prefetch = 'partial';

/**
 * Staff area. Non-staff get a plain 404 (the admin area isn't advertised); staff must pass the
 * two-step check for this session first (/admin/verify, outside this group).
 */
function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <StaffShell>{children}</StaffShell>
    </Suspense>
  );
}

async function StaffShell({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user' || viewer.user.staffRoles.length === 0) notFound();
  if (!viewer.user.staffTwoStepVerified) redirect(routes.admin.verify());
  // The live chats waiting for someone (2026-11-22): a count beside Live chat in the staff menu.
  const liveWaiting = await liveWaitingCount(db, await requestNow());
  // Staff pages show times on the staff member's own market clock, labelled where several markets meet (plan 8.1).
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      {/* Live notices for staff (2026-11-22): live chats asked for, joined and answered refresh the page they're on; this
          stream counts them as support online. */}
      <RealtimeProvider url="/api/realtime?staff=1">
        <AdminShell viewer={{ ...toStaffViewer(viewer.user), ...(liveWaiting > 0 ? { liveWaiting } : {}) }} handlers={{ onSignOut: signOut }}>
          {children}
        </AdminShell>
      </RealtimeProvider>
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/admin/(gated)/layout.tsx', AdminLayout);
