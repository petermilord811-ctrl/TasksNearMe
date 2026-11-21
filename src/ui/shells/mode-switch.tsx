'use client';

import { useId, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ActionResult, AppShellHandlers, Mode } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';

export interface ModeSwitchProps {
  mode: Mode;
  onModeChange: AppShellHandlers['onModeChange'];
}

/** Selection follows the viewer prop; a successful handler lets the app supply the new mode. */
export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  const t = useTranslations('shell');
  const feedback = useTranslations('feedback');
  const router = useRouter();
  const statusId = useId();
  const pendingRef = useRef(false);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  // A change the app accepted, until the viewer prop catches up (so the thumb doesn't bounce back meanwhile).
  const [accepted, setAccepted] = useState<Mode | null>(null);
  const [seenMode, setSeenMode] = useState(mode);
  if (seenMode !== mode) {
    setSeenMode(mode);
    setAccepted(null);
  }

  async function changeMode(nextMode: Mode) {
    if (nextMode === mode || pendingRef.current) return;
    pendingRef.current = true;
    setPendingMode(nextMode);
    setMessage(null);
    let result: ActionResult;
    try {
      result = await onModeChange({ mode: nextMode });
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    pendingRef.current = false;
    setPendingMode(null);
    setAccepted(result.ok ? nextMode : null);
    // Which mode the person is in now, not "Updated" (journeys on a phone).
    const text = result.ok ? t(nextMode === 'helper' ? 'mode.nowHelper' : 'mode.nowPoster') : feedback(`error.${result.code}`);
    setMessage({ text, error: !result.ok });
    if (result.ok) {
      toast.success(text);
      if (result.redirectTo) router.push(result.redirectTo);
    } else {
      toast.error(text);
    }
  }

  // The thumb moves to a choice as soon as it's pressed (and back if the change fails); `aria-pressed` follows the
  // mode the app confirms.
  const shown = pendingMode ?? accepted ?? mode;
  return (
    <div className="min-w-0">
      <div role="group" aria-label={t('mode.label')} aria-busy={pendingMode !== null} aria-describedby={statusId} className="relative grid grid-cols-2 rounded-full bg-foreground/[0.06] p-1 shadow-[inset_0_1px_2px_rgb(23_18_14/0.06)] dark:bg-white/[0.07] dark:shadow-none">
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-card shadow-[0_1px_2px_rgb(23_18_14/0.08),0_6px_16px_-8px_rgb(60_30_10/0.35)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] dark:bg-white/[0.12] dark:shadow-none',
            shown === 'helper' && 'translate-x-full',
          )}
        />
        {(['poster', 'helper'] as const).map((option) => (
          <Button
            key={option}
            type="button"
            variant="ghost"
            aria-pressed={mode === option}
            aria-busy={pendingMode === option}
            disabled={pendingMode !== null}
            onClick={() => void changeMode(option)}
            className={cn(
              'relative z-[1] min-w-0 gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground disabled:opacity-100 dark:hover:bg-transparent sm:px-4',
              shown === option && 'text-foreground dark:text-foreground',
            )}
          >
            {pendingMode === option && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
            {t(`mode.${option}`)}
          </Button>
        ))}
      </div>
      <p id={statusId} role="status" aria-live="polite" aria-atomic="true" className={cn(message?.error ? 'mt-2 max-w-80 text-sm text-destructive' : 'sr-only')}>
        {pendingMode ? t('mode.pending') : message?.text}
      </p>
    </div>
  );
}
