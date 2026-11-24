import { useTranslations } from 'next-intl';
import { Route } from 'lucide-react';
import type { NeighborhoodDayCardView } from '@/contracts';
import { NeighborhoodDayCard } from '@/ui/components/availability/neighborhood-day-card';
import { ScrollRow } from '@/ui/components/layout/scroll-row';

/**
 * Neighborhood days in the place, on Neighbors (2026-11-24): a helper's day of visits in one neighborhood, with its
 * open visits to pick (the request dialog). A sideways row of cards, full days too, so neighbors see them fill up.
 */
export function NeighborhoodDaysStrip({ days }: { days: NeighborhoodDayCardView[] }) {
  const t = useTranslations('neighborhoodDays');
  return <section aria-labelledby="portal-neighborhood-days" className="space-y-2.5">
    <div className="space-y-0.5">
      <h2 id="portal-neighborhood-days" className="flex items-center gap-2 font-display text-base font-semibold"><Route aria-hidden="true" className="size-4 text-primary" />{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
    </div>
    <ScrollRow label={t('title')} className="snap-x snap-mandatory gap-3 pb-1">
      {/* Each card positioned: its screen-reader text (absolute) stays inside the row instead of widening the page. */}
      {days.map((day) => <li key={day.id} className="relative flex w-[min(21rem,85vw)] shrink-0 snap-start"><NeighborhoodDayCard day={day} className="w-full" /></li>)}
    </ScrollRow>
  </section>;
}
