'use client';

import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { peekLastSeen } from '@/ui/lib/last-visit';
import { cn } from '@/ui/lib/utils';

const noSubscribe = () => () => {};

/**
 * The dot on the Neighbors item (plan 10.19): a neighbor posted since this device last looked at Neighbors. Not on a
 * first visit (nothing to compare with), not while on Neighbors, and never during the server render (no storage there).
 */
export function NeighborsDot({ latestAt, visitKey, bottom }: { latestAt: string; visitKey: string; bottom: boolean }) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const lastSeen = useSyncExternalStore(noSubscribe, () => peekLastSeen(visitKey), () => undefined);
  const onNeighbors = /\/app\/community(?:\/|$)/.test(pathname ?? '');
  if (onNeighbors || typeof lastSeen !== 'number' || Date.parse(latestAt) <= lastSeen) return null;
  // Named as an image, so the link's name gains "New posts" while its text stays "Neighbors".
  return <span role="img" aria-label={t('neighborsNew')} className={cn('rounded-full bg-primary ring-2 ring-background', bottom ? 'absolute top-1.5 left-[calc(50%+0.45rem)] size-2.5' : 'ml-auto size-2.5')} />;
}
