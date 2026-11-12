'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CircleAlert, CircleCheck, ImagePlus, Trash2 } from 'lucide-react';
import type { ActionResult, Photo, PhotoUploadResult } from '@/contracts';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { cn } from '@/ui/lib/utils';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

type UploadFailure = Extract<PhotoUploadResult, { ok: false }>['code'];

/**
 * The profile photo (the account page and the helper profile editor): the avatar as people see it, a button
 * to choose a new photo (the file input stays in the page, visually hidden but focusable) and one to remove
 * it. A new photo shows as soon as it's saved; the page then refreshes.
 */
export function ProfilePhotoField({
  initials,
  photo: saved,
  maxPhotoMegabytes,
  note,
  onUpload,
  onRemove,
}: {
  initials: string;
  photo?: Photo;
  maxPhotoMegabytes: number;
  /** Where else the photo shows, said under the hint. */
  note?: 'publicProfile' | 'helperEditor';
  onUpload: (form: FormData) => Promise<PhotoUploadResult>;
  onRemove: () => Promise<ActionResult>;
}) {
  const t = useTranslations('forms.profilePhoto');
  const feedback = useTranslations('feedback');
  const router = useRouter();
  const id = useId();
  // A saved change shows at once; the refreshed page data replaces it when it arrives.
  const [local, setLocal] = useState<{ photo?: Photo; over?: Photo }>();
  const photo = local && local.over === saved ? local.photo : saved;
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [outcome, setOutcome] = useState<{ kind: 'uploaded' | 'removed' } | { kind: 'failed'; code: UploadFailure } | { kind: 'remove_failed'; result: ActionResult }>();

  async function upload(file: File) {
    if (busy) return;
    if (file.size > maxPhotoMegabytes * 1024 * 1024) {
      setOutcome({ kind: 'failed', code: 'too_large' });
      return;
    }
    setBusy('upload');
    setOutcome(undefined);
    const body = new FormData();
    body.append('file', file);
    let result: PhotoUploadResult;
    try {
      result = await onUpload(body);
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    setBusy(null);
    if (!result.ok) {
      setOutcome({ kind: 'failed', code: result.code });
      return;
    }
    setLocal({ photo: result.photo, over: saved });
    setOutcome({ kind: 'uploaded' });
    router.refresh();
  }

  async function remove() {
    if (busy) return;
    setBusy('remove');
    setOutcome(undefined);
    let result: ActionResult;
    try {
      result = await onRemove();
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    setBusy(null);
    if (!result.ok) {
      setOutcome({ kind: 'remove_failed', result });
      return;
    }
    setLocal({ photo: undefined, over: saved });
    setOutcome({ kind: 'removed' });
    router.refresh();
  }

  const failed = outcome?.kind === 'failed' || outcome?.kind === 'remove_failed';
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
      <div className="relative w-fit shrink-0">
        <InitialsAvatar initials={initials} photo={photo} size="xl" />
        {busy && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-background/70">
            <Spinner aria-hidden="true" className="size-6" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <p id={`${id}-label`} className="font-medium">{t('label')}</p>
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {t('hint', { megabytes: maxPhotoMegabytes })}
            {note && <> {t(`notes.${note}`)}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={busy !== null}
            aria-describedby={`${id}-hint ${id}-status`}
            aria-busy={busy === 'upload' || undefined}
            className="peer sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared, so choosing the same file again still uploads it.
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
          <label
            htmlFor={id}
            aria-disabled={busy !== null || undefined}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'min-h-11 cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:pointer-events-none peer-disabled:opacity-50',
            )}
          >
            {busy === 'upload' ? <Spinner aria-hidden="true" /> : <ImagePlus aria-hidden="true" className="size-4" />}
            {busy === 'upload' ? t('uploading') : t(photo ? 'change' : 'add')}
          </label>
          {photo && (
            <Button type="button" variant="ghost" className="min-h-11" disabled={busy !== null} aria-busy={busy === 'remove'} onClick={() => void remove()}>
              {busy === 'remove' ? <Spinner aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              {busy === 'remove' ? t('removing') : t('remove')}
            </Button>
          )}
        </div>
        <div id={`${id}-status`} aria-live="polite" aria-atomic="true">
          {outcome && (
            <p className={cn('flex items-start gap-2 text-sm', failed ? 'text-destructive' : 'text-foreground')}>
              {failed ? <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />}
              <span>
                {outcome.kind === 'failed'
                  ? t(`errors.${outcome.code}`, { megabytes: maxPhotoMegabytes })
                  : outcome.kind === 'remove_failed'
                    ? feedback(`error.${outcome.result.ok ? 'unknown' : outcome.result.code}`)
                    : t(outcome.kind)}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
