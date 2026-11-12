import { getPublicShellViewer } from '@/platform/auth/viewer';
import { PublicShell } from '@/ui/shells';

/**
 * The landing page (`/`): the public shell's floating top bar and footer, with the page laying out its own
 * full-width sections. The viewer is passed as a promise, as on the other public pages.
 */
export default function LandingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PublicShell viewer={getPublicShellViewer()} variant="landing">{children}</PublicShell>;
}
