import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { setMode, signOut } from '@/modules/accounts/actions';
import { getViewer, toSignedInViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { AppShell } from '@/ui/shells';

/** Instant navigations inside the signed-in area (per-segment Partial Prefetching). */
export const prefetch = 'partial';

/** Signed-in area. Visitors without a session go to sign-in. */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}

async function SignedInShell({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.home()));
  return (
    <AppShell viewer={toSignedInViewer(viewer.user)} handlers={{ onModeChange: setMode, onSignOut: signOut }}>
      {children}
    </AppShell>
  );
}
