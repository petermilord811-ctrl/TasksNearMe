'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PresenceState } from '@/contracts';
import { useRealtime } from '@/ui/lib/realtime';
import { cn } from '@/ui/lib/utils';

/** How long "typing…" stays after the last notice (the sender pings every 2.5 s while typing). */
const TYPING_SHOWN_MS = 6000;

/**
 * The line under the other person's name (completion plan 7.1): "typing…" while they type, otherwise "Active now"
 * or "Active today" when they share their activity, otherwise nothing. In the header, so the conversation below
 * never jumps (Reddit moved its indicator there for that reason).
 */
export function ThreadPresence({ threadId, presence, className }: { threadId: string; presence?: PresenceState; className?: string }) {
  const t = useTranslations('thread');
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRealtime('typing', (notice) => {
    if (notice.thread !== threadId) return false;
    setTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTyping(false), TYPING_SHOWN_MS);
    return true;
  });
  // Their message arrived: they stopped typing (the page refreshes as usual).
  useRealtime('message', (notice) => {
    if (notice.thread === threadId) setTyping(false);
  });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!typing && !presence) return null;
  return <p aria-live="polite" className={cn('flex items-center gap-1.5 text-sm', typing ? 'font-medium text-primary' : 'text-muted-foreground', className)}>
    {typing
      ? <><span aria-hidden="true" className="inline-flex gap-0.5">{[0, 1, 2].map((dot) => <span key={dot} className="size-1.5 animate-bounce rounded-full bg-current motion-reduce:animate-none" style={{ animationDelay: `${dot * 150}ms` }} />)}</span>{t('typing')}</>
      : <><span aria-hidden="true" className={cn('size-2 rounded-full', presence === 'now' ? 'bg-success' : 'bg-muted-foreground/50')} />{t(presence === 'now' ? 'presenceNow' : 'presenceToday')}</>}
  </p>;
}
