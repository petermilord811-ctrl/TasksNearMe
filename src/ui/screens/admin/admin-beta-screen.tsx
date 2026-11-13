'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { Check, ChevronDown, Copy } from 'lucide-react';
import {
  BETA_GATES,
  BETA_ROLES,
  INVITE_EXPIRY_DAYS,
  INVITE_LABEL_MAX,
  INVITE_MAX_USES_LIMIT,
  inviteCodeCreateSchema,
  routes,
  type ActionResult,
  type AdminBetaHandlers,
  type AdminBetaMarket,
  type AdminBetaPageData,
  type AdminInviteCodeView,
  type BetaGate,
  type InviteCodeCreateInput,
  type InviteCodeStatus,
} from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormat } from '@/ui/lib/format';
import { useFormAction } from '@/ui/lib/use-form-action';
import { cn } from '@/ui/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/ui/primitives/alert-dialog';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Spinner } from '@/ui/primitives/spinner';
import { Switch } from '@/ui/primitives/switch';

const selectClass = 'h-11 w-full rounded-md border bg-background px-3 text-base sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const STATUS_TONE: Record<InviteCodeStatus, string> = {
  active: 'border-success/30 bg-success/10 text-foreground',
  used_up: 'border-border bg-muted text-foreground',
  expired: 'border-border bg-muted text-foreground',
  revoked: 'border-destructive/30 bg-destructive/10 text-foreground',
};

/** One switch: on means new people in this market need an invite for it. */
function GateSwitch({ market, gate, canManage, onSetGate }: { market: AdminBetaMarket; gate: BetaGate; canManage: boolean; onSetGate: AdminBetaHandlers['onSetGate'] }) {
  const t = useTranslations('adminBeta');
  const id = useId();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();
  const on = market.gates[gate];
  async function flip(enabled: boolean) {
    setPending(true);
    setResult(undefined);
    try {
      const next = await onSetGate({ marketId: market.id, gate, enabled });
      setResult(next);
      if (next.ok) router.refresh();
    } catch {
      setResult({ ok: false, code: 'unknown' });
    } finally {
      setPending(false);
    }
  }
  return <div className="space-y-2 rounded-2xl border border-foreground/[0.07] p-4 dark:border-white/[0.06]">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={`${id}-switch`} className="font-semibold">{t(`gates.${gate}.title`)}</Label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t(`gates.${gate}.${on ? 'on' : 'off'}`, { market: market.name })}</p>
      </div>
      <div className="flex min-h-11 items-center gap-2">
        {pending && <Spinner aria-hidden="true" />}
        <Switch id={`${id}-switch`} checked={on} disabled={!canManage || pending} aria-describedby={`${id}-hint`} aria-busy={pending} onCheckedChange={(checked) => void flip(checked)} />
      </div>
    </div>
    {result && !result.ok && <FormFeedback result={result} />}
    {result?.ok && <p role="status" className="text-sm text-muted-foreground">{t(on ? 'gates.savedOn' : 'gates.savedOff')}</p>}
  </div>;
}

type CreateForm = { role: 'poster' | 'helper'; label: string; maxUses: string; expiresInDays: string; customCode: string };

