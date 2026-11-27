'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, LockKeyhole, ShieldCheck } from 'lucide-react';
import {
  ADDRESS_REJECTION_REASONS,
  IDENTITY_CAPTURE_REJECTION_REASONS,
  routes,
  type ActionResult,
  type AddressAutoCheck,
  type AddressProofRevealResult,
  type AddressRejectionReason,
  type AdminAddressProofView,
  type AdminIdentityCaptureView,
  type AdminPersonVerification,
  type AdminVerificationActionId,
  type AdminVerificationHandlers,
  type BadgeTone,
  type IdentityAutoCheck,
  type IdentityCaptureRejectionReason,
  type IdentityCaptureDetails,
  type IdentityCaptureRevealResult,
  type IdentityCaptureStatus,
  type IdentityDetailsRevealResult,
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
import { addressStatusTones, backgroundStatusTones, identityStatusTones, payoutStatusTones } from '@/ui/components/status/verification-tones';

/** The actions with their own buttons on a proof or a capture; the rest are buttons under the section. */
type OtherAction = Exclude<AdminVerificationActionId, 'review_address' | 'review_identity_capture' | 'view_identity_photos'>;
const OWN_BUTTONS: readonly AdminVerificationActionId[] = ['review_address', 'review_identity_capture', 'view_identity_photos'];

export const identityCaptureTones: Record<IdentityCaptureStatus, BadgeTone> = { submitted: 'info', approved: 'success', rejected: 'warning', canceled: 'neutral' };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-1 border-t py-3 first:border-t-0 sm:grid-cols-[12rem_1fr] sm:gap-4"><dt className="text-sm font-medium text-muted-foreground">{label}</dt><dd className="min-w-0 space-y-1 text-sm">{children}</dd></div>;
}

function AutoCheck({ check }: { check: AddressAutoCheck }) {
  const t = useTranslations('adminVerification.autoCheck');
  if (!check.readable && !check.checks) return <p className="text-sm text-muted-foreground">{t('unreadable')}</p>;
  const answer = (value: boolean | undefined) => (value === undefined ? t('unknown') : value ? t('yes') : t('no'));
  const tone: Record<string, string> = { pass: 'text-success', fail: 'text-destructive', unsure: 'text-warning', skipped: 'text-muted-foreground' };
  return <>
    <ul aria-label={t('title')} className="flex flex-wrap gap-2 text-xs">
      <li className="rounded-full border px-2.5 py-1">{t('name', { answer: answer(check.nameMatches) })}</li>
      <li className="rounded-full border px-2.5 py-1">{t('address', { answer: answer(check.addressMatches) })}</li>
      <li className="rounded-full border px-2.5 py-1">{t('recent', { answer: answer(check.recent) })}</li>
      {check.issuer && <li className="rounded-full border px-2.5 py-1">{t('issuer', { issuer: check.issuer })}</li>}
      {check.documentDate && <li className="rounded-full border px-2.5 py-1 tabular-nums">{t('documentDate', { date: check.documentDate })}</li>}
    </ul>
    {/* The checks our server ran (2026-11-27): the decision, each check in words, the findings behind them. */}
    {check.checks && <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
      {check.decision && <p className="font-medium">{t('decision', { decision: t(`decisions.${check.decision}`) })}</p>}
      <ul aria-label={t('checksTitle')} className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {check.checks.map((item) => <li key={item.key} className="flex items-baseline justify-between gap-2"><span>{t(`checks.${item.key}`)}</span><span className={`shrink-0 font-medium ${tone[item.outcome] ?? ''}`}>{t(`outcomes.${item.outcome}`)}</span></li>)}
      </ul>
      {check.signals && check.signals.length > 0 && <div><p className="font-medium">{t('signalsTitle')}</p><ul className="list-disc space-y-0.5 pl-5">{check.signals.map((signal) => <li key={signal}>{t(`signals.${signal}`)}</li>)}</ul></div>}
    </div>}
  </>;
}

