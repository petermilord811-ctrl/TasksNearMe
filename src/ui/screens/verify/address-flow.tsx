'use client';

import { useEffect, useId, useMemo, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CalendarCheck, Camera, Clock, FileText, House, KeyRound, Landmark, Lock, ShieldCheck, Smartphone, TriangleAlert, Upload, X, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ADDRESS_CHECK_KEYS,
  ADDRESS_DOCUMENT_TYPES,
  ADDRESS_PROOF_RULES,
  routes,
  type AddressCheckKey,
  type AddressCheckProgress,
  type AddressDocumentType,
  type AddressProofResult,
  type AddressSuggestion,
  type HelperOnboardingHandlers,
  type VerificationSummary,
} from '@/contracts';
import { AddressSearchField } from '@/ui/components/forms/address-search-field';
import { useCoarsePointer } from '@/ui/components/verify-flow/camera';
import { CheckList, ScanIllustration, SuccessMark, type FlowCheckRow } from '@/ui/components/verify-flow/checks';
import { FlowChoice, FlowFrame, FlowHeading, FlowIcon } from '@/ui/components/verify-flow/flow-frame';
import { useFormat } from '@/ui/lib/format';
import { useRouteDialog } from '@/ui/lib/route-dialog';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * The home address as one calm flow (owner, 2026-11-27: "By bank statement or ** document uploading, verify the
 * address", in the Persona look): what counts, the address, the kind of document, the file (dropped, picked or
 * photographed), then "Verifying…" while our server reads it, each check turning over, and the outcome. Opened while a
 * proof is with our team or verified, it shows where that stands.
 */

export type AddressScreen = 'intro' | 'address' | 'kind' | 'upload' | 'verifying' | 'result' | 'status';

type Handlers = Pick<HelperOnboardingHandlers, 'onSearchAddresses' | 'onSubmitAddressProof' | 'onCheckProgress'>;

export interface AddressFlowProps {
  variant: 'dialog' | 'page';
  verification: VerificationSummary;
  handlers: Handlers;
  doneHref?: string;
  /** Previews: a screen, a chosen address, kind and file, the reading's answer. */
  preview?: {
    screen?: AddressScreen;
    address?: AddressSuggestion;
    documentType?: AddressDocumentType;
    file?: { name: string; size: number; type: string };
    progress?: AddressCheckProgress | null;
    suggestions?: AddressSuggestion[];
  };
}

const POLL_MS = 2_000;
const POLL_FOR_MS = 75_000;
const SCREEN_PROGRESS: Partial<Record<AddressScreen, number>> = { intro: 0.05, address: 0.3, kind: 0.55, upload: 0.8 };

const KIND_ICONS: Record<AddressDocumentType, typeof Zap> = {
  utility_bill: Zap,
  bank_statement: Landmark,
  phone_or_internet_bill: Smartphone,
  lease: KeyRound,
  insurance_statement: ShieldCheck,
  government_letter: Building2,
};
/** The kinds most people have at hand first. */
const KIND_ORDER: readonly AddressDocumentType[] = ['bank_statement', 'utility_bill', 'phone_or_internet_bill', 'lease', 'insurance_statement', 'government_letter'];

export function initialAddressScreen(address: VerificationSummary['address']): AddressScreen {
  if (address.status === 'in_review' || address.update?.status === 'in_review' || address.status === 'verified') return 'status';
  return 'intro';
}

