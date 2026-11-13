'use client';

import { useId, useRef, useState } from 'react';
import { KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  staffAuthenticatorResetInputSchema,
  staffRoleGrantInputSchema,
  staffRoleRemoveInputSchema,
  type ActionResult,
  type AdminStaffHandlers,
  type AdminStaffMember,
  type AdminStaffPageData,
  type ISODateTime,
  type StaffAuthenticatorResetInput,
  type StaffRole,
  type StaffRoleGrantInput,
  type StaffRoleRemoveInput,
} from '@/contracts';
import { formatDate, formatDateTime } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { useFormAction } from '@/ui/lib/use-form-action';
import { cn } from '@/ui/lib/utils';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

const selectClass = 'min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:border-destructive';

export interface AdminStaffPreviewState {
  initialGrantValues?: Partial<StaffRoleGrantInput>;
  initialGrantResult?: ActionResult;
  initialRemove?: { userId: string; role: StaffRole; reason?: string; result?: ActionResult };
  /** A setup code just given (shown once). */
  initialSetupCode?: { userId: string } & SetupCode;
  initialReset?: { userId: string; reason?: string; result?: ActionResult };
}

type SetupCode = { setupCode: string; expiresAt: ISODateTime };

function useReasonError(code: string | undefined) {
  const t = useTranslations('adminStaff');
  return code ? t(code === 'too_long' ? 'errors.reasonTooLong' : 'errors.reasonRequired') : undefined;
}

