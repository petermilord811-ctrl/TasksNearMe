import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RatingSummary } from '@/contracts';

export interface RatingStarsProps {
  rating?: RatingSummary;
}

export function RatingStars({ rating }: RatingStarsProps) {
  const t = useTranslations('verification');

  if (!rating) {
    return <span className="inline-flex rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">{t('new')}</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span aria-hidden="true" className="inline-flex gap-0.5 text-warning">
        {[0, 1, 2, 3, 4].map((index) => (
          <span key={index} className="relative size-4">
            <Star className="absolute inset-0 size-4" />
            <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${Math.max(0, Math.min(1, rating.average - index)) * 100}%` }}>
              <Star className="size-4 fill-current" />
            </span>
          </span>
        ))}
      </span>
      <span className="text-sm tabular-nums">{t('ratingSummary', { average: rating.average, count: rating.count })}</span>
    </div>
  );
}
