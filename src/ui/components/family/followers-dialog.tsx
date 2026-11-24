'use client';

import { useId, useRef, useState } from 'react';
import { Eye, UserMinus, UserPlus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { addFollowerInputSchema, type ActionResult, type BookingFollowersPanel, type FollowedByNotice, type FollowerHandlers } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * Family followers (2026-11-24): the client's "Add a family member" dialog (the booking page and the conversation's ⋯
 * menu) and the booking page's card. The dialog says what a follower sees and what they can't do, and that the helper
 * sees who follows. Everything it offers comes from the panel; the server decides.
 */

type FieldError = 'invalid' | 'notFound' | 'notAllowed' | 'limit' | 'expired';

const ERROR_OF: Partial<Record<string, FieldError>> = { not_found: 'notFound', not_allowed: 'notAllowed', limit_reached: 'limit', expired: 'expired' };

export interface FollowersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panel: BookingFollowersPanel;
  handlers: FollowerHandlers;
  /** The helper's first name: "Sam will see who follows". */
  helperName: string;
  /** After a change went through (the chat window reloads its conversation). */
  onDone?: (result: ActionResult) => void;
  /** Preview seeds. */
  initialWho?: string;
  initialError?: FieldError;
  initialResult?: ActionResult;
}

export function FollowersDialog({ open, onOpenChange, panel, handlers, helperName, onDone, initialWho = '', initialError, initialResult }: FollowersDialogProps) {
  const t = useTranslations('family.dialog');
  const id = useId();
  const [who, setWho] = useState(initialWho);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<FieldError | null>(initialError ?? null);
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  const [said, setSaid] = useState<string | null>(null);

  async function run(key: string, act: () => Promise<ActionResult>, onOk: () => void) {
    if (pending) return;
    setPending(key);
    setResult(undefined);
    setSaid(null);
    try {
      const answer = await act();
      if (answer.ok) {
        onOk();
        onDone?.(answer);
        return;
      }
      const mapped = ERROR_OF[answer.code] ?? (answer.code === 'validation_failed' ? 'invalid' : undefined);
      if (mapped) setError(mapped);
      else setResult(answer);
    } catch {
      setResult({ ok: false, code: 'unknown' });
    } finally {
      setPending(null);
    }
  }

  function add() {
    const parsed = addFollowerInputSchema.safeParse({ bookingId: panel.bookingId, who });
    if (!parsed.success) {
      setError('invalid');
      return;
    }
    setError(null);
    void run('add', () => handlers.onAdd(parsed.data), () => {
      setSaid(t('added', { who: parsed.data.who }));
      setWho('');
    });
  }

  const full = !panel.canAdd;
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description', { helper: helperName })}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4" aria-busy={pending !== null}>
        <ul className="space-y-1.5 rounded-2xl bg-secondary/60 p-3.5 text-sm dark:bg-secondary/30">
          <li className="flex items-start gap-2"><Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{t('sees', { helper: helperName })}</span></li>
          <li className="flex items-start gap-2"><Users aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{t('cant')}</span></li>
        </ul>
        {panel.followers.length > 0 && <section aria-labelledby={`${id}-list`} className="space-y-2">
          <h3 id={`${id}-list`} className="text-sm font-medium">{t('following', { count: panel.followers.length, max: panel.max })}</h3>
          <ul className="divide-y divide-foreground/[0.07] rounded-2xl border border-foreground/[0.07] dark:divide-white/[0.07] dark:border-white/[0.07]">
            {panel.followers.map((person) => <li key={person.id} className="flex items-center gap-3 px-3 py-2">
              <InitialsAvatar initials={person.initials} photo={person.photo} size="sm" />
              <span className="min-w-0 flex-1 truncate font-medium">{person.displayName}</span>
              <Button type="button" variant="ghost" className="min-h-11" disabled={pending !== null} aria-busy={pending === person.id} aria-label={t('removeNamed', { name: person.displayName })}
                onClick={() => void run(person.id, () => handlers.onRemove({ bookingId: panel.bookingId, followerId: person.id }), () => setSaid(t('removed', { name: person.displayName })))}>
                {pending === person.id ? <Spinner aria-hidden="true" /> : <UserMinus aria-hidden="true" />}{t('remove')}
              </Button>
            </li>)}
          </ul>
        </section>}
        {full
          ? <p role="note" className="rounded-2xl border border-foreground/[0.07] px-3.5 py-3 text-sm text-muted-foreground dark:border-white/[0.07]">{t(`blocked.${panel.addBlockedReason ?? 'limit'}`, { max: panel.max })}</p>
          : <form noValidate className="space-y-2" onSubmit={(event) => { event.preventDefault(); add(); }}>
            <label htmlFor={`${id}-who`} className="text-sm font-medium">{t('label')}</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id={`${id}-who`} value={who} autoComplete="off" autoCapitalize="none" spellCheck={false} inputMode="email" placeholder={t('placeholder')} disabled={pending !== null}
                aria-invalid={error !== null} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} className="min-h-11 flex-1"
                onChange={(event) => { setWho(event.target.value); if (error) setError(null); }} />
              <Button type="submit" className="min-h-11" disabled={pending !== null} aria-busy={pending === 'add'}>{pending === 'add' ? <Spinner aria-hidden="true" /> : <UserPlus aria-hidden="true" />}{t('add')}</Button>
            </div>
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">{t('hint')}</p>
            {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{t(`errors.${error}`, { max: panel.max })}</p>}
          </form>}
        <p aria-live="polite" className={cn('text-sm text-success', !said && 'sr-only')}>{said ?? ''}</p>
        <FormFeedback result={result} />
        <div className="flex justify-end">
          <Button type="button" variant="outline" className="min-h-11" disabled={pending !== null} onClick={() => onOpenChange(false)}>{t('close')}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

/** Who follows, in a line both of the booking's people read ("Maya's family member Lia follows this booking"). */
export function followedByLine(t: (key: string, values?: Record<string, string | number>) => string, notice: FollowedByNotice, viewer: 'client' | 'helper') {
  const names = notice.names.join(' · ');
  return viewer === 'client' ? t('note.client', { names, count: notice.names.length }) : t('note.helper', { client: notice.clientName, names, count: notice.names.length });
}

/** The booking page's "Family members" card: the client's followers and "Add a family member"; the helper's note. */
export function FamilyCard({ manage, followedBy, handlers, helperName, viewer, className }: {
  manage?: BookingFollowersPanel;
  followedBy?: FollowedByNotice;
  handlers?: FollowerHandlers;
  helperName: string;
  viewer: 'client' | 'helper';
  className?: string;
}) {
  const t = useTranslations('family');
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!manage && !followedBy) return null;
  return <section aria-labelledby="booking-family" className={cn('rounded-[1.375rem] border border-foreground/[0.07] bg-card p-5 shadow-card sm:p-6 dark:border-white/[0.06]', 'space-y-3', className)}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="booking-family" className="flex items-center gap-2 font-heading text-xl/7 font-semibold tracking-[-0.015em]"><Users aria-hidden="true" className="size-5 text-primary" />{t('card.title')}</h2>
      {manage && handlers && <Button ref={trigger} type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden="true" />{manage.followers.length ? t('card.manage') : t('card.add')}
      </Button>}
    </div>
    <p className="text-sm text-muted-foreground">{followedBy ? followedByLine(t, followedBy, viewer) : t('card.empty', { helper: helperName })}</p>
    {manage && handlers && <FollowersDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) window.setTimeout(() => trigger.current?.focus(), 0); }} panel={manage} handlers={handlers} helperName={helperName} />}
  </section>;
}
