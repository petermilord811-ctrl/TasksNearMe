import { RealtimeProvider } from '@/ui/lib/realtime';

/** Instant navigations inside the signed-in area (per-segment Partial Prefetching). */
export const prefetch = 'partial';

/**
 * Signed-in area. The shell comes from the (main) and (flow) group layouts. Live notices (completion plan 7.1)
 * reach every page here: a new message, an offer or a booking update refreshes what's on screen.
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RealtimeProvider>{children}</RealtimeProvider>;
}
