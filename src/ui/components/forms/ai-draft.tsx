'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CircleAlert, Sparkles, Undo2 } from 'lucide-react';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/** How a "Write it for me" request went. */
export type AiDraftOutcome =
  | { kind: 'drafted' }
  | { kind: 'undone' }
  | { kind: 'failed'; code: 'unavailable' | 'rate_limited' | 'prohibited' };

/** The "Write it for me" button: a spark, then a spinner while the draft is written. */
export function AiDraftButton({ pending, disabled, onClick, children, className, pendingLabel, variant = 'outline', size }: {
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  /** What it says while AI works ("Writing…" by default). */
  pendingLabel?: string;
  variant?: 'outline' | 'ghost' | 'secondary';
  size?: 'sm';
}) {
  const t = useTranslations('forms.aiDraft');
  return (
    <Button type="button" variant={variant} {...(size ? { size } : {})} disabled={disabled || pending} aria-busy={pending} onClick={onClick} className={cn('min-h-11', className)}>
      {pending ? <Spinner aria-hidden="true" /> : <Sparkles aria-hidden="true" className="text-primary" />}
      {pending ? (pendingLabel ?? t('drafting')) : children}
    </Button>
  );
}

/**
 * What happened, read out as it changes: drafted (with Undo, which puts back what was there), undone, or
 * why it didn't work. Drafts are suggestions: nothing is saved until the person saves the form. `drafted`: the words
 * after a draft, when "Drafted with AI … before you save" doesn't fit (a review or an answer is sent, not saved).
 */
export function AiDraftStatus({ id, outcome, onUndo, drafted }: { id?: string; outcome?: AiDraftOutcome; onUndo?: () => void; drafted?: string }) {
  const t = useTranslations('forms.aiDraft');
  return (
    <div id={id} aria-live="polite" aria-atomic="true">
      {outcome?.kind === 'drafted' && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-start gap-2"><Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{drafted ?? t('drafted')}</span>
          {onUndo && (
            <Button type="button" variant="link" className="h-auto min-h-11 px-0" onClick={onUndo}>
              <Undo2 aria-hidden="true" />{t('undo')}
            </Button>
          )}
        </p>
      )}
      {outcome?.kind === 'undone' && <p className="text-sm text-muted-foreground">{t('undone')}</p>}
      {outcome?.kind === 'failed' && (
        <p className="flex items-start gap-2 text-sm text-destructive"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(`errors.${outcome.code}`)}</p>
      )}
    </div>
  );
}