export function AddressFlow({ variant, verification, handlers, doneHref = routes.app.helperVerification(), preview }: AddressFlowProps) {
  const t = useTranslations('verifyFlow.address');
  const v = useTranslations('verification.homeAddress');
  const router = useRouter();
  const dialog = useRouteDialog();
  const id = useId();
  const address = verification.address;

  const [screen, setScreen] = useState<AddressScreen>(preview?.screen ?? initialAddressScreen(address));
  const [direction, setDirection] = useState<1 | -1>(1);
  const [place, setPlace] = useState<AddressSuggestion | undefined>(preview?.address);
  const [unit, setUnit] = useState('');
  const [placeError, setPlaceError] = useState<string>();
  const [documentType, setDocumentType] = useState<AddressDocumentType | undefined>(preview?.documentType);
  const [file, setFile] = useState<File | undefined>(() => (preview?.file ? new File([new Uint8Array(Math.min(preview.file.size, 16))], preview.file.name, { type: preview.file.type }) : undefined));
  const [declared, setDeclared] = useState(false);
  const [declarationError, setDeclarationError] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [progress, setProgress] = useState<AddressCheckProgress | null | undefined>(preview?.progress);
  const [slow, setSlow] = useState(false);

  const go = (next: AddressScreen, way: 1 | -1 = 1) => {
    setDirection(way);
    setScreen(next);
  };
  const order: AddressScreen[] = ['intro', 'address', 'kind', 'upload'];
  const index = order.indexOf(screen);
  const back = index > 0 && !busy ? () => go(order[index - 1]!, -1) : screen === 'intro' && address.status === 'verified' ? () => go('status', -1) : undefined;

  const polling = (screen === 'verifying' || (screen === 'status' && (address.status === 'in_review' || address.update?.status === 'in_review'))) && !preview;
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      const answer = await handlers.onCheckProgress({ kind: 'address' }).catch(() => null);
      if (stopped) return;
      const progressAnswer = answer?.kind === 'address' ? answer : null;
      if (progressAnswer && progressAnswer.phase !== 'reading') {
        setProgress(progressAnswer);
        return;
      }
      if (progressAnswer) setProgress(progressAnswer);
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

  const answered = screen === 'verifying' && ((progress !== undefined && progress !== null && progress.phase !== 'reading') || slow);
  useEffect(() => {
    if (!answered || preview) return;
    const rows = progress?.checks.filter((item) => item.outcome !== 'skipped').length ?? 0;
    const timer = setTimeout(() => go('result'), slow ? 300 : rows * 220 + 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` only sets state
  }, [answered, slow]);

  function choose(chosen: File | undefined) {
    if (!chosen) return;
    setFailure(undefined);
    if (!(ADDRESS_PROOF_RULES.acceptedTypes as readonly string[]).includes(chosen.type)) {
      setFailure(v('errors.unsupported_type'));
      return;
    }
    if (chosen.size > ADDRESS_PROOF_RULES.maxMegabytes * 1024 * 1024) {
      setFailure(v('errors.too_large', { megabytes: ADDRESS_PROOF_RULES.maxMegabytes }));
      return;
    }
    setFile(chosen);
  }

  async function submit() {
    if (busy || sent || !place || !documentType || !file) return;
    if (!declared) {
      setDeclarationError(true);
      return;
    }
    const form = new FormData();
    form.set('placeId', place.placeId);
    if (unit.trim()) form.set('line2', unit.trim());
    form.set('documentType', documentType);
    form.set('declaration', 'true');
    form.set('file', file);
    setBusy(true);
    setFailure(undefined);
    let result: AddressProofResult;
    try {
      result = await handlers.onSubmitAddressProof(form);
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
      if (fields.placeId) {
        setPlaceError(fields.placeId[0] === 'not_supported' ? v('outOfArea') : v('errors.placeId'));
        go('address', -1);
        return;
      }
      if (fields.documentType) {
        go('kind', -1);
        return;
      }
      if (fields.file) {
        setFailure(v(fields.file[0] === 'invalid' ? 'errors.fileInvalid' : 'errors.fileRequired'));
        return;
      }
      if (fields.declaration) {
        setDeclarationError(true);
        return;
      }
    }
    setFailure(v(`errors.${result.code === 'validation_failed' ? 'unknown' : result.code}`, { megabytes: ADDRESS_PROOF_RULES.maxMegabytes }));
  }

  function done(message?: string) {
    if (dialog) {
      if (sent || message) dialog.finish({ ok: true, code: 'updated' }, message);
      else dialog.close();
      return;
    }
    router.push(doneHref);
    router.refresh();
  }

  const checkRows = (answer: AddressCheckProgress | null | undefined): FlowCheckRow[] =>
    ADDRESS_CHECK_KEYS.map((key: AddressCheckKey) => {
      const outcome = answer?.checks.find((item) => item.key === key)?.outcome ?? 'pending';
      const label = key === 'accepted_kind' && answer?.issuer && outcome === 'pass' ? t('checks.fromIssuer', { issuer: answer.issuer }) : t(`checks.${key}`);
      return { key, label, outcome, ...(outcome === 'unsure' ? { note: t('checks.teamWillLook') } : {}) };
    });

  let content: React.ReactNode = null;
  let footer: React.ReactNode = null;
  switch (screen) {
    case 'intro':
      content = <>
        <FlowHeading icon={<FlowIcon><House /></FlowIcon>} description={t('intro.description')}>{t('intro.title')}</FlowHeading>
        <ul className="space-y-3">
          {[
            { icon: FileText, title: t('intro.kindsRow'), hint: t('intro.kindsHint') },
            { icon: CalendarCheck, title: t('intro.recentRow', { days: ADDRESS_PROOF_RULES.maxAgeDays }), hint: t('intro.recentHint') },
            { icon: Lock, title: t('intro.privateRow'), hint: t('intro.privateHint') },
          ].map((row) => <li key={row.title} className="flex items-center gap-4 rounded-2xl bg-foreground/[0.03] p-4">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card shadow-sm"><row.icon className="size-5 text-primary" /></span>
            <span><span className="block font-medium">{row.title}</span><span className="block text-sm text-muted-foreground">{row.hint}</span></span>
          </li>)}
        </ul>
        {(address.status === 'rejected' || address.update?.status === 'rejected') && <p className="mt-4 flex items-start gap-2 rounded-2xl bg-badge-warning p-3 text-sm text-badge-warning-foreground"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{v(`rejectionReasons.${(address.status === 'rejected' ? address.rejectionReason : address.update?.rejectionReason) ?? 'other'}`)}</p>}
        {address.status === 'requested' && <p className="mt-4 flex items-start gap-2 rounded-2xl bg-badge-warning p-3 text-sm text-badge-warning-foreground"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{v('requested')}</p>}
      </>;
      footer = <Button size="lg" className="w-full" onClick={() => go('address')}>{t('intro.start')}</Button>;
      break;
    case 'address':
      content = <>
        <FlowHeading description={t('addressStep.description')}>{t('addressStep.title')}</FlowHeading>
        <div className="space-y-5">
          <AddressSearchField
            label={v('search')}
            hint={v('searchHint')}
            onSearch={handlers.onSearchAddresses}
            selected={place}
            onSelect={(next) => { setPlace(next); setPlaceError(undefined); }}
            error={placeError}
            outOfAreaMessage={v('outOfArea')}
            initialSuggestions={preview?.suggestions}
          />
          <div className="space-y-2">
            <label htmlFor={`${id}-unit`} className="text-sm font-medium">{v('unit')}</label>
            <Input id={`${id}-unit`} value={unit} maxLength={40} autoComplete="address-line2" onChange={(event) => setUnit(event.target.value)} />
          </div>
        </div>
      </>;
      footer = <Button size="lg" className="w-full" disabled={!place} onClick={() => go('kind')}>{t('continue')}</Button>;
      break;
    case 'kind':
      content = <>
        <FlowHeading description={t('kind.description')}>{t('kind.title')}</FlowHeading>
        <div className="space-y-3">
          {KIND_ORDER.filter((type) => (ADDRESS_DOCUMENT_TYPES as readonly string[]).includes(type)).map((type) => {
            const Icon = KIND_ICONS[type];
            return <FlowChoice key={type} icon={<Icon />} label={v(`documentTypes.${type}`)} selected={documentType === type} onClick={() => { setDocumentType(type); go('upload'); }} />;
          })}
        </div>
      </>;
      break;
    case 'upload':
      content = <>
        <FlowHeading description={t('upload.description', { days: ADDRESS_PROOF_RULES.maxAgeDays })}>{documentType ? t('upload.titleKind', { kind: v(`documentTypes.${documentType}`).toLowerCase() }) : t('upload.title')}</FlowHeading>
        <DropZone file={file} onFile={choose} onClear={() => setFile(undefined)} />
        {failure && <p role="alert" className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{failure}</p>}
        <label className={cn('mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm leading-6 transition-colors', declarationError ? 'border-destructive' : declared ? 'border-primary/50 bg-brand-soft/40' : 'border-foreground/[0.12]')}>
          <input type="checkbox" checked={declared} onChange={(event) => { setDeclared(event.target.checked); setDeclarationError(false); }} aria-invalid={declarationError || undefined} className="mt-1 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
          <span>{t('upload.declaration', { days: ADDRESS_PROOF_RULES.maxAgeDays })}</span>
        </label>
        {declarationError && <p className="mt-2 text-sm text-destructive">{v('errors.declaration')}</p>}
      </>;
      footer = <Button size="lg" className="w-full" disabled={!file || busy} aria-busy={busy} onClick={() => void submit()}>{busy && <Spinner />}{busy ? t('upload.sending') : t('upload.submit')}</Button>;
      break;
    case 'verifying':
      content = <>
        <div className="pt-4 pb-6"><ScanIllustration kind="address" /></div>
        <FlowHeading description={t('verifying.description')}>{t('verifying.title')}</FlowHeading>
        <CheckList label={t('checks.label')} rows={checkRows(progress)} />
        <p role="status" aria-live="polite" className="sr-only">{answered ? t('verifying.done') : ''}</p>
      </>;
      break;
    case 'result': {
      const key = !progress || slow || progress.phase === 'reading' ? 'slow' : progress.phase === 'approved' ? 'verified' : progress.phase === 'rejected' ? 'rejected' : 'review';
      content = <>
        <FlowHeading
          icon={key === 'verified' ? <SuccessMark /> : <FlowIcon tone={key === 'rejected' ? 'danger' : 'info'}>{key === 'rejected' ? <X /> : <Clock />}</FlowIcon>}
          description={key === 'rejected' ? v(`rejectionReasons.${progress?.rejectionReason ?? 'other'}`) : t(`result.${key}Body`)}
        >{t(`result.${key}Title`)}</FlowHeading>
        {progress && progress.checks.length > 0 && <CheckList label={t('checks.label')} rows={checkRows(progress)} />}
      </>;
      footer = key === 'rejected' && progress?.canRetry !== false
        ? <><Button size="lg" className="w-full" onClick={() => { setFile(undefined); setDeclared(false); setSent(false); setProgress(undefined); go('kind', -1); }}>{t('result.tryAgain')}</Button><Button variant="ghost" className="w-full" onClick={() => done()}>{t('result.later')}</Button></>
        : <Button size="lg" className="w-full" onClick={() => done(t(key === 'verified' ? 'result.toastVerified' : 'result.toastReview'))}>{t('result.done')}</Button>;
      break;
    }
    case 'status':
      content = <AddressStatus verification={verification} progress={progress} slow={slow} />;
      footer = address.status === 'verified' && !address.update
        ? <><Button size="lg" className="w-full" onClick={() => done()}>{t('result.done')}</Button><Button variant="ghost" className="w-full" onClick={() => go('intro')}>{t('status.moved')}</Button></>
        : <Button size="lg" className="w-full" onClick={() => done()}>{t('result.done')}</Button>;
      break;
  }

  const stepProgress = SCREEN_PROGRESS[screen];
  return <FlowFrame
    variant={variant}
    title={t('title')}
    screen={screen}
    direction={direction}
    {...(stepProgress !== undefined ? { progress: stepProgress } : {})}
    {...(back ? { onBack: back } : {})}
    {...(variant === 'page' ? { onClose: () => done() } : {})}
    footer={footer}
  >
    {content}
  </FlowFrame>;
}

/** A file dropped on it, picked, or (phones) photographed; once chosen, its name, size and a picture of it. */
function DropZone({ file, onFile, onClear }: { file?: File; onFile: (file: File | undefined) => void; onClear: () => void }) {
  const t = useTranslations('verifyFlow.address.upload');
  const id = useId();
  const [over, setOver] = useState(false);
  // A picture of a chosen photo (a PDF shows its icon); its object URL is let go when the file changes or the flow closes.
  const thumb = useMemo(() => (file && file.type.startsWith('image/') && file.size > 16 && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined), [file]);
  useEffect(() => () => {
    if (thumb) URL.revokeObjectURL(thumb);
  }, [thumb]);
  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setOver(false);
    onFile(event.dataTransfer.files?.[0]);
  };
  if (file) {
    const megabytes = Math.max(0.1, Math.round((file.size / 1024 / 1024) * 10) / 10);
    return <div className="flex items-center gap-4 rounded-2xl border bg-card p-4">
      {thumb
        // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
        ? <img src={thumb} alt="" className="size-16 shrink-0 rounded-xl border object-cover" />
        : <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary"><FileText className="size-7" /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{file.name}</span>
        <span className="block text-sm text-muted-foreground tabular-nums">{t('size', { size: megabytes })}</span>
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>{t('change')}</Button>
    </div>;
  }
  return <div className="space-y-3">
    <input id={id} type="file" accept={ADDRESS_PROOF_RULES.acceptedTypes.join(',')} className="peer sr-only" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ''; }} />
    <label
      htmlFor={id}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        'flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.5rem] border-2 border-dashed px-6 py-8 text-center transition-[border-color,background-color,transform] duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
        over ? 'scale-[1.01] border-primary bg-brand-soft/60' : 'border-foreground/15 bg-foreground/[0.02] hover:border-foreground/30',
      )}
    >
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-card text-primary shadow-sm"><Upload className="size-5" /></span>
      <span className="font-medium">{t('drop')}</span>
      <span className="text-sm text-muted-foreground">{t('types', { megabytes: ADDRESS_PROOF_RULES.maxMegabytes })}</span>
    </label>
    <PhoneCameraButton onFile={(chosen) => onFile(chosen)} />
  </div>;
}

/** On phones: a photo of a paper bill with the camera app. */
function PhoneCameraButton({ onFile }: { onFile: (file: File) => void }) {
  const t = useTranslations('verifyFlow.address.upload');
  const id = useId();
  const phone = useCoarsePointer();
  if (!phone) return null;
  return <span className="block">
    <input id={id} type="file" accept="image/*" capture="environment" className="peer sr-only" onChange={(event) => { const chosen = event.target.files?.[0]; event.target.value = ''; if (chosen) onFile(chosen); }} />
    <label htmlFor={id} className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-foreground/[0.14] bg-card px-5 text-[0.9375rem] font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring"><Camera aria-hidden="true" className="size-4" />{t('photo')}</label>
  </span>;
}

function AddressStatus({ verification, progress, slow }: { verification: VerificationSummary; progress: AddressCheckProgress | null | undefined; slow: boolean }) {
  const t = useTranslations('verifyFlow.address');
  const { formatDate } = useFormat();
  const address = verification.address;
  const reviewing = address.status === 'in_review' || address.update?.status === 'in_review';
  if (address.status === 'verified' && !reviewing) {
    return <>
      <FlowHeading icon={<SuccessMark />} description={address.verifiedAt ? t('status.verifiedOn', { date: formatDate(address.verifiedAt) }) : undefined}>{t('result.verifiedTitle')}</FlowHeading>
      {address.label && <p className="rounded-2xl bg-foreground/[0.03] p-4 text-center text-[0.9375rem] break-words"><House aria-hidden="true" className="mr-1.5 inline size-4 align-[-2px] text-muted-foreground" />{address.label}</p>}
    </>;
  }
  const reading = !progress || progress.phase === 'reading';
  return <>
    {reading && !slow && <div className="pt-4 pb-6"><ScanIllustration kind="address" /></div>}
    <FlowHeading icon={reading && !slow ? undefined : <FlowIcon tone="info"><Clock /></FlowIcon>} description={t(address.recheck === 'name_differs' ? 'status.recheckBody' : reading && !slow ? 'verifying.description' : 'result.reviewBody')}>{t(reading && !slow ? 'verifying.title' : 'result.reviewTitle')}</FlowHeading>
    {progress && progress.checks.length > 0 && <CheckList label={t('checks.label')} rows={ADDRESS_CHECK_KEYS.map((key) => {
      const outcome = progress.checks.find((item) => item.key === key)?.outcome ?? 'unsure';
      return { key, label: key === 'accepted_kind' && progress.issuer && outcome === 'pass' ? t('checks.fromIssuer', { issuer: progress.issuer }) : t(`checks.${key}`), outcome, ...(outcome === 'unsure' ? { note: t('checks.teamWillLook') } : {}) };
    })} />}
    {address.label && <p className="mt-4 text-center text-sm text-muted-foreground break-words">{address.label}</p>}
  </>;
}
