'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, FileText, Home, Lock, Paperclip, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ADDRESS_DOCUMENT_TYPES,
  ADDRESS_PROOF_RULES,
  type AddressDocumentType,
  type AddressProofResult,
  type AddressSuggestion,
  type BadgeTone,
  type AddressVerificationStatus,
  type FieldErrorCode,
  type HelperOnboardingHandlers,
  type VerificationSummary,
} from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { useRouteDialog } from '@/ui/lib/route-dialog';
import { AddressSearchField } from '@/ui/components/forms/address-search-field';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';

export const addressStatusTones: Record<AddressVerificationStatus, BadgeTone> = {
  not_started: 'neutral', in_review: 'info', verified: 'success', rejected: 'warning', requested: 'warning',
};

type Errors = Partial<Record<'placeId' | 'line2' | 'documentType' | 'declaration' | 'file', FieldErrorCode>>;
const checkboxClass = 'size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * The home address step: where it stands, and the form for a proof of address (an address from search,
 * the unit, the document's type, a photo or PDF, and the declaration). The app checks and stores it;
 * our team reviews it. Clients never see the address. `inDialog` (2026-11-23): the check opened over the page from the
 * verified-helper reminder, under the dialog's own title; sending the proof closes it there.
 */
export function AddressStep({ verification, handlers, initialSuggestions, initialErrors, inDialog = false }: {
  verification: VerificationSummary;
  handlers: Pick<HelperOnboardingHandlers, 'onSearchAddresses' | 'onSubmitAddressProof'>;
  /** Previews: the search open with these. */
  initialSuggestions?: AddressSuggestion[];
  /** Previews: errors as the app returns them. */
  initialErrors?: Errors;
  inDialog?: boolean;
}) {
  const t = useTranslations('verification.homeAddress');
  const status = verification.address.status;
  const update = verification.address.update;
  const showFormAtFirst = status === 'not_started' || status === 'rejected' || status === 'requested' || update?.status === 'rejected' || !!initialErrors || !!initialSuggestions;
  const [formOpen, setFormOpen] = useState(showFormAtFirst);
  const canSubmit = status !== 'in_review' && update?.status !== 'in_review';

  return <section {...(inDialog ? { 'aria-label': t('title') } : { 'aria-labelledby': 'address-step-title' })} className={inDialog ? 'space-y-5' : 'space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6'}>
    {inDialog
      ? <StatusBadge tone={addressStatusTones[status]} label={t(`statuses.${status}`)} />
      : <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Home aria-hidden="true" className="size-5" /></span>
          <h2 id="address-step-title" className="font-heading text-lg font-semibold">{t('title')}</h2>
        </div>
        <StatusBadge tone={addressStatusTones[status]} label={t(`statuses.${status}`)} />
      </div>}

    <AddressStanding verification={verification} />

    {canSubmit && (formOpen
      ? <ProofForm handlers={handlers} initialSuggestions={initialSuggestions} initialErrors={initialErrors} />
      : <Button type="button" variant="outline" className="w-full whitespace-normal sm:w-auto" onClick={() => setFormOpen(true)}>{t('moving')}</Button>)}
    <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>
  </section>;
}

function AddressStanding({ verification }: { verification: VerificationSummary }) {
  const { formatDate } = useFormat();
  const t = useTranslations('verification.homeAddress');
  const { status, label, verifiedAt, submittedAt, rejectionReason, update, recheck } = verification.address;
  return <div className="space-y-3 text-sm leading-6">
    {status === 'not_started' && <p className="text-muted-foreground">{t('explanation')}</p>}
    {status === 'requested' && <p className="flex items-start gap-2 rounded-lg bg-badge-warning p-3 text-badge-warning-foreground"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('requested')}</p>}
    {status === 'in_review' && <div className="space-y-2 rounded-lg bg-badge-info p-3 text-badge-info-foreground">
      <p className="flex items-start gap-2 font-medium"><Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('inReview')}</p>
      {/* Back with our team because the ID's legal name differs (ab, 2026-11-21): why, and that there's nothing to do. */}
      {recheck === 'name_differs' && <p>{t('recheckNameDiffers')}</p>}
      {submittedAt && <p>{t('sentAt', { date: formatDate(submittedAt) })}</p>}
    </div>}
    {status === 'rejected' && <p className="flex items-start gap-2 rounded-lg bg-badge-warning p-3 text-badge-warning-foreground"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(`rejectionReasons.${rejectionReason ?? 'other'}`)}</p>}
    {status === 'verified' && <p className="flex items-start gap-2 rounded-lg bg-badge-success p-3 text-badge-success-foreground"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{verifiedAt ? t('verifiedAt', { date: formatDate(verifiedAt) }) : t('verified')}</p>}
    {label && status !== 'not_started' && <p className="break-words"><span className="font-medium">{t('onFile')}</span> {label}</p>}
    {update?.status === 'in_review' && <p className="flex items-start gap-2 rounded-lg bg-badge-info p-3 text-badge-info-foreground"><Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('updateInReview')}</p>}
    {update?.status === 'rejected' && <p className="flex items-start gap-2 rounded-lg bg-badge-warning p-3 text-badge-warning-foreground"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('updateRejected', { reason: t(`rejectionReasons.${update.rejectionReason ?? 'other'}`) })}</p>}
  </div>;
}

