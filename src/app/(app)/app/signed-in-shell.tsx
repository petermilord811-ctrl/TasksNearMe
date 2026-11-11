import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { setMode, signOut } from '@/modules/accounts/actions';
import { getViewer, toSignedInViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { AppShell, type AppShellProps } from '@/ui/shells';

type ShellLayout = NonNullable<AppShellProps['layout']>;

/**
 * The signed-in shell, shared by the (main) and (flow) route groups. Visitors without a session
 * go to sign-in. `flow` hides the phone tab bar for step-by-step screens like posting a task.
 */
export function SignedInShell({ layout, children }: { layout: ShellLayout; children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton variant={layout === 'flow' ? 'form' : 'list'} />}>
      <ViewerShell layout={layout}>{children}</ViewerShell>
    </Suspense>
  );
}

async function ViewerShell({ layout, children }: { layout: ShellLayout; children: React.ReactNode }) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.home()));
  return (
    <AppShell viewer={toSignedInViewer(viewer.user)} handlers={{ onModeChange: setMode, onSignOut: signOut }} layout={layout}>
      {children}
    </AppShell>
  );
}
