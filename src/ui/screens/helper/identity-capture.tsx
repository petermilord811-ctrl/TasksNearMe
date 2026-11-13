'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Camera, Clock, IdCard, Lock, RotateCcw, ScanFace, ShieldCheck, TriangleAlert, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import {
  IDENTITY_CAPTURE_RULES,
  IDENTITY_DOCUMENT_TYPES,
  routes,
  type ActionResult,
  type HelperOnboardingHandlers,
  type IdentityCapturePhoto,
  type IdentityCaptureResult,
  type IdentityDocumentType,
  type LivenessPrompt,
  type VerificationSummary,
} from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useFormat } from '@/ui/lib/format';
import { useFormAction } from '@/ui/lib/use-form-action';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { FieldError } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { identityBadge, IdentityStages } from './identity-stages';

/** Where the capture is: the notice, the kind of ID, each photo, then the review before sending. */
export type CaptureStep = 'notice' | 'type' | IdentityCapturePhoto | 'review';
/** A camera that works, one the browser can't open, or one the person blocked (previews pick one). */
export type CameraState = 'live' | 'unavailable' | 'denied';

/** A photo ready to send: the shrunk file, and a local preview of it. */
interface Shot {
  url: string;
  file?: File;
}

type Failure = Exclude<IdentityCaptureResult, { ok: true } | { code: 'validation_failed' }>['code'];

export interface IdentityCaptureStepProps {
  verification: VerificationSummary;
  handlers: Pick<HelperOnboardingHandlers, 'onAcceptIdentityNotice' | 'onSubmitIdentityCapture' | 'onRefreshStatus'>;
  /** Previews: open on a part of the capture, with sample photos, a camera stand-in, or a failure. */
  preview?: {
    step: CaptureStep;
    documentType?: IdentityDocumentType;
    photos?: Partial<Record<IdentityCapturePhoto, string>>;
    /** A camera stand-in (previews never open one); `cameraOpen` starts a document photo on it. */
    camera?: CameraState;
    cameraOpen?: boolean;
    photoErrors?: Partial<Record<IdentityCapturePhoto, 'required' | 'invalid'>>;
    failure?: Failure;
  };
}

const checkboxClass = 'mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const fileButtonClass = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[1.375rem] border border-foreground/[0.14] bg-card px-5 py-2 text-sm font-medium hover:border-foreground/25 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background dark:border-white/[0.12]';

function Note({ tone, children }: { tone: 'info' | 'warning' | 'success'; children: ReactNode }) {
  const Icon = tone === 'warning' ? TriangleAlert : tone === 'info' ? Clock : BadgeCheck;
  const tones = { warning: 'bg-badge-warning text-badge-warning-foreground', info: 'bg-badge-info text-badge-info-foreground', success: 'bg-badge-success text-badge-success-foreground' };
  return <p className={cn('flex items-start gap-2 rounded-lg p-3', tones[tone])}><Icon aria-hidden="true" className="mt-1 size-4 shrink-0" /><span>{children}</span></p>;
}

