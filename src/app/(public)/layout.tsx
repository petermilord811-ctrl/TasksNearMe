import { Suspense } from 'react';
import { getPublicShellViewer } from '@/platform/auth/viewer';
import { PublicShell } from '@/ui/shells';

/**
 * Public pages. The static shell renders as signed out; the header then streams in with the real
 * viewer (Cache Components: reading the session must happen inside Suspense).
 */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<PublicShell viewer={{ kind: 'public' }}>{children}</PublicShell>}>
      <ViewerAwarePublicShell>{children}</ViewerAwarePublicShell>
    </Suspense>
  );
}

async function ViewerAwarePublicShell({ children }: { children: React.ReactNode }) {
  const viewer = await getPublicShellViewer();
  return <PublicShell viewer={viewer}>{children}</PublicShell>;
}
