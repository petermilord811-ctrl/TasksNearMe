'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ActionHandler, ActionResult } from '@/contracts/actions';
import { COMMUNITY_BODY_MAX, COMMUNITY_POST_KINDS, COMMUNITY_TITLE_MAX, type CommunityComposerData, type CommunityPostInput, type CommunityPostKind } from '@/contracts/community';
import { routes } from '@/contracts/routes';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { nativeSelectClassName } from '@/ui/components/forms/native-select';
import { LocaleLink as Link, localeHref } from '@/ui/lib/locale-link';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { kindIcons } from './post-card';

export interface CommunityPostFormProps {
  data: CommunityComposerData;
  initialKind: CommunityPostKind;
  onPost: ActionHandler<CommunityPostInput>;
  /** The form's accessible name. */
  label: string;
  /** The composer's Cancel, beside Post. */
  onCancel?: () => void;
  /** Move focus into the title when the form appears (the composer opening). */
  focusOnMount?: boolean;
  className?: string;
}

/**
 * A new community post (completion plan 7.7), on its own page and in the portal's composer (9.10): the kind first
 * (a recommendation request, a question, a tip, or thanks for a booked helper), then a title and details, the
 * service it's about, and the neighborhood. The rules sit above the button, where people read them (a prompt
 * before posting cuts incivility). Posting opens the new post.
 */
export function CommunityPostForm({ data, initialKind, onPost, label, onCancel, focusOnMount = false, className }: CommunityPostFormProps) {
  const t = useTranslations('community');
  const card = useTranslations('taskCard');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const { formatDate } = useFormat();
  const router = useRouter();
  const locale = useLocale();
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<CommunityPostKind>(initialKind);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [areaSlug, setAreaSlug] = useState(data.yourArea?.slug ?? '');
  const [bookingId, setBookingId] = useState(data.thankOptions[0]?.bookingId ?? '');
  const [result, setResult] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();
  const errors = result && !result.ok ? result.fieldErrors ?? {} : {};
  const errorOf = (field: string) => {
    const code = errors[field]?.[0];
    return code ? fieldCopy(fieldCopy.has(code) ? code : 'invalid') : undefined;
  };
  const thanksBlocked = kind === 'thanks' && data.thankOptions.length === 0;
  const blocked = Boolean(data.postBlocked) || thanksBlocked;

  // The composer opens on a chosen kind (the form mounts with it), and the title takes focus.
  useEffect(() => {
    if (focusOnMount) titleRef.current?.focus();
  }, [focusOnMount]);

  const submit = () => startTransition(async () => {
    let next: ActionResult;
    try {
      next = await onPost({ kind, title, body, categorySlug: categorySlug || undefined, areaSlug, ...(kind === 'thanks' ? { bookingId } : {}) });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    setResult(next);
    if (next.ok) {
      toast.success(t('newPost.success'));
      if (next.redirectTo) router.push(localeHref(next.redirectTo, locale));
    }
  });

  const field = 'space-y-1.5';
  const errorText = (name: string) => errorOf(name) && <p id={`${id}-${name}-error`} className="text-sm text-destructive">{errorOf(name)}</p>;

  return <form noValidate aria-label={label} className={cn('space-y-5', className)} onSubmit={(event) => { event.preventDefault(); if (!pending && !blocked) submit(); }}>
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{t('newPost.kind')}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {COMMUNITY_POST_KINDS.map((option) => {
          const Icon = kindIcons[option];
          return <label key={option} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-2 text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring', kind === option ? 'border-primary/60 bg-primary/[0.05]' : 'border-border hover:border-foreground/20')}>
            <input type="radio" name={`${id}-kind`} value={option} checked={kind === option} onChange={() => setKind(option)} className="sr-only" />
            <Icon aria-hidden="true" className={cn('size-5 shrink-0', kind === option ? 'text-primary' : 'text-muted-foreground')} />{t(`kinds.${option}`)}
          </label>;
        })}
      </div>
    </fieldset>

    {kind === 'thanks' && <div className={field}>
      <label htmlFor={`${id}-booking`} className="text-sm font-semibold">{t('newPost.booking')}</label>
      {data.thankOptions.length === 0
        ? <p className="text-sm text-muted-foreground">{t('newPost.noBookings')}</p>
        : <select id={`${id}-booking`} value={bookingId} onChange={(event) => setBookingId(event.target.value)} aria-invalid={Boolean(errorOf('bookingId'))} className={nativeSelectClassName}>
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
      <label htmlFor={`${id}-body`} className="text-sm font-semibold">{t('newPost.body')}</label>
      <Textarea id={`${id}-body`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={COMMUNITY_BODY_MAX} rows={5} aria-invalid={Boolean(errorOf('body'))} aria-describedby={`${id}-body-hint ${id}-body-count`} className="min-h-32" />
      <p id={`${id}-body-hint`} className="text-sm text-muted-foreground">{t('newPost.bodyHint')}</p>
      <p id={`${id}-body-count`} className="text-xs tabular-nums text-muted-foreground">{t('newPost.bodyCount', { count: body.length, max: COMMUNITY_BODY_MAX })}</p>
      {errors.body?.[0] === 'prohibited' ? <p className="text-sm text-destructive">{t('guidelines')}</p> : errorText('body')}
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <div className={field}>
        <label htmlFor={`${id}-category`} className="text-sm font-semibold">{t('newPost.category')}</label>
        <select id={`${id}-category`} value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)} className={nativeSelectClassName}>
          <option value="">{t('newPost.categoryNone')}</option>
          {data.categories.map((category) => <option key={category.slug} value={category.slug}>{card(`categories.${category.slug}`)}</option>)}
        </select>
      </div>
      <div className={field}>
        <label htmlFor={`${id}-area`} className="text-sm font-semibold">{t('newPost.area')}</label>
        <select id={`${id}-area`} value={areaSlug} onChange={(event) => setAreaSlug(event.target.value)} aria-describedby={`${id}-area-hint`} className={nativeSelectClassName}>
          <option value="">{t('newPost.areaEverywhere', { market: data.market.name })}</option>
          {data.areas.map((area) => <option key={area.slug} value={area.slug}>{area.name}</option>)}
        </select>
        <p id={`${id}-area-hint`} className="text-sm text-muted-foreground">{t('newPost.areaHint', { market: data.market.name })}</p>
      </div>
    </div>

    <p className="rounded-2xl bg-muted/70 p-3 text-sm text-muted-foreground">{t('guidelines')} <Link href={routes.legal('community-guidelines')} className="font-medium text-primary underline underline-offset-4">{t('guidelinesLink')}</Link></p>
    {result && !result.ok && !result.fieldErrors && <FormFeedback result={result} />}
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>{t('cancel')}</Button>}
      <Button type="submit" disabled={pending || blocked || title.trim().length < 5 || body.trim().length < 10} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'newPost.submitting' : 'newPost.submit')}</Button>
    </div>
  </form>;
}
