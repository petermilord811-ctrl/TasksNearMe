import type { ReactNode } from 'react';
import { Check, Search, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { TaskBoardPageData, TaskBoardQuery, TaskBoardTime } from '@/contracts';
import { routes } from '@/contracts/routes';
import { TASK_BOARD_POSTED, TASK_BOARD_PRICE_PRESETS, TASK_BOARD_TIMES } from '@/contracts/tasks';
import { LocaleLink as Link, localeHref } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';
import { FiltersToggle } from './filters-toggle';

type Board = Pick<TaskBoardPageData, 'market' | 'categories' | 'query' | 'facets'>;

/** A board link with some filters changed (always back to page 1). */
export function boardHref(board: Board, change: Partial<TaskBoardQuery>): string {
  return routes.taskBoard(board.market.slug, { ...board.query, ...change, page: undefined });
}

/** The query string of a board URL, as hidden inputs, for a form that changes one filter and keeps the rest. */
function HiddenFields({ href, except }: { href: string; except: string[] }) {
  const params = new URL(href, 'https://board.invalid').searchParams;
  return <>{[...params].filter(([key]) => !except.includes(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}</>;
}

function Option({ href, selected, label, count, multi = false }: { href: string; selected: boolean; label: ReactNode; count?: number; multi?: boolean }) {
  const empty = count === 0 && !selected;
  return <li>
    <Link href={href} aria-current={selected ? 'true' : undefined} rel="nofollow" className={cn(
      'flex min-h-9 items-center gap-2 rounded-lg px-2 py-1 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
      selected ? 'bg-brand-soft font-semibold text-foreground' : 'text-foreground hover:bg-foreground/[0.05] dark:hover:bg-white/[0.06]',
      empty && 'text-muted-foreground',
    )}>
      <span aria-hidden="true" className={cn('flex size-4 shrink-0 items-center justify-center border', multi ? 'rounded-[5px]' : 'rounded-full', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/25')}>
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>}
    </Link>
  </li>;
}

/** A set of options under a small heading; a named group, so assistive tech reads "Neighborhoods, group". */
function Group({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  const id = `board-filter-${name}`;
  return <div role="group" aria-labelledby={id} className="space-y-1.5 border-t border-foreground/[0.07] pt-3 first:border-t-0 first:pt-0 dark:border-white/[0.06]">
    <h3 id={id} className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    <ul className="space-y-0.5">{children}</ul>
  </div>;
}

const toggle = <T,>(list: readonly T[], item: T) => (list.includes(item) ? list.filter((value) => value !== item) : [...list, item]);

/** How many filters are on (for the phone's "Filters" button). */
export function activeFilterCount(query: TaskBoardPageData['query']): number {
  return [query.category, query.type, query.q, query.minPrice !== undefined || query.maxPrice !== undefined ? 'price' : undefined, query.pricing, query.posted, query.few || undefined, query.when !== 'any' ? query.when : undefined, query.remoteOnly || undefined].filter(Boolean).length + query.areas.length + query.times.length;
}

/**
 * The board's filter panel (completion plan 7.4): every option a link with its count (what the list would show),
 * so it works without JavaScript and every filter set has its own URL. A side column on wide screens; behind a
 * "Filters" button on phones.
 */
export function BoardFilters({ board }: { board: Board }) {
  const t = useTranslations('taskBoard');
  const card = useTranslations('taskCard');
  const locale = useLocale();
  const { query, facets } = board;
  // The forms' own addresses keep the page's language, as the links do.
  const formAction = (href: string) => localeHref(new URL(href, 'https://board.invalid').pathname, locale);
  const href = (change: Partial<TaskBoardQuery>) => boardHref(board, change);
  const priceKey = TASK_BOARD_PRICE_PRESETS.find((preset) => ('min' in preset ? preset.min : undefined) === query.minPrice && ('max' in preset ? preset.max : undefined) === query.maxPrice)?.key;
  const totalAll = Object.values(facets.categories).reduce((sum, count) => sum + (count ?? 0), 0);

  return <FiltersToggle label={t('panel.toggle')} count={activeFilterCount(query)}>
    <div className="space-y-4">
      <form action={formAction(href({ q: undefined }))} method="get" role="search" className="space-y-1.5">
        <label htmlFor="board-q" className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('search.label')}</label>
        <div className="flex gap-1.5">
          <input id="board-q" name="q" type="search" defaultValue={query.q ?? ''} maxLength={80} placeholder={t('search.placeholder')} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40" />
          <button type="submit" className={buttonVariants({ size: 'icon', className: 'size-10 shrink-0' })}><Search aria-hidden="true" className="size-4" /><span className="sr-only">{t('search.submit')}</span></button>
        </div>
        <HiddenFields href={href({ q: undefined })} except={['q', 'page']} />
      </form>

      <Group name="category" title={t('category')}>
        <Option href={href({ category: undefined, type: undefined })} selected={!query.category} label={t('allCategories')} count={totalAll} />
        {board.categories.map((category) => <Option key={category.slug} href={href({ category: category.slug, type: undefined })} selected={query.category === category.slug} label={card(`categories.${category.slug}`)} count={facets.categories[category.slug] ?? 0} />)}
      </Group>

      {query.category && facets.types.length > 0 && <Group name="type" title={t('types')}>
        <Option href={href({ type: undefined })} selected={!query.type} label={t('allTypes')} />
        {facets.types.map((type) => <Option key={type.slug} href={href({ type: query.type === type.slug ? undefined : type.slug })} selected={query.type === type.slug} label={card(`types.${query.category}.${type.slug}`)} count={type.count} />)}
      </Group>}

      <Group name="area" title={t('areas')}>
        <Option href={href({ areas: [] })} selected={query.areas.length === 0} label={t('anyArea')} />
        {facets.areas.map((area) => <Option key={area.slug} multi href={href({ areas: toggle(query.areas, area.slug) })} selected={query.areas.includes(area.slug)} label={area.name} count={area.count} />)}
      </Group>

      <Group name="price" title={t('price')}>
        <Option href={href({ minPrice: undefined, maxPrice: undefined })} selected={query.minPrice === undefined && query.maxPrice === undefined} label={t('anyPrice')} />
        {TASK_BOARD_PRICE_PRESETS.map((preset) => <Option key={preset.key} href={priceKey === preset.key ? href({ minPrice: undefined, maxPrice: undefined }) : href({ minPrice: 'min' in preset ? preset.min : undefined, maxPrice: 'max' in preset ? preset.max : undefined })} selected={priceKey === preset.key} label={t(`pricePresets.${preset.key}`)} count={facets.prices[preset.key]} />)}
        <li>
          <form action={formAction(href({}))} method="get" className="flex items-center gap-1.5 px-2 pt-1">
            <HiddenFields href={href({ minPrice: undefined, maxPrice: undefined })} except={['min', 'max', 'page']} />
            <label className="sr-only" htmlFor="board-min">{t('priceRange.min')}</label>
            <input id="board-min" name="min" inputMode="numeric" pattern="[0-9]*" defaultValue={query.minPrice ?? ''} placeholder={t('priceRange.min')} className="h-9 w-0 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm tabular-nums" />
            <span aria-hidden="true" className="text-muted-foreground">–</span>
            <label className="sr-only" htmlFor="board-max">{t('priceRange.max')}</label>
            <input id="board-max" name="max" inputMode="numeric" pattern="[0-9]*" defaultValue={query.maxPrice ?? ''} placeholder={t('priceRange.max')} className="h-9 w-0 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm tabular-nums" />
            <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-9 shrink-0' })}>{t('priceRange.apply')}</button>
          </form>
        </li>
      </Group>

      <Group name="pricing" title={t('pricing')}>
        <Option href={href({ pricing: undefined })} selected={!query.pricing} label={t('pricingOptions.any')} />
        <Option href={href({ pricing: query.pricing === 'fixed' ? undefined : 'fixed' })} selected={query.pricing === 'fixed'} label={t('pricingOptions.fixed')} count={facets.pricing.fixed} />
        <Option href={href({ pricing: query.pricing === 'hourly' ? undefined : 'hourly' })} selected={query.pricing === 'hourly'} label={t('pricingOptions.hourly')} count={facets.pricing.hourly} />
      </Group>

      <Group name="when" title={t('when')}>
        <Option href={href({ when: 'any' })} selected={query.when === 'any'} label={t('whenOptions.any')} />
        {(['today', 'this_week', 'this_weekend'] as const).map((when) => <Option key={when} href={href({ when: query.when === when ? 'any' : when })} selected={query.when === when} label={t(`whenOptions.${when}`)} count={facets.when[when]} />)}
      </Group>

      <Group name="time" title={t('times')}>
        {TASK_BOARD_TIMES.map((time: TaskBoardTime) => <Option key={time} multi href={href({ times: toggle(query.times, time) })} selected={query.times.includes(time)} label={t(`timeOptions.${time}`)} count={facets.times[time]} />)}
      </Group>

      <Group name="posted" title={t('posted')}>
        <Option href={href({ posted: undefined })} selected={!query.posted} label={t('postedOptions.any')} />
        {TASK_BOARD_POSTED.map((posted) => <Option key={posted} href={href({ posted: query.posted === posted ? undefined : posted })} selected={query.posted === posted} label={t(`postedOptions.${posted}`)} count={facets.posted[posted]} />)}
      </Group>

      <Group name="more" title={t('more')}>
        <Option multi href={href({ remoteOnly: !query.remoteOnly })} selected={query.remoteOnly} label={t('remoteOnly')} count={facets.remote} />
        <Option multi href={href({ few: !query.few })} selected={query.few} label={t('few')} count={facets.few} />
      </Group>

      {activeFilterCount(query) > 0 && <Link href={routes.taskBoard(board.market.slug, { view: query.view, group: query.group, sort: query.sort })} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'w-full justify-center' })}><X aria-hidden="true" className="size-4" />{t('clearAll')}</Link>}
    </div>
  </FiltersToggle>;
}
