'use client';

import { useState } from 'react';
import type { PeekData, PeekTarget } from '@/contracts';
import { PeekSheet, type PeekLoad } from '@/ui/components/peek/peek-sheet';

/**
 * A peek sheet open over the page for the gallery: from the bottom on a phone-sized page, beside it on a wide one, as the
 * app places it (the left one stands for a chat window being open).
 */
export function PeekExample({ target, data, status = 'ready', side, modal }: { target: PeekTarget; data?: PeekData; status?: PeekLoad['status']; side?: 'left' | 'right'; modal?: boolean }) {
  const [wide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  const [open, setOpen] = useState(true);
  const load: PeekLoad = status === 'ready' && data ? { status: 'ready', data } : status === 'error' ? { status: 'error' } : { status: 'loading' };
  return <PeekSheet
    open={open}
    onOpenChange={setOpen}
    target={target}
    load={load}
    placement={wide ? (side ?? 'right') : 'bottom'}
    modal={modal ?? !wide}
    canGoBack={target.kind === 'help' && Boolean(target.slug)}
    onBack={() => undefined}
    onShow={() => undefined}
    onRetry={() => undefined}
    onMessage={() => undefined}
    onRequest={() => undefined}
    onToggleSaved={async () => true}
  />;
}
