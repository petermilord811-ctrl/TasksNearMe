import { withClientMessages } from '@/i18n/client-messages';
import { switchLanguageAction } from '@/modules/accounts/language-actions';
import { getPublicShellViewer } from '@/platform/auth/viewer';
import { PublicShell } from '@/ui/shells/public-shell';

/**
 * Public pages, the landing page (`/`) among them, so the shell (the top bar and its state) persists between them
 * (plan 9.5). The viewer is passed as a promise: the shell renders its chrome and the page immediately (so both
 * prerender into the static shell), and only the account area waits for the session, inside the shell's own Suspense
 * boundaries with signed-out fallbacks.
 */
function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PublicShell viewer={getPublicShellViewer()} onSwitchLanguage={switchLanguageAction}>{children}</PublicShell>;
}

export default withClientMessages('[locale]/(public)/layout.tsx', PublicLayout);