/** Draws an image at most `IDENTITY_CAPTURE_RULES.photoEdgePx` on its longer side, as a JPEG (no metadata). */
function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const scale = Math.min(1, IDENTITY_CAPTURE_RULES.photoEdgePx / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

/** A chosen file, shrunk before it's sent; one the browser can't draw (HEIC on most) goes as it is. */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const blob = await toJpeg(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

const previewUrl = (blob: Blob) => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '');

/**
 * Our own ID check, the first of two stages: where it stands (in review, turned down with the reason,
 * paused), and the capture itself (the Texas notice, the kind of ID, its photos and a live selfie that
 * follows a prompt, then a review before sending). The app decides every state; this only shows it.
 */
export function IdentityCaptureStep({ verification, handlers, preview }: IdentityCaptureStepProps) {
  const t = useTranslations('verification');
  const { formatDate, formatDateTime } = useFormat();
  const id = useId();
  const form = useForm();
  const status = useFormAction(form);
  const identity = verification.identity;
  const capture = identity.capture;
  if (!capture) return null;
  const badge = identityBadge(identity);
  const supportNeeded = identity.blocked === 'under_18' || identity.blocked === 'too_many_attempts';

  return <section aria-labelledby={`${id}-heading`} className="space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><ShieldCheck aria-hidden="true" className="size-5" /></span>
        <h2 id={`${id}-heading`} className="font-heading text-lg font-semibold">{t('setup.titles.identity')}</h2>
      </div>
      <StatusBadge tone={badge.tone} label={t(badge.key)} />
    </div>
    <IdentityStages identity={identity} />

    <div className="space-y-3 text-sm leading-6 text-muted-foreground">
      {capture.stage === 'needed' && !identity.blocked && <p>{t('capture.explanation')}</p>}
      {identity.requested && <Note tone="warning">{t(`setup.identityRequested.${identity.requested}`)}</Note>}
      {capture.rejectionReason && identity.blocked !== 'under_18' && <Note tone="warning">{t(`capture.rejectionReasons.${capture.rejectionReason}`)}</Note>}
      {identity.blocked === 'try_later' && <Note tone="warning">{t('setup.identityBlocked.try_later', { time: identity.retryAt ? formatDateTime(identity.retryAt) : '' })}</Note>}
      {identity.blocked === 'too_many_attempts' && <Note tone="warning">{t('setup.identityBlocked.too_many_attempts')}</Note>}
      {identity.blocked === 'under_18' && <Note tone="warning">{t('setup.identityBlocked.under_18')}</Note>}
      {capture.stage === 'in_review' && <Note tone="info">{t('capture.inReview')}{capture.submittedAt ? ` ${t('capture.sentAt', { date: formatDate(capture.submittedAt) })}` : ''}</Note>}
    </div>

    {capture.stage === 'in_review' && <div className="space-y-3">
      <FormFeedback result={status.result} />
      <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={status.pending} aria-busy={status.pending} onClick={() => void status.run(handlers.onRefreshStatus, undefined)}>
        {status.pending && <Spinner />}{t('capture.checkStatus')}
      </Button>
    </div>}
    {capture.canSubmit && <CaptureWizard identity={identity} prompt={capture.prompt} handlers={handlers} preview={preview} />}
    {supportNeeded && <Button asChild variant="outline" className="w-full sm:w-auto"><Link href={routes.app.support()}>{t('setup.contactSupport')}</Link></Button>}
    <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('capture.privacy')}</p>
  </section>;
}