/** The automatic checks (2026-11-27): the decision, each check's outcome in words, the findings, the face and liveness scores. */
function IdChecks({ check }: { check: IdentityAutoCheck }) {
  const t = useTranslations('adminVerification.capture.autoCheck');
  if (!check.checks) return null;
  const tone: Record<string, string> = { pass: 'text-success', fail: 'text-destructive', unsure: 'text-warning', skipped: 'text-muted-foreground' };
  return <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
    {check.decision && <p className="font-medium">{t('decision', { decision: t(`decisions.${check.decision}`) })}</p>}
    <ul aria-label={t('checksTitle')} className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
      {check.checks.map((item) => <li key={item.key} className="flex items-baseline justify-between gap-2"><span>{t(`checks.${item.key}`)}</span><span className={`shrink-0 font-medium ${tone[item.outcome] ?? ''}`}>{t(`outcomes.${item.outcome}`)}</span></li>)}
    </ul>
    {check.face && <p className="tabular-nums">{t('face', { score: check.face.similarity.toFixed(2), matchAt: check.face.matchAt.toFixed(2), below: check.face.mismatchBelow.toFixed(2) })}</p>}
    {check.liveness !== undefined && <p className="tabular-nums text-muted-foreground">{t('liveness', { score: check.liveness.toFixed(2) })}</p>}
    {check.signals && check.signals.length > 0 && <div><p className="font-medium">{t('signalsTitle')}</p><ul className="list-disc space-y-0.5 pl-5">{check.signals.map((signal) => <li key={signal}>{t(`signals.${signal}`)}</li>)}</ul></div>}
  </div>;
}

function IdAutoCheck({ check }: { check: IdentityAutoCheck }) {
  const t = useTranslations('adminVerification');
  if (!check.readable) return <><p className="text-sm text-muted-foreground">{t('capture.autoCheck.unreadable')}</p><IdChecks check={check} /></>;
  const answer = (value: boolean | undefined) => (value === undefined ? t('autoCheck.unknown') : value ? t('autoCheck.yes') : t('autoCheck.no'));
  return <><ul aria-label={t('capture.autoCheck.title')} className="flex flex-wrap gap-2 text-xs">
    <li className="rounded-full border px-2.5 py-1">{t('capture.autoCheck.name', { answer: answer(check.nameMatches) })}</li>
    <li className="rounded-full border px-2.5 py-1">{t('capture.autoCheck.adult', { answer: answer(check.isAdult) })}</li>
    <li className="rounded-full border px-2.5 py-1">{t('capture.autoCheck.notExpired', { answer: answer(check.notExpired) })}</li>
    {check.expires && <li className="rounded-full border px-2.5 py-1 tabular-nums">{t('capture.autoCheck.expires', { month: check.expires.month, year: check.expires.year })}</li>}
    {check.documentType && <li className="rounded-full border px-2.5 py-1">{t('capture.autoCheck.documentType', { type: check.documentType === 'other' ? t('capture.autoCheck.other') : t(`capture.documentTypes.${check.documentType}`) })}</li>}
    {check.addressMatches !== undefined && <li className="rounded-full border px-2.5 py-1">{t('capture.autoCheck.address', { answer: answer(check.addressMatches) })}</li>}
    {check.source && <li className="rounded-full border px-2.5 py-1">{t(`capture.autoCheck.source.${check.source}`)}</li>}
    {check.frontAgrees !== undefined && <li className="rounded-full border px-2.5 py-1">{t('capture.autoCheck.frontAgrees', { answer: answer(check.frontAgrees) })}</li>}
  </ul><IdChecks check={check} /></>;
}

