'use client';

import { useId, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, LockKeyhole, ShieldCheck } from 'lucide-react';
import {
  ADDRESS_REJECTION_REASONS,
  type ActionResult,
  type AddressAutoCheck,
  type AddressProofRevealResult,
  type AddressRejectionReason,
  type AdminAddressProofView,
  type AdminPersonVerification,
  type AdminVerificationActionId,
  type AdminVerificationHandlers,
  type ISODateTime,
} from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { addressStatusTones } from '../helper/address-step';
import { backgroundStatusTones, identityStatusTones, payoutStatusTones } from '../helper/verification-panel';

type OtherAction = Exclude<AdminVerificationActionId, 'review_address'>;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-1 border-t py-3 first:border-t-0 sm:grid-cols-[12rem_1fr] sm:gap-4"><dt className="text-sm font-medium text-muted-foreground">{label}</dt><dd className="min-w-0 space-y-1 text-sm">{children}</dd></div>;
}

function AutoCheck({ check }: { check: AddressAutoCheck }) {
  const t = useTranslations('adminVerification.autoCheck');
  if (!check.readable) return <p className="text-sm text-muted-foreground">{t('unreadable')}</p>;
  const answer = (value: boolean | undefined) => (value === undefined ? t('unknown') : value ? t('yes') : t('no'));
  return <ul aria-label={t('title')} className="flex flex-wrap gap-2 text-xs">
    <li className="rounded-full border px-2.5 py-1">{t('name', { answer: answer(check.nameMatches) })}</li>
    <li className="rounded-full border px-2.5 py-1">{t('address', { answer: answer(check.addressMatches) })}</li>
    <li className="rounded-full border px-2.5 py-1">{t('recent', { answer: answer(check.recent) })}</li>
  </ul>;
}

