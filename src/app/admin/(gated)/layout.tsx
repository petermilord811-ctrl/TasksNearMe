import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { signOut } from '@/modules/accounts/actions';
import { getViewer, toStaffViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { AdminShell } from '@/ui/shells';

/** Instant navigations inside the signed-in area (per-segment Partial Prefetching). */
export const prefetch = 'partial';

/**
 * Staff area. Non-staff get a plain 404 (the admin area isn't advertised); staff must pass the
 * two-step check for this session first (/admin/verify, outside this group).
 */
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
  return (
    <AdminShell viewer={toStaffViewer(viewer.user)} handlers={{ onSignOut: signOut }}>
      {children}
    </AdminShell>
  );
}
