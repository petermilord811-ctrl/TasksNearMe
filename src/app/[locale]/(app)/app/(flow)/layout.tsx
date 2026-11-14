import { withClientMessages } from '@/i18n/client-messages';
import { SignedInShell } from '../signed-in-shell';

/** Step-by-step flows (posting a task): no phone tab bar, so the flow's own buttons stay in reach. */
function FlowLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SignedInShell layout="flow">{children}</SignedInShell>;
}

export default withClientMessages('[locale]/(app)/app/(flow)/layout.tsx', FlowLayout);
