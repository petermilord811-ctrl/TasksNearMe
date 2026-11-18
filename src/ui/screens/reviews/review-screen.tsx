import Link from 'next/link';
import { ArrowLeft, CalendarDays, CircleAlert, CircleCheck, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type ISODateTime, type ReviewHandlers, type ReviewPageData } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { Badge } from '@/ui/primitives/badge';
import { ReviewForm } from './review-form';

export interface ReviewScreenProps {
  data: ReviewPageData;
  handlers: ReviewHandlers;
  now: ISODateTime;
}

export function ReviewScreen(props: ReviewScreenProps) {
  return <ReviewContent {...props} />;
}

/** Initial states support previews; app callers use ReviewScreen. */
export function ReviewContent({ data, handlers, now, initialResult, initialPending }: ReviewScreenProps & {
  initialResult?: ActionResult;
  initialPending?: boolean;
}) {
  const { formatDate, formatDateTime, formatRelative } = useFormat();
  const t = useTranslations('review');
  const mine = data.mine;
  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.app.booking(data.booking.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" />{t('backToBooking')}
    </Link>
    <header className="space-y-4">
      <div className="flex items-center gap-3">
        <InitialsAvatar initials={data.subject.initials} photo={data.subject.photo} />
        <h1 className="min-w-0 break-words font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title', { name: data.subject.displayName })}</h1>
      </div>
      <div className="space-y-2">
        <p className="break-words font-medium">{data.booking.title}</p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays aria-hidden="true" className="size-4 shrink-0" /><time dateTime={data.booking.start} className="tabular-nums">{formatDate(data.booking.start, { withYear: true })}</time></p>
      </div>
    </header>
    {mine ? <section aria-label={t('yourReview')} className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card sm:p-6">
      <div className="space-y-2">
        <h2 className="font-heading text-xl/7 font-semibold">{t('yourReview')}</h2>
        <p className="text-sm tabular-nums text-muted-foreground">{t('submittedAt', { date: formatDateTime(mine.submittedAt), relative: formatRelative(mine.submittedAt, now) })}</p>
      </div>
      <RatingStars rating={{ average: mine.rating, count: 1 }} />
      {mine.tags.length > 0 && <ul className="flex flex-wrap gap-2">{mine.tags.map((tag) => <li key={tag}><Badge variant="secondary" className="whitespace-normal px-3 py-1 text-sm">{t(`tags.${tag}`)}</Badge></li>)}</ul>}
      {mine.body && <p className="whitespace-pre-wrap break-words leading-6">{mine.body}</p>}
      <p className="flex items-start gap-2 border-t pt-4 text-sm">
        {mine.publishedAt ? <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" /> : <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
        <span>{mine.publishedAt ? t('published', { date: formatDate(mine.publishedAt) }) : t('hidden', { name: data.subject.displayName, date: formatDate(data.publishesBy) })}</span>
      </p>
    </section> : data.unavailable ? <section aria-label={t('unavailable.title')} className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card sm:p-6">
      <h2 className="flex items-start gap-2 font-heading text-xl/7 font-semibold"><CircleAlert aria-hidden="true" className="mt-1 size-5 shrink-0 text-warning" />{t('unavailable.title')}</h2>
      <p>{t(`unavailable.${data.unavailable}`)}</p>
    </section> : <ReviewForm key={`${data.booking.id}-${data.direction}`} data={data} handlers={handlers} initialResult={initialResult} initialPending={initialPending} />}
  </div>;
}
