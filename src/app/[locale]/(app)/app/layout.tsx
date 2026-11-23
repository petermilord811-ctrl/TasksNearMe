import { withClientMessages } from '@/i18n/client-messages';
import { RealtimeProvider } from '@/ui/lib/realtime';
import { SignedInPage } from '@/ui/lib/signed-in-page';
import { SignedInShell } from './signed-in-shell';

/** Instant navigations inside the signed-in area (per-segment Partial Prefetching). */
export const prefetch = 'partial';

/**
 * Signed-in area: one shell for every page here, the (main) route group (with the phone tab bar) and (flow) (without),
 * so moving between them keeps it mounted. Live notices (completion plan 7.1) reach every page: a new message, an
 * offer or a booking update refreshes what's on screen. SignedInPage: a failed action here can mean the session ended (J-N2).
 */
function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SignedInPage>
      <RealtimeProvider>
        <SignedInShell>{children}</SignedInShell>
      </RealtimeProvider>
    </SignedInPage>
  );
}

export default withClientMessages('[locale]/(app)/app/layout.tsx', AppLayout);