function ProofForm({ handlers, initialSuggestions, initialErrors }: {
  handlers: Pick<HelperOnboardingHandlers, 'onSearchAddresses' | 'onSubmitAddressProof'>;
  initialSuggestions?: AddressSuggestion[];
  initialErrors?: Errors;
}) {
  const t = useTranslations('verification.homeAddress');
  const fields = useTranslations('forms');
  const router = useRouter();
  const dialog = useRouteDialog();
  const id = useId();
  const [address, setAddress] = useState<AddressSuggestion>();
  const [unit, setUnit] = useState('');
  const [documentType, setDocumentType] = useState<AddressDocumentType>();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [declared, setDeclared] = useState(false);
  const [errors, setErrors] = useState<Errors>(initialErrors ?? {});
  const [failure, setFailure] = useState<Exclude<AddressProofResult, { ok: true } | { code: 'validation_failed' }>['code']>();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | undefined>(undefined);

  // The local preview's object URL is let go when the form goes away.
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  function pick(files: FileList | null) {
    const chosen = files?.[0];
    if (!chosen) return;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = chosen.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(chosen) : undefined;
    setPreview(previewUrl.current);
    setFile(chosen);
    setFailure(undefined);
    setErrors((current) => ({ ...current, file: undefined }));
  }

  async function submit() {
    if (pending) return;
    const next: Errors = {};
    if (!address) next.placeId = 'required';
    if (!documentType) next.documentType = 'required';
    if (!file) next.file = 'required';
    if (!declared) next.declaration = 'must_accept';
    setErrors(next);
    setFailure(undefined);
    if (Object.keys(next).length > 0) {
      if (next.placeId) searchRef.current?.focus();
      else if (next.file) fileRef.current?.focus();
      return;
    }
    const form = new FormData();
    form.set('placeId', address!.placeId);
    if (unit.trim()) form.set('line2', unit.trim());
    form.set('documentType', documentType!);
    form.set('declaration', 'true');
    form.set('file', file!);
    setPending(true);
    let result: AddressProofResult;
    try {
      result = await handlers.onSubmitAddressProof(form);
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    setPending(false);
    if (result.ok) {
      setSent(true);
      // In the check's dialog (2026-11-23): it closes over the page, which shows the address as sent; on setup's own
      // page, setup goes on to its next step.
      if (dialog) dialog.finish(result, t('sent'));
      else if (result.redirectTo) router.push(result.redirectTo);
      else router.refresh();
      return;
    }
    if (result.code === 'validation_failed') {
      const mapped: Errors = {};
      for (const [field, codes] of Object.entries(result.fieldErrors)) if (codes?.[0]) mapped[field as keyof Errors] = codes[0];
      setErrors(mapped);
      return;
    }
    setFailure(result.code);
  }

  const errorText = (field: keyof Errors) => {
    const code = errors[field];
    if (!code) return undefined;
    if (field === 'placeId') return code === 'not_supported' ? t('outOfArea') : t('errors.placeId');
    if (field === 'file') return t(code === 'invalid' ? 'errors.fileInvalid' : 'errors.fileRequired');
    if (field === 'documentType') return t('errors.documentType');
    if (field === 'declaration') return t('errors.declaration');
    return fields(`fieldErrors.${fields.has(`fieldErrors.${code}`) ? code : 'invalid'}`);
  };

  return <form noValidate aria-busy={pending} className="space-y-6 border-t pt-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <p className="text-sm leading-6 text-muted-foreground">{t('rules', { days: ADDRESS_PROOF_RULES.maxAgeDays, megabytes: ADDRESS_PROOF_RULES.maxMegabytes })}</p>
    <fieldset disabled={pending || sent} className="space-y-6">
      <legend className="sr-only">{t('formTitle')}</legend>
      <AddressSearchField
        label={t('search')}
        hint={t('searchHint')}
        onSearch={handlers.onSearchAddresses}
        selected={address}
        onSelect={(next) => { setAddress(next); setErrors((current) => ({ ...current, placeId: undefined })); }}
        error={errorText('placeId')}
        outOfAreaMessage={t('outOfArea')}
        inputRef={searchRef}
        initialSuggestions={initialSuggestions}
      />
      <Field className="gap-2">
        <FieldLabel htmlFor={`${id}-unit`}>{t('unit')}</FieldLabel>
        <Input id={`${id}-unit`} value={unit} maxLength={40} autoComplete="address-line2" onChange={(event) => setUnit(event.target.value)} aria-describedby={`${id}-unit-hint`} />
        <FieldDescription id={`${id}-unit-hint`}>{t('unitHint')}</FieldDescription>
      </Field>
      <fieldset className="space-y-3" aria-invalid={!!errors.documentType} aria-describedby={errors.documentType ? `${id}-type-error` : undefined}>
        <legend className="mb-1 font-medium">{t('documentType')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ADDRESS_DOCUMENT_TYPES.map((type) => <label key={type} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm', documentType === type ? 'border-primary bg-secondary text-secondary-foreground' : 'bg-card')}>
            <input type="radio" name={`${id}-type`} value={type} checked={documentType === type} onChange={() => { setDocumentType(type); setErrors((current) => ({ ...current, documentType: undefined })); }} className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            <span className="font-medium">{t(`documentTypes.${type}`)}</span>
          </label>)}
        </div>
        {errors.documentType && <FieldError id={`${id}-type-error`}>{errorText('documentType')}</FieldError>}
      </fieldset>
      <Field className="gap-2" data-invalid={!!errors.file}>
        <FieldLabel id={`${id}-file-label`} htmlFor={`${id}-file`}>{t('file')}</FieldLabel>
        <div className={cn('flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-3 sm:p-4', errors.file && 'border-destructive')}>
          <input ref={fileRef} id={`${id}-file`} type="file" accept={ADDRESS_PROOF_RULES.acceptedTypes.join(',')} aria-labelledby={`${id}-file-label`} aria-describedby={`${id}-file-hint${errors.file ? ` ${id}-file-error` : ''}`} aria-invalid={!!errors.file || undefined} className="peer sr-only" onChange={(event) => pick(event.target.files)} />
          <label htmlFor={`${id}-file`} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50">
            <Paperclip aria-hidden="true" className="size-4" />{file ? t('chooseAnother') : t('choose')}
          </label>
          {file && <div className="flex w-full min-w-0 items-center gap-3">
            {preview
              // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
              ? <img src={preview} alt={t('previewAlt')} className="size-16 shrink-0 rounded-lg border object-cover" />
              : <span className="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-secondary"><FileText aria-hidden="true" className="size-6" /></span>}
            <p className="min-w-0 break-words text-sm"><span className="font-medium">{file.name}</span><span className="block text-muted-foreground tabular-nums">{t('fileSize', { size: Math.max(0.1, Math.round((file.size / 1024 / 1024) * 10) / 10) })}</span></p>
          </div>}
        </div>
        <FieldDescription id={`${id}-file-hint`}>{t('fileHint')}</FieldDescription>
        {errors.file && <FieldError id={`${id}-file-error`}>{errorText('file')}</FieldError>}
      </Field>
      <div className="space-y-2">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 text-sm leading-6">
          <input type="checkbox" checked={declared} onChange={(event) => { setDeclared(event.target.checked); setErrors((current) => ({ ...current, declaration: undefined })); }} aria-invalid={!!errors.declaration || undefined} aria-describedby={errors.declaration ? `${id}-declaration-error` : undefined} className={`${checkboxClass} mt-0.5`} />
          <span>{t('declaration', { days: ADDRESS_PROOF_RULES.maxAgeDays })}</span>
        </label>
        {errors.declaration && <FieldError id={`${id}-declaration-error`}>{errorText('declaration')}</FieldError>}
      </div>
    </fieldset>
    <div role="status" aria-live="polite">
      {failure && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t(`errors.${failure}`, { megabytes: ADDRESS_PROOF_RULES.maxMegabytes })}</p>}
      {sent && <p className="rounded-lg bg-badge-success p-3 text-sm text-badge-success-foreground">{t('sent')}</p>}
    </div>
    <Button type="submit" disabled={pending || sent} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{pending ? t('sending') : t('submit')}</Button>
  </form>;
}
