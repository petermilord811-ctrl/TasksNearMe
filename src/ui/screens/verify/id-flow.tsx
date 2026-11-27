'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookUser, Camera, Clock, CreditCard, IdCard, Lock, ScanFace, ShieldAlert, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ID_CHECK_KEYS,
  IDENTITY_CAPTURE_RULES,
  routes,
  type ActionResult,
  type HelperOnboardingHandlers,
  type IdCheckKey,
  type IdCheckProgress,
  type IdentityCapturePhoto,
  type IdentityCaptureResult,
  type IdentityDocumentType,
  type VerificationSummary,
} from '@/contracts';
import { CaptureCamera, FilePickButton, pickedPhoto, useCoarsePointer, type CameraState } from '@/ui/components/verify-flow/camera';
import { CheckList, ScanIllustration, SuccessMark, type FlowCheckRow } from '@/ui/components/verify-flow/checks';
import { FlowChoice, FlowFrame, FlowHeading, FlowIcon } from '@/ui/components/verify-flow/flow-frame';
import { lookAtPhoto, previewUrl, type PhotoLook } from '@/ui/components/verify-flow/photo';
import { useFormat } from '@/ui/lib/format';
import { useRouteDialog } from '@/ui/lib/route-dialog';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * Our own ID check as one calm flow (owner, 2026-11-27: "This platform own ID verification page should be looks same as
 * Persona. simple and tidy and clear … Clear&natural animation + clear output"): what's needed and the consent, the kind
 * of ID, its front (and back), a live selfie that follows an instruction, then "Verifying…" while our server checks it,
 * each check turning over as it lands, and the outcome in one sentence. Opened on a check that's under way, it shows
 * where that stands. The app decides every state; this only shows it.
 */

export type IdScreen = 'intro' | 'type' | 'front' | 'front-check' | 'back' | 'back-check' | 'selfie-intro' | 'selfie' | 'selfie-check' | 'verifying' | 'result' | 'status';

type Handlers = Pick<HelperOnboardingHandlers, 'onAcceptIdentityNotice' | 'onSubmitIdentityCapture' | 'onCheckProgress' | 'onStartIdentity' | 'onRefreshStatus'>;

interface Shot {
  url: string;
  file?: File;
  look?: PhotoLook | null;
}

export interface IdFlowProps {
  variant: 'dialog' | 'page';
  verification: VerificationSummary;
  handlers: Handlers;
  /** Where "Done" goes on the page version (the dialog closes over the page it came from). */
  doneHref?: string;
  /** Previews: a screen, sample photos, a camera stand-in, the reading's answer. */
  preview?: {
    screen?: IdScreen;
    documentType?: IdentityDocumentType;
    photos?: Partial<Record<IdentityCapturePhoto, string>>;
    camera?: CameraState;
    progress?: IdCheckProgress | null;
    failure?: Exclude<IdentityCaptureResult, { ok: true } | { code: 'validation_failed' }>['code'];
  };
}

/** How often "Verifying…" asks, and for how long before it says it'll let them know. */
const POLL_MS = 2_000;
const POLL_FOR_MS = 75_000;

const SCREEN_PROGRESS: Partial<Record<IdScreen, number>> = {
  intro: 0.04, type: 0.14, front: 0.28, 'front-check': 0.38, back: 0.5, 'back-check': 0.6, 'selfie-intro': 0.7, selfie: 0.8, 'selfie-check': 0.9, verifying: 1,
};

const TYPE_ICONS: Record<IdentityDocumentType, typeof IdCard> = { drivers_license: CreditCard, state_id: IdCard, passport: BookUser };

/** Where a flow opened on someone's ID check starts: the capture when photos can be sent, else where it stands. */
export function initialIdScreen(identity: VerificationSummary['identity']): IdScreen {
  const capture = identity.capture;
  if (!capture || identity.blocked || identity.nameCheck) return 'status';
  if (capture.canSubmit) return 'intro';
  return 'status';
}

export function IdFlow({ variant, verification, handlers, doneHref = routes.app.helperVerification(), preview }: IdFlowProps) {
  const t = useTranslations('verifyFlow.id');
  const v = useTranslations('verification');
  const router = useRouter();
  const dialog = useRouteDialog();
  const identity = verification.identity;
  const capture = identity.capture;

  const [screen, setScreen] = useState<IdScreen>(preview?.screen ?? initialIdScreen(identity));
  const [direction, setDirection] = useState<1 | -1>(1);
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [documentType, setDocumentType] = useState<IdentityDocumentType | undefined>(preview?.documentType);
  const [shots, setShots] = useState<Partial<Record<IdentityCapturePhoto, Shot>>>(() => Object.fromEntries(Object.entries(preview?.photos ?? {}).map(([kind, url]) => [kind, { url }])));
  const [failure, setFailure] = useState<string | undefined>(preview?.failure ? v(`capture.errors.${preview.failure}`, { megabytes: IDENTITY_CAPTURE_RULES.maxMegabytes }) : undefined);
  const [progress, setProgress] = useState<IdCheckProgress | null | undefined>(preview?.progress);
  const [slow, setSlow] = useState(false);
  const [sent, setSent] = useState(false);
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const created = urls.current;
    return () => {
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, []);

  const passport = documentType === 'passport';
  const order: IdScreen[] = ['intro', 'type', 'front', 'front-check', ...(passport ? [] : (['back', 'back-check'] as IdScreen[])), 'selfie-intro', 'selfie', 'selfie-check', 'verifying'];
  const go = (next: IdScreen, way: 1 | -1 = 1) => {
    setDirection(way);
    setNotice(undefined);
    setScreen(next);
  };
  const index = order.indexOf(screen);
  const previous = index > 0 && screen !== 'verifying' ? order[index - 1] : undefined;
  // The intro is skipped going back once consent was given there (nothing to change on it).
  const back = previous && !(previous === 'intro' && !identity.consentNeeded && capture?.canSubmit) ? () => go(previous, -1) : screen === 'type' ? () => go('intro', -1) : undefined;

  // "Verifying…": ask where the photos stand until our server has read them (or a minute and a bit has gone by).
  const polling = screen === 'verifying' && !preview;
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      let answer: IdCheckProgress | null = null;
      try {
        const result = await handlers.onCheckProgress({ kind: 'identity' });
        answer = result?.kind === 'identity' ? result : null;
      } catch {
        answer = null;
      }
      if (stopped) return;
      if (answer && answer.phase !== 'reading') {
        setProgress(answer);
        return;
      }
      if (Date.now() - started > POLL_FOR_MS) {
        setSlow(true);
        return;
      }
      timer = setTimeout(() => void ask(), POLL_MS);
    };
    void ask();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [polling, handlers]);

  // Once the answers are in, the list turns over line by line, then the outcome opens.
  const answered = screen === 'verifying' && (progress !== undefined && progress !== null && progress.phase !== 'reading' || slow);
  useEffect(() => {
    if (!answered || preview) return;
    const rows = progress?.checks.filter((item) => item.outcome !== 'skipped').length ?? 0;
    const timer = setTimeout(() => go('result'), slow ? 300 : rows * 220 + 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` is stable enough: it only sets state
  }, [answered, slow]);

  async function start() {
    if (busy) return;
    if (identity.consentNeeded) {
      if (!agreed) {
        setConsentError(true);
        return;
      }
      setBusy(true);
      let result: ActionResult;
      try {
        result = await handlers.onAcceptIdentityNotice({ consent: true });
      } catch {
        result = { ok: false, code: 'unknown' };
      }
      setBusy(false);
      if (!result.ok) {
        if (result.fieldErrors?.consent) setConsentError(true);
        else setNotice(v('capture.errors.not_allowed'));
        return;
      }
    }
    go('type');
  }

  async function keep(kind: IdentityCapturePhoto, file: File | Blob) {
    const ready = file instanceof File ? file : new File([file], `${kind}.jpg`, { type: 'image/jpeg' });
    const url = previewUrl(ready);
    if (url) urls.current.add(url);
    setShots((current) => ({ ...current, [kind]: { url, file: ready } }));
    setFailure(undefined);
    go(`${kind}-check` as IdScreen);
    const look = await lookAtPhoto(ready, kind === 'selfie' ? 'face' : 'document');
    setShots((current) => (current[kind]?.url === url ? { ...current, [kind]: { ...current[kind]!, look } } : current));
  }

  async function submit() {
    if (busy || sent || !documentType) return;
    const kinds: IdentityCapturePhoto[] = passport ? ['front', 'selfie'] : ['front', 'back', 'selfie'];
    const missing = kinds.find((kind) => !shots[kind]?.file);
    if (missing) {
      go(missing, -1);
      return;
    }
    if (kinds.some((kind) => (shots[kind]?.file?.size ?? 0) > IDENTITY_CAPTURE_RULES.maxMegabytes * 1024 * 1024)) {
      setFailure(v('capture.errors.too_large', { megabytes: IDENTITY_CAPTURE_RULES.maxMegabytes }));
      return;
    }
    const body = new FormData();
    body.set('documentType', documentType);
    for (const kind of kinds) body.set(kind, shots[kind]!.file!);
    setBusy(true);
    setFailure(undefined);
    let result: IdentityCaptureResult;
    try {
      result = await handlers.onSubmitIdentityCapture(body);
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    setBusy(false);
    if (result.ok) {
      setSent(true);
      setProgress(undefined);
      setSlow(false);
      go('verifying');
      return;
    }
    if (result.code === 'validation_failed') {
      const fields = result.fieldErrors;
      if (fields.consent) {
        setConsentError(true);
        go('intro', -1);
        return;
      }
      if (fields.documentType) {
        go('type', -1);
        return;
      }
      const bad = kinds.find((kind) => fields[kind]);
      if (bad) {
        setShots((current) => ({ ...current, [bad]: undefined }));
        go(bad, -1);
        setNotice(v(`capture.errors.photo.${fields[bad]![0] === 'invalid' ? 'invalid' : 'required'}`, { megabytes: IDENTITY_CAPTURE_RULES.maxMegabytes }));
        return;
      }
    }
    setFailure(v(`capture.errors.${result.code === 'validation_failed' ? 'unknown' : result.code}`, { megabytes: IDENTITY_CAPTURE_RULES.maxMegabytes }));
  }

  function tryAgain() {
    setShots({});
    setProgress(undefined);
    setSlow(false);
    setSent(false);
    go('type');
  }

  /** Done: the dialog closes and the page under it refreshes; the page version goes back to Verifications. */
  function done(message?: string) {
    if (dialog) {
      if (sent || message) dialog.finish({ ok: true, code: 'updated' }, message);
      else dialog.close();
      return;
    }
    router.push(doneHref);
    router.refresh();
  }

  const checkLabel = (key: IdCheckKey) => t(`checks.${key === 'machine_readable' && passport ? 'machine_readable_passport' : key}`);
  const rows = (answer: IdCheckProgress | null | undefined): FlowCheckRow[] =>
    ID_CHECK_KEYS.filter((key) => !(key === 'machine_readable' && passport && !answer)).map((key) => {
      const outcome = answer?.checks.find((item) => item.key === key)?.outcome ?? 'pending';
      return { key, label: checkLabel(key), outcome, ...(outcome === 'unsure' ? { note: t('checks.teamWillLook') } : {}) };
    });

  const promptText = capture ? v(`capture.prompt.${capture.prompt}`) : '';
  const photoKind = (screen.replace('-check', '') as IdentityCapturePhoto);
  const title = t('title');
  let footer: React.ReactNode = null;
  let content: React.ReactNode = null;

  switch (screen) {
    case 'intro': {
      content = <IntroScreen identity={identity} agreed={agreed} consentError={consentError} onAgree={(value) => { setAgreed(value); setConsentError(false); }} />;
      footer = <>
        {notice && <p role="alert" className="text-center text-sm text-destructive">{notice}</p>}
        <Button size="lg" className="w-full" disabled={busy} aria-busy={busy} onClick={() => void start()}>{busy && <Spinner />}{t('intro.start')}</Button>
      </>;
      break;
    }
    case 'type': {
      content = <>
        <FlowHeading description={t('type.description')}>{t('type.title')}</FlowHeading>
        <div className="space-y-3">
          {(['drivers_license', 'state_id', 'passport'] as const).map((type) => {
            const Icon = TYPE_ICONS[type];
            return <FlowChoice key={type} icon={<Icon />} label={t(`type.${type}`)} selected={documentType === type} onClick={() => {
              if (type !== documentType) setShots({});
              setDocumentType(type);
              go('front');
            }} />;
          })}
        </div>
      </>;
      break;
    }
    case 'front':
    case 'back': {
      const kind = screen;
      const which = kind === 'front' ? (passport ? 'passport' : documentType === 'state_id' ? 'frontId' : 'front') : documentType === 'state_id' ? 'backId' : 'back';
      content = <>
        <FlowHeading description={t(`capture.${which}.description`)}>{t(`capture.${which}.title`)}</FlowHeading>
        {notice && <p role="alert" className="mb-4 flex items-start gap-2 rounded-2xl bg-badge-warning p-3 text-sm text-badge-warning-foreground"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{notice}</p>}
        <DocumentCapture key={kind} camera={preview?.camera} onShot={(blob) => void keep(kind, blob)} />
      </>;
      break;
    }
    case 'front-check':
    case 'back-check':
    case 'selfie-check': {
      const kind = photoKind;
      const shot = shots[kind];
      const last = kind === 'selfie';
      content = <>
        <FlowHeading description={t(last ? 'check.selfieDescription' : 'check.description')}>{t(last ? 'check.selfieTitle' : 'check.title')}</FlowHeading>
        <figure className="space-y-3">
          {shot?.url
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of the person's own photo
            ? <img src={shot.url} alt={t(`check.alt.${kind}`)} className={cn('mx-auto w-full rounded-[1.25rem] border bg-muted object-contain', last ? 'max-h-[22rem] max-w-[18rem]' : 'max-h-64')} />
            : <span className="mx-auto flex aspect-[4/3] w-full items-center justify-center rounded-[1.25rem] border bg-muted text-muted-foreground">{last ? <ScanFace aria-hidden="true" className="size-10" /> : <IdCard aria-hidden="true" className="size-10" />}<span className="sr-only">{t(`check.alt.${kind}`)}</span></span>}
          {shot?.look && (shot.look.dark || shot.look.blurry) && <figcaption className="flex items-start gap-2 rounded-2xl bg-badge-warning p-3 text-sm text-badge-warning-foreground"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(shot.look.blurry ? 'check.blurry' : 'check.dark')}</figcaption>}
        </figure>
        {last && failure && <p role="alert" className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{failure}</p>}
      </>;
      footer = <>
        <Button size="lg" className="w-full" disabled={!shot || busy} aria-busy={busy} onClick={() => (last ? void submit() : go(kind === 'front' && !passport ? 'back' : 'selfie-intro'))}>
          {busy && <Spinner />}{busy ? t('check.sending') : t(last ? 'check.submit' : 'check.use')}
        </Button>
        <Button variant="ghost" className="w-full" disabled={busy} onClick={() => { setShots((current) => ({ ...current, [kind]: undefined })); go(kind === 'selfie' ? 'selfie' : kind, -1); }}>{t('check.retake')}</Button>
      </>;
      break;
    }
    case 'selfie-intro': {
      content = <>
        <FlowHeading icon={<FlowIcon><ScanFace /></FlowIcon>} description={t('selfie.description')}>{t('selfie.title')}</FlowHeading>
        <div className="space-y-3">
          <p className="rounded-2xl border border-primary/30 bg-brand-soft/60 p-4 text-center"><span className="block text-sm text-muted-foreground">{t('selfie.promptLabel')}</span><span className="block text-lg font-semibold">{promptText}</span></p>
          <p className="text-center text-sm text-muted-foreground">{t('selfie.tip')}</p>
        </div>
      </>;
      footer = <Button size="lg" className="w-full" onClick={() => go('selfie')}><Camera aria-hidden="true" />{t('selfie.open')}</Button>;
      break;
    }
    case 'selfie': {
      content = <>
        <FlowHeading>{t('selfie.cameraTitle')}</FlowHeading>
        <CaptureCamera facing="user" prompt={promptText} simulate={preview?.camera} onShot={(blob) => void keep('selfie', blob)} fallback={<FilePickButton label={v('capture.camera.uploadSelfie')} accept="image/*" capture="user" onFile={(file) => void pickedPhoto(file).then((shrunk) => keep('selfie', shrunk))} />} />
      </>;
      break;
    }
    case 'verifying': {
      content = <>
        <div className="pt-4 pb-6"><ScanIllustration kind="identity" /></div>
        <FlowHeading description={t('verifying.description')}>{t('verifying.title')}</FlowHeading>
        <CheckList label={t('checks.label')} rows={rows(progress)} />
        <p role="status" aria-live="polite" className="sr-only">{answered ? t('verifying.done') : ''}</p>
      </>;
      break;
    }
    case 'result': {
      const result = resultView(progress, slow);
      content = <>
        <FlowHeading icon={result.tone === 'success' ? <SuccessMark /> : <FlowIcon tone={result.tone}>{result.tone === 'danger' ? <X /> : <Clock />}</FlowIcon>} description={result.reason ? v(`capture.rejectionReasons.${result.reason}`) : t(`result.${result.key}Body`)}>{t(`result.${result.key}Title`)}</FlowHeading>
        {progress && progress.checks.length > 0 && <CheckList label={t('checks.label')} rows={rows(progress)} />}
      </>;
      footer = result.key === 'approved'
        ? <DoubleCheckButton handlers={handlers} label={t('result.doubleCheck')} />
        : result.key === 'rejected' && progress?.canRetry
          ? <><Button size="lg" className="w-full" onClick={tryAgain}>{t('result.tryAgain')}</Button><Button variant="ghost" className="w-full" onClick={() => done()}>{t('result.later')}</Button></>
          : result.key === 'rejected'
            ? <Button asChild size="lg" variant="outline" className="w-full"><Link href={routes.app.support()}>{v('setup.contactSupport')}</Link></Button>
            : <Button size="lg" className="w-full" onClick={() => done(t(result.key === 'verified' ? 'result.toastVerified' : 'result.toastReview'))}>{t('result.done')}</Button>;
      break;
    }
    case 'status': {
      content = <StatusScreen identity={identity} handlers={handlers} preview={preview?.progress} />;
      footer = <StatusFooter identity={identity} handlers={handlers} onRetake={() => go('intro')} onDone={() => done()} />;
      break;
    }
  }

  const stepProgress = SCREEN_PROGRESS[screen];
  return <FlowFrame
    variant={variant}
    title={title}
    screen={screen}
    direction={direction}
    {...(stepProgress !== undefined && screen !== 'verifying' ? { progress: passport && stepProgress > 0.4 ? Math.min(1, stepProgress) : stepProgress } : {})}
    {...(back && !busy ? { onBack: back } : {})}
    {...(variant === 'page' ? { onClose: () => done() } : {})}
    footer={footer}
  >
    {content}
  </FlowFrame>;
}

/** What the outcome screen says: verified, the double check next, our team looking, turned down, or still reading. */
function resultView(progress: IdCheckProgress | null | undefined, slow: boolean): { key: 'verified' | 'approved' | 'review' | 'rejected' | 'slow'; tone: 'success' | 'info' | 'danger'; reason?: IdCheckProgress['rejectionReason'] } {
  if (!progress || progress.phase === 'reading' || slow) return { key: 'slow', tone: 'info' };
  if (progress.phase === 'approved') return progress.next === 'double_check' ? { key: 'approved', tone: 'success' } : { key: 'verified', tone: 'success' };
  if (progress.phase === 'rejected') return { key: 'rejected', tone: 'danger', ...(progress.rejectionReason ? { reason: progress.rejectionReason } : {}) };
  return { key: 'review', tone: 'info' };
}

function IntroScreen({ identity, agreed, consentError, onAgree }: { identity: VerificationSummary['identity']; agreed: boolean; consentError: boolean; onAgree: (value: boolean) => void }) {
  const t = useTranslations('verifyFlow.id');
  const v = useTranslations('verification');
  const { formatDate } = useFormat();
  const id = useId();
  const [details, setDetails] = useState(false);
  const capture = identity.capture;
  return <>
    <FlowHeading icon={<FlowIcon><ShieldCheck /></FlowIcon>} description={t('intro.description')}>{t('intro.title')}</FlowHeading>
    <ul className="space-y-3">
      <li className="flex items-center gap-4 rounded-2xl bg-foreground/[0.03] p-4"><span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card shadow-sm"><IdCard className="size-5 text-primary" /></span><span><span className="block font-medium">{t('intro.idRow')}</span><span className="block text-sm text-muted-foreground">{t('intro.idHint')}</span></span></li>
      <li className="flex items-center gap-4 rounded-2xl bg-foreground/[0.03] p-4"><span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card shadow-sm"><ScanFace className="size-5 text-primary" /></span><span><span className="block font-medium">{t('intro.selfieRow')}</span><span className="block text-sm text-muted-foreground">{t('intro.selfieHint')}</span></span></li>
    </ul>
    {identity.requested && <p className="mt-4 flex items-start gap-2 rounded-2xl bg-badge-info p-3 text-sm text-badge-info-foreground"><Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{v(`setup.identityRequested.${identity.requested}`, { date: identity.renewal ? formatDate(identity.renewal.countsUntil) : '' })}</p>}
    {capture?.rejectionReason && <p className="mt-4 flex items-start gap-2 rounded-2xl bg-badge-warning p-3 text-sm text-badge-warning-foreground"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{v(`capture.rejectionReasons.${capture.rejectionReason}`)}</p>}
    {identity.consentNeeded && <div className="mt-5 space-y-2">
      <label className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm leading-6 transition-colors', consentError ? 'border-destructive' : agreed ? 'border-primary/50 bg-brand-soft/40' : 'border-foreground/[0.12]')}>
        <input type="checkbox" checked={agreed} onChange={(event) => onAgree(event.target.checked)} aria-invalid={consentError || undefined} aria-describedby={`${id}-details${consentError ? ` ${id}-error` : ''}`} className="mt-1 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
        <span>{t('intro.consent')}</span>
      </label>
      {consentError && <p id={`${id}-error`} className="text-sm text-destructive">{t('intro.consentRequired')}</p>}
    </div>}
    <div className="mt-4">
      <button type="button" aria-expanded={details} aria-controls={`${id}-details`} onClick={() => setDetails((open) => !open)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Lock aria-hidden="true" className="size-3.5" />{t('intro.howWeUse')}</button>
      <p id={`${id}-details`} hidden={!details} className="mt-1 rounded-2xl bg-foreground/[0.03] p-4 text-sm leading-6 text-muted-foreground">{v('capture.notice.body')}</p>
    </div>
  </>;
}

/** A document's photo: the camera on phones, a choice on computers (a file is easier there), the file picker always. */
function DocumentCapture({ camera, onShot }: { camera?: CameraState; onShot: (blob: Blob) => void }) {
  const t = useTranslations('verifyFlow.id');
  const v = useTranslations('verification');
  const canOpenCamera = camera !== undefined ? camera !== 'unavailable' : typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const phone = useCoarsePointer();
  const [chosen, setMode] = useState<'choose' | 'camera' | undefined>(camera === 'live' ? 'camera' : undefined);
  // Phones open the camera at once; computers choose (a file is often easier there).
  const mode = chosen ?? (phone && canOpenCamera ? 'camera' : 'choose');
  const upload = <FilePickButton label={v('capture.camera.upload')} accept="image/*" onFile={(file) => void pickedPhoto(file).then(onShot)} variant={mode === 'camera' ? 'link' : 'outline'} />;
  if (mode === 'camera' && canOpenCamera) {
    return <div className="space-y-2">
      <CaptureCamera facing="environment" simulate={camera} onShot={onShot} fallback={<FilePickButton label={v('capture.camera.uploadCameraApp')} accept="image/*" capture="environment" onFile={(file) => void pickedPhoto(file).then(onShot)} />} />
      {upload}
    </div>;
  }
  return <div className="space-y-3">
    <div aria-hidden="true" className="mx-auto flex aspect-[1.586] w-full max-w-[18rem] items-center justify-center rounded-2xl border-2 border-dashed border-foreground/15 bg-foreground/[0.02] text-foreground/30"><IdCard className="size-14" /></div>
    {canOpenCamera && <Button size="lg" className="w-full" onClick={() => setMode('camera')}><Camera aria-hidden="true" />{t('capture.useCamera')}</Button>}
    {upload}
  </div>;
}

/** The provider's double check, once our check approved the photos (only where one is set up). */
function DoubleCheckButton({ handlers, label }: { handlers: Handlers; label: string }) {
  const v = useTranslations('verification');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function run() {
    setBusy(true);
    setError(false);
    let result: ActionResult;
    try {
      result = await handlers.onStartIdentity({ consent: true });
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    setBusy(false);
    if (result.ok && result.redirectTo) router.push(result.redirectTo);
    else if (!result.ok) setError(true);
  }
  return <>
    {error && <p role="alert" className="text-center text-sm text-destructive">{v('capture.errors.unknown')}</p>}
    <Button size="lg" className="w-full" disabled={busy} aria-busy={busy} onClick={() => void run()}>{busy && <Spinner />}{label}</Button>
  </>;
}

/**
 * Opened on a check that's under way or finished: verified, the photos with our team or approved, the provider's
 * double check, a name check, or paused. While the photos are being read it keeps asking, as "Verifying…" does.
 */
function StatusScreen({ identity, handlers, preview }: { identity: VerificationSummary['identity']; handlers: Handlers; preview?: IdCheckProgress | null }) {
  const t = useTranslations('verifyFlow.id');
  const v = useTranslations('verification');
  const { formatDate, formatDateTime } = useFormat();
  const [progress, setProgress] = useState<IdCheckProgress | null | undefined>(preview);
  const capture = identity.capture;
  const inReview = capture?.stage === 'in_review' && !identity.blocked;
  useEffect(() => {
    if (!inReview || preview !== undefined) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const ask = async () => {
      const answer = await handlers.onCheckProgress({ kind: 'identity' }).catch(() => null);
      if (stopped) return;
      if (answer?.kind === 'identity') setProgress(answer);
      if ((!answer || answer.phase === 'reading') && Date.now() - started < POLL_FOR_MS) timer = setTimeout(() => void ask(), POLL_MS);
    };
    void ask();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [inReview, preview, handlers]);

  const verified = identity.status === 'verified' && !identity.nameCheck;
  if (identity.blocked) {
    return <FlowHeading icon={<FlowIcon tone="warning"><ShieldAlert /></FlowIcon>} description={v(`setup.identityBlocked.${identity.blocked}`, { time: identity.retryAt ? formatDateTime(identity.retryAt) : '' })}>{t(`status.blocked.${identity.blocked}`)}</FlowHeading>;
  }
  if (identity.nameCheck) return <FlowHeading icon={<FlowIcon tone="info"><Clock /></FlowIcon>} description={t('status.nameCheckBody')}>{t('status.nameCheckTitle')}</FlowHeading>;
  if (verified) {
    return <FlowHeading icon={<SuccessMark />} description={identity.verifiedAt ? t('status.verifiedOn', { date: formatDate(identity.verifiedAt) }) : undefined}>{t('result.verifiedTitle')}</FlowHeading>;
  }
  if (identity.status === 'processing') return <FlowHeading icon={<FlowIcon tone="info"><Clock /></FlowIcon>} description={t('status.doubleCheckBody')}>{t('status.doubleCheckTitle')}</FlowHeading>;
  if (capture?.stage === 'approved') return <FlowHeading icon={<SuccessMark />} description={t('result.approvedBody')}>{t('result.approvedTitle')}</FlowHeading>;
  if (inReview) {
    const reading = !progress || progress.phase === 'reading';
    return <>
      {reading && <div className="pt-4 pb-6"><ScanIllustration kind="identity" /></div>}
      <FlowHeading icon={reading ? undefined : <FlowIcon tone="info"><Clock /></FlowIcon>} description={t(reading ? 'verifying.description' : 'result.reviewBody')}>{t(reading ? 'verifying.title' : 'result.reviewTitle')}</FlowHeading>
      {progress && progress.checks.length > 0 && <CheckList label={t('checks.label')} rows={ID_CHECK_KEYS.map((key) => {
        const outcome = progress.checks.find((item) => item.key === key)?.outcome ?? 'unsure';
        return { key, label: t(`checks.${key === 'machine_readable' && progress.documentType === 'passport' ? 'machine_readable_passport' : key}`), outcome, ...(outcome === 'unsure' ? { note: t('checks.teamWillLook') } : {}) };
      })} />}
    </>;
  }
  return <FlowHeading icon={<FlowIcon><ShieldCheck /></FlowIcon>}>{t('intro.title')}</FlowHeading>;
}

function StatusFooter({ identity, handlers, onRetake, onDone }: { identity: VerificationSummary['identity']; handlers: Handlers; onRetake: () => void; onDone: () => void }) {
  const t = useTranslations('verifyFlow.id');
  const v = useTranslations('verification');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const capture = identity.capture;
  const support = identity.blocked === 'under_18' || identity.blocked === 'too_many_attempts' || identity.blocked === 'duplicate_id';
  if (support) return <Button asChild size="lg" variant="outline" className="w-full"><Link href={routes.app.support()}>{v('setup.contactSupport')}</Link></Button>;
  if (capture?.stage === 'approved' && capture.doubleCheck && identity.status !== 'processing' && !identity.blocked) return <DoubleCheckButton handlers={handlers} label={t('result.doubleCheck')} />;
  if (identity.status === 'processing' && !identity.blocked) {
    return <>
      <DoubleCheckButton handlers={handlers} label={t('status.continueDoubleCheck')} />
      <Button variant="ghost" className="w-full" disabled={busy} onClick={async () => { setBusy(true); await handlers.onRefreshStatus().catch(() => undefined); setBusy(false); router.refresh(); }}>{busy && <Spinner />}{t('status.checkStatus')}</Button>
    </>;
  }
  if (capture?.canSubmit && !identity.blocked) return <Button size="lg" className="w-full" onClick={onRetake}>{t('status.newCheck')}</Button>;
  return <Button size="lg" className="w-full" onClick={onDone}>{t('result.done')}</Button>;
}
