'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb, MapPin, Tag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ActionHandler, ActionResult, QueryHandler } from '@/contracts/actions';
import {
  COMMUNITY_BODY_MAX,
  COMMUNITY_BODY_MIN,
  COMMUNITY_BODY_OPTIONAL_KINDS,
  COMMUNITY_POST_KINDS,
  COMMUNITY_POST_PHOTOS_MAX,
  COMMUNITY_TITLE_MAX,
  type CommunityComposerData,
  type CommunityPostInput,
  type CommunityPostKind,
} from '@/contracts/community';
import type { Photo } from '@/contracts/common';
import type { PhotoUploadResult } from '@/contracts/posting';
import { routes } from '@/contracts/routes';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { LocaleLink as Link, localeHref } from '@/ui/lib/locale-link';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { CommunityPhotoPicker } from './community-photo-picker';
import { isKindnessReminder, KindnessReminder } from './kindness-reminder';
import { kindIcons } from './post-card';
import { useSparksToast } from './sparks-toast';

export interface CommunityPostFormProps {
  data: CommunityComposerData & { bookingId?: string };
  initialKind: CommunityPostKind;
  onPost: ActionHandler<CommunityPostInput>;
  /** Photos (plan 10.1); without it, the form takes none. */
  onUploadPhoto?: QueryHandler<FormData, PhotoUploadResult>;
  /** The form's accessible name. */
  label: string;
  /** The composer's Cancel, beside Post. */
  onCancel?: () => void;
  /** Move focus into the title when the form appears (the composer opening). */
  focusOnMount?: boolean;
  className?: string;
}

/** What this device keeps of an unfinished post (plan 10.6). */
interface Draft {
  kind: CommunityPostKind;
  title: string;
  body: string;
  categorySlug: string;
  areaSlug: string;
  photos: Photo[];
}

function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<Draft>;
    if (!draft || typeof draft.title !== 'string' || typeof draft.body !== 'string') return null;
    return {
      kind: (COMMUNITY_POST_KINDS as readonly string[]).includes(draft.kind ?? '') ? (draft.kind as CommunityPostKind) : 'recommendation',
      title: draft.title,
      body: draft.body,
      categorySlug: typeof draft.categorySlug === 'string' ? draft.categorySlug : '',
      areaSlug: typeof draft.areaSlug === 'string' ? draft.areaSlug : '',
      photos: Array.isArray(draft.photos) ? draft.photos.filter((photo): photo is Photo => Boolean(photo && typeof photo.id === 'string' && typeof photo.src === 'string')).slice(0, COMMUNITY_POST_PHOTOS_MAX) : [],
    };
  } catch {
    return null;
  }
}

const chipClass = 'inline-flex min-h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring';
const pillSelect = 'h-10 max-w-full appearance-none rounded-full border border-border bg-card pr-8 pl-8 text-[13px] font-semibold text-foreground/90 outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';

/**
 * A new community post (completion plan 7.7; plan 10.6, Nextdoor's light composer), on its own page and in the portal's
 * composer: the kind as one row of chips, the season's starters while the title is empty, a title and (for an ask,
 * optional) details, photos, and the service and neighborhood as two pills. The rules sit above the button, where people
 * read them; words that might land as unkind get the kindness reminder. An unfinished post stays on this device until
 * it's posted or discarded. Posting opens the new post.
 */