/** A person's verification, as staff see it: statuses, the proofs of address, and the decisions the app allows. */
export function AdminVerificationSection({ userId, verification, handlers, now, initialRevealed }: {
  userId: string;
  verification: AdminPersonVerification;
  handlers: AdminVerificationHandlers;
  now: ISODateTime;
  /** Previews: a proof already opened. */
  initialRevealed?: { proofId: string; result: Extract<AddressProofRevealResult, { ok: true }> };
}) {
  const { formatDate, formatDateTime, formatRelative } = useFormat();
  const t = useTranslations('adminVerification');
  const status = useTranslations('verification.statuses');
  const home = useTranslations('verification.homeAddress');
  const { phone, agreement, identity, address, payout, background } = verification;
  const [reveal, setReveal] = useState<AdminAddressProofView>();
  const [revealed, setRevealed] = useState(initialRevealed);
  const [decide, setDecide] = useState<AdminAddressProofView>();
  const [other, setOther] = useState<OtherAction>();
  const [result, setResult] = useState<ActionResult>();
  const otherActions = verification.actions.filter((action): action is OtherAction => action !== 'review_address');
  const canOpen = verification.actions.includes('review_address') || verification.actions.includes('request_address');

  return <section aria-labelledby={`verification-${userId}`} className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-5">
    <h2 id={`verification-${userId}`} className="flex items-center gap-2 font-heading text-xl font-semibold"><ShieldCheck aria-hidden="true" className="size-5 shrink-0" />{t('title')}</h2>
    <p className="text-sm text-muted-foreground">{t('intro')}</p>
    <dl>
      <Row label={t('phone')}>{phone.verified ? <p>{t('phoneVerified', { last4: phone.last4 ?? '' })}{phone.verifiedAt ? ` · ${formatDate(phone.verifiedAt)}` : ''}</p> : <p className="text-muted-foreground">{phone.last4 ? t('phoneUnverified', { last4: phone.last4 }) : t('phoneMissing')}</p>}</Row>
      <Row label={t('agreement')}>{agreement ? <p>{t('agreementAccepted', { version: agreement.version, date: formatDate(agreement.acceptedAt) })}</p> : <p className="text-muted-foreground">{t('agreementMissing')}</p>}</Row>
      <Row label={t('identity')}>
        <StatusBadge tone={identity.blocked ? 'warning' : identity.nameMatches === false && !identity.nameConfirmedAt ? 'info' : identityStatusTones[identity.status]} label={status(`identity.${identity.status}`)} />
        {identity.verifiedAt && <p>{t('verifiedOn', { date: formatDate(identity.verifiedAt) })}</p>}
        {identity.failureReason && <p>{t(`identityFailure.${identity.failureReason}`)}</p>}
        <p className="tabular-nums">{t('attempts', { count: identity.attempts })}</p>
        {identity.nameMatches === false && <p className="font-medium">{identity.nameConfirmedAt ? t('nameConfirmed', { date: formatDate(identity.nameConfirmedAt) }) : t('nameDiffers')}</p>}
        {identity.blocked && <p className="font-medium">{t(`identityBlocked.${identity.blocked}`)}</p>}
        {identity.requested && <p>{t(`identityRequested.${identity.requested}`)}</p>}
        {identity.consentAt && <p className="text-muted-foreground">{t('consentAt', { date: formatDateTime(identity.consentAt) })}</p>}
        {identity.redactionRequestedAt && <p className="text-muted-foreground">{t('redaction', { date: formatDate(identity.redactionRequestedAt) })}</p>}
      </Row>
      <Row label={t('address')}>
        <StatusBadge tone={addressStatusTones[address.status]} label={home(`statuses.${address.status}`)} />
        {address.verifiedAt && <p>{t('verifiedOn', { date: formatDate(address.verifiedAt) })}</p>}
        {address.proofs.length === 0 ? <p className="text-muted-foreground">{t('noProofs')}</p> : <ul aria-label={t('proofs')} className="space-y-3 pt-1">
          {address.proofs.map((proof) => <li key={proof.id} className="space-y-2 rounded-lg border bg-background p-3">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={addressStatusTones[proof.status]} label={home(`statuses.${proof.status}`)} />{proof.documentType && <span className="text-sm">{home(`documentTypes.${proof.documentType}`)}</span>}</div>
            {proof.submittedAt && <p className="tabular-nums"><time dateTime={proof.submittedAt} title={formatRelative(proof.submittedAt, now)}>{t('sentOn', { date: formatDateTime(proof.submittedAt) })}</time></p>}
            {proof.areaName && <p>{t('near', { area: proof.areaName })}</p>}
            {proof.autoCheck && <AutoCheck check={proof.autoCheck} />}
            {proof.decidedAt && <p>{t('decided', { date: formatDateTime(proof.decidedAt), name: proof.decidedBy ?? t('staff') })}</p>}
            {proof.rejectionReason && <p>{t('rejectedFor', { reason: t(`rejectionReasons.${proof.rejectionReason}`) })}</p>}
            {proof.status === 'requested' && <p className="text-muted-foreground">{t('requestedRow')}</p>}
            <p className="text-muted-foreground">{proof.documentAvailable ? t('documentKept') : proof.documentDeletedAt ? t('documentDeleted', { date: formatDate(proof.documentDeletedAt) }) : t('documentNone')}</p>
            {revealed?.proofId === proof.id && <div className="space-y-2 rounded-lg border border-primary/40 p-3">
              <p role="status" className="flex items-center gap-2 font-medium text-success"><LockKeyhole aria-hidden="true" className="size-4" />{t('reveal.logged')}</p>
              <p className="break-words"><span className="font-medium">{t('reveal.address')}</span> {revealed.result.address}</p>
              {revealed.result.document?.kind === 'image' && <a href={revealed.result.document.url} target="_blank" rel="noreferrer noopener" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived staff link, never cached */}
                <img src={revealed.result.document.url} alt={t('reveal.documentAlt')} className="max-h-[32rem] w-full rounded-lg border object-contain" />
              </a>}
              {revealed.result.document?.kind === 'pdf' && <a href={revealed.result.document.url} className="inline-flex min-h-11 items-center gap-2 font-medium text-primary underline underline-offset-4"><Download aria-hidden="true" className="size-4" />{t('reveal.downloadPdf')}</a>}
              <p className="text-muted-foreground tabular-nums">{t('reveal.expires', { time: formatDateTime(revealed.result.expiresAt) })}</p>
            </div>}
            {(canOpen || proof.status === 'in_review') && proof.documentAvailable && verification.actions.length > 0 && <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setReveal(proof)}>{t('reveal.open')}</Button>
              {proof.status === 'in_review' && verification.actions.includes('review_address') && <Button type="button" size="sm" onClick={() => setDecide(proof)}>{t('decide.open')}</Button>}
            </div>}
          </li>)}
        </ul>}
      </Row>
      <Row label={t('payout')}><StatusBadge tone={payoutStatusTones[payout.status]} label={status(`payout.${payout.status}`)} /></Row>
      <Row label={t('background')}>
        <StatusBadge tone={background.adjudication === 'engaged' ? 'success' : background.adjudication === 'post_adverse' ? 'danger' : backgroundStatusTones[background.status]} label={background.adjudication ? status(`backgroundAdjudication.${background.adjudication}`) : status(`background.${background.status}`)} />
        {background.completedAt && <p>{t('completedOn', { date: formatDate(background.completedAt) })}</p>}
        {background.validUntil && <p>{t('validUntil', { date: formatDate(background.validUntil) })}</p>}
        {background.finalDecisionFrom && <p className="font-medium">{t('finalDecisionFrom', { date: formatDateTime(background.finalDecisionFrom) })}</p>}
        {background.requiredFor.length > 0 && <p>{t('requiredFor', { count: background.requiredFor.length })}</p>}
        {background.disclosureAt && <p className="text-muted-foreground">{t('disclosureAt', { date: formatDateTime(background.disclosureAt) })}</p>}
      </Row>
    </dl>
    {otherActions.length > 0 ? <div role="group" aria-label={t('actionsLabel')} className="flex flex-wrap gap-2 border-t pt-4">
      {otherActions.map((action) => <Button key={action} type="button" variant={action === 'post_adverse_background' ? 'destructive' : 'outline'} onClick={() => { setResult(undefined); setOther(action); }}>{t(`actions.${action}`)}</Button>)}
    </div> : verification.actions.length === 0 && <p className="border-t pt-4 text-sm text-muted-foreground">{t('readOnly')}</p>}
    <div role="status" aria-live="polite"><FormFeedback result={result} successMessage={t('updated')} /></div>

    <RevealDialog proof={reveal} onClose={() => setReveal(undefined)} onReveal={handlers.onRevealAddressProof} onRevealed={(proofId, value) => { setRevealed({ proofId, result: value }); setReveal(undefined); }} />
    <DecideDialog proof={decide} onClose={() => setDecide(undefined)} onDecide={handlers.onDecideAddress} onDone={(value) => { setResult(value); setDecide(undefined); }} />
    <ActionDialog userId={userId} action={other} onClose={() => setOther(undefined)} onAction={handlers.onVerificationAction} onDone={(value) => { setResult(value); setOther(undefined); }} />
  </section>;
}

