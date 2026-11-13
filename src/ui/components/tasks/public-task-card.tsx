import Link from 'next/link';
import type { ReactNode } from 'react';
import { CalendarDays, Hammer, Laptop, Leaf, MapPin, Package, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CategorySlug, type ISODateTime, type TaskPublicView } from '@/contracts';
import { formatDate, formatDateTime, formatHours, formatMoney, formatMonthYear, formatRelative, formatTimeRange, marketDayKey } from '@/shared/format';
import { VerificationBadges } from '@/ui/components/people/verification-badges';

export interface PublicTaskCardProps {
  task: TaskPublicView;
  now: ISODateTime;
  headingLevel?: 2 | 3;
  href?: string;
  footer?: ReactNode;
}

const categoryIcons: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};

export function PublicTaskCard({ task, now, headingLevel = 3, href = routes.publicTask(task.slug), footer }: PublicTaskCardProps) {
  const t = useTranslations('taskCard');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const CategoryIcon = categoryIcons[task.categorySlug];
  const LocationIcon = task.location.kind === 'remote' ? Laptop : MapPin;
  const schedule = task.schedule.flexible
    ? t('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
    : marketDayKey(task.schedule.windowStart) === marketDayKey(task.schedule.windowEnd)
      ? t('scheduledWindow', {
          date: formatDate(task.schedule.windowStart),
          window: formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd),
        })
      : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd);
  const budget = task.budget.type === 'fixed'
    ? formatMoney(task.budget.priceCents)
    : t('hourlyBudget', { rate: formatMoney(task.budget.rateCents), cap: formatHours(task.budget.hoursCap) });

  return (
    <article className="group/task flex h-full min-w-0 flex-col rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card transition-[transform,box-shadow] duration-300 ease-[var(--ease-out)] hover:shadow-[0_1px_2px_rgb(23_18_14/0.04),0_22px_44px_-26px_rgb(60_30_10/0.34)] motion-safe:hover:-translate-y-0.5 md:p-5 dark:border-white/[0.06] dark:hover:shadow-[0_1px_2px_rgb(0_0_0/0.4),0_22px_44px_-24px_rgb(0_0_0/0.75)]">
      <p className="flex items-center gap-2 text-sm font-medium text-secondary-foreground">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary transition-transform duration-300 ease-[var(--ease-out)] group-hover/task:scale-105">
          <CategoryIcon aria-hidden="true" className="size-5" />
        </span>
        {t(`categories.${task.categorySlug}`)}
      </p>
      <Heading className="mt-3 font-display text-[17px]/6 font-semibold tracking-[-0.01em] md:text-lg/6.5">
        <Link href={href} className="inline-flex min-h-11 items-center rounded-md underline-offset-4 transition-colors hover:text-primary hover:underline">
          {task.title}
        </Link>
      </Heading>
      <div className="mt-3 space-y-3 text-sm">
        <p className="flex items-start gap-2">
          <LocationIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{task.location.kind === 'remote' ? t('remote') : task.location.areaName}</span>
        </p>
        <p className="flex items-start gap-2 tabular-nums">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{schedule}</span>
        </p>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-foreground/[0.07] pt-4 dark:border-white/[0.06]">
        <p className="font-display text-xl font-semibold tracking-[-0.01em] tabular-nums">{budget}</p>
        <p className="text-sm tabular-nums text-muted-foreground">{t('offers', { count: task.offerCount })}</p>
      </div>
      <div className="mt-auto pt-4">
        <p className="text-sm tabular-nums text-muted-foreground">
          <time dateTime={task.postedAt} title={formatDateTime(task.postedAt)}>{t('posted', { relative: formatRelative(task.postedAt, now) })}</time>
        </p>
        <div className="mt-4 space-y-2 border-t border-foreground/[0.07] pt-4 dark:border-white/[0.06]">
          <p className="text-sm font-semibold">{task.poster.displayName}</p>
          <p className="text-sm tabular-nums text-muted-foreground">{t('memberSince', { date: formatMonthYear(task.poster.memberSince) })}</p>
          {task.poster.phoneVerified && <VerificationBadges badges={{ phoneVerified: task.poster.phoneVerified }} compact />}
        </div>
      </div>
      {footer && <div className="mt-4 border-t border-foreground/[0.07] pt-4 dark:border-white/[0.06]">{footer}</div>}
    </article>
  );
}
