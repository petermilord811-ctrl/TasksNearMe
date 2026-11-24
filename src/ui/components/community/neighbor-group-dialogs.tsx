'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Signpost, UsersRound } from 'lucide-react';
import {
  NEIGHBOR_GROUP_KINDS,
  NEIGHBOR_GROUP_NAME_MAX,
  NEIGHBOR_GROUP_NAME_MIN,
  type ActionResult,
  type NeighborGroupCodeInput,
  type NeighborGroupCreateInput,
  type NeighborGroupInvitePreview,
  type NeighborGroupKind,
  type NeighborGroupResult,
  type QueryHandler,
} from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { Input } from '@/ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Spinner } from '@/ui/primitives/spinner';

export const GroupKindIcon = ({ kind, className }: { kind: NeighborGroupKind; className?: string }) =>
  kind === 'street' ? <Signpost aria-hidden="true" className={className} /> : <Building2 aria-hidden="true" className={className} />;

/** A result the screens couldn't get (the action threw): said as "something went wrong". */
const failed = { ok: false as const, code: 'unknown' as const };

/**
 * "Create a group" (2026-11-24): a name and whether it's for a building or a street, in the creator's own
 * neighborhood (shown, not chosen). The server decides the rest; the new group opens on its members, to invite people.
 */
export function CreateGroupDialog({ open, onOpenChange, areaName, onCreate, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areaName?: string;
  onCreate: QueryHandler<NeighborGroupCreateInput, NeighborGroupResult>;
  onCreated: (groupId: string) => void;
}) {
  const t = useTranslations('neighborGroups.create');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const id = useId();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<NeighborGroupKind>('building');
  const [result, setResult] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();
  const nameError = result && !result.ok ? result.fieldErrors?.name?.[0] : undefined;
  const tooShort = name.trim().length < NEIGHBOR_GROUP_NAME_MIN;

  const submit = () => startTransition(async () => {
    let next: NeighborGroupResult;
    try {
      next = await onCreate({ name, kind });
    } catch {
      next = failed;
    }
    if (next.ok && next.groupId) {
      setResult(undefined);
      setName('');
      onCreated(next.groupId);
      return;
    }
    setResult(next);
  });
  const errorMessage = result && !result.ok ? (result.code === 'limit_reached' ? t('limit') : result.code === 'not_allowed' ? t('notAllowed') : undefined) : undefined;

  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description', { area: areaName ?? '' })}</DialogDescription>
      </DialogHeader>
      <form id={`${id}-form`} noValidate aria-busy={pending} className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!pending && !tooShort) submit(); }}>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-semibold">{t('name')}</label>
          <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} maxLength={NEIGHBOR_GROUP_NAME_MAX} autoComplete="off" aria-describedby={`${id}-hint`} aria-invalid={Boolean(nameError)} />
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('nameHint')}</p>
          {nameError && <p className="text-sm text-destructive">{fieldCopy(fieldCopy.has(nameError) ? nameError : 'invalid')}</p>}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">{t('kind')}</legend>
          <RadioGroup value={kind} onValueChange={(value) => setKind(value as NeighborGroupKind)} className="grid gap-2 sm:grid-cols-2">
            {NEIGHBOR_GROUP_KINDS.map((option) => <label key={option} htmlFor={`${id}-${option}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
              <RadioGroupItem id={`${id}-${option}`} value={option} />
              <GroupKindIcon kind={option} className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t(`kindOptions.${option}`)}</span>
            </label>)}
          </RadioGroup>
        </fieldset>
        {areaName && <p className="text-sm"><span className="font-semibold">{t('area')}:</span> {areaName}</p>}
        <FormFeedback result={result && !result.ok && !nameError ? result : undefined} {...(errorMessage ? { errorMessage } : {})} />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={pending}>{t('cancel')}</Button>
        <Button type="submit" form={`${id}-form`} className="min-h-11" disabled={pending || tooShort} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'pending' : 'submit')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/**
 * "Join with a code" (2026-11-24): the code or the whole link, checked first so the person sees which group it is (and
 * why it won't work: expired, turned off, another neighborhood, full) before they accept. Opened from an invite link
 * with its preview already made.
 */
export function JoinGroupDialog({ open, onOpenChange, initial, onPreview, onJoin, onJoined }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: NeighborGroupInvitePreview;
  onPreview: QueryHandler<NeighborGroupCodeInput, NeighborGroupInvitePreview>;
  onJoin: QueryHandler<NeighborGroupCodeInput, NeighborGroupResult>;
  onJoined: (groupId: string, name: string) => void;
}) {
  const t = useTranslations('neighborGroups.join');
  const kinds = useTranslations('neighborGroups.kinds');
  const id = useId();
  const [code, setCode] = useState(initial?.code ?? '');
  const [preview, setPreview] = useState<NeighborGroupInvitePreview | undefined>(initial);
  const [result, setResult] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();

  const check = () => startTransition(async () => {
    setResult(undefined);
    try {
      setPreview(await onPreview({ code }));
    } catch {
      setResult(failed);
    }
  });
  const join = () => startTransition(async () => {
    let next: NeighborGroupResult;
    try {
      next = await onJoin({ code: preview?.code ?? code });
    } catch {
      next = failed;
    }
    if (next.ok && next.groupId) {
      onJoined(next.groupId, preview?.group?.name ?? '');
      return;
    }
    setResult(next);
  });
  const state = preview?.state;
  const group = preview?.group;
  const canJoin = state === 'valid';

  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <form id={`${id}-form`} noValidate aria-busy={pending} className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (pending || !code.trim()) return; if (canJoin && preview?.code) join(); else check(); }}>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-code`} className="text-sm font-semibold">{t('code')}</label>
          <div className="flex gap-2">
            <Input id={`${id}-code`} value={code} onChange={(event) => { setCode(event.target.value); setPreview(undefined); setResult(undefined); }} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono uppercase tracking-wider" />
            <Button type="button" variant="outline" className="min-h-11 shrink-0" disabled={pending || !code.trim()} onClick={check}>{t(pending && !canJoin ? 'checking' : 'check')}</Button>
          </div>
        </div>
        <div aria-live="polite" aria-atomic="true">
          {state && <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <p className="text-sm font-medium">{t(`states.${state}`, { group: group?.name ?? '', area: group?.areaName ?? '', yours: preview?.yourAreaName ?? '' })}</p>
            {group && (state === 'valid' || state === 'member') && <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <GroupKindIcon kind={group.kind} className="size-4 shrink-0" />
              {t('about', { kind: kinds(group.kind), area: group.areaName, count: group.memberCount })}
            </p>}
            {canJoin && <p className="flex gap-2 text-sm text-muted-foreground"><UsersRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>}
          </div>}
        </div>
        <FormFeedback result={result} />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={pending}>{t('cancel')}</Button>
        {state === 'member' && group
          ? <Button type="button" className="min-h-11" onClick={() => onJoined(group.id, group.name)}>{t('openGroup')}</Button>
          : <Button type="submit" form={`${id}-form`} className="min-h-11" disabled={pending || !canJoin} aria-busy={pending && canJoin}>{pending && canJoin && <Spinner aria-hidden="true" />}{t(pending && canJoin ? 'pending' : 'submit')}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
