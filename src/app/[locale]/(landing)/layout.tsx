import { withClientMessages } from '@/i18n/client-messages';
import { switchLanguageAction } from '@/modules/accounts/language-actions';
import { getPublicShellViewer } from '@/platform/auth/viewer';
import { PublicShell } from '@/ui/shells';

/**
 * The landing page (`/`): the public shell's floating top bar and footer, with the page laying out its own
 * full-width sections. The viewer is passed as a promise, as on the other public pages.
 */
function LandingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PublicShell viewer={getPublicShellViewer()} variant="landing" onSwitchLanguage={switchLanguageAction}>{children}</PublicShell>;
}

export default withClientMessages('[locale]/(landing)/layout.tsx', LandingLayout);