function NewInviteForm({ market, onCreate }: { market: AdminBetaMarket; onCreate: AdminBetaHandlers['onCreateCode'] }) {
  const t = useTranslations('adminBeta');
  const forms = useTranslations('forms');
  const id = useId();
  const router = useRouter();
  const form = useForm<CreateForm>({ defaultValues: { role: 'poster', label: '', maxUses: '20', expiresInDays: '30', customCode: '' } });
  const action = useFormAction(form, { onResult: (result) => { if (result.ok) { form.reset({ role: form.getValues('role'), label: '', maxUses: '20', expiresInDays: '30', customCode: '' }); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting;
  const errors = form.formState.errors;
  const message = (field: keyof CreateForm) => {
    const code = errors[field]?.message;
    if (!code) return undefined;
    const key = `form.errors.${field}.${code}`;
    return t.has(key) ? t(key, { max: field === 'label' ? INVITE_LABEL_MAX : INVITE_MAX_USES_LIMIT }) : forms(`fieldErrors.${forms.has(`fieldErrors.${code}`) ? code : 'invalid'}`);
  };
  const input = (values: CreateForm): InviteCodeCreateInput => ({ marketId: market.id, role: values.role, label: values.label, maxUses: values.maxUses, expiresInDays: values.expiresInDays, customCode: values.customCode });

  return <form noValidate aria-labelledby={`${id}-title`} aria-busy={pending} className="space-y-5" onSubmit={form.handleSubmit(async (values) => {
    const parsed = inviteCodeCreateSchema.safeParse(input(values));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) form.setError(issue.path[0] as keyof CreateForm, { type: 'zod', message: issue.message });
      return;
    }
    await action.run(onCreate, input(values));
  })}>
    <h3 id={`${id}-title`} className="text-lg font-semibold">{t('form.title')}</h3>
    <Controller control={form.control} name="role" render={({ field }) => <FieldSet className="gap-3">
      <FieldLegend id={`${id}-role`} className="mb-0 text-sm font-medium">{t('form.role')}</FieldLegend>
      <RadioGroup value={field.value} onValueChange={field.onChange} disabled={pending} aria-labelledby={`${id}-role`} className="grid gap-2 sm:grid-cols-2">
        {BETA_ROLES.map((role) => <Field key={role} orientation="horizontal" className="gap-3 rounded-2xl border border-foreground/[0.1] px-3 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-brand-soft dark:border-white/[0.1]">
          <RadioGroupItem id={`${id}-${role}`} value={role} />
          <FieldLabel htmlFor={`${id}-${role}`} className="min-h-11 flex-1 flex-col items-start gap-0.5 py-3 font-normal">
            <span className="font-medium">{t(`roles.${role}.title`)}</span>
            <span className="text-sm text-muted-foreground">{t(`roles.${role}.hint`)}</span>
          </FieldLabel>
        </Field>)}
      </RadioGroup>
    </FieldSet>} />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field data-invalid={Boolean(errors.label)} className="gap-2 sm:col-span-2">
        <FieldLabel htmlFor={`${id}-label`}>{t('form.label')}</FieldLabel>
        <FieldDescription id={`${id}-label-hint`}>{t('form.labelHint')}</FieldDescription>
        <Input {...form.register('label')} id={`${id}-label`} maxLength={INVITE_LABEL_MAX} disabled={pending} aria-invalid={Boolean(errors.label)} aria-describedby={`${id}-label-hint${errors.label ? ` ${id}-label-error` : ''}`} />
        {errors.label && <FieldError id={`${id}-label-error`}>{message('label')}</FieldError>}
      </Field>
      <Field data-invalid={Boolean(errors.maxUses)} className="gap-2">
        <FieldLabel htmlFor={`${id}-uses`}>{t('form.maxUses')}</FieldLabel>
        <FieldDescription id={`${id}-uses-hint`}>{t('form.maxUsesHint', { max: INVITE_MAX_USES_LIMIT })}</FieldDescription>
        <Input {...form.register('maxUses')} id={`${id}-uses`} type="number" inputMode="numeric" min={1} max={INVITE_MAX_USES_LIMIT} disabled={pending} aria-invalid={Boolean(errors.maxUses)} aria-describedby={`${id}-uses-hint${errors.maxUses ? ` ${id}-uses-error` : ''}`} />
        {errors.maxUses && <FieldError id={`${id}-uses-error`}>{message('maxUses')}</FieldError>}
      </Field>
      <Field className="gap-2">
        <FieldLabel htmlFor={`${id}-expires`}>{t('form.expires')}</FieldLabel>
        <FieldDescription id={`${id}-expires-hint`}>{t('form.expiresHint')}</FieldDescription>
        <select {...form.register('expiresInDays')} id={`${id}-expires`} disabled={pending} aria-describedby={`${id}-expires-hint`} className={selectClass}>
          {INVITE_EXPIRY_DAYS.map((days) => <option key={days} value={String(days)}>{t('form.expiresIn', { days })}</option>)}
          <option value="">{t('form.never')}</option>
        </select>
      </Field>
      <Field data-invalid={Boolean(errors.customCode)} className="gap-2 sm:col-span-2">
        <FieldLabel htmlFor={`${id}-custom`}>{t('form.customCode')}</FieldLabel>
        <FieldDescription id={`${id}-custom-hint`}>{t('form.customCodeHint')}</FieldDescription>
        <Input {...form.register('customCode')} id={`${id}-custom`} autoCapitalize="characters" spellCheck={false} autoComplete="off" disabled={pending} className="font-mono uppercase" aria-invalid={Boolean(errors.customCode)} aria-describedby={`${id}-custom-hint${errors.customCode ? ` ${id}-custom-error` : ''}`} />
        {errors.customCode && <FieldError id={`${id}-custom-error`}>{message('customCode')}</FieldError>}
      </Field>
    </div>
    <FormFeedback result={action.result} successMessage={t('form.created')} />
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t('form.submit')}</Button>
  </form>;
}

function CopyButton({ text, label, copiedLabel, name }: { text: string; label: string; copiedLabel: string; name: string }) {
  const t = useTranslations('adminBeta');
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const busy = useRef(false);
  async function copy() {
    if (busy.current) return;
    busy.current = true;
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('error');
    } finally {
      busy.current = false;
    }
  }
  return <span className="inline-flex items-center gap-2">
    <Button type="button" size="sm" variant="outline" onClick={() => void copy()} aria-label={`${label}: ${name}`}>
      {state === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{state === 'copied' ? copiedLabel : label}
    </Button>
    <span role="status" aria-live="polite" className={state === 'error' ? 'text-sm text-destructive' : 'sr-only'}>{state === 'error' ? t('codes.copyFailed') : state === 'copied' ? copiedLabel : ''}</span>
  </span>;
}

function InviteCard({ invite, canManage, onRevoke }: { invite: AdminInviteCodeView; canManage: boolean; onRevoke: AdminBetaHandlers['onRevokeCode'] }) {
  const t = useTranslations('adminBeta');
  const { formatDate, formatDateTime } = useFormat();
  const router = useRouter();
  const [revoking, setRevoking] = useState(false);
  const [result, setResult] = useState<ActionResult>();
  async function revoke() {
    setRevoking(true);
    try {
      const next = await onRevoke({ id: invite.id });
      setResult(next);
      if (next.ok) router.refresh();
    } catch {
      setResult({ ok: false, code: 'unknown' });
    } finally {
      setRevoking(false);
    }
  }
  const live = invite.status === 'active';
  return <li className="space-y-3 rounded-2xl border border-foreground/[0.07] bg-card p-4 dark:border-white/[0.06]">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-1">
        <p className="font-mono text-lg font-semibold tracking-[0.06em] break-all">{invite.code}</p>
        <p className="break-words">{invite.label}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{t(`roles.${invite.role}.title`)}</Badge>
        <Badge variant="outline" className={cn(STATUS_TONE[invite.status])}>{t(`status.${invite.status}`)}</Badge>
      </div>
    </div>
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <div className="flex gap-2"><dt className="text-muted-foreground">{t('codes.used')}</dt><dd className="tabular-nums">{t('codes.usedValue', { uses: invite.uses, max: invite.maxUses })}</dd></div>
      <div className="flex gap-2"><dt className="text-muted-foreground">{t('codes.expires')}</dt><dd>{invite.expiresAt ? formatDate(invite.expiresAt) : t('codes.never')}</dd></div>
      <div className="flex gap-2 sm:col-span-2"><dt className="text-muted-foreground">{t('codes.created')}</dt><dd>{t('codes.createdValue', { name: invite.createdBy.displayName, date: formatDate(invite.createdAt) })}</dd></div>
      {invite.revokedAt && <div className="flex gap-2 sm:col-span-2"><dt className="text-muted-foreground">{t('codes.revoked')}</dt><dd>{formatDateTime(invite.revokedAt)}</dd></div>}
    </dl>
    {live && <div className="flex flex-wrap gap-2">
      <CopyButton text={invite.link} label={t('codes.copyLink')} copiedLabel={t('codes.copied')} name={invite.code} />
      <CopyButton text={invite.code} label={t('codes.copyCode')} copiedLabel={t('codes.copied')} name={invite.code} />
      {canManage && <AlertDialog>
        <AlertDialogTrigger asChild><Button type="button" size="sm" variant="outline" disabled={revoking} aria-busy={revoking} aria-label={t('codes.revokeLabel', { code: invite.code })}>{revoking && <Spinner aria-hidden="true" />}{t('codes.revoke')}</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('codes.revokeTitle', { code: invite.code })}</AlertDialogTitle><AlertDialogDescription>{t('codes.revokeBody')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t('codes.keep')}</AlertDialogCancel><AlertDialogAction onClick={() => void revoke()}>{t('codes.revokeConfirm')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>}
    {result && !result.ok && <FormFeedback result={result} />}
    <details className="group/joined rounded-xl bg-muted/50 px-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-medium">{t('codes.joined', { count: invite.uses })}<ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open/joined:rotate-180 motion-reduce:transition-none" /></summary>
      {invite.joined.length === 0 ? <p className="pb-3 text-sm text-muted-foreground">{t('codes.nobody')}</p> : <ul className="divide-y divide-border pb-2 text-sm">
        {invite.joined.map((person) => <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <Link href={routes.admin.user(person.id)} className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{person.displayName || t('codes.noName')}</Link>
          <span className="text-muted-foreground">{person.signUpFinished ? t('codes.joinedOn', { date: formatDate(person.joinedAt) }) : t('codes.stillSigningUp', { date: formatDate(person.joinedAt) })}</span>
        </li>)}
      </ul>}
    </details>
  </li>;
}

function MarketSection({ market, canManage, handlers }: { market: AdminBetaMarket; canManage: boolean; handlers: AdminBetaHandlers }) {
  const t = useTranslations('adminBeta');
  const id = useId();
  const live = market.codes.filter((code) => code.status === 'active');
  const past = market.codes.filter((code) => code.status !== 'active');
  return <section aria-labelledby={`${id}-market`} className="space-y-6 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
    <header className="space-y-1">
      <h2 id={`${id}-market`} className="font-display text-xl font-semibold">{market.name}</h2>
      <p className="text-muted-foreground">{t('joinedSummary', { posters: market.joined.poster, helpers: market.joined.helper })}</p>
    </header>
    <div className="grid gap-3 lg:grid-cols-2">{BETA_GATES.map((gate) => <GateSwitch key={gate} market={market} gate={gate} canManage={canManage} onSetGate={handlers.onSetGate} />)}</div>
    {canManage && <NewInviteForm market={market} onCreate={handlers.onCreateCode} />}
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{t('codes.liveTitle', { count: live.length })}</h3>
      {live.length === 0 ? <p className="text-muted-foreground">{t(canManage ? 'codes.emptyManage' : 'codes.empty')}</p> : <ul className="grid gap-3 xl:grid-cols-2">{live.map((invite) => <InviteCard key={invite.id} invite={invite} canManage={canManage} onRevoke={handlers.onRevokeCode} />)}</ul>}
    </div>
    {past.length > 0 && <details className="group/past space-y-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-lg font-semibold">{t('codes.pastTitle', { count: past.length })}<ChevronDown aria-hidden="true" className="size-5 shrink-0 transition-transform group-open/past:rotate-180 motion-reduce:transition-none" /></summary>
      <ul className="grid gap-3 pt-3 xl:grid-cols-2">{past.map((invite) => <InviteCard key={invite.id} invite={invite} canManage={canManage} onRevoke={handlers.onRevokeCode} />)}</ul>
    </details>}
  </section>;
}

/**
 * `/admin/beta`: the private beta per market. Two switches (invite-only sign-up, invite-only helpers), invite
 * codes to create, share and withdraw, and who joined with each. Leads and admins manage; other staff read.
 */
export function AdminBetaScreen({ data, handlers }: { data: AdminBetaPageData; handlers: AdminBetaHandlers }) {
  const t = useTranslations('adminBeta');
  return <div className="space-y-8">
    <header className="space-y-2">
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1>
      <p className="max-w-3xl text-muted-foreground">{t('intro')}</p>
      {!data.canManage && <p className="text-sm text-muted-foreground">{t('readOnly')}</p>}
    </header>
    {data.markets.length === 0 ? <p className="rounded-xl border bg-card p-5 text-muted-foreground">{t('noMarkets')}</p> : data.markets.map((market) => <MarketSection key={market.id} market={market} canManage={data.canManage} handlers={handlers} />)}
  </div>;
}
