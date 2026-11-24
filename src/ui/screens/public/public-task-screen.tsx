import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ArrowRight, BadgeCheck, CalendarDays, Camera, CircleDollarSign, Flag, HandCoins, Laptop, Lock, MapPin, MessageSquareText, ShieldCheck, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ISODateTime, PublicTaskPageData, TaskMapBundle } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { GeneralArea } from '@/ui/components/location/general-area';
import { TaskMapPanel } from '@/ui/components/map/task-map-panel';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { RichText } from '@/ui/components/rich-text/rich-text';
import { TaskPhotoCarousel } from '@/ui/components/tasks/task-photo-carousel';
import { TaskRow } from '@/ui/components/tasks/task-row';
import { TaskSpec } from '@/ui/components/tasks/task-spec';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/ui/primitives/breadcrumb';
import { buttonVariants } from '@/ui/primitives/button';
import { categoryIcons } from './marketing-sections';

export interface PublicTaskScreenProps {
  data: PublicTaskPageData;
  now: ISODateTime;
  /** Previews and tests: the drawn map only. */
  liveMap?: boolean;
  /** The task map (its area, the trip there, the weather and what's around); the area's plain map without it. */
  map?: TaskMapBundle | null;
}

const cardClass = 'rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]';
const headingClass = 'font-display text-lg leading-7 font-semibold tracking-[-0.015em]';

/**
 * A task's public page (2026-11-23, owner: "make it structured and good layout and clear task title and content. and
 * there will be images also (if many, show it as carousel)"). The title and the facts that decide an offer first
 * (where, when, budget, offers so far), then the photos, the task in the poster's words, its answers as a spec sheet,
 * the area and who posted it; on wide screens the price and the next step stay beside it. Helpers who can offer, and the
 * poster, see the full description, the answers and the photos (`details`); everyone else sees the excerpt, how many
 * photos there are, and how to see the rest.
 */
