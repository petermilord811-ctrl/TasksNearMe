import { Clock, Laptop, MapPin, MessageCircle, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityPostView, ISODateTime, PortalItem, PortalTaskView } from '@/contracts';
import { routes } from '@/contracts/routes';
import { kindIcons, kindTone } from '@/ui/components/community/post-card';
import { LiveOfferCount, NewSinceBadge } from '@/ui/components/tasks/task-live';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { categoryIcons, useTaskPrice } from './task-feed-card';

const NEW_FOR_MS = 24 * 3_600_000;
const rowClass = 'grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3 px-3 py-2.5 transition-colors duration-150 hover:bg-muted/60 sm:grid-cols-[3.25rem_minmax(0,1fr)_auto] sm:px-4';
const metaClass = 'flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground';
const titleLink = 'rounded-sm underline-offset-4 outline-offset-2 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring';

/** A task as a dense row (Craigslist): when it is, the title, its type, place, time and offers, and the price. */
function TaskRow({ view, now, visitKey, showArea }: { view: PortalTaskView; now: ISODateTime; visitKey: string; showArea: boolean }) {
  const t = useTranslations('portal');
  const card = useTranslations('taskCard');
  const { formatDate, formatDateTime, formatTimeRange, locale, timeZone } = useFormat();
  const { task } = view;
  const Icon = categoryIcons[task.categorySlug];
  const { price, note } = useTaskPrice(task);
  const start = new Date(task.schedule.windowStart);
  const tag = locale === 'es' ? 'es-US' : 'en-US';
  const weekday = new Intl.DateTimeFormat(tag, { timeZone, weekday: 'short' }).format(start);
  const day = new Intl.DateTimeFormat(tag, { timeZone, day: 'numeric' }).format(start);
  const recent = Date.parse(now) - Date.parse(task.postedAt) < NEW_FOR_MS;
  return <article className={rowClass}>
    <time dateTime={task.schedule.windowStart} title={formatDateTime(task.schedule.windowStart)} className="flex flex-col items-center rounded-lg bg-secondary/80 px-1 py-1 text-center leading-tight text-secondary-foreground">
      <span className="text-[11px] font-semibold tracking-wide uppercase">{weekday}</span>
      <span className="text-sm font-bold tabular-nums">{day}</span>
      <span className="sr-only">{formatDate(task.schedule.windowStart)}</span>
    </time>
    <div className="min-w-0 space-y-0.5">
      <h3 className="text-[15px]/6 font-semibold [overflow-wrap:anywhere]">
        <Link href={view.href} className={titleLink}>{task.title}</Link>
        <NewSinceBadge postedAt={task.postedAt} recent={recent} visitKey={visitKey} />
      </h3>
      <p className={metaClass}>
        <span className="font-display text-sm font-semibold text-foreground tabular-nums sm:hidden">{price}{note && <span className="ml-1 font-sans text-[12px] font-normal text-muted-foreground">{note}</span>}</span>
        <span className="inline-flex items-center rounded-full bg-foreground px-1.5 py-px text-[11px] font-semibold text-background">{t('task.flair')}</span>
        <span className="inline-flex items-center gap-1"><Icon aria-hidden="true" className="size-3.5 shrink-0" />{task.taskType ? card(`types.${task.categorySlug}.${task.taskType}`) : card(`categories.${task.categorySlug}`)}</span>
        {showArea && <span className="inline-flex items-center gap-1">{task.location.kind === 'remote' ? <><Laptop aria-hidden="true" className="size-3.5 shrink-0" />{t('task.remote')}</> : <><MapPin aria-hidden="true" className="size-3.5 shrink-0" />{task.location.areaName}</>}</span>}
        <span className="inline-flex items-center gap-1 tabular-nums"><Clock aria-hidden="true" className="size-3.5 shrink-0" />{task.schedule.flexible ? t('task.anyTime') : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd)}</span>
        <LiveOfferCount taskId={task.id} offerCount={task.offerCount} renderedAt={now} />
      </p>
    </div>
    <p className="hidden text-right leading-tight sm:block">
      <span className="block font-display text-base font-semibold tabular-nums">{price}</span>
      {note && <span className="block text-[12px] text-muted-foreground tabular-nums">{note}</span>}
    </p>
  </article>;
}

/** A post as a dense row: its kind, the title, service, place and who, its replies and Helpful, and how long ago. */
function PostRow({ post, now, showArea }: { post: CommunityPostView; now: ISODateTime; showArea: boolean }) {
  const t = useTranslations('portal');
  const community = useTranslations('community');
  const card = useTranslations('taskCard');
  const { formatRelative, formatDateTime } = useFormat();
  const Icon = kindIcons[post.kind];
  const when = <time dateTime={post.createdAt} title={formatDateTime(post.createdAt)}>{formatRelative(post.createdAt, now)}</time>;
  return <article className={cn(rowClass, post.moderation && 'bg-destructive/[0.04]')}>
    <span aria-hidden="true" className={cn('grid h-[2.625rem] place-items-center rounded-lg', kindTone[post.kind])}><Icon className="size-4.5" /></span>
    <div className="min-w-0 space-y-0.5">
      <h3 className="text-[15px]/6 font-semibold [overflow-wrap:anywhere]">
        <Link href={routes.app.communityPost(post.id)} className={titleLink}>{post.title}</Link>
      </h3>
      <p className={metaClass}>
        <span className="sm:hidden">{when}</span>
        <span className={cn('inline-flex items-center rounded-full px-1.5 py-px text-[11px] font-semibold', kindTone[post.kind])}>{community(`kindBadge.${post.kind}`)}</span>
        {post.moderation && <span className="font-semibold text-destructive">{community(`moderation.${post.moderation.status}`)}</span>}
        {post.categorySlug && <span>{card(`categories.${post.categorySlug}`)}</span>}
        {showArea && post.areaName && <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-3.5 shrink-0" />{post.areaName}</span>}
        <span className="truncate">{post.author.displayName}</span>
        <span className="inline-flex items-center gap-1 tabular-nums"><MessageCircle aria-hidden="true" className="size-3.5 shrink-0" />{t('list.replies', { count: post.replyCount })}</span>
        {post.reactions.helpful > 0 && <span className="inline-flex items-center gap-1 tabular-nums"><ThumbsUp aria-hidden="true" className="size-3.5 shrink-0" />{t('list.helpful', { count: post.reactions.helpful })}</span>}
      </p>
    </div>
    <p className="hidden text-right text-[13px] leading-tight text-muted-foreground tabular-nums sm:block">{when}</p>
  </article>;
}

/** One item of the portal's List (completion plan 9.10, Craigslist): a post or a task as one dense row. */
export function PortalRow({ item, now, visitKey, showArea = true }: { item: PortalItem; now: ISODateTime; visitKey: string; showArea?: boolean }) {
  return item.type === 'task'
    ? <TaskRow view={item.task} now={now} visitKey={visitKey} showArea={showArea} />
    : <PostRow post={item.post} now={now} showArea={showArea} />;
}
