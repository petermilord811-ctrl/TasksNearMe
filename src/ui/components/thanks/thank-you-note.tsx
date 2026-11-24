'use client';

import { useId, useRef, useState } from 'react';
import { Flag, HandHeart, Pencil, ShieldOff, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, THANK_YOU_NOTE_MAX, thankYouNoteInputSchema, type ActionResult, type ThankYouHandlers, type ThankYouNoteView, type ThanksPanel } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Checkbox } from '@/ui/primitives/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { Spinner } from '@/ui/primitives/spinner';
import { Switch } from '@/ui/primitives/switch';
import { Textarea } from '@/ui/primitives/textarea';

/**
 * Thank-you notes (2026-11-24): the client's "Write a thank-you note" offer, the note as a card for both people (in the
 * booking's conversation and on the booking page), and the dialog that writes or edits it. Separate from reviews: no
 * stars, no ratings, nothing about rewards. Every switch says what it changed and goes back if it failed.
 */

const surface = 'rounded-2xl border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.07]';

/** Write or edit the note: up to 280 characters, and "Don't show my name". */
function ThankYouDialog({ open, onOpenChange, bookingId, name, note, onSave, onDone }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  name: string;
  note?: ThankYouNoteView;
  onSave: ThankYouHandlers['onSave'];
  onDone?: (result: ActionResult) => void;
}) {
  const t = useTranslations('thanks.dialog');
  const id = useId();
  const [body, setBody] = useState(note?.draft ?? '');
  const [hideName, setHideName] = useState(note?.nameHidden ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'required' | 'tooLong' | 'notAllowed' | null>(null);
  const [result, setResult] = useState<ActionResult>();

  async function submit() {
    if (pending) return;
    const parsed = thankYouNoteInputSchema.safeParse({ bookingId, body, hideName });
    if (!parsed.success) {
      setError(parsed.error.issues.some((issue) => issue.message === 'too_long') ? 'tooLong' : 'required');
      return;
    }
    setError(null);
    setResult(undefined);
    setPending(true);
    try {
      const answer = await onSave(parsed.data);
      if (answer.ok) {
        onOpenChange(false);
        onDone?.(answer);
        return;
      }
      if (answer.code === 'validation_failed') setError(answer.fieldErrors?.body?.includes('too_long') ? 'tooLong' : 'required');
      else if (answer.code === 'not_allowed') setError('notAllowed');
      else setResult(answer);
    } catch {
      setResult({ ok: false, code: 'unknown' });
    } finally {
      setPending(false);
    }
  }

  const length = body.trim().length;
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{note ? t('editTitle') : t('newTitle', { name })}</DialogTitle>
        <DialogDescription>{t('description', { max: THANK_YOU_NOTE_MAX })}</DialogDescription>
      </DialogHeader>
      <form noValidate aria-busy={pending} className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="space-y-2">
          <label htmlFor={`${id}-body`} className="text-sm font-medium">{t('label')}</label>
          <Textarea id={`${id}-body`} value={body} rows={4} maxLength={THANK_YOU_NOTE_MAX + 40} disabled={pending} placeholder={t('placeholder', { name })} aria-invalid={error !== null && error !== 'notAllowed'} aria-describedby={`${id}-count${error ? ` ${id}-error` : ''}`} onChange={(event) => { setBody(event.target.value); if (error) setError(null); }} />
          <p id={`${id}-count`} className={cn('text-right text-xs tabular-nums', length > THANK_YOU_NOTE_MAX ? 'text-destructive' : 'text-muted-foreground')}>{t('count', { count: length, max: THANK_YOU_NOTE_MAX })}</p>
          {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{t(error, { max: THANK_YOU_NOTE_MAX })}</p>}
        </div>
        <label htmlFor={`${id}-anonymous`} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5">
          <Checkbox id={`${id}-anonymous`} checked={hideName} disabled={pending} className="mt-0.5" onCheckedChange={(checked) => setHideName(checked === true)} />
          <span className="space-y-0.5 text-sm">
            <span className="block font-medium">{t('hideName', { name })}</span>
            <span className="block text-muted-foreground">{t('hideNameHint')}</span>
          </span>
        </label>
        <FormFeedback result={result} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button type="submit" className="min-h-11" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{pending ? t('pending') : note ? t('save') : t('send')}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

/** "Thank Sam with a note": the client's offer while the booking has none. */
export function ThanksOffer({ bookingId, name, onSave, compact = false, className }: { bookingId: string; name: string; onSave: ThankYouHandlers['onSave']; compact?: boolean; className?: string }) {
  const t = useTranslations('thanks');
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <section aria-label={t('offer.title', { name })} className={cn(compact ? 'flex items-center gap-2 px-3 py-2' : cn(surface, 'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'), className)}>
    <div className="min-w-0 space-y-0.5">
      <p className={cn('font-semibold', compact ? 'text-xs' : 'text-base')}>{t('offer.title', { name })}</p>
      {!compact && <p className="text-sm text-muted-foreground">{t('offer.body', { name })}</p>}
    </div>
    <Button ref={trigger} type="button" variant="outline" size={compact ? 'sm' : 'default'} className={cn('shrink-0 rounded-full border-primary/35 text-primary', compact ? 'ml-auto min-h-9' : 'min-h-11')} onClick={() => setOpen(true)}>
      <HandHeart aria-hidden="true" />{t('offer.action')}
    </Button>
    <p aria-live="polite" className="sr-only">{sent ? t('card.sent') : ''}</p>
    <ThankYouDialog open={open} onOpenChange={setOpen} bookingId={bookingId} name={name} onSave={onSave} onDone={() => setSent(true)} />
  </section>;
}

/** A switch that saves at once and goes back if it failed. */
function SavedSwitch({ label, state, checked, onSave }: { label: string; state: string; checked: boolean; onSave: (next: boolean) => Promise<ActionResult> }) {
  const t = useTranslations('thanks.card');
  const id = useId();
  const [value, setValue] = useState(checked);
  const [saved, setSaved] = useState(checked);
  // A refresh brings the saved value: follow it here rather than remounting (keeps focus).
  if (saved !== checked) { setSaved(checked); setValue(checked); }
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return <div className="space-y-1">
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{state}</span>
      </span>
      <span className="flex items-center gap-2">
        {pending && <Spinner aria-hidden="true" className="size-3.5" />}
        <Switch id={id} checked={value} aria-busy={pending} onCheckedChange={async (next) => {
          if (pending) return;
          setValue(next);
          setPending(true);
          setFailed(false);
          try {
            const result = await onSave(next);
            if (!result.ok) throw new Error(result.code);
          } catch {
            setValue(!next);
            setFailed(true);
          } finally {
            setPending(false);
          }
        }} />
      </span>
    </label>
    <p role="alert" className="text-xs text-destructive empty:hidden">{failed ? t('failed') : ''}</p>
  </div>;
}

/**
 * The note as a card. The client: their words, whether the helper shows it, Edit (24 h), Delete, "Don't show my name".
 * The helper: the words (masked), "Show on my profile" and Report. Hidden by our team: says so, without the words for
 * the helper.
 */
export function ThankYouNoteCard({ note, name, handlers, compact = false, className }: { note: ThankYouNoteView; name: string; handlers?: ThankYouHandlers; compact?: boolean; className?: string }) {
  const t = useTranslations('thanks.card');
  const { formatDate, formatTime } = useFormat();
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [result, setResult] = useState<ActionResult>();
  const client = note.viewerRole === 'client';

  async function remove() {
    if (!handlers || deletePending) return;
    setDeletePending(true);
    try {
      const answer = await handlers.onDelete({ noteId: note.id });
      setResult(answer.ok ? { ok: true, code: 'updated' } : answer);
      if (answer.ok) setDeleting(false);
    } catch {
      setResult({ ok: false, code: 'unknown' });
    } finally {
      setDeletePending(false);
    }
  }

  return <article aria-labelledby={titleId} className={cn(surface, 'w-full max-w-md space-y-3 text-left', compact ? 'p-3' : 'p-4', className)}>
    <header className="flex items-start gap-2">
      <HandHeart aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0">
        <h3 id={titleId} className={cn('font-semibold', compact ? 'text-sm' : 'text-base')}>{client ? t('fromYou', { name }) : t('toYou', { name })}</h3>
        <p className="text-xs text-muted-foreground"><time dateTime={note.createdAt}>{t('sentAt', { date: formatDate(note.createdAt) })}</time></p>
      </div>
    </header>
    {note.hidden && !client
      ? <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground"><ShieldOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('hiddenForHelper')}</p>
      : <blockquote className="whitespace-pre-line rounded-xl bg-brand-soft/60 px-3 py-2 text-[15px] leading-6 [overflow-wrap:anywhere] dark:bg-white/[0.05]"><MaskedText segments={note.segments} /></blockquote>}
    {client && note.hidden && <p className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('hidden')}</p>}
    {client && !note.hidden && <p className="text-sm text-muted-foreground">{note.shownOnProfile ? t('shown', { name }) : t('notShown', { name })}</p>}
    {client && note.editableUntil && <p className="text-xs text-muted-foreground"><time dateTime={note.editableUntil}>{t('editableUntil', { time: `${formatDate(note.editableUntil)} ${formatTime(note.editableUntil)}` })}</time></p>}
    {handlers && client && <SavedSwitch label={t('hideName')} state={note.nameHidden ? t('hideNameOn') : t('hideNameOff')} checked={note.nameHidden} onSave={(hidden) => handlers.onHideName({ noteId: note.id, hidden })} />}
    {handlers && !client && !note.hidden && <SavedSwitch label={t('showOnProfile')} state={note.shownOnProfile ? t('showOnProfileOn') : t('showOnProfileOff', { name })} checked={note.shownOnProfile} onSave={(shown) => handlers.onShowOnProfile({ noteId: note.id, shown })} />}
    {handlers && client && <div className="flex flex-wrap gap-2">
      {note.editableUntil && <Button type="button" variant="outline" size="sm" className="min-h-10 rounded-full" onClick={() => setEditing(true)}><Pencil aria-hidden="true" />{t('edit')}</Button>}
      <Button type="button" variant="ghost" size="sm" className="min-h-10 rounded-full text-destructive hover:text-destructive" onClick={() => setDeleting(true)}><Trash2 aria-hidden="true" />{t('delete')}</Button>
    </div>}
    {!client && note.reportable && <p><Link href={routes.app.report('thanks', note.id)} className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"><Flag aria-hidden="true" className="size-3.5" />{t('report')}</Link></p>}
    <FormFeedback result={result} successMessage={result?.ok ? t('updated') : undefined} />
    {handlers && client && note.editableUntil && <ThankYouDialog key={note.draft} open={editing} onOpenChange={setEditing} bookingId={note.bookingId} name={name} note={note} onSave={handlers.onSave} onDone={(answer) => setResult(answer)} />}
    {handlers && client && <AlertDialog open={deleting} onOpenChange={(next) => { if (!deletePending) setDeleting(next); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteBody', { name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletePending}>{t('cancel')}</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={deletePending} aria-busy={deletePending} onClick={() => void remove()}>{deletePending && <Spinner aria-hidden="true" />}{t('deleteConfirm')}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </article>;
}

/** A completed booking's note for the booking page: the client's offer, or the note as a card. */
export function ThanksPanelView({ panel, name, handlers, className }: { panel: ThanksPanel; name: string; handlers?: ThankYouHandlers; className?: string }) {
  if (panel.note) return <ThankYouNoteCard note={panel.note} name={name} {...(handlers ? { handlers } : {})} className={cn('max-w-none', className)} />;
  if (panel.canWrite && handlers) return <ThanksOffer bookingId={panel.bookingId} name={name} onSave={handlers.onSave} {...(className ? { className } : {})} />;
  return null;
}