/** Our own ID check's tries (stage 1): what was sent, the automatic reading, the decision, and the photos once opened. */
function CaptureList({ captures, canView, canReview, revealed, detailsRevealed, onOpen, onDetails, onReview, now }: {
  captures: AdminIdentityCaptureView[];
  canView: boolean;
  canReview: boolean;
  revealed?: { captureId: string; result: Extract<IdentityCaptureRevealResult, { ok: true }> };
  detailsRevealed?: { captureId: string; details: IdentityCaptureDetails };
  onOpen: (capture: AdminIdentityCaptureView) => void;
  onDetails: (capture: AdminIdentityCaptureView) => void;
  onReview: (capture: AdminIdentityCaptureView) => void;
  now: ISODateTime;
}) {
  const { formatDate, formatDateTime, formatRelative } = useFormat();
  const t = useTranslations('adminVerification');
  // Clients, and helpers verified before our own check existed, have none.
  if (captures.length === 0) return null;
  return <div className="space-y-2 pt-1">
    <p className="font-medium">{t('capture.title')}</p>
    <ul aria-label={t('capture.title')} className="space-y-3">
      {captures.map((capture) => <li key={capture.id} className="space-y-2 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={identityCaptureTones[capture.status]} label={t(`capture.statuses.${capture.status}`)} /><span className="text-sm">{t(`capture.documentTypes.${capture.documentType}`)}</span></div>
        <p className="tabular-nums"><time dateTime={capture.submittedAt} title={formatRelative(capture.submittedAt, now)}>{t('capture.sentOn', { date: formatDateTime(capture.submittedAt) })}</time></p>
        <p>{t('capture.prompt', { prompt: t(`capture.prompts.${capture.prompt}`) })}</p>
        {capture.autoCheck && <IdAutoCheck check={capture.autoCheck} />}
        {capture.reading && <p className={capture.reading.state === 'skipped' ? 'font-medium text-warning' : 'text-muted-foreground'}>{capture.reading.state === 'waiting' ? t('capture.reading.waiting', { time: formatDateTime(capture.reading.until) }) : t(`capture.reading.${capture.reading.why}`)}</p>}
        {capture.decidedAt && <p>{capture.decidedByKind === 'auto' ? t('capture.decidedAuto', { date: formatDateTime(capture.decidedAt) }) : t('capture.decided', { date: formatDateTime(capture.decidedAt), name: capture.decidedBy ?? t('staff') })}</p>}
        {capture.rejectionReason && <p>{t('capture.rejectedFor', { reason: t(`capture.rejectionReasons.${capture.rejectionReason}`) })}</p>}
        {capture.note && <p className="break-words text-muted-foreground">{t('capture.note', { note: capture.note })}</p>}
        {capture.duplicateOf && capture.duplicateOf.length > 0 && <p className="font-medium">{t('capture.duplicateOf')}{capture.duplicateOf.map((other, index) => <span key={other.id}>{index > 0 ? ', ' : ''}<Link href={routes.admin.user(other.id)} className="underline underline-offset-4">{other.displayName}</Link></span>)}</p>}
        {capture.duplicateClearedAt && <p className="text-muted-foreground">{t('capture.duplicateCleared', { date: formatDateTime(capture.duplicateClearedAt) })}</p>}
        <p className="text-muted-foreground">{capture.photos.length > 0 ? t('capture.photosKept', { count: capture.photos.length }) : capture.photosDeletedAt ? t('capture.photosDeleted', { date: formatDate(capture.photosDeletedAt) }) : t('capture.photosNone')}</p>
        {detailsRevealed?.captureId === capture.id && <IdDetailsPanel details={detailsRevealed.details} />}
        {revealed?.captureId === capture.id && <div className="space-y-3 rounded-lg border border-primary/40 p-3">
          <p role="status" className="flex items-center gap-2 font-medium text-success"><LockKeyhole aria-hidden="true" className="size-4" />{t('capture.reveal.logged')}</p>
          <div><p className="font-medium">{t('capture.prompt', { prompt: t(`capture.prompts.${revealed.result.prompt}`) })}</p><p className="text-muted-foreground">{t('capture.promptHint')}</p></div>
          {revealed.result.photos.length === 0 ? <p className="text-muted-foreground">{t('capture.reveal.none')}</p> : <div className="grid gap-3 sm:grid-cols-3">
            {revealed.result.photos.map((photo) => <a key={photo.kind} href={photo.url} target="_blank" rel="noreferrer noopener" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived staff link, never cached */}
              <img src={photo.url} alt={t(`capture.reveal.alt.${photo.kind}`)} className="max-h-96 w-full rounded-lg border bg-muted object-contain" />
            </a>)}
          </div>}
          <p className="text-muted-foreground tabular-nums">{t('capture.reveal.expires', { time: formatDateTime(revealed.result.expiresAt) })}</p>
        </div>}
        {((canView && (capture.photos.length > 0 || capture.detailsStored)) || (canReview && capture.status === 'submitted')) && <div className="flex flex-wrap gap-2">
          {canView && (capture.detailsStored || hasBarcodeSide(capture)) && <Button type="button" variant="outline" size="sm" onClick={() => onDetails(capture)}>{t('capture.details.open')}</Button>}
          {canView && capture.photos.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => onOpen(capture)}>{t('capture.reveal.open')}</Button>}
          {canReview && capture.status === 'submitted' && <Button type="button" size="sm" onClick={() => onReview(capture)}>{t('capture.decide.open')}</Button>}
        </div>}
      </li>)}
    </ul>
  </div>;
}

