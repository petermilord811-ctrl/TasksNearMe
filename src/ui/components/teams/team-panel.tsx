'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowRight, MessagesSquare, UserPlus, UsersRound } from 'lucide-react';
import { routes, teamInviteInputSchema, type ActionHandler, type BookingSheetHandlers, type BookingTeamView, type BookingView, type TeamHandlers, type TeamInviteInput } from '@/contracts';
import { PricingFields } from '@/ui/components/forms/pricing-fields';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { CancelBookingSheet } from '@/ui/screens/bookings/sheets/cancel-booking-sheet';
import { TeamInviteCardView } from './team-card';

const surface = 'rounded-[1.5rem] border border-foreground/[0.07] bg-card p-5 shadow-[0_1px_2px_rgb(23_18_14/0.05)] dark:border-white/[0.07] sm:p-6';
const textLink = 'inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline';
const first = (name: string) => name.split(' ')[0] || name;

/**
 * The team on a booking page (2026-11-24): the lead's "Team up" and their invite; the partner's and the client's view of
 * the team; the client's choice when the lead's booking was canceled (keep the partner, or cancel their booking through
 * its own cancel sheet, policy preview first). Everything opens over the page.
 */
export function TeamPanel({ data, team, handlers, partnerSheets, initialDialog = false }: {
  data: BookingView;
  team: BookingTeamView;
  handlers?: TeamHandlers;
  /** The partner's booking's cancel sheet handlers (the client's "cancel both"). */
  partnerSheets?: BookingSheetHandlers;
  /** Previews: the invite dialog open. */
  initialDialog?: boolean;
}) {
  const t = useTranslations('teams.panel');
  const [inviting, setInviting] = useState(initialDialog);
  const [canceling, setCanceling] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [kept, setKept] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const lead = team.lead ?? team.invite?.lead;

  if (team.part === 'partner') {
    return <section aria-labelledby="team-panel-title" data-team-panel="partner" className={cn(surface, 'space-y-2')}>
      <h2 id="team-panel-title" className="flex items-center gap-2 font-heading text-lg font-semibold"><UsersRound aria-hidden="true" className="size-5 text-primary" />{t('title')}</h2>
      <p>{team.leadCanceled ? t(team.viewerRole === 'partner' ? 'leadCanceled' : 'leadCanceledClient', { lead: lead?.displayName ?? '' }) : team.viewerRole === 'partner' ? t('leadsThis', { lead: lead?.displayName ?? '' }) : t('partOf', { lead: lead?.displayName ?? '' })}</p>
      <div className="flex flex-wrap gap-x-5">
        {team.leadBookingId && <Link href={routes.app.booking(team.leadBookingId)} className={textLink}>{t('leadBooking', { lead: first(lead?.displayName ?? '') })}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
        {team.teamThreadId && <Link href={routes.app.thread(team.teamThreadId)} className={textLink}><MessagesSquare aria-hidden="true" className="size-4" />{t('teamChat')}</Link>}
      </div>
    </section>;
  }

  const choice = team.cancelChoice;
  const partnerName = choice ? first(choice.partner.displayName) : '';
  async function keep() {
    if (!choice || !team.invite || !handlers?.onKeep || keeping) return;
    setKeeping(true);
    try {
      const result = await handlers.onKeep({ teamId: team.invite.teamId });
      if (result.ok) { setKept(true); toast.success(t('kept', { partner: partnerName })); }
    } finally {
      setKeeping(false);
    }
  }

  return <section aria-labelledby="team-panel-title" data-team-panel="lead" className={cn(surface, 'space-y-4')}>
    <h2 id="team-panel-title" className="flex items-center gap-2 font-heading text-lg font-semibold"><UsersRound aria-hidden="true" className="size-5 text-primary" />{team.canInvite && !team.invite ? t('inviteTitle') : t('title')}</h2>
    {choice && !kept && <div data-team-choice className="space-y-3 rounded-2xl border border-warning/40 bg-warning/5 p-4">
      <p className="font-semibold">{t('choiceTitle', { partner: partnerName })}</p>
      <p className="text-sm">{t('choiceBody', { partner: partnerName })}</p>
      <div className="flex flex-wrap gap-2">
        {handlers?.onKeep && <Button type="button" onClick={() => void keep()} disabled={keeping} aria-busy={keeping} className="min-h-11 rounded-full">{keeping && <Spinner aria-hidden="true" />}{t('keep', { partner: partnerName })}</Button>}
        {partnerSheets && <Button ref={cancelButton} type="button" variant="outline" onClick={() => setCanceling(true)} className="min-h-11 rounded-full">{t('cancelBoth', { partner: partnerName })}</Button>}
      </div>
    </div>}
    {team.canInvite && !team.invite && <p className="text-sm text-muted-foreground">{t('inviteBody')}</p>}
    {team.invite && <TeamInviteCardView card={team.invite} {...(handlers ? { handlers } : {})} embedded />}
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {team.canInvite && handlers?.onInvite && <Button type="button" variant={team.invite ? 'outline' : 'default'} onClick={() => setInviting(true)} className="min-h-11 rounded-full"><UserPlus aria-hidden="true" className="size-4" />{t('invite')}</Button>}
      {team.teamThreadId && <Link href={routes.app.thread(team.teamThreadId)} className={textLink}><MessagesSquare aria-hidden="true" className="size-4" />{t('teamChat')}</Link>}
    </div>
    {team.canInvite && handlers?.onInvite && <TeamInviteDialog open={inviting} onOpenChange={setInviting} onInvite={handlers.onInvite} />}
    {choice && partnerSheets && <CancelBookingSheet
      data={{ ...data, id: choice.partnerBookingId, helper: { ...data.helper, displayName: choice.partner.displayName, initials: choice.partner.initials } }}
      handlers={partnerSheets}
      open={canceling}
      onOpenChange={setCanceling}
      returnFocus={cancelButton}
      onSuccess={() => setKept(true)}
    />}
  </section>;
}

/** The lead's invite (2026-11-24): the partner's @username, a price for their part, and a short note. */
export function TeamInviteDialog({ open, onOpenChange, onInvite }: { open: boolean; onOpenChange: (open: boolean) => void; onInvite: ActionHandler<TeamInviteInput> }) {
  const t = useTranslations('teams.dialog');
  const errors = useTranslations('forms.fieldErrors');
  const id = useId();
  const form = useForm<TeamInviteInput>({ resolver: zodResolver(teamInviteInputSchema), defaultValues: { username: '', pricing: { type: 'fixed', priceCents: 0 }, note: '' }, shouldFocusError: true });
  const [failure, setFailure] = useState<string | null>(null);
  const pending = form.formState.isSubmitting;
  const usernameError = form.formState.errors.username?.message;

  async function submit(values: TeamInviteInput) {
    setFailure(null);
    try {
      const result = await onInvite(values);
      if (result.ok) {
        toast.success(t('sent'));
        form.reset();
        onOpenChange(false);
        return;
      }
      if (result.code === 'validation_failed' && result.fieldErrors) {
        for (const [field, codes] of Object.entries(result.fieldErrors)) if (codes?.[0]) form.setError(field as 'username', { message: codes[0] });
        return;
      }
      setFailure(t(`errors.${result.code === 'not_allowed' || result.code === 'rate_limited' ? result.code : 'unknown'}`));
    } catch {
      setFailure(t('errors.unknown'));
    }
  }

  const usernameMessage = usernameError === 'invalid' || usernameError === 'prohibited' ? t(`errors.${usernameError}`) : usernameError ? errors(errors.has(usernameError) ? usernameError : 'invalid') : null;
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <FormProvider {...form}>
        <form id={id} noValidate aria-busy={pending} className="space-y-5" onSubmit={form.handleSubmit(submit)}>
          <Field data-invalid={Boolean(usernameMessage)} className="gap-2">
            <FieldLabel htmlFor={`${id}-username`}>{t('username')}</FieldLabel>
            <Input id={`${id}-username`} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="@" disabled={pending} aria-invalid={Boolean(usernameMessage)} aria-describedby={`${id}-username-hint ${id}-username-error`} {...form.register('username')} />
            <FieldDescription id={`${id}-username-hint`}>{t('usernameHint')}</FieldDescription>
            <div id={`${id}-username-error`}>{usernameMessage && <FieldError>{usernameMessage}</FieldError>}</div>
          </Field>
          <PricingFields namespace="invites" disabled={pending} />
          <Field className="gap-2">
            <FieldLabel htmlFor={`${id}-note`}>{t('note')}</FieldLabel>
            <Textarea id={`${id}-note`} rows={3} maxLength={500} disabled={pending} aria-describedby={`${id}-note-hint`} {...form.register('note')} />
            <FieldDescription id={`${id}-note-hint`}>{t('noteHint')}</FieldDescription>
          </Field>
          {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
        </form>
      </FormProvider>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)} className="min-h-11">{t('cancel')}</Button>
        <Button type="submit" form={id} disabled={pending} aria-busy={pending} className="min-h-11">{pending && <Spinner aria-hidden="true" />}{t('send')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
