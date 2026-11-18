import { withClientMessages } from '@/i18n/client-messages';
import { RealtimeProvider } from '@/ui/lib/realtime';
import { SignedInShell } from './signed-in-shell';

/** Instant navigations inside the signed-in area (per-segment Partial Prefetching). */
export const prefetch = 'partial';

/**
 * Signed-in area: one shell for every page here, the (main) route group (with the phone tab bar) and (flow) (without),
 * so moving between them keeps it mounted. Live notices (completion plan 7.1) reach every page: a new message, an
 * offer or a booking update refreshes what's on screen.
 */
function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <RealtimeProvider>
      <SignedInShell>{children}</SignedInShell>
    </RealtimeProvider>
  );
}

export default withClientMessages('[locale]/(app)/app/layout.tsx', AppLayout);
