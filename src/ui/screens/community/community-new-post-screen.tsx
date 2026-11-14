'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ActionResult } from '@/contracts/actions';
import { COMMUNITY_BODY_MAX, COMMUNITY_POST_KINDS, COMMUNITY_TITLE_MAX, type CommunityNewPostHandlers, type CommunityNewPostPageData, type CommunityPostKind } from '@/contracts/community';
import { routes } from '@/contracts/routes';
import { kindIcons } from '@/ui/components/community/post-card';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { nativeSelectClassName } from '@/ui/components/forms/native-select';
import { LocaleLink as Link, localeHref } from '@/ui/lib/locale-link';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export interface CommunityNewPostScreenProps { data: CommunityNewPostPageData; handlers: CommunityNewPostHandlers }

/**
 * A new community post (completion plan 7.7): the kind first (a recommendation request, a question, a tip, or
 * thanks for a booked helper), then a title and details, the service it's about, and the neighborhood. The rules
 * sit above the button, where people read them (the research report: a prompt before posting cuts incivility).
 */
export function CommunityNewPostScreen({ data, handlers }: CommunityNewPostScreenProps) {
  const t = useTranslations('community');
  const card = useTranslations('taskCard');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const { formatDate } = useFormat();
  const router = useRouter();
  const locale = useLocale();
  const id = useId();
  const [kind, setKind] = useState<CommunityPostKind>(data.kind);
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

  const submit = () => startTransition(async () => {
    let next: ActionResult;
    try {
      next = await handlers.onPost({ kind, title, body, categorySlug: categorySlug || undefined, areaSlug, ...(kind === 'thanks' ? { bookingId } : {}) });
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

  return <div className="mx-auto max-w-2xl space-y-5">
    <Link href={routes.app.community()} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />{t('newPost.back')}</Link>
    <h1 className="font-display text-[1.75rem]/[1.15] font-semibold tracking-[-0.02em]">{t('newPost.title')}</h1>
    {data.postBlocked && <p role="status" className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">{t(`postBlocked.${data.postBlocked}`)} {data.postBlocked === 'phone_required' && <Link href={routes.app.account()} className="font-semibold text-primary underline underline-offset-4">{t('verifyPhone')}</Link>}</p>}
    <form noValidate aria-label={t('newPost.title')} className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]" onSubmit={(event) => { event.preventDefault(); if (!pending && !blocked) submit(); }}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t('newPost.kind')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {COMMUNITY_POST_KINDS.map((option) => {
            const Icon = kindIcons[option];
            return <label key={option} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-2 text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring', kind === option ? 'border-primary/60 bg-primary/[0.05]' : 'border-foreground/[0.09] hover:border-foreground/20')}>
              <input type="radio" name="kind" value={option} checked={kind === option} onChange={() => setKind(option)} className="sr-only" />
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
        <Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={COMMUNITY_TITLE_MAX} aria-invalid={Boolean(errorOf('title'))} aria-describedby={`${id}-title-hint`} />
        <p id={`${id}-title-hint`} className="text-sm text-muted-foreground">{t(`newPost.titleHints.${kind}`)}</p>
        {errorText('title')}
      </div>

      <div className={field}>
        <label htmlFor={`${id}-body`} className="text-sm font-semibold">{t('newPost.body')}</label>
        <Textarea id={`${id}-body`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={COMMUNITY_BODY_MAX} rows={6} aria-invalid={Boolean(errorOf('body'))} aria-describedby={`${id}-body-hint ${id}-body-count`} className="min-h-36" />
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

      <p className="rounded-2xl bg-foreground/[0.03] p-3 text-sm text-muted-foreground dark:bg-white/[0.04]">{t('guidelines')} <Link href={routes.legal('community-guidelines')} className="font-medium text-primary underline underline-offset-4">{t('guidelinesLink')}</Link></p>
      {result && !result.ok && !result.fieldErrors && <FormFeedback result={result} />}
      <Button type="submit" disabled={pending || blocked || title.trim().length < 5 || body.trim().length < 10} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'newPost.submitting' : 'newPost.submit')}</Button>
    </form>
  </div>;
}