function CaptureWizard({ identity, prompt, handlers, preview }: {
  identity: VerificationSummary['identity'];
  prompt: LivenessPrompt;
  handlers: IdentityCaptureStepProps['handlers'];
  preview: IdentityCaptureStepProps['preview'];
}) {
  const t = useTranslations('verification.capture');
  const router = useRouter();
  const id = useId();
  const [step, setStep] = useState<CaptureStep>(preview?.step ?? (identity.consentNeeded ? 'notice' : 'type'));
  const [agreed, setAgreed] = useState(false);
  const [noticeError, setNoticeError] = useState(false);
  const [noticeResult, setNoticeResult] = useState<ActionResult>();
  const [documentType, setDocumentType] = useState<IdentityDocumentType | undefined>(preview?.documentType);
  const [typeError, setTypeError] = useState(false);
  const [shots, setShots] = useState<Partial<Record<IdentityCapturePhoto, Shot>>>(() => Object.fromEntries(Object.entries(preview?.photos ?? {}).map(([kind, url]) => [kind, { url }])));
  const [photoErrors, setPhotoErrors] = useState<Partial<Record<IdentityCapturePhoto, 'required' | 'invalid' | 'too_large'>>>(preview?.photoErrors ?? {});
  const [failure, setFailure] = useState<Failure | undefined>(preview?.failure);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const urls = useRef(new Set<string>());

  // Local previews are let go when the capture goes away.
  useEffect(() => {
    const created = urls.current;
    return () => { for (const url of created) URL.revokeObjectURL(url); };
  }, []);
  // Each part's heading takes focus after a move, so screen readers hear where they are.
  useEffect(() => { if (moved.current) headingRef.current?.focus(); }, [step]);

  const photos: IdentityCapturePhoto[] = documentType === 'passport' ? ['front', 'selfie'] : ['front', 'back', 'selfie'];
  const go = (next: CaptureStep) => { moved.current = true; setStep(next); };

  function keep(kind: IdentityCapturePhoto, file: File | Blob) {
    const ready = file instanceof File ? file : new File([file], `${kind}.jpg`, { type: 'image/jpeg' });
    const url = previewUrl(ready);
    if (url) urls.current.add(url);
    setShots((current) => ({ ...current, [kind]: { url, file: ready } }));
    setPhotoErrors((current) => ({ ...current, [kind]: ready.size > IDENTITY_CAPTURE_RULES.maxMegabytes * 1024 * 1024 ? 'too_large' : undefined }));
    setFailure(undefined);
  }

  function drop(kind: IdentityCapturePhoto) {
    setShots((current) => ({ ...current, [kind]: undefined }));
    setPhotoErrors((current) => ({ ...current, [kind]: undefined }));
  }

  async function acceptNotice() {
    if (pending) return;
    if (!agreed) { setNoticeError(true); return; }
    setNoticeError(false);
    setPending(true);
    let result: ActionResult;
    try { result = await handlers.onAcceptIdentityNotice({ consent: true }); } catch { result = { ok: false, code: 'unknown' }; }
    setPending(false);
    if (result.ok) { setNoticeResult(undefined); go('type'); return; }
    if (result.fieldErrors?.consent) { setNoticeError(true); return; }
    setNoticeResult(result);
  }

  function chooseType() {
    if (!documentType) { setTypeError(true); return; }
    go('front');
  }

  async function submit() {
    if (pending || sent || !documentType) return;
    const missing = photos.filter((kind) => !shots[kind]);
    if (missing.length > 0) { setPhotoErrors((current) => ({ ...current, ...Object.fromEntries(missing.map((kind) => [kind, 'required'])) })); return; }
    if (photos.some((kind) => photoErrors[kind] === 'too_large')) { setFailure('too_large'); return; }
    const body = new FormData();
    body.set('documentType', documentType);
    for (const kind of photos) { const file = shots[kind]?.file; if (file) body.set(kind, file); }
    setPending(true);
    setFailure(undefined);
    let result: IdentityCaptureResult;
    try { result = await handlers.onSubmitIdentityCapture(body); } catch { result = { ok: false, code: 'unknown' }; }
    setPending(false);
    if (result.ok) {
      setSent(true);
      if (result.redirectTo) router.push(result.redirectTo);
      else router.refresh();
      return;
    }
    if (result.code === 'validation_failed') {
      const fields = result.fieldErrors;
      if (fields.consent) { setNoticeError(true); go('notice'); return; }
      if (fields.documentType) { setTypeError(true); go('type'); return; }
      const next: Partial<Record<IdentityCapturePhoto, 'required' | 'invalid'>> = {};
      for (const kind of photos) { const code = fields[kind]?.[0]; if (code) next[kind] = code === 'invalid' ? 'invalid' : 'required'; }
      setPhotoErrors(next);
      return;
    }
    setFailure(result.code);
  }

  const heading = (text: string) => <h3 ref={headingRef} tabIndex={-1} className="font-heading text-base font-semibold outline-none">{text}</h3>;
  const photoIndex = photos.indexOf(step as IdentityCapturePhoto);
  const previous: CaptureStep | undefined = step === 'type' ? undefined : step === 'review' ? photos.at(-1) : photoIndex > 0 ? photos[photoIndex - 1] : photoIndex === 0 ? 'type' : undefined;
  const back = previous ? <Button type="button" variant="ghost" className="w-full sm:w-auto" disabled={pending} onClick={() => go(previous)}>{t('back')}</Button> : null;

  return <div className="space-y-5 border-t pt-5">
    {step === 'notice' && <div className="space-y-4">
      {heading(t('notice.title'))}
      <p className="text-sm leading-6 text-muted-foreground">{t('notice.body')}</p>
      <div className="space-y-2">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-background p-4 text-sm leading-6">
          <input type="checkbox" checked={agreed} onChange={(event) => { setAgreed(event.target.checked); setNoticeError(false); }} aria-invalid={noticeError || undefined} aria-describedby={noticeError ? `${id}-notice-error` : undefined} className={checkboxClass} />
          <span>{t('notice.checkbox')}</span>
        </label>
        {noticeError && <FieldError id={`${id}-notice-error`}>{t('notice.required')}</FieldError>}
      </div>
      <FormFeedback result={noticeResult} />
      <Button type="button" className="w-full sm:w-auto" disabled={pending} aria-busy={pending} onClick={() => void acceptNotice()}>{pending && <Spinner />}{t('notice.continue')}</Button>
    </div>}

    {step === 'type' && <div className="space-y-4">
      {heading(t('documentType.legend'))}
      <fieldset className="space-y-3" aria-describedby={`${id}-type-hint${typeError ? ` ${id}-type-error` : ''}`} aria-invalid={typeError || undefined}>
        <legend className="sr-only">{t('documentType.legend')}</legend>
        <p id={`${id}-type-hint`} className="text-sm text-muted-foreground">{t('documentType.hint')}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {IDENTITY_DOCUMENT_TYPES.map((type) => <label key={type} className={cn('flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm', documentType === type ? 'border-primary bg-secondary text-secondary-foreground' : 'bg-card')}>
            <input type="radio" name={`${id}-type`} value={type} checked={documentType === type} onChange={() => { setDocumentType(type); setTypeError(false); }} className="mt-0.5 size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            <span><span className="block font-medium">{t(`documentType.types.${type}`)}</span><span className="block text-muted-foreground">{t(`documentType.hints.${type}`)}</span></span>
          </label>)}
        </div>
        {typeError && <FieldError id={`${id}-type-error`}>{t('documentType.required')}</FieldError>}
      </fieldset>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" className="w-full sm:w-auto" onClick={chooseType}>{t('continue')}</Button>
      </div>
    </div>}

    {(step === 'front' || step === 'back' || step === 'selfie') && <PhotoStep
      key={step}
      kind={step}
      heading={heading(step === 'front' && documentType === 'passport' ? t('steps.front.passportTitle') : t(`steps.${step}.title`))}
      position={{ current: photoIndex + 1, total: photos.length }}
      prompt={prompt}
      shot={shots[step]}
      error={photoErrors[step]}
      camera={preview?.camera}
      cameraOpen={preview?.cameraOpen === true}
      onShot={(file) => keep(step, file)}
      onRetake={() => drop(step)}
      onUse={() => go(photos[photoIndex + 1] ?? 'review')}
      back={back}
    />}

    {step === 'review' && <div className="space-y-4">
      {heading(t('review.title'))}
      <p className="text-sm leading-6 text-muted-foreground">{t('review.body')}</p>
      <ul className="grid gap-3 sm:grid-cols-3">
        {photos.map((kind) => <li key={kind} className="space-y-2 rounded-xl border bg-background p-3">
          <p className="text-sm font-medium">{t(`photo.names.${kind}`)}</p>
          {shots[kind]?.url
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of the person's own photo
            ? <img src={shots[kind]!.url} alt={t(`photo.alt.${kind}`)} className="aspect-[4/3] w-full rounded-lg border bg-muted object-contain" />
            : <span className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border bg-muted text-muted-foreground">{kind === 'selfie' ? <ScanFace aria-hidden="true" className="size-8" /> : <IdCard aria-hidden="true" className="size-8" />}</span>}
          {photoErrors[kind] && <FieldError>{t(`errors.photo.${photoErrors[kind]}`, { megabytes: IDENTITY_CAPTURE_RULES.maxMegabytes })}</FieldError>}
          <Button type="button" variant="outline" size="sm" className="w-full" disabled={pending || sent} aria-label={t('photo.retakeNamed', { photo: t(`photo.names.${kind}`) })} onClick={() => { drop(kind); go(kind); }}><RotateCcw aria-hidden="true" />{t('photo.retake')}</Button>
        </li>)}
      </ul>
      <p className="text-sm">{t('review.promptReminder', { prompt: t(`prompt.${prompt}`) })}</p>
      <div role="status" aria-live="polite">
        {failure && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t(`errors.${failure}`, { megabytes: IDENTITY_CAPTURE_RULES.maxMegabytes })}</p>}
        {sent && <p className="rounded-lg bg-badge-success p-3 text-sm text-badge-success-foreground">{t('review.sent')}</p>}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {back}
        <Button type="button" className="w-full sm:w-auto" disabled={pending || sent} aria-busy={pending} onClick={() => void submit()}>{pending && <Spinner aria-hidden="true" />}{pending ? t('review.sending') : t('review.submit')}</Button>
      </div>
    </div>}
  </div>;
}

