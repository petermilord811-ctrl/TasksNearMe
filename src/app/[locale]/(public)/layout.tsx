import { getPublicShellViewer } from '@/platform/auth/viewer';
import { PublicShell } from '@/ui/shells';

/**
 * Public pages. The viewer is passed as a promise: the shell renders its chrome and the page
 * immediately (so both prerender into the static shell), and only the account area waits for the
 * session, inside the shell's own Suspense boundaries with signed-out fallbacks.
 */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PublicShell viewer={getPublicShellViewer()}>{children}</PublicShell>;
}