function NoteField({ id, label, hint, value, onChange, error, disabled }: { id: string; label: string; hint: string; value: string; onChange: (value: string) => void; error?: string; disabled: boolean }) {
  return <Field data-invalid={Boolean(error)} className="gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
    <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={4} maxLength={1000} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} />
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </Field>;
}

function RevealDialog({ proof, onClose, onReveal, onRevealed }: {
  proof?: AdminAddressProofView;
  onClose: () => void;
  onReveal: AdminVerificationHandlers['onRevealAddressProof'];
  onRevealed: (proofId: string, result: Extract<AddressProofRevealResult, { ok: true }>) => void;
}) {
  const t = useTranslations('adminVerification.reveal');
  const id = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ActionResult>();
  async function submit() {
    if (!proof || pending) return;
    if (reason.trim().length < 10) { setError(t('reasonRequired')); return; }
    setError(undefined);
    setPending(true);
    let result: AddressProofRevealResult;
    try { result = await onReveal({ verificationId: proof.id, reason: reason.trim() }); } catch { result = { ok: false, code: 'unknown' }; }
    setPending(false);
    if (result.ok) { setReason(''); onRevealed(proof.id, result); return; }
    setFailure({ ok: false, code: result.code === 'validation_failed' ? 'validation_failed' : result.code });
  }
  return <Dialog open={proof !== undefined} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t('title')}</DialogTitle><DialogDescription>{t('description')}</DialogDescription></DialogHeader>
      <form noValidate className="space-y-4" aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <NoteField id={`${id}-reason`} label={t('reason')} hint={t('reasonHint')} value={reason} onChange={setReason} error={error} disabled={pending} />
        <FormFeedback result={failure} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t('cancel')}</Button><Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t('submit')}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function DecideDialog({ proof, onClose, onDecide, onDone }: {
  proof?: AdminAddressProofView;
  onClose: () => void;
  onDecide: AdminVerificationHandlers['onDecideAddress'];
  onDone: (result: ActionResult) => void;
}) {
  const t = useTranslations('adminVerification.decide');
  const reasons = useTranslations('adminVerification.rejectionReasons');
  const router = useRouter();
  const id = useId();
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [reason, setReason] = useState<AddressRejectionReason>();
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; note?: string }>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ActionResult>();
  async function submit() {
    if (!proof || pending) return;
    const next: { reason?: string; note?: string } = {};
    if (decision === 'reject' && !reason) next.reason = t('reasonRequired');
    if (note.trim().length < 10) next.note = t('noteRequired');
    setErrors(next);
    if (Object.keys(next).length) return;
    setPending(true);
    let result: ActionResult;
    try { result = await onDecide({ verificationId: proof.id, decision, ...(decision === 'reject' && reason ? { reason } : {}), note: note.trim() }); } catch { result = { ok: false, code: 'unknown' }; }
    setPending(false);
    if (result.ok) { setNote(''); onDone(result); router.refresh(); return; }
    setFailure(result);
  }
  return <Dialog open={proof !== undefined} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t('title')}</DialogTitle><DialogDescription>{t('description')}</DialogDescription></DialogHeader>
      <form noValidate className="space-y-4" aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <fieldset className="space-y-2" disabled={pending}>
          <legend className="font-medium">{t('decision')}</legend>
          {(['approve', 'reject'] as const).map((value) => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm">
            <input type="radio" name={`${id}-decision`} value={value} checked={decision === value} onChange={() => setDecision(value)} className="size-4 accent-primary" />{t(value)}
          </label>)}
        </fieldset>
        {decision === 'reject' && <Field data-invalid={Boolean(errors.reason)} className="gap-2">
          <FieldLabel htmlFor={`${id}-reason`}>{t('reason')}</FieldLabel>
          <select id={`${id}-reason`} value={reason ?? ''} disabled={pending} onChange={(event) => setReason(event.target.value as AddressRejectionReason)} aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? `${id}-reason-error` : undefined} className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base">
            <option value="" disabled>{t('choose')}</option>
            {ADDRESS_REJECTION_REASONS.map((value) => <option key={value} value={value}>{reasons(value)}</option>)}
          </select>
          {errors.reason && <FieldError id={`${id}-reason-error`}>{errors.reason}</FieldError>}
        </Field>}
        <NoteField id={`${id}-note`} label={t('note')} hint={t('noteHint')} value={note} onChange={setNote} error={errors.note} disabled={pending} />
        <FormFeedback result={failure} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t('cancel')}</Button><Button type="submit" variant={decision === 'reject' ? 'destructive' : 'default'} disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(decision === 'approve' ? 'submitApprove' : 'submitReject')}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function ActionDialog({ userId, action, onClose, onAction, onDone }: {
  userId: string;
  action?: OtherAction;
  onClose: () => void;
  onAction: AdminVerificationHandlers['onVerificationAction'];
  onDone: (result: ActionResult) => void;
}) {
  const t = useTranslations('adminVerification');
  const router = useRouter();
  const id = useId();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ActionResult>();
  async function submit() {
    if (!action || pending) return;
    if (note.trim().length < 10) { setError(t('decide.noteRequired')); return; }
    setError(undefined);
    setPending(true);
    let result: ActionResult;
    try { result = await onAction({ userId, action, note: note.trim() }); } catch { result = { ok: false, code: 'unknown' }; }
    setPending(false);
    if (result.ok) { setNote(''); onDone(result); router.refresh(); return; }
    setFailure(result);
  }
  return <Dialog open={action !== undefined} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{action ? t(`actions.${action}`) : ''}</DialogTitle><DialogDescription>{action ? t(`actionHints.${action}`) : ''}</DialogDescription></DialogHeader>
      <form noValidate className="space-y-4" aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <NoteField id={`${id}-note`} label={t('decide.note')} hint={t('decide.noteHint')} value={note} onChange={setNote} error={error} disabled={pending} />
        <FormFeedback result={failure} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t('decide.cancel')}</Button><Button type="submit" variant={action === 'post_adverse_background' ? 'destructive' : 'default'} disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{action ? t(`actions.${action}`) : ''}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
