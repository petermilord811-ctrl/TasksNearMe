import { BadgeCheck, HandCoins, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CategorySlug } from '@/contracts';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';

/**
 * A service page's next step and why to trust it, on its first screen (visitor-to-first-post walk, J-V): "Post a task"
 * that opens the wizard on this service, what posting costs, and three short promises. Before, the page's own button
 * was its last section, and the trust lines sat below the fold.
 */
export function CategoryNextStep({ category }: { category: CategorySlug }) {
  const t = useTranslations('publicPages.shared');
  const points = [
    { id: 'verified', icon: BadgeCheck, label: t('trustPoints.verified') },
    { id: 'reviews', icon: Star, label: t('trustPoints.reviews') },
    { id: 'price', icon: HandCoins, label: t('trustPoints.price') },
  ];
  return <div className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <Link href={routes.app.newTask({ category })} className={buttonVariants({ size: 'lg', className: 'w-full sm:w-auto' })}>{t('postTask')}</Link>
      <p className="text-sm text-muted-foreground">{t('freeToPost')}</p>
    </div>
    <ul aria-label={t('trustPoints.label')} className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm font-medium">
      {points.map(({ id, icon: Icon, label }) => <li key={id} className="flex items-center gap-1.5"><Icon aria-hidden="true" className="size-4 shrink-0 text-success" />{label}</li>)}
    </ul>
  </div>;
}
