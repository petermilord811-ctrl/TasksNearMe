'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useRealtime } from '@/ui/lib/realtime';

/** A post's page, live: new replies and reactions on it show without a reload (one refresh per burst). */
export function CommunityPostLive({ postId }: { postId: string }) {
  const router = useRouter();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useRealtime('community', (notice) => {
    if (notice.post !== postId || notice.event === 'posted') return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => router.refresh(), 600);
    return true;
  });
  return null;
}