/** A person's verification, as staff see it: statuses, our ID photos, the proofs of address, and the decisions the app allows. */
export function AdminVerificationSection({ userId, verification, handlers, now, initialRevealed, initialCaptureRevealed, initialDetailsRevealed }: {
  userId: string;
  verification: AdminPersonVerification;
  handlers: AdminVerificationHandlers;
  now: ISODateTime;
  /** Previews: a proof already opened. */
  initialRevealed?: { proofId: string; result: Extract<AddressProofRevealResult, { ok: true }> };
  /** Previews: ID photos already opened. */
  initialCaptureRevealed?: { captureId: string; result: Extract<IdentityCaptureRevealResult, { ok: true }> };
  /** Previews: an ID's barcode details already shown. */
  initialDetailsRevealed?: { captureId: string; details: IdentityCaptureDetails };
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
  const [revealCapture, setRevealCapture] = useState<AdminIdentityCaptureView>();
  const [captureRevealed, setCaptureRevealed] = useState(initialCaptureRevealed);
  const [detailsCapture, setDetailsCapture] = useState<AdminIdentityCaptureView>();
  const [detailsRevealed, setDetailsRevealed] = useState(initialDetailsRevealed);
  const [decideCapture, setDecideCapture] = useState<AdminIdentityCaptureView>();
  const otherActions = verification.actions.filter((action): action is OtherAction => !OWN_BUTTONS.includes(action));
  const captureStatus = useTranslations('verification.capture.statuses');
  // While our own check is the step that matters (photos in review, or approved before the double check).
  const latestCapture = identity.captures[0];
  const photosStage = identity.status === 'verified' || identity.blocked || !latestCapture ? undefined
    : latestCapture.status === 'submitted' ? ('in_review' as const)
      : latestCapture.status === 'approved' && identity.status === 'not_started' ? ('approved' as const) : undefined;
  const canOpen = verification.actions.includes('review_address') || verification.actions.includes('request_address');

  return <section aria-labelledby={`verification-${userId}`} className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-5">
    <h2 id={`verification-${userId}`} className="flex items-center gap-2 font-heading text-xl font-semibold"><ShieldCheck aria-hidden="true" className="size-5 shrink-0" />{t('title')}</h2>
    <p className="text-sm text-muted-foreground">{t('intro')}</p>
    <dl>
      <Row label={t('phone')}>{phone.verified ? <p>{t('phoneVerified', { last4: phone.last4 ?? '' })}{phone.verifiedAt ? ` · ${formatDate(phone.verifiedAt)}` : ''}</p> : <p className="text-muted-foreground">{phone.last4 ? t('phoneUnverified', { last4: phone.last4 }) : t('phoneMissing')}</p>}</Row>
      <Row label={t('agreement')}>{agreement ? <p>{t('agreementAccepted', { version: agreement.version, date: formatDate(agreement.acceptedAt) })}</p> : <p className="text-muted-foreground">{t('agreementMissing')}</p>}</Row>
      <Row label={t('identity')}>
        {photosStage
          ? <StatusBadge tone="info" label={captureStatus(photosStage)} />
          : <StatusBadge tone={identity.blocked ? 'warning' : identity.nameMatches === false && !identity.nameConfirmedAt ? 'info' : identityStatusTones[identity.status]} label={status(`identity.${identity.status}`)} />}
        {identity.verifiedAt && <p>{t('verifiedOn', { date: formatDate(identity.verifiedAt) })}</p>}
        {identity.failureReason && <p>{t(`identityFailure.${identity.failureReason}`)}</p>}
        {identity.providerOutcome && <p>{t('providerOutcome', { outcome: t(`providerOutcomes.${identity.providerOutcome}`) })}</p>}
        <p className="tabular-nums">{t('attempts', { count: identity.attempts })}</p>
        {identity.nameMatches === false && <p className="font-medium">{identity.nameConfirmedAt ? t('nameConfirmed', { date: formatDate(identity.nameConfirmedAt) }) : t('nameDiffers')}</p>}
        {identity.blocked && <p className="font-medium">{t(`identityBlocked.${identity.blocked}`)}</p>}
        {identity.requested && <p>{t(`identityRequested.${identity.requested}`)}</p>}
        {identity.consentAt && <p className="text-muted-foreground">{t('consentAt', { date: formatDateTime(identity.consentAt) })}</p>}
        {identity.redactionRequestedAt && <p className="text-muted-foreground">{t('redaction', { date: formatDate(identity.redactionRequestedAt) })}</p>}
        <CaptureList
          captures={identity.captures}
          canView={verification.actions.includes('view_identity_photos')}
          canReview={verification.actions.includes('review_identity_capture')}
          revealed={captureRevealed}
          detailsRevealed={detailsRevealed}
          onOpen={setRevealCapture}
          onDetails={setDetailsCapture}
          onReview={(capture) => { setResult(undefined); setDecideCapture(capture); }}
          now={now}
        />
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
            {proof.decidedAt && <p>{proof.decidedByKind === 'auto' ? t('capture.decidedAuto', { date: formatDateTime(proof.decidedAt) }) : t('decided', { date: formatDateTime(proof.decidedAt), name: proof.decidedBy ?? t('staff') })}</p>}
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
              {revealed.result.document?.kind === 'pdf' && <a href={revealed.result.document.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-2 font-medium text-primary underline underline-offset-4"><Download aria-hidden="true" className="size-4" />{t('reveal.downloadPdf')}</a>}
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
    <CaptureRevealDialog capture={revealCapture} onClose={() => setRevealCapture(undefined)} onReveal={handlers.onRevealIdentityCapture} onRevealed={(captureId, value) => { setCaptureRevealed({ captureId, result: value }); setRevealCapture(undefined); }} />
    <DetailsRevealDialog capture={detailsCapture} onClose={() => setDetailsCapture(undefined)} onReveal={handlers.onRevealIdentityDetails} onRevealed={(captureId, details) => { setDetailsRevealed({ captureId, details }); setDetailsCapture(undefined); }} />
    <CaptureDecideDialog capture={decideCapture} onClose={() => setDecideCapture(undefined)} onDecide={handlers.onDecideIdentityCapture} onDone={(value) => { setResult(value); setDecideCapture(undefined); }} />
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

function CaptureRevealDialog({ capture, onClose, onReveal, onRevealed }: {
  capture?: AdminIdentityCaptureView;
  onClose: () => void;
  onReveal: AdminVerificationHandlers['onRevealIdentityCapture'];
  onRevealed: (captureId: string, result: Extract<IdentityCaptureRevealResult, { ok: true }>) => void;
}) {
  const t = useTranslations('adminVerification.capture.reveal');
  const id = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ActionResult>();
  async function submit() {
    if (!capture || pending) return;
    if (reason.trim().length < 10) { setError(t('reasonRequired')); return; }
    setError(undefined);
    setPending(true);
    let result: IdentityCaptureRevealResult;
    try { result = await onReveal({ captureId: capture.id, reason: reason.trim() }); } catch { result = { ok: false, code: 'unknown' }; }
    setPending(false);
    if (result.ok) { setReason(''); setFailure(undefined); onRevealed(capture.id, result); return; }
    setFailure({ ok: false, code: result.code });
  }
  return <Dialog open={capture !== undefined} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
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

/** A license or state ID whose back is still stored: its barcode can be read. */
function hasBarcodeSide(capture: AdminIdentityCaptureView): boolean {
  return (capture.documentType === 'drivers_license' || capture.documentType === 'state_id') && capture.photos.includes('back');
}

/** What the ID's barcode says, beside how it compares with the account; shown once staff give a reason (logged). */
function IdDetailsPanel({ details }: { details: IdentityCaptureDetails }) {
  const t = useTranslations('adminVerification.capture.details');
  const types = useTranslations('adminVerification.capture.documentTypes');
  const { formatDate } = useFormat();
  // Calendar dates as encoded: noon UTC falls on the same day in every US time zone.
  const day = (value: string) => formatDate(`${value}T12:00:00.000Z`, { withYear: true });
  const { name, address, matches } = details;
  const physical = [details.sex && t(`sex.${details.sex}`), details.height && t('height', { height: details.height }), details.eyeColor && t('eyes', { eyes: details.eyeColor })].filter(Boolean).join(' · ');
  return <div className="space-y-3 rounded-lg border border-primary/40 p-3">
    <p role="status" className="flex items-center gap-2 font-medium text-success"><LockKeyhole aria-hidden="true" className="size-4" />{t(details.stored ? 'loggedStored' : 'logged')}</p>
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]">
      <dt className="font-medium">{t('name')}</dt>
      <dd className="break-words">{[name.given, name.middle, name.surname, name.suffix].filter(Boolean).join(' ')} <Match ok={matches.name} yes={t('matches.name.yes')} no={t('matches.name.no')} /></dd>
      <dt className="font-medium">{t('dateOfBirth')}</dt>
      <dd className="tabular-nums">{day(details.dateOfBirth)} · {t('age', { age: details.age })} <Match ok={matches.adult} yes={t('matches.adult.yes')} no={t('matches.adult.no')} /></dd>
      <dt className="font-medium">{t('expires')}</dt>
      <dd className="tabular-nums">{day(details.expiryDate)} <Match ok={matches.notExpired} yes={t('matches.notExpired.yes')} no={t('matches.notExpired.no')} /></dd>
      {details.issueDate && <><dt className="font-medium">{t('issued')}</dt><dd className="tabular-nums">{day(details.issueDate)}</dd></>}
      <dt className="font-medium">{t('number')}</dt>
      <dd className="break-all font-mono">{details.documentNumber}</dd>
      <dt className="font-medium">{t('issuer')}</dt>
      <dd>{t('issuedBy', { type: types(details.documentType), state: details.issuingState })}{details.source ? ` · ${t(`source.${details.source}`)}` : ''}</dd>
      {details.licenseClass && <><dt className="font-medium">{t('licenseClass')}</dt><dd>{details.licenseClass}</dd></>}
      {details.restrictions && <><dt className="font-medium">{t('restrictions')}</dt><dd>{details.restrictions}</dd></>}
      {details.endorsements && <><dt className="font-medium">{t('endorsements')}</dt><dd>{details.endorsements}</dd></>}
      {details.documentDiscriminator && <><dt className="font-medium">{t('discriminator')}</dt><dd className="break-all font-mono">{details.documentDiscriminator}</dd></>}
      {details.inventoryControl && <><dt className="font-medium">{t('inventory')}</dt><dd className="break-all font-mono">{details.inventoryControl}</dd></>}
      {details.aamvaVersion !== undefined && <><dt className="font-medium">{t('versionLabel')}</dt><dd className="tabular-nums">{t('version', { version: details.aamvaVersion, jurisdiction: details.jurisdictionVersion ?? 0 })}</dd></>}
      {address && <><dt className="font-medium">{t('address')}</dt>
        <dd className="break-words">{[address.line1, address.line2, `${address.city}, ${address.state} ${address.zip}`].filter(Boolean).join(', ')} <Match ok={matches.address} yes={t('matches.address.yes')} no={t('matches.address.no')} unknown={t('matches.address.none')} /></dd></>}
      {physical && <><dt className="font-medium">{t('physical')}</dt><dd>{physical}</dd></>}
    </dl>
    <p className="text-muted-foreground">{t(details.stored ? 'stored' : 'notStored')}</p>
  </div>;
}

/** A comparison with the account, in words (never color alone). */
function Match({ ok, yes, no, unknown }: { ok: boolean | null; yes: string; no: string; unknown?: string }) {
  if (ok === null) return <span className="text-muted-foreground">({unknown ?? no})</span>;
  return <span className={ok ? 'font-medium text-success' : 'font-medium text-warning'}>({ok ? yes : no})</span>;
}

function DetailsRevealDialog({ capture, onClose, onReveal, onRevealed }: {
  capture?: AdminIdentityCaptureView;
  onClose: () => void;
  onReveal: AdminVerificationHandlers['onRevealIdentityDetails'];
  onRevealed: (captureId: string, details: IdentityCaptureDetails) => void;
}) {
  const t = useTranslations('adminVerification.capture.details');
  const id = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Extract<IdentityDetailsRevealResult, { ok: false }>>();
  async function submit() {
    if (!capture || pending) return;
    if (reason.trim().length < 10) { setError(t('reasonRequired')); return; }
    setError(undefined);
    setPending(true);
    let result: IdentityDetailsRevealResult;
    try { result = await onReveal({ captureId: capture.id, reason: reason.trim() }); } catch { result = { ok: false, code: 'unknown' }; }
    setPending(false);
    if (result.ok) { setReason(''); setFailure(undefined); onRevealed(capture.id, result.details); return; }
    setFailure(result);
  }
  return <Dialog open={capture !== undefined} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t('title')}</DialogTitle><DialogDescription>{t('description')}</DialogDescription></DialogHeader>
      <form noValidate className="space-y-4" aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <NoteField id={`${id}-reason`} label={t('reason')} hint={t('reasonHint')} value={reason} onChange={setReason} error={error} disabled={pending} />
        {failure && (failure.code === 'no_barcode' || failure.code === 'unavailable') && <p role="alert" className="text-sm font-medium text-warning">{t(failure.code === 'no_barcode' ? 'noBarcode' : 'unavailable')}</p>}
        <FormFeedback result={failure && failure.code !== 'no_barcode' && failure.code !== 'unavailable' ? { ok: false, code: failure.code, ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}) } : undefined} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t('cancel')}</Button><Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t('submit')}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function CaptureDecideDialog({ capture, onClose, onDecide, onDone }: {
  capture?: AdminIdentityCaptureView;
  onClose: () => void;
  onDecide: AdminVerificationHandlers['onDecideIdentityCapture'];
  onDone: (result: ActionResult) => void;
}) {
  const t = useTranslations('adminVerification.capture.decide');
  const reasons = useTranslations('adminVerification.capture.rejectionReasons');
  const router = useRouter();
  const id = useId();
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [reason, setReason] = useState<IdentityCaptureRejectionReason>();
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; note?: string }>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ActionResult>();
  async function submit() {
    if (!capture || pending) return;
    const next: { reason?: string; note?: string } = {};
    if (decision === 'reject' && !reason) next.reason = t('reasonRequired');
    if (note.trim().length < 10) next.note = t('noteRequired');
    setErrors(next);
    if (Object.keys(next).length) return;
    setPending(true);
    let result: ActionResult;
    try { result = await onDecide({ captureId: capture.id, decision, ...(decision === 'reject' && reason ? { reason } : {}), note: note.trim() }); } catch { result = { ok: false, code: 'unknown' }; }
    setPending(false);
    if (result.ok) { setNote(''); setFailure(undefined); onDone(result); router.refresh(); return; }
    setFailure(result);
  }
  return <Dialog open={capture !== undefined} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
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
          <select id={`${id}-reason`} value={reason ?? ''} disabled={pending} onChange={(event) => setReason(event.target.value as IdentityCaptureRejectionReason)} aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? `${id}-reason-error` : undefined} className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base">
            <option value="" disabled>{t('choose')}</option>
            {IDENTITY_CAPTURE_REJECTION_REASONS.map((value) => <option key={value} value={value}>{reasons(value)}</option>)}
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