export function PublicTaskScreen({ data, now, liveMap = true, map }: PublicTaskScreenProps) {
  const { formatDate, formatDateTime, formatMonthYear, formatRelative, formatTimeRange, dayKey } = useFormat();
  const t = useTranslations('publicTask');
  const report = useTranslations('report');
  const categoryName = useTranslations('helperCard.categories');
  const card = useTranslations('taskCard');
  const { task, category, market, details } = data;
  const viewer = data.viewer ?? 'visitor';
  const photoCount = details?.photos.length ?? data.photoCount ?? 0;
  const CategoryIcon = categoryIcons[task.categorySlug];
  const remote = task.location.kind === 'remote';
  const schedule = task.schedule.flexible
    ? t('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
    : dayKey(task.schedule.windowStart) === dayKey(task.schedule.windowEnd)
      ? t('scheduledWindow', { date: formatDate(task.schedule.windowStart), window: formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd) })
      : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd);
  const price = task.budget.type === 'fixed' ? formatMoney(task.budget.priceCents) : `${formatMoney(task.budget.rateCents)}${card('perHour')}`;
  const priceNote = task.budget.type === 'fixed' ? t('fixedPrice') : t('hourlyUpTo', { hours: formatHours(task.budget.hoursCap) });
  const state = data.acceptingOffers ? 'open' : task.status === 'assigned' || task.status === 'completed' ? 'booked' : 'closed';
  const where = task.location.kind === 'remote' ? t('remote') : t('area', { area: task.location.areaName, market: task.location.marketName });

  const facts = [
    { key: 'where', Icon: remote ? Laptop : MapPin, label: t('facts.where'), value: where },
    { key: 'when', Icon: CalendarDays, label: t('facts.when'), value: schedule },
    { key: 'budget', Icon: CircleDollarSign, label: t('facts.budget'), value: price, note: priceNote },
    { key: 'offers', Icon: Users, label: t('facts.offers'), value: t('offersSoFar', { count: task.offerCount }) },
  ];

  // The next step for whoever is looking: offer, sign in to offer, or manage their own task.
  const action = !data.acceptingOffers
    ? <><p className="font-semibold">{t('closed')}</p><Link href={routes.taskBoard(market.slug)} className={buttonVariants({ variant: 'outline', className: 'w-full' })}>{t('backToBoard')}</Link></>
    : viewer === 'poster'
      ? <><p className="text-sm text-muted-foreground">{t('ownTask')}</p><Link href={routes.app.task(task.id)} className={buttonVariants({ className: 'w-full' })}>{t('manage')}<ArrowRight aria-hidden="true" /></Link></>
      : <><Link href={routes.app.findWorkOffer(task.id)} className={buttonVariants({ size: 'lg', className: 'w-full' })}><HandCoins aria-hidden="true" />{t('makeOffer')}</Link><p className="text-sm text-muted-foreground">{t(viewer === 'helper' ? 'offerHintHelper' : 'offerHint')}</p></>;

  const offerOpen = data.acceptingOffers && viewer !== 'poster';
  return <div className={cn('space-y-section', offerOpen && 'max-lg:pb-20')}>
    {/* Phones: the price and the offer stay at the bottom of the screen while the task scrolls by (the price card
        itself comes after the task there). */}
    {offerOpen && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-foreground/[0.08] bg-card/95 px-gutter pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_30px_-20px_rgb(23_18_14/0.35)] backdrop-blur-md lg:hidden dark:border-white/[0.08]">
      <div className="mx-auto flex max-w-content items-center gap-3">
        <div className="min-w-0 flex-1 leading-tight"><p className="font-display text-xl font-semibold tabular-nums">{price}</p><p className="truncate text-xs text-muted-foreground">{priceNote} · {t('offersSoFar', { count: task.offerCount })}</p></div>
        <Link href={routes.app.findWorkOffer(task.id)} className={buttonVariants({ className: 'shrink-0' })}><HandCoins aria-hidden="true" />{t('makeOffer')}</Link>
      </div>
    </div>}
    <div className="space-y-5">
      <Breadcrumb><BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink asChild><Link href={routes.market(market.slug)}>{market.name}</Link></BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink asChild><Link href={routes.taskBoard(market.slug)}>{t('taskBoard')}</Link></BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink asChild><Link href={routes.category(category.slug, market.slug)}>{categoryName(category.slug)}</Link></BreadcrumbLink></BreadcrumbItem>
      </BreadcrumbList></Breadcrumb>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 font-medium" style={{ background: `color-mix(in oklab, var(--cat-${task.categorySlug}) 12%, transparent)` }}>
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-card" style={{ color: `var(--cat-${task.categorySlug})` }}><CategoryIcon className="size-4" /></span>
            {task.taskType ? card(`types.${task.categorySlug}.${task.taskType}`) : categoryName(category.slug)}
          </span>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium', state === 'open' ? 'border-success/30 bg-success/[0.08] text-success' : 'border-foreground/15 text-muted-foreground')}>
            <span aria-hidden="true" className={cn('size-1.5 rounded-full', state === 'open' ? 'bg-success motion-safe:animate-pulse' : 'bg-muted-foreground')} />{t(`state.${state}`)}
          </span>
          <time dateTime={task.postedAt} title={formatDateTime(task.postedAt)} className="text-muted-foreground tabular-nums">{t('posted', { relative: formatRelative(task.postedAt, now) })}</time>
        </div>
        <h1 className="max-w-4xl font-display text-[2rem]/[2.375rem] font-semibold tracking-[-0.025em] text-balance [overflow-wrap:anywhere] sm:text-[2.5rem]/[2.875rem]">{task.title}</h1>
      </header>

      {/* The facts an offer depends on, at a glance: two by two on phones, one row on wide screens. */}
      <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {facts.map(({ key, Icon, label, value, note }) => <div key={key} className={cn('relative min-w-0 rounded-2xl border border-foreground/[0.07] bg-card/80 py-3.5 pr-3.5 pl-[3.75rem] shadow-[0_1px_2px_rgb(23_18_14/0.04)] dark:border-white/[0.06]', (key === 'where' || key === 'when') && 'max-lg:col-span-2')}>
          <dt className="text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase"><span aria-hidden="true" className="absolute top-3.5 left-3.5 grid size-9 place-items-center rounded-xl bg-brand-soft text-primary"><Icon className="size-[1.125rem]" /></span>{label}</dt>
          <dd className={cn('[overflow-wrap:anywhere]', key === 'budget' ? 'font-display text-lg leading-6 font-semibold tabular-nums' : 'text-[0.9375rem] leading-6 font-medium tabular-nums')}>{value}{note && <span className="block font-sans text-xs font-normal text-muted-foreground">{note}</span>}</dd>
        </div>)}
      </dl>
    </div>

    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-10">
      <div className="min-w-0 space-y-6">
        {details && details.photos.length > 0 && <TaskPhotoCarousel photos={details.photos} posterName={task.poster.displayName} />}

        <section aria-labelledby="task-about" className={cn(cardClass, 'space-y-4')}>
          <h2 id="task-about" className={cn(headingClass, 'flex items-center gap-2')}><MessageSquareText aria-hidden="true" className="size-5 text-primary" />{t('about')}</h2>
          {details ? <RichText text={details.description} headingLevel={3} />
            : <p className="leading-7 whitespace-pre-line [overflow-wrap:anywhere]">{task.excerpt}</p>}
        </section>

        {details ? Object.keys(details.answers).length > 0 && <section aria-labelledby="task-details" className={cn(cardClass, 'space-y-4')}>
          <h2 id="task-details" className={headingClass}>{t('details')}</h2>
          <TaskSpec category={task.categorySlug} answers={details.answers} />
          {details.expenseAllowance && <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-3.5 dark:bg-secondary/30"><HandCoins aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-medium">{t('allowance', { amount: formatMoney(details.expenseAllowance.amountCents) })}</p><p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{details.expenseAllowance.description}</p></div></div>}
        </section>
          : data.acceptingOffers && <section aria-labelledby="task-locked" className="relative isolate overflow-hidden rounded-[1.375rem] border border-dashed border-primary/30 bg-brand-soft/50 p-card">
          {/* What's behind the sign-in, drawn as shapes: no photo or answer reaches the page. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 grid grid-cols-3 gap-3 p-4 opacity-40 blur-[2px]">
            {Array.from({ length: Math.min(3, Math.max(1, photoCount)) }, (_, at) => <span key={at} className="rounded-2xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_22%,transparent),color-mix(in_oklab,var(--primary)_6%,transparent))]" />)}
          </div>
          <div className="space-y-3 rounded-2xl bg-card/90 p-4 shadow-card backdrop-blur-sm sm:max-w-md">
            <h2 id="task-locked" className="flex items-center gap-2 font-semibold"><Lock aria-hidden="true" className="size-4 text-primary" />{t('lockedTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t(viewer === 'member' ? 'lockedMember' : 'lockedVisitor', { photos: photoCount })}</p>
            {photoCount > 0 && <p className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground"><Camera aria-hidden="true" className="size-3.5" />{t('photoCount', { count: photoCount })}</p>}
            <div><Link href={viewer === 'member' ? routes.app.helperOnboarding() : routes.signIn(routes.publicTask(task.slug))} className={buttonVariants({ variant: 'outline', size: 'sm' })}>{t(viewer === 'member' ? 'becomeHelper' : 'signInToSee')}<ArrowRight aria-hidden="true" /></Link></div>
          </div>
        </section>}

        {!remote && <section aria-labelledby="task-where" className={cn(cardClass, 'space-y-3')}>
          <h2 id="task-where" className={headingClass}>{t('whereTitle')}</h2>
          {map
            ? <><GeneralArea location={task.location} privacyNote={false} /><TaskMapPanel map={map} {...(liveMap ? {} : { live: false })} /></>
            : <>
              <GeneralArea location={task.location} showMap liveMap={liveMap} privacyNote={false} />
              <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>
            </>}
        </section>}

        <section aria-labelledby="task-poster" className={cn(cardClass, 'space-y-4')}>
          <h2 id="task-poster" className={headingClass}>{t('posterTitle')}</h2>
          <div className="flex items-center gap-3">
            <span className="rounded-full p-0.5 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_14%,transparent)]"><InitialsAvatar initials={task.poster.initials} /></span>
            <div className="min-w-0"><p className="font-semibold">{task.poster.displayName}</p><p className="text-sm text-muted-foreground tabular-nums">{t('memberSince', { date: formatMonthYear(task.poster.memberSince) })}</p></div>
          </div>
          {task.poster.phoneVerified && <VerificationBadges badges={{ phoneVerified: task.poster.phoneVerified }} />}
          {task.poster.ratingAsClient && <div className="space-y-2"><p className="text-sm text-muted-foreground">{t('clientRating')}</p><RatingStars rating={task.poster.ratingAsClient} /></div>}
        </section>
      </div>

      {/* The price and the next step stay in reach while the task scrolls by on wide screens. */}
      <aside aria-label={t('summary')} className="space-y-4 lg:sticky lg:top-28">
        <div className="relative isolate space-y-4 overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
          <span aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 -z-10 size-60 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_16%,transparent),transparent)]" />
          <div>
            <p className="text-sm text-muted-foreground">{t('budget')}</p>
            <p className="font-display text-[2rem]/10 font-semibold tracking-[-0.02em] tabular-nums">{price}</p>
            <p className="text-sm text-muted-foreground">{priceNote}</p>
          </div>
          <p className="flex items-center gap-2 border-t border-foreground/[0.07] pt-3 text-sm tabular-nums dark:border-white/[0.06]"><Users aria-hidden="true" className="size-4 text-primary" />{t('offersSoFar', { count: task.offerCount })}</p>
          <div className="space-y-2.5">{action}</div>
        </div>
        <div className={cn(cardClass, 'space-y-3')}>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck aria-hidden="true" className="size-4 text-primary" />{t('how.title')}</h2>
          <ol className="space-y-2.5 text-sm">
            {(['offer', 'book', 'paid'] as const).map((step, at) => <li key={step} className="flex items-start gap-3"><span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground tabular-nums">{at + 1}</span><span className="text-muted-foreground">{t(`how.${step}`)}</span></li>)}
          </ol>
          <p className="flex items-start gap-2 border-t border-foreground/[0.07] pt-3 text-xs text-muted-foreground dark:border-white/[0.06]"><BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />{t(remote ? 'remotePrivacy' : 'privacy')}</p>
        </div>
      </aside>
    </div>

    {/* Compact rows, the board's: title, area, date, price and offers (audit M43). */}
    {data.similarTasks.length > 0 && <section aria-labelledby="task-similar" className="space-y-4">
      <h2 id="task-similar" className="font-display text-xl font-semibold tracking-[-0.015em]">{t('similarTasks')}</h2>
      <ol className="divide-y divide-foreground/[0.06] rounded-[1.375rem] border border-foreground/[0.07] bg-card px-2 shadow-card dark:divide-white/[0.05] dark:border-white/[0.06]">
        {data.similarTasks.map((similar) => <li key={similar.id}><TaskRow task={similar} now={now} /></li>)}
      </ol>
    </section>}
    <div className="border-t pt-4 text-center"><Link href={routes.app.newTask({ category: category.slug })} className={buttonVariants({ variant: 'link', className: 'h-auto min-h-11 max-w-full whitespace-normal' })}>{t('postSimilar')}</Link></div>
    <p className="text-center"><Link href={routes.app.report('task', task.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"><Flag aria-hidden="true" className="size-4" />{report('links.task')}</Link></p>
  </div>;
}