export function CommunityPostForm({ data, initialKind, onPost, onUploadPhoto, label, onCancel, focusOnMount = false, className }: CommunityPostFormProps) {
  const t = useTranslations('community');
  const card = useTranslations('taskCard');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const sparksToast = useSparksToast();
  const { formatDate } = useFormat();
  const router = useRouter();
  const locale = useLocale();
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [kind, setKind] = useState<CommunityPostKind>(initialKind);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [areaSlug, setAreaSlug] = useState(data.yourArea?.slug ?? '');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [bookingId, setBookingId] = useState(data.bookingId ?? data.thankOptions[0]?.bookingId ?? '');
  const [result, setResult] = useState<ActionResult | undefined>();
  const [restored, setRestored] = useState(false);
  const [pending, startTransition] = useTransition();
  const reminder = isKindnessReminder(result);
  const errors = result && !result.ok && !reminder ? result.fieldErrors ?? {} : {};
  const errorOf = (field: string) => {
    const code = errors[field]?.[0];
    return code ? fieldCopy(fieldCopy.has(code) ? code : 'invalid') : undefined;
  };
  const bodyOptional = (COMMUNITY_BODY_OPTIONAL_KINDS as readonly string[]).includes(kind);
  const thanksBlocked = kind === 'thanks' && data.thankOptions.length === 0;
  const blocked = Boolean(data.postBlocked) || thanksBlocked;
  const tooShort = title.trim().length < 5 || (!bodyOptional && body.trim().length < COMMUNITY_BODY_MIN);

  // The composer opens on a chosen kind (the form mounts with it), and the title takes focus.
  useEffect(() => {
    if (focusOnMount) titleRef.current?.focus();
  }, [focusOnMount]);

  // A draft this device kept (plan 10.6) comes back, unless the form was opened for a thanks from a booking.
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    if (data.bookingId) return;
    const draft = readDraft(data.draftKey);
    if (!draft || (!draft.title.trim() && !draft.body.trim() && draft.photos.length === 0)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device's storage exists only after hydration
    setKind(draft.kind);
    setTitle(draft.title);
    setBody(draft.body);
    setCategorySlug(draft.categorySlug);
    if (draft.areaSlug === '' || data.areas.some((area) => area.slug === draft.areaSlug)) setAreaSlug(draft.areaSlug);
    setPhotos(draft.photos);
    setRestored(true);
  }, [data.draftKey, data.bookingId, data.areas]);

  // Kept as it's typed (a little after each change), and forgotten once posted or emptied.
  useEffect(() => {
    if (!loaded.current) return;
    const handle = window.setTimeout(() => {
      try {
        if (!title.trim() && !body.trim() && photos.length === 0) window.localStorage.removeItem(data.draftKey);
        else window.localStorage.setItem(data.draftKey, JSON.stringify({ kind, title, body, categorySlug, areaSlug, photos } satisfies Draft));
      } catch {
        // No storage (a private window): the draft isn't kept.
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [data.draftKey, kind, title, body, categorySlug, areaSlug, photos]);

  const discard = () => {
    try {
      window.localStorage.removeItem(data.draftKey);
    } catch {
      // Nothing kept.
    }
    setTitle('');
    setBody('');
    setPhotos([]);
    setCategorySlug('');
    setRestored(false);
    titleRef.current?.focus();
  };

  const submit = (kindnessConfirmed = false) => startTransition(async () => {
    let next: ActionResult;
    try {
      next = await onPost({
        kind,
        title,
        body,
        categorySlug: categorySlug || undefined,
        areaSlug,
        ...(kind === 'thanks' ? { bookingId } : {}),
        ...(photos.length > 0 ? { photoIds: photos.map((photo) => photo.id) } : {}),
        ...(kindnessConfirmed ? { kindnessConfirmed: true } : {}),
      });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    setResult(next);
    if (next.ok) {
      try {
        window.localStorage.removeItem(data.draftKey);
      } catch {
        // Nothing kept.
      }
      sparksToast(t('newPost.success'), next.sparks);
      if (next.redirectTo) router.push(localeHref(next.redirectTo, locale));
    }
  });

  const field = 'space-y-1.5';
  const errorText = (name: string) => errorOf(name) && <p id={`${id}-${name}-error`} className="text-sm text-destructive">{errorOf(name)}</p>;

  return <form noValidate aria-label={label} className={cn('space-y-5', className)} onSubmit={(event) => { event.preventDefault(); if (!pending && !blocked && !tooShort) submit(); }}>
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{t('newPost.kind')}</legend>
      <div className="flex flex-wrap gap-1.5">
        {COMMUNITY_POST_KINDS.map((option) => {
          const Icon = kindIcons[option];
          const chosen = kind === option;
          return <label key={option} className={cn(chipClass, chosen ? 'border-primary/60 bg-brand-soft text-primary' : 'border-border text-foreground/85 hover:border-foreground/25')}>
            <input type="radio" name={`${id}-kind`} value={option} checked={chosen} onChange={() => setKind(option)} className="sr-only" />
            <Icon aria-hidden="true" className={cn('size-4 shrink-0', chosen ? 'text-primary' : 'text-muted-foreground')} />{t(`kinds.${option}`)}
          </label>;
        })}
      </div>
    </fieldset>

    {restored && <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-muted/70 px-3 py-2 text-sm text-muted-foreground">
      {t('draft.restored')}
      <button type="button" onClick={discard} className="min-h-8 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('draft.discard')}</button>
    </p>}

    {/* The season's starters (plan 10.18), while there's no title yet. */}
    {data.starters.length > 0 && !title.trim() && kind !== 'thanks' && <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><Lightbulb aria-hidden="true" className="size-3.5 text-primary" />{t('starters.title')}</p>
      <ul className="flex flex-wrap gap-1.5">{data.starters.map((starter) => <li key={starter.title} className="min-w-0">
        <button type="button" onClick={() => { setKind(starter.kind); setTitle(starter.title); if (starter.categorySlug) setCategorySlug(starter.categorySlug); bodyRef.current?.focus(); }} className="min-h-10 max-w-full rounded-2xl border border-dashed border-primary/40 bg-card px-3 py-1.5 text-left text-[13px] font-medium text-foreground/90 transition-colors hover:border-primary hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-ring">
          {starter.title}
        </button>
      </li>)}</ul>
    </div>}

    {kind === 'thanks' && <div className={field}>
      <label htmlFor={`${id}-booking`} className="text-sm font-semibold">{t('newPost.booking')}</label>
      {data.thankOptions.length === 0
        ? <p className="text-sm text-muted-foreground">{t('newPost.noBookings')}</p>
        : <select id={`${id}-booking`} value={bookingId} onChange={(event) => setBookingId(event.target.value)} aria-invalid={Boolean(errorOf('bookingId'))} className="h-11 w-full rounded-xl border border-input bg-card px-3 text-base sm:text-sm">
            {data.thankOptions.map((option) => <option key={option.bookingId} value={option.bookingId}>{t('newPost.bookingOption', { helper: option.helperName, task: option.taskTitle })} · {formatDate(option.completedAt)}</option>)}
          </select>}
      {errorText('bookingId')}
    </div>}

    <div className={field}>
      <label htmlFor={`${id}-title`} className="text-sm font-semibold">{t('newPost.titleLabel')}</label>
      <Input ref={titleRef} id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={COMMUNITY_TITLE_MAX} aria-invalid={Boolean(errorOf('title'))} aria-describedby={`${id}-title-hint`} />
      <p id={`${id}-title-hint`} className="text-sm text-muted-foreground">{t(`newPost.titleHints.${kind}`)}</p>
      {errorText('title')}
    </div>

    <div className={field}>
      <label htmlFor={`${id}-body`} className="text-sm font-semibold">{bodyOptional ? t('newPost.bodyOptional') : t('newPost.body')}</label>
      <Textarea ref={bodyRef} id={`${id}-body`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={COMMUNITY_BODY_MAX} rows={bodyOptional ? 3 : 5} aria-invalid={Boolean(errorOf('body'))} aria-describedby={`${id}-body-hint ${id}-body-count`} className={bodyOptional ? 'min-h-24' : 'min-h-32'} />
      <p id={`${id}-body-hint`} className="text-sm text-muted-foreground">{t('newPost.bodyHint')}</p>
      <p id={`${id}-body-count`} className="text-xs tabular-nums text-muted-foreground">{t('newPost.bodyCount', { count: body.length, max: COMMUNITY_BODY_MAX })}</p>
      {errors.body?.[0] === 'prohibited' ? <p className="text-sm text-destructive">{t('guidelines')}</p> : errorText('body')}
    </div>

    {onUploadPhoto && <div className={field}>
      <p className="text-sm font-semibold">{t('photos.label')}</p>
      <CommunityPhotoPicker id={`${id}-photos`} photos={photos} onChange={setPhotos} onUpload={onUploadPhoto} max={COMMUNITY_POST_PHOTOS_MAX} disabled={pending} />
      {errorText('photoIds')}
    </div>}

    {/* The service and the neighborhood as two pills (Nextdoor's audience picker). */}
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <span className="relative inline-flex max-w-full">
          <Tag aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-primary" />
          <label htmlFor={`${id}-category`} className="sr-only">{t('newPost.category')}</label>
          <select id={`${id}-category`} value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)} className={pillSelect}>
            <option value="">{t('newPost.categoryNone')}</option>
            {data.categories.map((category) => <option key={category.slug} value={category.slug}>{card(`categories.${category.slug}`)}</option>)}
          </select>
        </span>
        <span className="relative inline-flex max-w-full">
          <MapPin aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-primary" />
          <label htmlFor={`${id}-area`} className="sr-only">{t('newPost.area')}</label>
          <select id={`${id}-area`} value={areaSlug} onChange={(event) => setAreaSlug(event.target.value)} aria-describedby={`${id}-area-hint`} className={pillSelect}>
            <option value="">{t('newPost.areaEverywhere', { market: data.market.name })}</option>
            {data.areas.map((area) => <option key={area.slug} value={area.slug}>{area.name}</option>)}
          </select>
        </span>
      </div>
      <p id={`${id}-area-hint`} className="text-sm text-muted-foreground">{t('newPost.areaHint', { market: data.market.name })}</p>
    </div>

    <p className="rounded-2xl bg-muted/70 p-3 text-sm text-muted-foreground">{t('guidelines')} <Link href={routes.legal('community-guidelines')} className="font-medium text-primary underline underline-offset-4">{t('guidelinesLink')}</Link></p>
    {reminder && <KindnessReminder busy={pending} onEdit={() => { const onTitle = Boolean(result && !result.ok && result.fieldErrors?.title); setResult(undefined); (onTitle ? titleRef : bodyRef).current?.focus(); }} onSendAnyway={() => submit(true)} />}
    {result && !result.ok && !result.fieldErrors && <FormFeedback result={result} />}
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>{t('cancel')}</Button>}
      <Button type="submit" disabled={pending || blocked || tooShort} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'newPost.submitting' : 'newPost.submit')}</Button>
    </div>
  </form>;
}