function PhotoStep({ kind, heading, position, prompt, shot, error, camera, cameraOpen, onShot, onRetake, onUse, back }: {
  kind: IdentityCapturePhoto;
  heading: ReactNode;
  position: { current: number; total: number };
  prompt: LivenessPrompt;
  shot?: Shot;
  error?: 'required' | 'invalid' | 'too_large';
  camera?: CameraState;
  cameraOpen: boolean;
  onShot: (file: File | Blob) => void;
  onRetake: () => void;
  onUse: () => void;
  back: ReactNode;
}) {
  const t = useTranslations('verification.capture');
  const id = useId();
  const selfie = kind === 'selfie';
  // Documents start with a choice (a camera, or a file on a computer); the selfie is always live.
  const [mode, setMode] = useState<'choose' | 'camera'>(selfie || cameraOpen ? 'camera' : 'choose');
  const [announcement, setAnnouncement] = useState('');
  const canOpenCamera = camera !== undefined ? camera !== 'unavailable' : typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  async function chosen(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    onShot(await shrink(file));
    setAnnouncement(t('camera.taken'));
  }

  const fileInput = (facing: 'user' | 'environment' | undefined, label: string) => <span className="inline-flex">
    <input id={`${id}-${facing ?? 'file'}`} type="file" accept="image/*" {...(facing ? { capture: facing } : {})} className="peer sr-only" onChange={(event) => { void chosen(event.target.files); event.target.value = ''; }} />
    <label htmlFor={`${id}-${facing ?? 'file'}`} className={cn(fileButtonClass, 'w-full sm:w-auto')}><Upload aria-hidden="true" className="size-4" />{label}</label>
  </span>;

  return <div className="space-y-4">
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground tabular-nums">{t('progress', position)}</p>
      {heading}
      <p className="text-sm leading-6 text-muted-foreground">{t(`steps.${kind}.help`)}</p>
    </div>
    {selfie && <p className="rounded-xl border border-primary/40 bg-secondary p-3 text-secondary-foreground"><span className="block text-sm">{t('prompt.label')}</span><span className="block text-lg font-semibold">{t(`prompt.${prompt}`)}</span></p>}

    {shot ? <div className="space-y-3">
      {shot.url
        // eslint-disable-next-line @next/next/no-img-element -- a local preview of the person's own photo
        ? <img src={shot.url} alt={t(`photo.alt.${kind}`)} className={cn('w-full rounded-xl border bg-muted object-contain', selfie ? 'max-h-[28rem]' : 'max-h-80')} />
        : <span className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border bg-muted text-muted-foreground">{selfie ? <ScanFace aria-hidden="true" className="size-10" /> : <IdCard aria-hidden="true" className="size-10" />}</span>}
      {error && <FieldError>{t(`errors.photo.${error}`, { megabytes: IDENTITY_CAPTURE_RULES.maxMegabytes })}</FieldError>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => { onRetake(); setAnnouncement(''); }}><RotateCcw aria-hidden="true" />{t('photo.retake')}</Button>
        <Button type="button" className="w-full sm:w-auto" disabled={error === 'too_large'} onClick={onUse}>{t('photo.use')}</Button>
      </div>
    </div> : mode === 'camera' && canOpenCamera
      ? <CameraView facing={selfie ? 'user' : 'environment'} prompt={selfie ? prompt : undefined} simulate={camera} onShot={(blob) => { onShot(blob); setAnnouncement(t('camera.taken')); }} fallback={fileInput(selfie ? 'user' : 'environment', t(selfie ? 'camera.uploadSelfie' : 'camera.uploadCameraApp'))} />
      : <div className="space-y-3">
        {!canOpenCamera && <p className="text-sm text-muted-foreground">{t('camera.unavailable')}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {!selfie && canOpenCamera && <Button type="button" className="w-full sm:w-auto" onClick={() => setMode('camera')}><Camera aria-hidden="true" />{t('camera.open')}</Button>}
          {selfie ? fileInput('user', t('camera.uploadSelfie')) : fileInput(canOpenCamera ? undefined : 'environment', t('camera.upload'))}
        </div>
      </div>}
    {error && !shot && <FieldError>{t(`errors.photo.${error}`, { megabytes: IDENTITY_CAPTURE_RULES.maxMegabytes })}</FieldError>}
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    {back && <div>{back}</div>}
  </div>;
}

const isDenied = (error: unknown) => error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');

/** The live camera with a frame to line up in (a card for documents, an oval for the face). */
function CameraView({ facing, prompt, simulate, onShot, fallback }: {
  facing: 'user' | 'environment';
  prompt?: LivenessPrompt;
  /** Previews: no real camera. */
  simulate?: CameraState;
  onShot: (blob: Blob) => void;
  /** The file input to use when the camera can't open. */
  fallback: ReactNode;
}) {
  const t = useTranslations('verification.capture');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | CameraState>(simulate ?? 'starting');
  const [taking, setTaking] = useState(false);
  const selfie = facing === 'user';

  useEffect(() => {
    if (simulate) return;
    const media = navigator.mediaDevices;
    let stream: MediaStream | undefined;
    let stopped = false;
    if (!media?.getUserMedia) {
      void Promise.resolve().then(() => { if (!stopped) setState('unavailable'); });
      return () => { stopped = true; };
    }
    media.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }).then(
      (opened) => {
        if (stopped) { for (const track of opened.getTracks()) track.stop(); return; }
        stream = opened;
        const video = videoRef.current;
        if (!video) return;
        // Ready once the first frame's size is known (a photo of an empty video would be blank).
        video.addEventListener('loadedmetadata', () => { if (!stopped) setState('live'); }, { once: true });
        video.srcObject = opened;
        void video.play().catch(() => undefined);
      },
      (error: unknown) => { if (!stopped) setState(isDenied(error) ? 'denied' : 'unavailable'); },
    );
    return () => {
      stopped = true;
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [facing, simulate]);

  async function take() {
    const video = videoRef.current;
    if (taking || !video || !video.videoWidth) return;
    setTaking(true);
    // The photo is what the camera sees (the selfie preview is mirrored, the photo isn't).
    const blob = await toJpeg(video, video.videoWidth, video.videoHeight);
    setTaking(false);
    if (blob) onShot(blob);
  }

  if (state === 'unavailable' || state === 'denied') {
    return <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-lg bg-badge-warning p-3 text-sm text-badge-warning-foreground"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(state === 'denied' ? 'camera.denied' : 'camera.unavailable')}</p>
      {fallback}
    </div>;
  }

  return <div className="space-y-3">
    <div className={cn('relative mx-auto w-full overflow-hidden rounded-xl bg-neutral-900', selfie ? 'aspect-[3/4] max-w-sm' : 'aspect-[4/3]')}>
      {simulate
        ? <div aria-hidden="true" className="flex size-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#4a4038,#1b1612)] text-white/40">{selfie ? <ScanFace className="size-20" /> : <IdCard className="size-20" />}</div>
        : <video ref={videoRef} autoPlay playsInline muted aria-label={t('camera.previewLabel')} className={cn('size-full object-cover', selfie && '-scale-x-100')} />}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className={cn('border-2 border-white/90 shadow-[0_0_0_9999px_rgb(0_0_0/0.45)]', selfie ? 'aspect-[3/4] w-[62%] rounded-[50%]' : 'aspect-[1.586] w-[86%] rounded-2xl')} />
      </div>
      {prompt && <p aria-hidden="true" className="absolute inset-x-3 top-3 rounded-full bg-black/70 px-4 py-2 text-center text-base font-semibold text-white">{t(`prompt.${prompt}`)}</p>}
      {state === 'starting' && <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white">{t('camera.starting')}</p>}
    </div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button type="button" className="w-full sm:w-auto" disabled={state !== 'live' || taking} aria-busy={taking} onClick={() => void take()}><Camera aria-hidden="true" />{t(selfie ? 'camera.takeSelfie' : 'camera.take')}</Button>
    </div>
  </div>;
}
