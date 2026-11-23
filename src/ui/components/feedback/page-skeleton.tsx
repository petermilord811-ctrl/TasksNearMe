import { useTranslations } from 'next-intl';
import { Skeleton } from '@/ui/primitives/skeleton';
import { cn } from '@/ui/lib/utils';
import { SkeletonReveal } from '@/ui/shells/page-transition';

export function PageSkeleton({ variant }: { variant: 'list' | 'detail' | 'form' | 'cards' }) {
  const t = useTranslations('feedback');
  return (
    <div role="status" aria-busy="true" className="w-full space-y-6">
      <span className="sr-only">{t('loading')}</span>
      <SkeletonReveal />
      <div aria-hidden="true" className="space-y-6">
        <div className="space-y-3"><Skeleton className="h-8 w-3/5" /><Skeleton className="h-4 w-4/5" /></div>
        <div className={cn('grid gap-4', variant === 'cards' && 'sm:grid-cols-2')}>
          {Array.from({ length: variant === 'detail' ? 2 : 3 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-5 shadow-card dark:border-white/[0.06]">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className={cn('w-full', variant === 'form' ? 'h-11' : variant === 'cards' ? 'h-24' : 'h-4')} />
              {variant !== 'form' && <Skeleton className="h-4 w-3/4" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
