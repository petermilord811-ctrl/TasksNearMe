import { Quote, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { localeOrDefault, type ReviewSummaryView } from '@/contracts';

/**
 * "What neighbors say" above a helper's reviews (2026-11-24): a few points made with AI from their published client
 * reviews, in the page's language, said to be a summary with AI and of how many reviews. The reviews follow it.
 */
export function ReviewSummaryCard({ summary }: { summary: ReviewSummaryView }) {
  const t = useTranslations('helperProfile.reviewSummary');
  const locale = localeOrDefault(useLocale());
  const points = summary.points[locale].length > 0 ? summary.points[locale] : summary.points.en;
  return <section aria-labelledby="helper-review-summary-heading" data-review-summary className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] border-l-4 border-l-primary bg-card p-card shadow-card dark:border-white/[0.06] dark:border-l-primary">
    <h3 id="helper-review-summary-heading" className="flex items-center gap-2 font-heading text-[1.0625rem]/6 font-semibold"><Quote aria-hidden="true" className="size-4 shrink-0 text-primary" />{t('title')}</h3>
    <ul className="space-y-2">
      {points.map((point) => <li key={point} className="flex items-start gap-2.5 break-words leading-6"><span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />{point}</li>)}
    </ul>
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Sparkles aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" /><span>{t('caption', { count: summary.reviewCount })}</span></p>
  </section>;
}
