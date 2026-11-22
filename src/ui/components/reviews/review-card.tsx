import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PublicReviewView } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { useShownPerson } from '@/ui/lib/shown-person';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { Badge } from '@/ui/primitives/badge';

export interface ReviewCardProps {
  review: PublicReviewView;
  /** Where "Report this review" goes (the public profile); none: no link. */
  reportHref?: string;
}

export function ReviewCard({ review, reportHref }: ReviewCardProps) {
  const { formatDate } = useFormat();
  const t = useTranslations('reviews');
  const report = useTranslations('report');
  // A reviewer whose account was deleted, in the page's own words (J-PR15).
  const author = useShownPerson()(review.author);

  return (
    <article aria-label={t('reviewBy', { name: author.displayName })} className="min-w-0 space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <RatingStars rating={{ average: review.rating, count: 1 }} single />
        <time dateTime={review.publishedAt} className="text-sm tabular-nums text-muted-foreground">
          {formatDate(review.publishedAt, { withYear: true })}
        </time>
      </div>
      {review.tags.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {review.tags.map((tag) => <li key={tag}><Badge variant="secondary" className="whitespace-normal px-3 py-1 text-sm">{t(`tags.${tag}`)}</Badge></li>)}
        </ul>
      )}
      {review.body && <p className="whitespace-pre-wrap break-words leading-6">{review.body}</p>}
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <InitialsAvatar initials={author.initials} />
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{author.displayName}</p>
          <p className="text-sm text-muted-foreground">{t(`categories.${review.categorySlug}`)}</p>
        </div>
      </div>
      {reportHref && <Link href={reportHref} aria-label={report('links.reviewBy', { name: author.displayName })} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"><Flag aria-hidden="true" className="size-4" />{report('links.review')}</Link>}
    </article>
  );
}
