'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useRealtimeConnected } from '@/ui/lib/realtime';

/**
 * The live chat console reads again on every live notice for support (the staff layout's stream). When that stream is
 * down (a dropped connection, too many tabs), it looks again every 10 seconds instead, so nobody waits unseen.
 */
export function LiveRefresh() {
  const router = useRouter();
  const connected = useRealtimeConnected();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), connected ? 60_000 : 10_000);
    return () => clearInterval(timer);
  }, [connected, router]);
  return null;
}
