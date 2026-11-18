import { withClientMessages } from '@/i18n/client-messages';
import { switchLanguageAction } from '@/modules/accounts/language-actions';
import { getPublicShellViewer } from '@/platform/auth/viewer';
import { PublicShell } from '@/ui/shells/public-shell';

/**
 * Signing in and creating an account (completion plan 9.14): the public shell with a minimal footer (the legal links and
 * the language), so nothing below competes with the one thing the page is for (audit M45: on a phone the full footer
 * was longer than the sign-in form). Same addresses as before: a route group doesn't change URLs.
 */
function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PublicShell viewer={getPublicShellViewer()} variant="minimal" onSwitchLanguage={switchLanguageAction}>{children}</PublicShell>;
}

export default withClientMessages('[locale]/(auth)/layout.tsx', AuthLayout);
