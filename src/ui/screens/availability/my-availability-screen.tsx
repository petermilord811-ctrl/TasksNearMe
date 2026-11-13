import { useTranslations } from 'next-intl';
import { CalendarDays, MapPin } from 'lucide-react';
import type { ActionResult, AvailabilityHandlers, ISODateTime, MyAvailabilityPageData } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { FinishSetupPanel } from '@/ui/components/helper/finish-setup-panel';
import { PageHeader } from '@/ui/components/layout/page-header';
import { AvailabilityPostForm, type AvailabilityFormPreviewState } from './availability-post-form';
import { AvailabilityPostCard } from './availability-post-card';

export interface MyAvailabilityScreenProps { data: MyAvailabilityPageData; handlers: AvailabilityHandlers; now: ISODateTime }

export function MyAvailabilityScreen(props: MyAvailabilityScreenProps) {
  return <MyAvailabilityContent {...props} />;
}

/** Preview state stays separate from the screen's application contract. */
export function MyAvailabilityContent({ data, handlers, now, initialConfirmId, initialCancelResult, ...formState }: MyAvailabilityScreenProps & AvailabilityFormPreviewState & {
  initialConfirmId?: string;
  initialCancelResult?: ActionResult;
}) {
  const t = useTranslations('availability');
  return <div className="mx-auto w-full max-w-reading space-y-section">
    <PageHeader title={t('title')} description={t('description')} />
    <div className="flex items-start gap-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 dark:border-white/[0.06]">
      <MapPin aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" /><div><p className="text-sm text-muted-foreground">{t('areaLabel')}</p><p className="font-medium">{t('area', { name: data.areaName, radius: data.radiusMiles })}</p></div>
    </div>
    {!data.setup.bookable ? <FinishSetupPanel setup={data.setup} title={t('setupTitle')} body={t('setupBody')} />
      : data.limits.activeCount >= data.limits.maxActive ? <p role="status" className="rounded-[1.375rem] border border-foreground/[0.05] bg-secondary p-card text-secondary-foreground">{t('atLimit', { count: data.limits.activeCount })}</p>
        : <AvailabilityPostForm data={data} onCreate={handlers.onCreate} now={now} {...formState} />}
    <section className="space-y-4" aria-label={t('postsTitle')}>
      <div className="space-y-2"><h2 className="font-display text-xl/7 font-semibold tracking-[-0.015em]">{t('postsTitle')}</h2><p className="text-sm text-muted-foreground">{t('marketTime')}</p></div>
      {data.posts.length ? <ul className="space-y-4">{data.posts.map((post) => <li key={post.id}><AvailabilityPostCard post={post} onCancel={handlers.onCancel} initialConfirm={initialConfirmId === post.id} initialResult={initialConfirmId === post.id ? initialCancelResult : undefined} /></li>)}</ul>
        : <EmptyState title={t('emptyTitle')} body={t(data.setup.bookable ? 'emptyBody' : 'emptySetupBody')} headingLevel={3} icon={<CalendarDays className="size-6" />} />}
    </section>
  </div>;
}