function GrantForm({ data, handlers, initialValues, initialResult }: { data: AdminStaffPageData; handlers: AdminStaffHandlers; initialValues?: Partial<StaffRoleGrantInput>; initialResult?: ActionResult }) {
  const t = useTranslations('adminStaff');
  const roles = useTranslations('shell.roles');
  const router = useRouter();
  const id = useId();
  const form = useForm<StaffRoleGrantInput>({ resolver: zodResolver(staffRoleGrantInputSchema), defaultValues: { email: '', role: undefined, reason: '', ...initialValues } as StaffRoleGrantInput });
  const action = useFormAction(form, { initialResult, onResult: (result) => { if (result.ok) { form.reset({ email: '', reason: '' } as StaffRoleGrantInput); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting;
  const { errors } = form.formState;
  const emailError = errors.email?.message ? t('errors.emailInvalid') : undefined;
  const roleError = errors.role?.message ? t(errors.role.message === 'in_use' ? 'errors.roleInUse' : 'errors.roleRequired') : undefined;
  const reasonError = useReasonError(errors.reason?.message);
  const feedback = action.result && (action.result.ok || !action.result.fieldErrors) ? action.result : undefined;
  return <form noValidate aria-labelledby={`${id}-title`} aria-busy={pending} className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-5" onSubmit={form.handleSubmit((input) => action.run(handlers.onGrant, input))}>
    <h2 id={`${id}-title`} className="font-heading text-xl font-semibold">{t('grantTitle')}</h2>
    <div className="grid gap-4 md:grid-cols-2">
      <Field data-invalid={Boolean(emailError)} className="gap-2">
        <FieldLabel htmlFor={`${id}-email`}>{t('email')}</FieldLabel>
        <FieldDescription id={`${id}-email-hint`}>{t('emailHint')}</FieldDescription>
        <Input {...form.register('email')} id={`${id}-email`} type="email" autoComplete="off" disabled={pending} aria-invalid={Boolean(emailError)} aria-describedby={`${id}-email-hint${emailError ? ` ${id}-email-error` : ''}`} />
        {emailError && <FieldError id={`${id}-email-error`}>{emailError}</FieldError>}
      </Field>
      <Field data-invalid={Boolean(roleError)} className="gap-2">
        <FieldLabel htmlFor={`${id}-role`}>{t('role')}</FieldLabel>
        <select {...form.register('role')} id={`${id}-role`} disabled={pending} aria-invalid={Boolean(roleError)} aria-describedby={roleError ? `${id}-role-error` : undefined} className={selectClass}>
          <option value="">{t('chooseRole')}</option>
          {data.grantable.map((role) => <option key={role} value={role}>{roles(role)}</option>)}
        </select>
        {roleError && <FieldError id={`${id}-role-error`}>{roleError}</FieldError>}
      </Field>
    </div>
    <Field data-invalid={Boolean(reasonError)} className="gap-2">
      <FieldLabel htmlFor={`${id}-reason`}>{t('reason')}</FieldLabel>
      <FieldDescription id={`${id}-reason-hint`}>{t('reasonHint')}</FieldDescription>
      <Textarea {...form.register('reason')} id={`${id}-reason`} rows={3} maxLength={1000} disabled={pending} aria-invalid={Boolean(reasonError)} aria-describedby={`${id}-reason-hint${reasonError ? ` ${id}-reason-error` : ''}`} />
      {reasonError && <FieldError id={`${id}-reason-error`}>{reasonError}</FieldError>}
    </Field>
    <FormFeedback result={feedback} successMessage={t('granted')} errorMessage={feedback && !feedback.ok && feedback.code === 'not_allowed' ? t('errors.notAllowed') : undefined} />
    <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'granting' : 'grant')}</Button>
  </form>;
}

function RemoveForm({ member, role, handlers, initialReason, initialResult, onCancel, onDone, onBusy }: {
  member: AdminStaffMember; role: StaffRole; handlers: AdminStaffHandlers; initialReason?: string; initialResult?: ActionResult;
  onCancel: () => void; onDone: (result: ActionResult) => void; onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations('adminStaff');
  const roles = useTranslations('shell.roles');
  const router = useRouter();
  const id = useId();
  const form = useForm<StaffRoleRemoveInput>({ resolver: zodResolver(staffRoleRemoveInputSchema), defaultValues: { userId: member.person.id, role, reason: initialReason ?? '' } });
  const action = useFormAction(form, { initialResult, onResult: (result) => { if (result.ok) { onDone(result); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting;
  const reasonError = useReasonError(form.formState.errors.reason?.message);
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : undefined;
  return <form noValidate aria-label={t('removeTitle')} aria-busy={pending} className="space-y-4" onSubmit={form.handleSubmit(async (input) => { onBusy(true); try { await action.run(handlers.onRemove, input); } finally { onBusy(false); } })}>
    <Field data-invalid={Boolean(reasonError)} className="gap-2">
      <FieldLabel htmlFor={`${id}-reason`}>{t('reason')}</FieldLabel>
      <FieldDescription id={`${id}-hint`}>{t('reasonHint')}</FieldDescription>
      <Textarea {...form.register('reason')} id={`${id}-reason`} rows={3} maxLength={1000} disabled={pending} aria-invalid={Boolean(reasonError)} aria-describedby={`${id}-hint${reasonError ? ` ${id}-error` : ''}`} />
      {reasonError && <FieldError id={`${id}-error`}>{reasonError}</FieldError>}
    </Field>
    <FormFeedback result={feedback} errorMessage={feedback?.code === 'not_allowed' ? t('errors.notAllowed') : undefined} />
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <AlertDialogCancel type="button" disabled={pending} onClick={onCancel}>{t('cancel')}</AlertDialogCancel>
      <Button type="submit" variant="destructive" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{pending ? t('removing') : t('remove', { role: roles(role) })}</Button>
    </div>
  </form>;
}

function ResetForm({ member, handlers, initialReason, initialResult, onCancel, onDone, onBusy }: {
  member: AdminStaffMember; handlers: AdminStaffHandlers; initialReason?: string; initialResult?: ActionResult;
  onCancel: () => void; onDone: (result: ActionResult) => void; onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations('adminStaff');
  const router = useRouter();
  const id = useId();
  const form = useForm<StaffAuthenticatorResetInput>({ resolver: zodResolver(staffAuthenticatorResetInputSchema), defaultValues: { userId: member.person.id, reason: initialReason ?? '' } });
  const action = useFormAction(form, { initialResult, onResult: (result) => { if (result.ok) { onDone(result); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting;
  const reasonError = useReasonError(form.formState.errors.reason?.message);
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : undefined;
  return <form noValidate aria-label={t('authenticator.resetTitle')} aria-busy={pending} className="space-y-4" onSubmit={form.handleSubmit(async (input) => { onBusy(true); try { await action.run(handlers.onResetAuthenticator, input); } finally { onBusy(false); } })}>
    <Field data-invalid={Boolean(reasonError)} className="gap-2">
      <FieldLabel htmlFor={`${id}-reason`}>{t('reason')}</FieldLabel>
      <FieldDescription id={`${id}-hint`}>{t('reasonHint')}</FieldDescription>
      <Textarea {...form.register('reason')} id={`${id}-reason`} rows={3} maxLength={1000} disabled={pending} aria-invalid={Boolean(reasonError)} aria-describedby={`${id}-hint${reasonError ? ` ${id}-error` : ''}`} />
      {reasonError && <FieldError id={`${id}-error`}>{reasonError}</FieldError>}
    </Field>
    <FormFeedback result={feedback} errorMessage={feedback?.code === 'not_allowed' ? t('errors.notAllowed') : undefined} />
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <AlertDialogCancel type="button" disabled={pending} onClick={onCancel}>{t('cancel')}</AlertDialogCancel>
      <Button type="submit" variant="destructive" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'authenticator.resetting' : 'authenticator.resetConfirm')}</Button>
    </div>
  </form>;
}

/** Their authenticator app: its state, a setup code (shown once, here), and a reset. */
function MemberAuthenticator({ member, handlers, code, onCode, onReset, busy }: {
  member: AdminStaffMember; handlers: AdminStaffHandlers; code?: SetupCode;
  onCode: (code: SetupCode) => void; onReset: (trigger: HTMLButtonElement) => void; busy: boolean;
}) {
  const t = useTranslations('adminStaff.authenticator');
  const [giving, setGiving] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = member.authenticator === 'active';
  const Icon = active ? ShieldCheck : ShieldAlert;
  const give = async () => {
    setGiving(true);
    setFailed(false);
    try {
      const result = await handlers.onCreateSetupCode({ userId: member.person.id });
      if (result.ok) onCode({ setupCode: result.setupCode, expiresAt: result.expiresAt });
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setGiving(false);
    }
  };
  return <div className="space-y-3 border-t pt-3">
    <p className="flex items-center gap-2 text-sm"><Icon aria-hidden="true" className={cn('size-4 shrink-0', active ? 'text-success' : 'text-muted-foreground')} />{t(member.authenticator)}</p>
    {code && <div className="space-y-1 rounded-lg border bg-muted/40 p-3">
      <p className="flex items-center gap-2 text-sm font-medium"><KeyRound aria-hidden="true" className="size-4 shrink-0" />{t('codeFor', { name: member.person.displayName })}</p>
      <p className="font-mono text-xl font-semibold tracking-widest tabular-nums select-all">{code.setupCode}</p>
      <p className="text-sm text-muted-foreground">{t('codeHint', { time: formatDateTime(code.expiresAt) })}</p>
    </div>}
    <p role="alert" className={failed ? 'text-sm text-destructive' : 'sr-only'}>{failed ? t('failed') : ''}</p>
    {member.authenticatorActions.length > 0 && <div className="flex flex-wrap gap-2">
      {member.authenticatorActions.includes('setup_code') && <Button type="button" variant="outline" size="sm" disabled={busy || giving} aria-busy={giving} onClick={() => void give()}>{giving && <Spinner aria-hidden="true" />}{t(giving ? 'giving' : 'giveCode')}</Button>}
      {member.authenticatorActions.includes('reset') && <Button type="button" variant="outline" size="sm" disabled={busy || giving} onClick={(event) => onReset(event.currentTarget)}>{t('reset')}</Button>}
    </div>}
  </div>;
}

function MemberRoles({ member, onRemove, busy }: { member: AdminStaffMember; onRemove: (role: StaffRole, trigger: HTMLButtonElement) => void; busy: boolean }) {
  const t = useTranslations('adminStaff');
  const roles = useTranslations('shell.roles');
  return <ul className="space-y-2">{member.roles.map((item) => <li key={item.role} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
    <div className="min-w-0"><p className="font-medium">{roles(item.role)}</p><p className="text-sm text-muted-foreground"><time dateTime={item.grantedAt}>{item.grantedBy ? t('grantedBy', { date: formatDate(item.grantedAt), name: item.grantedBy }) : t('grantedOn', { date: formatDate(item.grantedAt) })}</time></p></div>
    {member.removable.includes(item.role) && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={(event) => onRemove(item.role, event.currentTarget)}>{t('remove', { role: roles(item.role) })}</Button>}
  </li>)}</ul>;
}

/**
 * The staff page's interactive part: add a role, and remove one behind a confirmation with a reason; give
 * someone a setup code for their authenticator app, or reset a lost one (also with a reason).
 */
export function AdminStaffControls({ data, handlers, initialGrantValues, initialGrantResult, initialRemove, initialSetupCode, initialReset }: { data: AdminStaffPageData; handlers: AdminStaffHandlers; now: ISODateTime } & AdminStaffPreviewState) {
  const t = useTranslations('adminStaff');
  const roles = useTranslations('shell.roles');
  const [removing, setRemoving] = useState<{ userId: string; role: StaffRole } | undefined>(initialRemove ? { userId: initialRemove.userId, role: initialRemove.role } : undefined);
  const [resetting, setResetting] = useState<string | undefined>(initialReset?.userId);
  const [codes, setCodes] = useState<Record<string, SetupCode>>(initialSetupCode ? { [initialSetupCode.userId]: { setupCode: initialSetupCode.setupCode, expiresAt: initialSetupCode.expiresAt } } : {});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ result: ActionResult; message: string } | undefined>();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const resultRegion = useRef<HTMLDivElement>(null);
  const member = removing ? data.members.find((item) => item.person.id === removing.userId) : undefined;
  const open = Boolean(member && removing && member.removable.includes(removing.role));
  const resetMember = resetting ? data.members.find((item) => item.person.id === resetting) : undefined;
  const resetOpen = Boolean(resetMember?.authenticatorActions.includes('reset'));
  const closeFocus = (event: Event) => { event.preventDefault(); if (result?.result.ok) resultRegion.current?.focus(); else trigger.current?.focus(); };
  const sheetClass = 'max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none';
  return <div className="space-y-6">
    <GrantForm data={data} handlers={handlers} initialValues={initialGrantValues} initialResult={initialGrantResult} />
    <section aria-labelledby="staff-members" className="space-y-3">
      <h2 id="staff-members" className="font-heading text-xl font-semibold">{t('membersTitle')}</h2>
      <p className="text-sm tabular-nums text-muted-foreground">{t('count', { count: data.members.length, admins: data.adminCount })}</p>
      <div ref={resultRegion} tabIndex={-1} className={result ? 'rounded-lg outline-offset-4' : 'sr-only'}><FormFeedback result={result?.result} successMessage={result?.message} /></div>
      <ul className="grid gap-3 lg:grid-cols-2">{data.members.map((item) => <li key={item.person.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-card">
        <div className="flex items-center gap-3"><InitialsAvatar initials={item.person.initials} size="sm" /><div className="min-w-0"><p className="font-semibold">{item.person.displayName}</p><p className="text-sm break-all text-muted-foreground">{item.person.email}</p></div></div>
        <MemberRoles member={item} busy={busy} onRemove={(role, button) => { trigger.current = button; setResult(undefined); setRemoving({ userId: item.person.id, role }); }} />
        <MemberAuthenticator member={item} handlers={handlers} code={codes[item.person.id]} busy={busy} onCode={(code) => setCodes((all) => ({ ...all, [item.person.id]: code }))} onReset={(button) => { trigger.current = button; setResult(undefined); setResetting(item.person.id); }} />
      </li>)}</ul>
    </section>
    <AlertDialog open={resetOpen} onOpenChange={(next) => { if (!next && !busy) setResetting(undefined); }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onCloseAutoFocus={closeFocus} className={sheetClass}>
        <AlertDialogHeader><AlertDialogTitle>{t('authenticator.resetTitle')}</AlertDialogTitle><AlertDialogDescription>{resetMember ? t('authenticator.resetDescription', { name: resetMember.person.displayName }) : null}</AlertDialogDescription></AlertDialogHeader>
        {resetMember && resetOpen && <ResetForm key={resetMember.person.id} member={resetMember} handlers={handlers} initialReason={initialReset?.reason} initialResult={initialReset?.result} onBusy={setBusy} onCancel={() => setResetting(undefined)} onDone={(next) => { setResult({ result: next, message: t('authenticator.resetDone') }); setCodes(({ [resetMember.person.id]: _dropped, ...rest }) => rest); setResetting(undefined); }} />}
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) setRemoving(undefined); }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onCloseAutoFocus={closeFocus} className={sheetClass}>
        <AlertDialogHeader><AlertDialogTitle>{t('removeTitle')}</AlertDialogTitle><AlertDialogDescription>{member && removing ? t('removeDescription', { name: member.person.displayName, role: roles(removing.role) }) : null}</AlertDialogDescription></AlertDialogHeader>
        {member && removing && open && <RemoveForm key={`${removing.userId}:${removing.role}`} member={member} role={removing.role} handlers={handlers} initialReason={initialRemove?.reason} initialResult={initialRemove?.result} onBusy={setBusy} onCancel={() => setRemoving(undefined)} onDone={(next) => { setResult({ result: next, message: t('removed') }); setRemoving(undefined); }} />}
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
