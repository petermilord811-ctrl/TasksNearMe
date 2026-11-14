import { withClientMessages } from '@/i18n/client-messages';
import { SignedInShell } from '../signed-in-shell';

/** Most signed-in pages: the shell with the phone tab bar. */
function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SignedInShell layout="tabs">{children}</SignedInShell>;
}

export default withClientMessages('[locale]/(app)/app/(main)/layout.tsx', MainLayout);
